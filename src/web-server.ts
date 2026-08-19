#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { JobRunner, publicJobView, type JobEvent } from "./job-runner.js";
import { captureJobsConfig, catalogUrls, loadCaptureCatalog } from "./capture-catalog.js";
import { captureIdentityKey, filterExistingCaptureUrls } from "./capture-identity.js";
import { getPool } from "./db.js";
import { listIndexedCaptureUrlKeys } from "./library-reset.js";
import { rejectIfDestructiveUnauthorized } from "./api-auth.js";
import { EnrichmentQueue, publicEnrichmentView } from "./enrichment-queue.js";
import { getEnrichmentJobFromDb, listEnrichmentJobsFromDb } from "./enrichment-store.js";
import { handleLibraryApi } from "./library-api.js";
import { handlePinterestApi } from "./pinterest-api.js";
import { handleMcpHttp } from "./mcp-http.js";
import { handlePlatformProvisioningApi } from "./platform-provisioning-api.js";
import { loadDotEnv } from "./load-env.js";
import { imageIngestConfig, loadDigPaths, webHost, webPort, webStaticDir } from "./runtime-paths.js";
import { setFlowSeedEnqueueCapture } from "./flow-seed.js";
import { setDigApiRuntime } from "./dig-api-runtime.js";
import { parseMultipartImageUploads } from "./image-upload.js";

loadDotEnv();
const enrichmentQueue = new EnrichmentQueue({ autoStart: true });
const runner = new JobRunner({ enrichmentQueue });
setFlowSeedEnqueueCapture((url) => {
  const job = runner.startJob(url);
  return { job_id: job.job_id };
});
setDigApiRuntime({ runner, enrichmentQueue });
const paths = loadDigPaths();
const enrichmentPath = paths.api.enrichmentPath ?? "/api/enrichment";

function shouldServeStatic(): boolean {
  return process.env.DIG_WEB_STATIC !== "0";
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*"
  });
  response.end(payload);
}

