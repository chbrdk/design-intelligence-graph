/**
 * HTTP API for brand-kit allowlist sync.
 * Spec: plexon specs/domain/spirion-brand-kit-allowlist.md
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import sharp from "sharp";
import { rejectIfDestructiveUnauthorized } from "./api-auth.js";
import {
  brandKitAllowlistConfig,
  brandKitSourceId,
  downloadAllowlistedBrandAsset,
  findBrandKit,
  loadBrandKitCatalog,
  type BrandKitAsset,
  type BrandKitEntry
} from "./brand-kit-allowlist.js";
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

function kitSummary(kit: BrandKitEntry) {
  return {
    id: kit.id,
    name: kit.name,
    guidelinesUrl: kit.guidelinesUrl,
    assetCount: kit.assets.length,
    licenseClass: kit.licenseClass,
    craftEligibleDefault: kit.craftEligibleDefault,
    industryTags: kit.industryTags,
    hostAllowlist: kit.hostAllowlist
  };
}

async function rasterizeToPng(buffer: Buffer, contentType: string): Promise<Buffer> {
  const type = contentType.toLowerCase();
  if (type.includes("png") || type.includes("jpeg") || type.includes("jpg") || type.includes("webp") || type.includes("gif")) {
    return sharp(buffer, { failOn: "none" }).rotate().png().toBuffer();
  }
  // SVG / unknown: attempt sharp decode (may fail for exotic vectors)
  return sharp(buffer, { failOn: "none" }).png().toBuffer();
}

function extensionForFilename(filename: string): string {
  const ext = extname(filename).toLowerCase();
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp" || ext === ".gif") return ".png";
  return ".png";
}

export async function handleBrandKitApi(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
  environment: NodeJS.ProcessEnv = process.env,
  root = process.cwd()
): Promise<boolean> {
  const cfg = brandKitAllowlistConfig(root);
  const base = cfg.apiPrefix.replace(/\/$/, "");
  if (!requestUrl.pathname.startsWith(base)) return false;

  const path = requestUrl.pathname.slice(base.length) || "/";

  // Catalog is public (shipped in git); sync remains Bearer-gated.
  if (request.method === "GET" && (path === "/" || path === "")) {
    try {
      const catalog = await loadBrandKitCatalog(root);
      sendJson(response, 200, {
        ok: true,
        policy_version: catalog.policy_version,
        schema_version: catalog.schema_version,
        default_asset_kind: cfg.defaultAssetKind,
        kits: catalog.kits.map(kitSummary)
      });
    } catch (error: unknown) {
      sendJson(response, 500, {
        error: "brand_kit_catalog_failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return true;
  }

  const kitDetail = path.match(/^\/([^/]+)$/);
  if (request.method === "GET" && kitDetail && kitDetail[1] !== "sync") {
    try {
      const catalog = await loadBrandKitCatalog(root);
      const kit = findBrandKit(catalog, decodeURIComponent(kitDetail[1] ?? ""));
      if (!kit) {
        sendJson(response, 404, { error: "kit_not_found" });
        return true;
      }
      sendJson(response, 200, {
        ok: true,
        policy_version: catalog.policy_version,
        kit: {
          ...kitSummary(kit),
          assets: kit.assets
        }
      });
    } catch (error: unknown) {
      sendJson(response, 500, {
        error: "brand_kit_catalog_failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return true;
  }

  if (request.method === "POST" && path === "/sync") {
    if (rejectIfDestructiveUnauthorized(request, response, environment, root)) return true;
    const body = await readJsonBody(request);
    try {
      const catalog = await loadBrandKitCatalog(root);
      const kitIdRaw =
        typeof body.kitId === "string"
          ? body.kitId
          : typeof body.kit_id === "string"
            ? body.kit_id
            : null;
      const kits: BrandKitEntry[] = kitIdRaw
        ? (() => {
            const kit = findBrandKit(catalog, kitIdRaw);
            if (!kit) throw new Error("kit_not_found");
            return [kit];
          })()
        : catalog.kits;

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
      const skipped: Array<{ kitId: string; url: string; reason: string }> = [];
      let remaining = limit;

      for (const kit of kits) {
        if (remaining <= 0) break;
        const slice = kit.assets.slice(0, remaining);
        for (const asset of slice) {
          try {
            const downloaded = await downloadAllowlistedBrandAsset(kit, asset, {
              timeoutMs: cfg.timeoutMs,
              maxBytes: cfg.maxBytes
            });
            const png = await rasterizeToPng(downloaded.buffer, downloaded.contentType);
            const sourceId = brandKitSourceId(kit.id, asset.url);
            const dest = join(stagingDir, `${sourceId}${extensionForFilename(asset.filename)}`);
            await writeFile(dest, png);
            const job = runtime.runner.startUploadJob(
              {
                source_id: sourceId,
                filename: asset.filename.replace(/[^\w.-]+/g, "_").slice(0, 120) || "brand.png",
                path: dest,
                asset_kind: cfg.defaultAssetKind
              },
              { platformProjectId }
            );
            jobs.push({
              job_id: job.job_id,
              kit_id: kit.id,
              source: "connector:brand_kit",
              source_id: sourceId,
              asset_url: asset.url,
              role: asset.role ?? null,
              policy_version: catalog.policy_version,
              license_class: kit.licenseClass,
              craft_eligible: kit.craftEligibleDefault,
              asset_kind: cfg.defaultAssetKind
            });
            remaining -= 1;
          } catch (error: unknown) {
            skipped.push({
              kitId: kit.id,
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
        note: "brand_system uploads; craftEligible false until review PATCH"
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === "kit_not_found" ? 404 : 400;
      sendJson(response, status, { error: message });
    }
    return true;
  }

  sendJson(response, 404, { error: "not_found" });
  return true;
}

/** Test helper: pick first N assets from a kit without network. */
export function selectKitAssets(kit: BrandKitEntry, limit: number): BrandKitAsset[] {
  return kit.assets.slice(0, Math.max(0, limit));
}
