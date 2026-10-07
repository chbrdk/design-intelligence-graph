/**
 * Public brand-kit allowlist — explicit URLs only (no scrape).
 * Spec: plexon specs/domain/spirion-brand-kit-allowlist.md
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadDigPaths } from "./runtime-paths.js";
import { normalizeLicenseClass, type LicenseClass } from "./spirion-asset.js";

export type BrandKitAsset = {
  url: string;
  filename: string;
  role?: string;
};

export type BrandKitEntry = {
  id: string;
  name: string;
  guidelinesUrl: string;
  hostAllowlist: string[];
  licenseClass: LicenseClass;
  craftEligibleDefault: boolean;
  industryTags: string[];
  assets: BrandKitAsset[];
};

export type BrandKitCatalog = {
  schema_version: string;
  policy_version: string;
  doc?: string;
  notes?: string;
  kits: BrandKitEntry[];
};

export function brandKitAllowlistConfig(root = process.cwd()): {
  catalogPath: string;
  apiPrefix: string;
  policyVersion: string;
  defaultAssetKind: string;
  maxAssetsPerSync: number;
  timeoutMs: number;
  maxBytes: number;
} {
  const paths = loadDigPaths(root) as {
    brandKitAllowlist?: {
      catalogPath?: string;
      apiPrefix?: string;
      policyVersion?: string;
      defaultAssetKind?: string;
      maxAssetsPerSync?: number;
      timeoutMs?: number;
      maxBytes?: number;
    };
    api?: { brandKitsPath?: string };
    imageIngest?: { maxBytes?: number };
  };
  const cfg = paths.brandKitAllowlist ?? {};
  const maxAssets = Number(cfg.maxAssetsPerSync);
  const timeoutMs = Number(cfg.timeoutMs);
  const maxBytes = Number(cfg.maxBytes ?? paths.imageIngest?.maxBytes);
  return {
    catalogPath: cfg.catalogPath ?? "knowledge/catalogs/brand-kit-allowlist.json",
    apiPrefix: cfg.apiPrefix ?? paths.api?.brandKitsPath ?? "/api/brand-kits",
    policyVersion: cfg.policyVersion ?? "brand_kit_allowlist_2026-10",
    defaultAssetKind: cfg.defaultAssetKind ?? "brand_system",
    maxAssetsPerSync: Number.isFinite(maxAssets) ? Math.min(40, Math.max(1, Math.round(maxAssets))) : 20,
    timeoutMs: Number.isFinite(timeoutMs) ? Math.min(120_000, Math.max(3_000, Math.round(timeoutMs))) : 30_000,
    maxBytes: Number.isFinite(maxBytes) ? Math.max(64_000, Math.round(maxBytes)) : 12_582_912
  };
}

export async function loadBrandKitCatalog(root = process.cwd()): Promise<BrandKitCatalog> {
  const cfg = brandKitAllowlistConfig(root);
  const absolute = resolve(root, cfg.catalogPath);
  const raw = JSON.parse(await readFile(absolute, "utf8")) as BrandKitCatalog;
  if (!Array.isArray(raw.kits)) throw new Error("brand_kit_catalog_invalid");
  return {
    schema_version: String(raw.schema_version ?? "0.1.0"),
    policy_version: String(raw.policy_version ?? cfg.policyVersion),
    ...(typeof raw.doc === "string" ? { doc: raw.doc } : {}),
    ...(typeof raw.notes === "string" ? { notes: raw.notes } : {}),
    kits: raw.kits.map(normalizeKit)
  };
}

function normalizeKit(raw: BrandKitEntry): BrandKitEntry {
  const id = String(raw.id ?? "").trim().toLowerCase();
  if (!id) throw new Error("brand_kit_missing_id");
  const assets = Array.isArray(raw.assets)
    ? raw.assets
        .filter((a) => a && typeof a.url === "string" && a.url.trim())
        .map((a) => ({
          url: a.url.trim(),
          filename: String(a.filename ?? "asset.png").trim() || "asset.png",
          ...(a.role ? { role: String(a.role) } : {})
        }))
    : [];
  return {
    id,
    name: String(raw.name ?? id),
    guidelinesUrl: String(raw.guidelinesUrl ?? ""),
    hostAllowlist: (raw.hostAllowlist ?? []).map((h) => String(h).trim().toLowerCase()).filter(Boolean),
    licenseClass: normalizeLicenseClass(raw.licenseClass, "connector_tos"),
    craftEligibleDefault: raw.craftEligibleDefault === true,
    industryTags: Array.isArray(raw.industryTags)
      ? raw.industryTags.map((t) => String(t)).filter(Boolean)
      : [],
    assets
  };
}

export function findBrandKit(catalog: BrandKitCatalog, kitId: string): BrandKitEntry | null {
  const id = kitId.trim().toLowerCase();
  return catalog.kits.find((k) => k.id === id) ?? null;
}

/** Exact host or subdomain of an allowlisted host. */
export function isHostAllowed(assetUrl: string, hostAllowlist: string[]): boolean {
  let host: string;
  try {
    host = new URL(assetUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!hostAllowlist.length) return false;
  return hostAllowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export function assertAssetUrlAllowed(kit: BrandKitEntry, assetUrl: string): void {
  if (!kit.assets.some((a) => a.url === assetUrl)) {
    throw new Error(`asset_url_not_in_kit:${kit.id}`);
  }
  if (!isHostAllowed(assetUrl, kit.hostAllowlist)) {
    throw new Error(`asset_host_not_allowed:${kit.id}`);
  }
}

export function brandKitSourceId(kitId: string, assetUrl: string): string {
  const digest = createHash("sha256").update(assetUrl).digest("hex").slice(0, 16);
  return `brandkit_${kitId}_${digest}`;
}

export async function downloadAllowlistedBrandAsset(
  kit: BrandKitEntry,
  asset: BrandKitAsset,
  options: { timeoutMs: number; maxBytes: number } = brandKitAllowlistConfig()
): Promise<{ buffer: Buffer; contentType: string }> {
  assertAssetUrlAllowed(kit, asset.url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(asset.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { accept: "image/png,image/jpeg,image/webp,image/gif,*/*;q=0.1" }
    });
    if (!response.ok) {
      throw new Error(`brand_kit_fetch_failed:${response.status}`);
    }
    // Re-check final URL host after redirects.
    if (!isHostAllowed(response.url || asset.url, kit.hostAllowlist)) {
      throw new Error(`asset_host_not_allowed_after_redirect:${kit.id}`);
    }
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() || "";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.byteLength > options.maxBytes) {
      throw new Error("brand_kit_asset_too_large");
    }
    if (buffer.byteLength < 32) {
      throw new Error("brand_kit_asset_empty");
    }
    return { buffer, contentType };
  } finally {
    clearTimeout(timer);
  }
}