function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      if (Buffer.concat(chunks).length > 64_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (chunks.length === 0) {
        resolvePromise({});
        return;
      }
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function isInsideRoot(root: string, candidate: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(normalizedRoot + sep);
}

function tryStatic(response: ServerResponse, requestPath: string): boolean {
  if (!shouldServeStatic()) return false;
  const root = webStaticDir();
  if (!existsSync(root)) return false;
  const relativePath = requestPath === "/" ? "/index.html" : requestPath;
  const candidate = normalize(join(root, decodeURIComponent(relativePath)));
  if (!isInsideRoot(root, candidate) || !existsSync(candidate) || !statSync(candidate).isFile()) {
    const fallback = join(root, "index.html");
    if (existsSync(fallback) && !extname(relativePath)) {
      response.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-cache" });
      createReadStream(fallback).pipe(response);
      return true;
    }
    return false;
  }
  response.writeHead(200, {
    "content-type": MIME[extname(candidate)] ?? "application/octet-stream",
    "cache-control": extname(candidate) === ".html" ? "no-cache" : "public, max-age=3600"
  });
  createReadStream(candidate).pipe(response);
  return true;
}

function writeSse(response: ServerResponse, event: JobEvent): void {
  response.write(`event: job\ndata: ${JSON.stringify(event)}\n\n`);
}

async function handleApi(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
  if (!url.pathname.startsWith(paths.api.basePath)) return false;

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      service: "dig-api",
      static: shouldServeStatic()
    });
    return true;
  }

  if (await handleLibraryApi(request, response, url)) return true;
  if (await handlePinterestApi(request, response, url)) return true;
  if (await handlePlatformProvisioningApi(request, response, url)) return true;

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
      "access-control-allow-headers":
        "content-type, authorization, x-service-secret, x-plexon-contract-version, x-plexon-user-id"
    });
    response.end();
    return true;
  }

  if (request.method === "POST" && url.pathname === paths.api.jobsPath) {
    try {
      const body = (await readJson(request)) as {
        url?: unknown;
        platformProjectId?: unknown;
        platform_project_id?: unknown;
        digProjectId?: unknown;
        dig_project_id?: unknown;
      };
      if (typeof body.url !== "string") {
        sendJson(response, 400, { error: "Body must include string url" });
        return true;
      }
      const platformProjectId =
        typeof body.platformProjectId === "string"
          ? body.platformProjectId
          : typeof body.platform_project_id === "string"
            ? body.platform_project_id
            : null;
      const digProjectId =
        typeof body.digProjectId === "string"
          ? body.digProjectId
          : typeof body.dig_project_id === "string"
            ? body.dig_project_id
            : null;
      const job = runner.startJob(body.url, { platformProjectId, digProjectId });
      sendJson(response, 202, publicJobView(job));
    } catch (error: unknown) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const jobsBatchPath = `${paths.api.jobsPath.replace(/\/$/, "")}${captureJobsConfig().batchPath}`;
  if (request.method === "POST" && url.pathname === jobsBatchPath) {
    if (rejectIfDestructiveUnauthorized(request, response)) return true;
    try {
      const body = (await readJson(request)) as {
        catalog?: unknown;
        urls?: unknown;
        skip_existing?: unknown;
        skipExisting?: unknown;
        platformProjectId?: unknown;
        platform_project_id?: unknown;
      };
      const cfg = captureJobsConfig();
      let urls: string[] = [];
      let catalogId: string | null = null;
      if (typeof body.catalog === "string" && body.catalog.trim()) {
        catalogId = body.catalog.trim();
        urls = catalogUrls(loadCaptureCatalog(catalogId));
      } else if (Array.isArray(body.urls)) {
        urls = body.urls.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
      }
      if (!urls.length) {
        sendJson(response, 400, { error: "catalog or urls required" });
        return true;
      }
      if (urls.length > cfg.maxBatch) {
        sendJson(response, 400, { error: "batch_too_large", max: cfg.maxBatch, count: urls.length });
        return true;
      }
      const skipExisting = body.skip_existing !== false && body.skipExisting !== false;
      const existingKeys = new Set<string>();
      if (skipExisting) {
        const pool = getPool();
        if (pool) {
          try {
            const indexed = await listIndexedCaptureUrlKeys(pool);
            for (const key of indexed) existingKeys.add(key);
          } catch {
            /* queue anyway if library lookup fails */
          }
        }
        for (const job of runner.listJobs()) {
          const key = captureIdentityKey(job.url);
          if (key) existingKeys.add(key);
        }
      }
      const filtered = skipExisting
        ? filterExistingCaptureUrls(urls, existingKeys)
        : filterExistingCaptureUrls(urls, []);
      const platformProjectId =
        typeof body.platformProjectId === "string"
          ? body.platformProjectId
          : typeof body.platform_project_id === "string"
            ? body.platform_project_id
            : null;
      const jobs = filtered.urls.length ? runner.startJobs(filtered.urls, { platformProjectId }) : [];
      sendJson(response, 202, {
        ok: true,
        catalog: catalogId,
        queued: jobs.length,
        skipped_existing: filtered.skippedExisting,
        skipped_duplicate: filtered.skippedDuplicate,
        skip_existing: skipExisting,
        max_concurrent: cfg.maxConcurrent,
        max_image_concurrent: imageIngestConfig().maxConcurrent,
        jobs: jobs.map(publicJobView)
      });
    } catch (error: unknown) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const jobsImagesPath = `${paths.api.jobsPath.replace(/\/$/, "")}${imageIngestConfig().imagesPath}`;
  if (request.method === "POST" && url.pathname === jobsImagesPath) {
    if (rejectIfDestructiveUnauthorized(request, response)) return true;
    try {
      const parsed = await parseMultipartImageUploads(request);
      if (!parsed.files.length) {
        sendJson(response, 400, {
          error: "no_images",
          skipped: parsed.skipped
        });
        return true;
      }
      const jobs = runner.startUploadJobs(parsed.files, {
        platformProjectId: parsed.platformProjectId
      });
      sendJson(response, 202, {
        ok: true,
        queued: jobs.length,
        skipped: parsed.skipped.length,
        skipped_files: parsed.skipped,
        max_image_concurrent: imageIngestConfig().maxConcurrent,
        jobs: jobs.map(publicJobView)
      });
    } catch (error: unknown) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === paths.api.jobsPath) {
    const order = runner.queuedOrder();
    sendJson(response, 200, {
      jobs: runner.listJobs().map((job) => {
        const index = order.indexOf(job.job_id);
        return publicJobView(job, index >= 0 ? index : null);
      })
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === `${paths.api.embeddingsPath ?? "/api/embeddings"}/backfill`) {
    if (rejectIfDestructiveUnauthorized(request, response)) return true;
    try {
      const body = (await readJson(request)) as { limit?: unknown };
      const limitRaw = typeof body.limit === "number" ? body.limit : Number(body.limit ?? 25);
      const limit = Number.isFinite(limitRaw) ? limitRaw : 25;
      const pool = getPool();
      if (!pool) {
        sendJson(response, 503, { error: "database_unavailable" });
        return true;
      }
      const {
        embedDenseCapturePackage,
        listCapturesMissingDenseScreens
      } = await import("./dense-embedding-package.js");
      const pending = await listCapturesMissingDenseScreens(pool, limit);
      const results: Array<{ capture_run_id: string; written: number; subjects: number; error?: string }> = [];
      for (const row of pending) {
        try {
          const outcome = await embedDenseCapturePackage(row.package_path, { client: pool });
          results.push({
            capture_run_id: row.capture_run_id,
            written: outcome.written,
            subjects: outcome.subjects
          });
        } catch (error: unknown) {
          results.push({
            capture_run_id: row.capture_run_id,
            written: 0,
            subjects: 0,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      sendJson(response, 202, {
        ok: true,
        queued: pending.length,
        embedded: results.filter((row) => row.written > 0).length,
        results
      });
    } catch (error: unknown) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === enrichmentPath) {
    if (rejectIfDestructiveUnauthorized(request, response)) return true;
    try {
      const body = (await readJson(request)) as { capture_run_id?: unknown; captureRunId?: unknown };
      const captureRunId =
        (typeof body.capture_run_id === "string" ? body.capture_run_id : typeof body.captureRunId === "string" ? body.captureRunId : "").trim();
      if (!captureRunId) {
        sendJson(response, 400, { error: "capture_run_id required" });
        return true;
      }
      const pool = getPool();
      if (!pool) {
        sendJson(response, 503, { error: "database_unavailable" });
        return true;
      }
      const capture = await pool.query("SELECT package_path FROM captures WHERE capture_run_id = $1 LIMIT 1", [
        captureRunId
      ]);
      const packagePath = (capture.rows[0] as { package_path?: string } | undefined)?.package_path;
      if (!packagePath) {
        sendJson(response, 404, { error: "capture_not_found" });
        return true;
      }
      const job = enrichmentQueue.enqueue({ package_path: packagePath, capture_run_id: captureRunId });
      sendJson(response, 202, publicEnrichmentView(job));
    } catch (error: unknown) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === enrichmentPath) {
    const memory = enrichmentQueue.listJobs();
    const fromDb = await listEnrichmentJobsFromDb(100).catch(() => []);
    const byId = new Map<string, ReturnType<typeof publicEnrichmentView>>();
    for (const job of fromDb) byId.set(job.enrichment_job_id, publicEnrichmentView(job));
    for (const job of memory) byId.set(job.enrichment_job_id, publicEnrichmentView(job));
    const jobs = [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
    sendJson(response, 200, { jobs });
    return true;
  }

  const enrichmentMatch = url.pathname.match(new RegExp(`^${enrichmentPath}/([^/]+)$`));
  if (enrichmentMatch) {
    const id = decodeURIComponent(enrichmentMatch[1]!);
    if (request.method === "DELETE") {
      if (rejectIfDestructiveUnauthorized(request, response)) return true;
      const skipped = enrichmentQueue.skipQueued(id);
      if (!skipped) {
        sendJson(response, 409, { error: "only_queued_enrichment_can_be_skipped" });
        return true;
      }
      sendJson(response, 200, publicEnrichmentView(skipped));
      return true;
    }
    if (request.method === "GET") {
      const job = enrichmentQueue.getJob(id) ?? (await getEnrichmentJobFromDb(id).catch(() => null));
      if (!job) {
        sendJson(response, 404, { error: "Enrichment job not found" });
        return true;
      }
      sendJson(response, 200, publicEnrichmentView(job));
      return true;
    }
  }

  const jobMatch = url.pathname.match(new RegExp(`^${paths.api.jobsPath}/([^/]+)(/events)?$`));
  if (jobMatch) {
    const jobId = decodeURIComponent(jobMatch[1]!);
    const job = runner.getJob(jobId);
    if (!job) {
      sendJson(response, 404, { error: "Job not found" });
      return true;
    }
    if (jobMatch[2] === "/events") {
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "access-control-allow-origin": "*"
      });
      response.write(": connected\n\n");
      for (const event of job.events) writeSse(response, event);
      const unsubscribe = runner.subscribe(jobId, (event) => {
        writeSse(response, event);
        if (event.stage === "complete" || event.stage === "failed" || event.stage === "skipped") {
          response.end();
          unsubscribe();
        }
      });
      request.on("close", unsubscribe);
      if (job.stage === "complete" || job.stage === "failed" || job.stage === "skipped") response.end();
      return true;
    }
    if (request.method === "GET") {
      const idx = runner.queuedOrder().indexOf(job.job_id);
      sendJson(response, 200, publicJobView(job, idx >= 0 ? idx : null));
      return true;
    }
    if (request.method === "DELETE") {
      if (rejectIfDestructiveUnauthorized(request, response)) return true;
      const skipped = runner.cancelQueued(jobId);
      if (!skipped) {
        sendJson(response, 409, { error: "only_queued_jobs_can_be_skipped" });
        return true;
      }
      sendJson(response, 200, publicJobView(skipped, null));
      return true;
    }
    if (request.method === "PATCH") {
      if (rejectIfDestructiveUnauthorized(request, response)) return true;
      try {
        const body = (await readJson(request)) as { action?: unknown; direction?: unknown };
        if (body.action !== "move") {
          sendJson(response, 400, { error: "action must be move" });
          return true;
        }
        const direction = body.direction;
        if (direction !== "up" && direction !== "down" && direction !== "front") {
          sendJson(response, 400, { error: "direction must be up, down, or front" });
          return true;
        }
        const moved = runner.moveQueued(jobId, direction);
        if (!moved) {
          sendJson(response, 409, { error: "only_queued_jobs_can_be_reordered" });
          return true;
        }
        const index = runner.queuedOrder().indexOf(moved.job_id);
        sendJson(response, 200, publicJobView(moved, index >= 0 ? index : null));
      } catch (error: unknown) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }
  }

  sendJson(response, 404, { error: "Not found" });
  return true;
}

export function createWebServer(): ReturnType<typeof createServer> {
  return createServer(async (request, response) => {
    try {
      const host = request.headers.host ?? `127.0.0.1:${webPort()}`;
      const url = new URL(request.url ?? "/", `http://${host}`);
      if (await handleMcpHttp(request, response, url)) return;
      if (await handleApi(request, response, url)) return;
      if (request.method === "GET" && tryStatic(response, url.pathname)) return;
      sendJson(response, 404, { error: "Not found" });
    } catch (error: unknown) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

export function startWebServer(): void {
  const server = createWebServer();
  const host = webHost();
  const port = webPort();
  server.listen(port, host, () => {
    process.stdout.write(`DIG web listening on http://${host}:${port}\n`);
  });
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  startWebServer();
}
