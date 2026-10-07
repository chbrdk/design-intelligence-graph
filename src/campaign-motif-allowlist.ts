/**
 * Campaign / print motif allowlist — explicit URLs only (no scrape).
 * Spec: plexon specs/domain/spirion-campaign-motif-allowlist.md
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isHostAllowed } from "./brand-kit-allowlist.js";
import { loadDigPaths } from "./runtime-paths.js";
import {
  normalizeAssetKind,
  normalizeLicenseClass,
  type LicenseClass,
  type SpirionAssetKind
} from "./spirion-asset.js";

export type CampaignMotifAsset = {
  url: string;
  filename: string;
  role?: string;
  assetKind?: SpirionAssetKind;
  commonsTitle?: string;
  notes?: string;
};

export type CampaignMotifPack = {
  id: string;
  name: string;
  sourcePage: string;
  hostAllowlist: string[];
  licenseClass: LicenseClass;
  craftEligibleDefault: boolean;
  defaultAssetKind: SpirionAssetKind;
  industryTags: string[];
  assets: CampaignMotifAsset[];
};

export type CampaignMotifCatalog = {
  schema_version: string;
  policy_version: string;
  doc?: string;
  notes?: string;
  packs: CampaignMotifPack[];
};

export function campaignMotifAllowlistConfig(root = process.cwd()): {
  catalogPath: string;
  apiPrefix: string;
  policyVersion: string;
  defaultAssetKind: SpirionAssetKind;
  maxAssetsPerSync: number;
  timeoutMs: number;
  maxBytes: number;
  fetchUserAgent: string;
} {
  const paths = loadDigPaths(root) as {
    campaignMotifAllowlist?: {
      catalogPath?: string;
      apiPrefix?: string;
      policyVersion?: string;
      defaultAssetKind?: string;
      maxAssetsPerSync?: number;
      timeoutMs?: number;
      maxBytes?: number;
      fetchUserAgent?: string;
    };
    api?: { campaignMotifsPath?: string };
    imageIngest?: { maxBytes?: number };
  };
  const cfg = paths.campaignMotifAllowlist ?? {};
  const maxAssets = Number(cfg.maxAssetsPerSync);
  const timeoutMs = Number(cfg.timeoutMs);
  const maxBytes = Number(cfg.maxBytes ?? paths.imageIngest?.maxBytes);
  return {
    catalogPath: cfg.catalogPath ?? "knowledge/catalogs/campaign-motif-allowlist.json",
    apiPrefix: cfg.apiPrefix ?? paths.api?.campaignMotifsPath ?? "/api/campaign-motifs",
    policyVersion: cfg.policyVersion ?? "campaign_motif_allowlist_2026-10",
    defaultAssetKind: normalizeAssetKind(cfg.defaultAssetKind, "print_ad"),
    maxAssetsPerSync: Number.isFinite(maxAssets) ? Math.min(40, Math.max(1, Math.round(maxAssets))) : 20,
    timeoutMs: Number.isFinite(timeoutMs) ? Math.min(120_000, Math.max(3_000, Math.round(timeoutMs))) : 45_000,
    maxBytes: Number.isFinite(maxBytes) ? Math.max(64_000, Math.round(maxBytes)) : 12_582_912,
    fetchUserAgent:
      typeof cfg.fetchUserAgent === "string" && cfg.fetchUserAgent.trim()
        ? cfg.fetchUserAgent.trim()
        : "SpirionAllowlistBot/1.0 (https://github.com/chbrdk/design-intelligence-graph; campaign-motif allowlist)"
  };
}

export async function loadCampaignMotifCatalog(root = process.cwd()): Promise<CampaignMotifCatalog> {
  const cfg = campaignMotifAllowlistConfig(root);
  const absolute = resolve(root, cfg.catalogPath);
  const raw = JSON.parse(await readFile(absolute, "utf8")) as CampaignMotifCatalog;
  if (!Array.isArray(raw.packs)) throw new Error("campaign_motif_catalog_invalid");
  return {
    schema_version: String(raw.schema_version ?? "0.1.0"),
    policy_version: String(raw.policy_version ?? cfg.policyVersion),
    ...(typeof raw.doc === "string" ? { doc: raw.doc } : {}),
    ...(typeof raw.notes === "string" ? { notes: raw.notes } : {}),
    packs: raw.packs.map(normalizePack)
  };
}

function normalizePack(raw: CampaignMotifPack): CampaignMotifPack {
  const id = String(raw.id ?? "").trim().toLowerCase();
  if (!id) throw new Error("campaign_motif_missing_pack_id");
  const defaultAssetKind = normalizeAssetKind(raw.defaultAssetKind, "print_ad");
  const assets = Array.isArray(raw.assets)
    ? raw.assets
        .filter((a) => a && typeof a.url === "string" && a.url.trim())
        .map((a) => ({
          url: a.url.trim(),
          filename: String(a.filename ?? "motif.jpg").trim() || "motif.jpg",
          ...(a.role ? { role: String(a.role) } : {}),
          ...(a.assetKind
            ? { assetKind: normalizeAssetKind(a.assetKind, defaultAssetKind) }
            : {}),
          ...(a.commonsTitle ? { commonsTitle: String(a.commonsTitle) } : {}),
          ...(a.notes ? { notes: String(a.notes) } : {})
        }))
    : [];
  return {
    id,
    name: String(raw.name ?? id),
    sourcePage: String(raw.sourcePage ?? ""),
    hostAllowlist: (raw.hostAllowlist ?? []).map((h) => String(h).trim().toLowerCase()).filter(Boolean),
    licenseClass: normalizeLicenseClass(raw.licenseClass, "public_domain"),
    craftEligibleDefault: raw.craftEligibleDefault === true,
    defaultAssetKind,
    industryTags: Array.isArray(raw.industryTags)
      ? raw.industryTags.map((t) => String(t)).filter(Boolean)
      : [],
    assets
  };
}

export function findCampaignMotifPack(
  catalog: CampaignMotifCatalog,
  packId: string
): CampaignMotifPack | null {
  const id = packId.trim().toLowerCase();
  return catalog.packs.find((p) => p.id === id) ?? null;
}

export function assertMotifAssetUrlAllowed(pack: CampaignMotifPack, asset: CampaignMotifAsset | string): void {
  const assetUrl = typeof asset === "string" ? asset : asset.url;
  const found = pack.assets.some((a) => a.url === assetUrl);
  if (!found) {
    throw new Error(`asset_url_not_in_pack:${pack.id}`);
  }
  if (!isHostAllowed(assetUrl, pack.hostAllowlist)) {
    throw new Error(`asset_host_not_allowed:${pack.id}`);
  }
}

export function campaignMotifSourceId(packId: string, assetUrl: string): string {
  const digest = createHash("sha256").update(assetUrl).digest("hex").slice(0, 16);
  return `motif_${packId}_${digest}`;
}

export function resolveMotifAssetKind(pack: CampaignMotifPack, asset: CampaignMotifAsset): SpirionAssetKind {
  return asset.assetKind ?? pack.defaultAssetKind;
}

export async function downloadAllowlistedMotifAsset(
  pack: CampaignMotifPack,
  asset: CampaignMotifAsset,
  options: {
    timeoutMs: number;
    maxBytes: number;
    fetchUserAgent: string;
  } = campaignMotifAllowlistConfig()
): Promise<{ buffer: Buffer; contentType: string }> {
  assertMotifAssetUrlAllowed(pack, asset);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(asset.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": options.fetchUserAgent,
        accept: "image/png,image/jpeg,image/webp,image/gif,image/*;q=0.8,*/*;q=0.1"
      }
    });
    if (!response.ok) {
      throw new Error(`campaign_motif_fetch_failed:${response.status}`);
    }
    if (!isHostAllowed(response.url || asset.url, pack.hostAllowlist)) {
      throw new Error(`asset_host_not_allowed_after_redirect:${pack.id}`);
    }
    const contentType =
      (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() || "";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.byteLength > options.maxBytes) {
      throw new Error("campaign_motif_asset_too_large");
    }
    if (buffer.byteLength < 32) {
      throw new Error("campaign_motif_asset_empty");
    }
    return { buffer, contentType };
  } finally {
    clearTimeout(timer);
  }
}

export { isHostAllowed };
