/**
 * Dribbble connector HTTP API — OAuth + sync scaffold.
 * Media is copied into SPIRION storage via existing upload ingest; CDN is never craft SSOT.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { rejectIfDestructiveUnauthorized, rejectIfUnauthorized } from "./api-auth.js";
import { requireDigApiRuntime } from "./dig-api-runtime.js";
import {
  downloadDribbbleImage,
  fetchDribbbleUser,
  listDribbbleUserShots
} from "./dribbble-client.js";
import {
  connectedDribbbleAccessToken,
  createDribbbleAuthorizeUrl,
  dribbbleClientConfigured,
  dribbbleConnectionStatus,
  dribbbleRedirectUri,
  exchangeDribbbleCode,
  saveDribbbleUsername
} from "./dribbble-oauth.js";
import { dribbbleConfig } from "./runtime-paths.js";
import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { imageIngestConfig } from "./runtime-paths.js";

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*"
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function handleDribbbleApi(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
  environment: NodeJS.ProcessEnv = process.env,
  root = process.cwd()
): Promise<boolean> {
  const prefix = dribbbleConfig(root).apiPrefix.replace(/\/$/, "");
  if (!requestUrl.pathname.startsWith(prefix)) return false;
  if (request.method === "OPTIONS") return false;
  const path = requestUrl.pathname.slice(prefix.length) || "/";
  const cfg = dribbbleConfig(root);

  if (request.method === "GET" && (path === "/status" || path === "/")) {
    if (rejectIfUnauthorized(request, response, environment, root)) return true;
    const status = await dribbbleConnectionStatus(environment, root);
    sendJson(response, 200, {
      ...status,
      redirect_uri: dribbbleRedirectUri(environment, root),
      scopes: cfg.oauthScopes,
      max_shots: cfg.maxShotsPerSync,
      rate_limit_per_minute: cfg.rateLimitPerMinute,
      rate_limit_per_day: cfg.rateLimitPerDay,
      license_class: cfg.licenseClass,
      craft_eligible_default: cfg.craftEligibleDefault,
      note: "Official Dribbble API only — no HTML scrape"
    });
    return true;
  }

  if (request.method === "GET" && path === "/oauth/start") {
    if (rejectIfUnauthorized(request, response, environment, root)) return true;
    if (!dribbbleClientConfigured(environment, root)) {
      sendJson(response, 503, {
        error: "dribbble_not_configured",
        message: "Set DRIBBBLE_CLIENT_ID and DRIBBBLE_CLIENT_SECRET on dig-api"
      });
      return true;
    }
    try {
      const started = await createDribbbleAuthorizeUrl(environment, root);
      sendJson(response, 200, {
        authorize_url: started.authorize_url,
        redirect_uri: dribbbleRedirectUri(environment, root)
      });
    } catch (error: unknown) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (request.method === "GET" && path === "/oauth/callback") {
    const code = requestUrl.searchParams.get("code")?.trim();
    const state = requestUrl.searchParams.get("state")?.trim();
    if (!code || !state) {
      sendJson(response, 400, { error: "missing_code_or_state" });
      return true;
    }
    try {
      await exchangeDribbbleCode(code, state, environment, root);
      const token = await connectedDribbbleAccessToken(root);
      if (token) {
        const user = await fetchDribbbleUser(token, root).catch(() => null);
        if (user?.username) await saveDribbbleUsername(user.username, root);
      }
      sendJson(response, 200, { ok: true, connected: true });
    } catch (error: unknown) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (request.method === "POST" && path === "/sync") {
    if (rejectIfDestructiveUnauthorized(request, response, environment, root)) return true;
    const token = await connectedDribbbleAccessToken(root);
    if (!token) {
      sendJson(response, 401, { error: "dribbble_not_connected" });
      return true;
    }
    const body = await readJsonBody(request);
    const limitRaw = typeof body.limit === "number" ? body.limit : Number(body.limit ?? cfg.maxShotsPerSync);
    const limit = Math.min(cfg.maxShotsPerSync, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : cfg.maxShotsPerSync));
    const platformProjectId =
      typeof body.platformProjectId === "string"
        ? body.platformProjectId
        : typeof body.platform_project_id === "string"
          ? body.platform_project_id
          : null;
    try {
      const shots = (await listDribbbleUserShots(token, { perPage: limit }, root)).slice(0, limit);
      const ingest = imageIngestConfig(root);
      const stagingDir = resolve(root, ingest.stagingDir);
      await mkdir(stagingDir, { recursive: true });
      const runtime = requireDigApiRuntime();
      const jobs = [];
      for (const shot of shots) {
        const imageUrl = shot.images.hidpi || shot.images.normal || shot.images.teaser;
        if (!imageUrl) continue;
        const image = await downloadDribbbleImage(imageUrl, root);
        const sourceId = `dribbble_${shot.id}`;
        const dest = join(stagingDir, `${sourceId}.png`);
        await writeFile(dest, image);
        const job = runtime.runner.startUploadJob(
          {
            source_id: sourceId,
            filename: `${shot.title || shot.id}.png`.replace(/[^\w.-]+/g, "_").slice(0, 120),
            path: dest,
            asset_kind: cfg.defaultAssetKind
          },
          { platformProjectId }
        );
        // Provenance overrides applied at index time via source_id; connector license via
        // a follow-up PATCH / allowlist. Sync stores copies; craftEligible stays false until review.
        jobs.push({
          job_id: job.job_id,
          shot_id: shot.id,
          source: "connector:dribbble",
          source_id: String(shot.id),
          policy_version: cfg.policyVersion,
          license_class: cfg.licenseClass,
          craft_eligible: cfg.craftEligibleDefault
        });
      }
      sendJson(response, 202, {
        ok: true,
        queued: jobs.length,
        jobs,
        note: "Assets land as uploads; mark craftEligible after review (connector_tos default false)"
      });
    } catch (error: unknown) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  sendJson(response, 404, { error: "not_found" });
  return true;
}
