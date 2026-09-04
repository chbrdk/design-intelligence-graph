/**
 * Capture catalog source tiers for inspiration ranking.
 * Quality (CSSDA) > volume (Awwwards/FWA) for craft; vertical catalogs hard-match industry.
 * @see knowledge/design-facets.md
 * @see knowledge/dense-embeddings.md
 */
import { loadCaptureCatalog } from "./capture-catalog.js";
import { catalogHostKey, industryTagsForHost } from "./catalog-industry.js";
import { loadDigPaths } from "./runtime-paths.js";

export type CatalogSourceTier = "quality" | "volume" | "vertical" | "unknown";

const QUALITY_CATALOG_IDS = ["cssda-wotd-1000"] as const;
const VOLUME_CATALOG_IDS = [
  "awwwards-500",
  "awwwards-plus-1000",
  "awwwards-plus-2000",
  "awwwards-plus-3000",
  "awwwards-plus-4000",
  "siteinspire-1000",
  "thefwa-1000"
] as const;
const VERTICAL_CATALOG_IDS = [
  "insurance-1000",
  "insurance-plus-500",
  "automotive-oem-50",
  "engineering-manufacturing-1000",
  "public-sector-1000",
  "public-sector-plus-500"
] as const;

type HostSource = {
  tier: CatalogSourceTier;
  catalogs: string[];
};

let hostSourceIndex: Map<string, HostSource> | null = null;

export type CatalogSourceWeightConfig = {
  quality: number;
  volume: number;
  vertical: number;
  unknown: number;
  /** Extra additive boost when industry filter matches a vertical host. */
  industryVerticalBoost: number;
  enabled: boolean;
};

export function catalogSourceWeightConfig(root = process.cwd()): CatalogSourceWeightConfig {
  const cfg = loadDigPaths(root).catalogSourceWeights;
  const num = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    quality: num(cfg?.quality, 0.06),
    volume: num(cfg?.volume, 0.02),
    vertical: num(cfg?.vertical, 0.03),
    unknown: num(cfg?.unknown, 0),
    industryVerticalBoost: num(cfg?.industryVerticalBoost, 0.08),
    enabled: cfg?.enabled !== false
  };
}

function rememberHost(
  index: Map<string, HostSource>,
  url: string,
  catalogId: string,
  tier: CatalogSourceTier
): void {
  const host = catalogHostKey(url);
  if (!host) return;
  const current = index.get(host);
  if (!current) {
    index.set(host, { tier, catalogs: [catalogId] });
    return;
  }
  if (!current.catalogs.includes(catalogId)) current.catalogs.push(catalogId);
  // quality wins over volume/vertical; vertical wins over volume for dual-listed hosts
  if (tier === "quality") current.tier = "quality";
  else if (tier === "vertical" && current.tier !== "quality") current.tier = "vertical";
  else if (tier === "volume" && current.tier === "unknown") current.tier = "volume";
}

function loadHostSourceIndex(root = process.cwd()): Map<string, HostSource> {
  if (hostSourceIndex) return hostSourceIndex;
  const index = new Map<string, HostSource>();
  const load = (ids: readonly string[], tier: CatalogSourceTier) => {
    for (const catalogId of ids) {
      try {
        const catalog = loadCaptureCatalog(catalogId, root);
        for (const entry of catalog.entries) rememberHost(index, entry.url, catalogId, tier);
      } catch {
        /* optional in slim checkouts */
      }
    }
  };
  load(VOLUME_CATALOG_IDS, "volume");
  load(VERTICAL_CATALOG_IDS, "vertical");
  load(QUALITY_CATALOG_IDS, "quality");
  hostSourceIndex = index;
  return index;
}

/** Reset caches (tests). */
export function clearCatalogSourceCache(): void {
  hostSourceIndex = null;
}

export function catalogSourceTiersForHost(
  canonicalUrl?: string | null,
  siteDomain?: string | null,
  root = process.cwd()
): CatalogSourceTier {
  const index = loadHostSourceIndex(root);
  for (const host of [catalogHostKey(canonicalUrl), catalogHostKey(siteDomain)].filter(Boolean)) {
    const hit = index.get(host);
    if (hit) return hit.tier;
  }
  return "unknown";
}

export function catalogSourceCatalogsForHost(
  canonicalUrl?: string | null,
  siteDomain?: string | null,
  root = process.cwd()
): string[] {
  const index = loadHostSourceIndex(root);
  for (const host of [catalogHostKey(canonicalUrl), catalogHostKey(siteDomain)].filter(Boolean)) {
    const hit = index.get(host);
    if (hit) return [...hit.catalogs];
  }
  return [];
}

/**
 * Additive score boost for dense/library ranking.
 * When `industry` is set, vertical hosts that pin that industry get an extra boost.
 */
export function catalogSourceScoreBoost(
  opts: {
    canonicalUrl?: string | null;
    siteDomain?: string | null;
    industry?: string | null;
  },
  root = process.cwd()
): number {
  const weights = catalogSourceWeightConfig(root);
  if (!weights.enabled) return 0;
  const tier = catalogSourceTiersForHost(opts.canonicalUrl, opts.siteDomain, root);
  let boost =
    tier === "quality"
      ? weights.quality
      : tier === "volume"
        ? weights.volume
        : tier === "vertical"
          ? weights.vertical
          : weights.unknown;

  const industry = opts.industry?.trim();
  if (industry) {
    const tags = industryTagsForHost(opts.canonicalUrl, opts.siteDomain);
    if (tags.includes(industry)) boost += weights.industryVerticalBoost;
  }
  return boost;
}
