#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { JobRunner, publicJobView, type JobEvent } from "./job-runner.js";
import { EnrichmentQueue, publicEnrichmentView } from "./enrichment-queue.js";
import { getEnrichmentJobFromDb, listEnrichmentJobsFromDb } from "./enrichment-store.js";
import { handleLibraryApi } from "./library-api.js";
import { handlePlatformProvisioningApi } from "./platform-provisioning-api.js";
import { loadDotEnv } from "./load-env.js";
import { loadDigPaths, webHost, webPort, webStaticDir } from "./runtime-paths.js";
import { setFlowSeedEnqueueCapture } from "./flow-seed.js";

loadDotEnv();
const enrichmentQueue = new EnrichmentQueue({ autoStart: true });
const runner = new JobRunner({ enrichmentQueue });
setFlowSeedEnqueueCapture((url) => {
  const job = runner.startJob(url);
  return { job_id: job.job_id };
});
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

  if (request.method === "GET" && url.pathname === paths.api.jobsPath) {
    sendJson(response, 200, { jobs: runner.listJobs().map(publicJobView) });
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
  if (request.method === "GET" && enrichmentMatch) {
    const id = decodeURIComponent(enrichmentMatch[1]!);
    const job = enrichmentQueue.getJob(id) ?? (await getEnrichmentJobFromDb(id).catch(() => null));
    if (!job) {
      sendJson(response, 404, { error: "Enrichment job not found" });
      return true;
    }
    sendJson(response, 200, publicEnrichmentView(job));
    return true;
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
        if (event.stage === "complete" || event.stage === "failed") {
          response.end();
          unsubscribe();
        }
      });
      request.on("close", unsubscribe);
      if (job.stage === "complete" || job.stage === "failed") response.end();
      return true;
    }
    if (request.method === "GET") {
      sendJson(response, 200, publicJobView(job));
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
