/**
 * HTTP API for campaign / print motif allowlist sync.
 * Spec: plexon specs/domain/spirion-campaign-motif-allowlist.md
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import sharp from "sharp";
import { rejectIfDestructiveUnauthorized } from "./api-auth.js";
import {
  campaignMotifAllowlistConfig,
  campaignMotifSourceId,
  downloadAllowlistedMotifAsset,
  findCampaignMotifPack,
  loadCampaignMotifCatalog,
  resolveMotifAssetKind,
  type CampaignMotifAsset,
  type CampaignMotifPack
} from "./campaign-motif-allowlist.js";
import { getPool } from "./db.js";
import { requireDigApiRuntime } from "./dig-api-runtime.js";
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

function packSummary(pack: CampaignMotifPack) {
  return {
    id: pack.id,
    name: pack.name,
    sourcePage: pack.sourcePage,
    assetCount: pack.assets.length,
    licenseClass: pack.licenseClass,
    craftEligibleDefault: pack.craftEligibleDefault,
    defaultAssetKind: pack.defaultAssetKind,
    industryTags: pack.industryTags,
    hostAllowlist: pack.hostAllowlist
  };
}

async function rasterizeToPng(buffer: Buffer, contentType: string): Promise<Buffer> {
  const type = contentType.toLowerCase();
  if (
    type.includes("png") ||
    type.includes("jpeg") ||
    type.includes("jpg") ||
    type.includes("webp") ||
    type.includes("gif") ||
    !type
  ) {
    return sharp(buffer, { failOn: "none" }).rotate().png().toBuffer();
  }
  return sharp(buffer, { failOn: "none" }).png().toBuffer();
}

function extensionForFilename(filename: string): string {
  const ext = extname(filename).toLowerCase();
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp" || ext === ".gif") {
    return ".png";
  }
  return ".png";
}

export async function handleCampaignMotifApi(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
  environment: NodeJS.ProcessEnv = process.env,
  root = process.cwd()
): Promise<boolean> {
  const cfg = campaignMotifAllowlistConfig(root);
  const base = cfg.apiPrefix.replace(/\/$/, "");
  if (!requestUrl.pathname.startsWith(base)) return false;

  const path = requestUrl.pathname.slice(base.length) || "/";

  if (request.method === "GET" && (path === "/" || path === "")) {
    try {
      const catalog = await loadCampaignMotifCatalog(root);
      sendJson(response, 200, {
        ok: true,
        policy_version: catalog.policy_version,
        schema_version: catalog.schema_version,
        default_asset_kind: cfg.defaultAssetKind,
        packs: catalog.packs.map(packSummary)
      });
    } catch (error: unknown) {
      sendJson(response, 500, {
        error: "campaign_motif_catalog_failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return true;
  }

  const packDetail = path.match(/^\/([^/]+)$/);
  if (request.method === "GET" && packDetail && packDetail[1] !== "sync") {
    try {
      const catalog = await loadCampaignMotifCatalog(root);
      const pack = findCampaignMotifPack(catalog, decodeURIComponent(packDetail[1] ?? ""));
      if (!pack) {
        sendJson(response, 404, { error: "pack_not_found" });
        return true;
      }
      sendJson(response, 200, {
        ok: true,
        policy_version: catalog.policy_version,
        pack: {
          ...packSummary(pack),
          assets: pack.assets
        }
      });
    } catch (error: unknown) {
      sendJson(response, 500, {
        error: "campaign_motif_catalog_failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return true;
  }

  if (request.method === "POST" && path === "/repair-provenance") {
    if (rejectIfDestructiveUnauthorized(request, response, environment, root)) return true;
    const pool = getPool();
    if (!pool) {
      sendJson(response, 503, { error: "database_unavailable" });
      return true;
    }
    try {
      const body = await readJsonBody(request);
      const requeue = body.requeueEnrichment === true || body.requeue_enrichment === true;
      const updated = await pool.query(
        `UPDATE captures
         SET source = 'connector:campaign_motif',
             license_class = 'public_domain',
             craft_eligible = FALSE
         WHERE source_id LIKE 'motif\\_%' ESCAPE '\\'
           AND (
             source IS DISTINCT FROM 'connector:campaign_motif'
             OR license_class IS DISTINCT FROM 'public_domain'
             OR craft_eligible IS DISTINCT FROM FALSE
           )
         RETURNING capture_run_id, source_id, source, license_class, craft_eligible, enrichment_status`
      );
      const rows = updated.rows as Array<Record<string, unknown>>;
      const requeued: string[] = [];
      if (requeue) {
        const runtime = requireDigApiRuntime();
        const pending = await pool.query(
          `SELECT capture_run_id, package_path
           FROM captures
           WHERE source_id LIKE 'motif\\_%' ESCAPE '\\'
             AND enrichment_status = 'pending'
             AND package_path IS NOT NULL
           ORDER BY completed_at DESC NULLS LAST
           LIMIT 40`
        );
        for (const row of pending.rows as Array<{ capture_run_id?: string; package_path?: string }>) {
          const captureRunId = row.capture_run_id;
          const packagePath = row.package_path;
          if (!captureRunId || !packagePath) continue;
          runtime.enrichmentQueue.enqueue({
            package_path: packagePath,
            capture_run_id: captureRunId
          });
          requeued.push(captureRunId);
        }
      }
      sendJson(response, 200, {
        ok: true,
        repaired: rows.length,
        rows: rows.map((r) => ({
          capture_run_id: r.capture_run_id,
          source_id: r.source_id,
          source: r.source,
          license_class: r.license_class,
          craft_eligible: r.craft_eligible,
          enrichment_status: r.enrichment_status
        })),
        requeued_enrichment: requeued.length,
        requeued_capture_run_ids: requeued
      });
    } catch (error: unknown) {
      sendJson(response, 500, {
        error: "campaign_motif_repair_failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return true;
  }

  if (request.method === "POST" && path === "/sync") {
    if (rejectIfDestructiveUnauthorized(request, response, environment, root)) return true;
    const body = await readJsonBody(request);
    try {
      const catalog = await loadCampaignMotifCatalog(root);
      const packIdRaw =
        typeof body.packId === "string"
          ? body.packId
          : typeof body.pack_id === "string"
            ? body.pack_id
            : typeof body.kitId === "string"
              ? body.kitId
              : null;
      const packs: CampaignMotifPack[] = packIdRaw
        ? (() => {
            const pack = findCampaignMotifPack(catalog, packIdRaw);
            if (!pack) throw new Error("pack_not_found");
            return [pack];
          })()
        : catalog.packs;

      const limitRaw = typeof body.limit === "number" ? body.limit : Number(body.limit ?? cfg.maxAssetsPerSync);
      const limit = Math.min(
        cfg.maxAssetsPerSync,
        Math.max(1, Number.isFinite(limitRaw) ? Math.round(limitRaw) : cfg.maxAssetsPerSync)
      );
      const platformProjectId =
        typeof body.platformProjectId === "string"
          ? body.platformProjectId
          : typeof body.platform_project_id === "string"
            ? body.platform_project_id
            : null;

      const ingest = imageIngestConfig(root);
      const stagingDir = resolve(root, ingest.stagingDir);
      await mkdir(stagingDir, { recursive: true });
      const runtime = requireDigApiRuntime();

      const jobs: Array<Record<string, unknown>> = [];
      const skipped: Array<{ packId: string; url: string; reason: string }> = [];
      let remaining = limit;

      for (const pack of packs) {
        if (remaining <= 0) break;
        const slice = pack.assets.slice(0, remaining);
        for (const asset of slice) {
          try {
            const downloaded = await downloadAllowlistedMotifAsset(pack, asset, {
              timeoutMs: cfg.timeoutMs,
              maxBytes: cfg.maxBytes,
              fetchUserAgent: cfg.fetchUserAgent
            });
            const png = await rasterizeToPng(downloaded.buffer, downloaded.contentType);
            const sourceId = campaignMotifSourceId(pack.id, asset.url);
            const assetKind = resolveMotifAssetKind(pack, asset);
            const dest = join(stagingDir, `${sourceId}${extensionForFilename(asset.filename)}`);
            await writeFile(dest, png);
            const job = runtime.runner.startUploadJob(
              {
                source_id: sourceId,
                filename: asset.filename.replace(/[^\w.-]+/g, "_").slice(0, 120) || "motif.png",
                path: dest,
                asset_kind: assetKind
              },
              { platformProjectId }
            );
            jobs.push({
              job_id: job.job_id,
              pack_id: pack.id,
              source: "connector:campaign_motif",
              source_id: sourceId,
              asset_url: asset.url,
              role: asset.role ?? null,
              commons_title: asset.commonsTitle ?? null,
              policy_version: catalog.policy_version,
              license_class: pack.licenseClass,
              craft_eligible: pack.craftEligibleDefault,
              asset_kind: assetKind
            });
            remaining -= 1;
          } catch (error: unknown) {
            skipped.push({
              packId: pack.id,
              url: asset.url,
              reason: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }

      sendJson(response, 202, {
        ok: true,
        queued: jobs.length,
        skipped: skipped.length,
        skipped_assets: skipped,
        jobs,
        note: "print_ad/campaign_keyvisual uploads; craftEligible false until review PATCH"
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === "pack_not_found" ? 404 : 400;
      sendJson(response, status, { error: message });
    }
    return true;
  }

  sendJson(response, 404, { error: "not_found" });
  return true;
}

/** Test helper: pick first N assets from a pack without network. */
export function selectPackAssets(pack: CampaignMotifPack, limit: number): CampaignMotifAsset[] {
  return pack.assets.slice(0, Math.max(0, limit));
}
