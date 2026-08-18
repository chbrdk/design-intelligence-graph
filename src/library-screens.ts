/**
 * Library screen list with compact design facets (shared by HTTP + MCP).
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Queryable } from "./db.js";
import {
  buildDesignFacets,
  CHROME_WEIGHT_VOCAB,
  COMPOSITION_ENERGY_VOCAB,
  CONTRAST_MODE_VOCAB,
  DESIGN_FACETS_VERSION,
  IMAGERY_DENSITY_VOCAB,
  INDUSTRY_VOCAB,
  LAYOUT_VOCAB,
  STYLE_VOCAB,
  TYPE_IMAGE_MODE_VOCAB,
  TYPE_SCALE_VOCAB,
  designFacetFilterCatalog,
  normalizeFacetFilterValue,
  screenFacetsMatch,
  summarizeDesignFacets,
  type ScreenFacetFilter,
  type ScreenFacetSummary
} from "./design-facets.js";
import { libraryCardScreenshotPath } from "./library-screenshot.js";
import { loadVisionPageDocument } from "./vision-page.js";
import { captureNavConfig } from "./capture-nav.js";

export type LibraryScreenListOpts = ScreenFacetFilter & {
  platformProjectId?: string | null | undefined;
  limit?: number | undefined;
};

export type LibraryScreenRecord = Record<string, unknown> & {
  capture_run_id: string;
  viewport_capture_id: string;
  name: string;
  title: string | null;
  site_domain: string | null;
  canonical_url: string;
  package_path?: string | null;
  settled_screenshot_path?: unknown;
  full_page_screenshot_path?: unknown;
  design_facets: ScreenFacetSummary | null;
};

export type LibraryScreenHit = {
  capture_run_id: string;
  viewport_capture_id: string;
  name: string;
  title: string | null;
  site_domain: string | null;
  canonical_url: string;
  design_facets: ScreenFacetSummary | null;
};

function clampLimit(limit: unknown, fallback: number, max: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(limit)));
}

async function compactFacetsForPackage(
  packagePath: string | null,
  cache: Map<string, ScreenFacetSummary | null>,
  hints: { site_domain?: string | null; canonical_url?: string | null }
): Promise<ScreenFacetSummary | null> {
  if (!packagePath) return null;
  if (cache.has(packagePath)) return cache.get(packagePath) ?? null;
  const [visionPage, llm] = await Promise.all([
    loadVisionPageDocument(packagePath).catch(() => null),
    loadLlmDesignDisk(packagePath)
  ]);
  const screen_pattern_labels = (llm?.mobbin?.screen_patterns ?? [])
    .map((item) => String(item.name ?? "").trim())
    .filter(Boolean);
  const visual_style_labels = (llm?.mobbin?.visual_style_labels ?? [])
    .map((item) => String(item.name ?? "").trim())
    .filter(Boolean);
  const summary = summarizeDesignFacets(
    buildDesignFacets({
      vision_page: visionPage,
      screen_pattern_labels,
      visual_style_labels,
      design_summary: llm?.design_summary ?? null,
      site_domain: hints.site_domain ?? null,
      canonical_url: hints.canonical_url ?? null
    })
  );
  const usable = summary.style || summary.layout || (summary.industry_tags?.length ?? 0) || summary.imagery_density;
  const value = usable ? summary : null;
  cache.set(packagePath, value);
  return value;
}

type LlmDisk = {
  design_summary?: string;
  mobbin?: {
    screen_patterns?: Array<{ name?: string }>;
    visual_style_labels?: Array<{ name?: string }>;
  };
};

async function loadLlmDesignDisk(packagePath: string): Promise<LlmDisk | null> {
  try {
    const raw = await readFile(resolve(packagePath, "derived/llm-design.json"), "utf8");
    return JSON.parse(raw) as LlmDisk;
  } catch {
    return null;
  }
}

export function hasScreenFacetFilters(opts: ScreenFacetFilter): boolean {
  return Boolean(
    opts.q?.trim() ||
    normalizeFacetFilterValue(opts.style ?? null, STYLE_VOCAB) ||
      normalizeFacetFilterValue(opts.layout ?? null, LAYOUT_VOCAB) ||
      normalizeFacetFilterValue(opts.industry ?? null, INDUSTRY_VOCAB) ||
      normalizeFacetFilterValue(opts.imagery_density ?? null, IMAGERY_DENSITY_VOCAB) ||
      normalizeFacetFilterValue(opts.type_scale ?? null, TYPE_SCALE_VOCAB) ||
      normalizeFacetFilterValue(opts.type_image_mode ?? null, TYPE_IMAGE_MODE_VOCAB) ||
      normalizeFacetFilterValue(opts.contrast_mode ?? null, CONTRAST_MODE_VOCAB) ||
      normalizeFacetFilterValue(opts.composition_energy ?? null, COMPOSITION_ENERGY_VOCAB) ||
      normalizeFacetFilterValue(opts.chrome_weight ?? null, CHROME_WEIGHT_VOCAB) ||
      (opts.modules ?? []).some((item) => item.trim()) ||
      (opts.craft_tags ?? []).some((item) => item.trim())
  );
}

export async function captureRunIdsForScreenFacets(
  client: Queryable,
  opts: LibraryScreenListOpts = {}
): Promise<string[] | null> {
  if (!hasScreenFacetFilters(opts)) return null;
  const screens = await listLibraryScreens(client, { ...opts, limit: opts.limit ?? 200 });
  return [...new Set(screens.map((row) => row.capture_run_id).filter(Boolean))];
}

export function publicLibraryScreenHit(row: LibraryScreenRecord): LibraryScreenHit {
  return {
    capture_run_id: row.capture_run_id,
    viewport_capture_id: row.viewport_capture_id,
    name: row.name,
    title: row.title,
    site_domain: row.site_domain,
    canonical_url: row.canonical_url,
    design_facets: row.design_facets
  };
}

export async function listLibraryScreens(
  client: Queryable,
  opts: LibraryScreenListOpts = {}
): Promise<LibraryScreenRecord[]> {
  const filter: ScreenFacetFilter = {
    q: typeof opts.q === "string" ? opts.q.trim() : undefined,
    style: normalizeFacetFilterValue(opts.style ?? null, STYLE_VOCAB),
    layout: normalizeFacetFilterValue(opts.layout ?? null, LAYOUT_VOCAB),
    industry: normalizeFacetFilterValue(opts.industry ?? null, INDUSTRY_VOCAB),
    modules: Array.isArray(opts.modules) ? opts.modules.map(String).map((item) => item.trim()).filter(Boolean) : undefined,
    craft_tags: Array.isArray(opts.craft_tags)
      ? opts.craft_tags.map(String).map((item) => item.trim()).filter(Boolean)
      : undefined,
    imagery_density: normalizeFacetFilterValue(opts.imagery_density ?? null, IMAGERY_DENSITY_VOCAB),
    type_scale: normalizeFacetFilterValue(opts.type_scale ?? null, TYPE_SCALE_VOCAB),
    type_image_mode: normalizeFacetFilterValue(opts.type_image_mode ?? null, TYPE_IMAGE_MODE_VOCAB),
    contrast_mode: normalizeFacetFilterValue(opts.contrast_mode ?? null, CONTRAST_MODE_VOCAB),
    composition_energy: normalizeFacetFilterValue(opts.composition_energy ?? null, COMPOSITION_ENERGY_VOCAB),
    chrome_weight: normalizeFacetFilterValue(opts.chrome_weight ?? null, CHROME_WEIGHT_VOCAB)
  };
  const limit = clampLimit(opts.limit, 200, 200);
  const values: unknown[] = [];
  const clauses: string[] = [];
  if (opts.platformProjectId?.trim()) {
    values.push(opts.platformProjectId.trim());
    clauses.push(`c.platform_project_id = $${values.length}`);
  }
  const listedStatuses = captureNavConfig().libraryListedStatuses;
  const statusPlaceholders = listedStatuses.map((status) => {
    values.push(status);
    return `$${values.length}`;
  });
  clauses.push(`(v.status IS NULL OR v.status IN (${statusPlaceholders.join(", ")}))`);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  values.push(limit);
  const result = await client.query(
    `SELECT v.id, v.capture_run_id, v.viewport_capture_id, v.name, v.status, v.width, v.height,
            v.document_width, v.document_height,
            v.title, v.settled_screenshot_path, v.full_page_screenshot_path,
            c.canonical_url, c.site_domain, c.package_path
     FROM viewports v
     JOIN captures c ON c.capture_run_id = v.capture_run_id
     ${where}
     ORDER BY c.indexed_at DESC, v.name
     LIMIT $${values.length}`,
    values
  );
  const facetCache = new Map<string, ScreenFacetSummary | null>();
  const uniquePackages = [
    ...new Set(
      result.rows
        .map((row) => (typeof row.package_path === "string" ? row.package_path : ""))
        .filter(Boolean)
    )
  ];
  const rowByPackage = new Map<string, { site_domain?: unknown; canonical_url?: unknown }>();
  for (const row of result.rows) {
    const pkg = typeof row.package_path === "string" ? row.package_path : "";
    if (pkg && !rowByPackage.has(pkg)) rowByPackage.set(pkg, row);
  }
  await Promise.all(
    uniquePackages.map((pkg) => {
      const row = rowByPackage.get(pkg);
      return compactFacetsForPackage(pkg, facetCache, {
        site_domain: typeof row?.site_domain === "string" ? row.site_domain : null,
        canonical_url: typeof row?.canonical_url === "string" ? row.canonical_url : null
      });
    })
  );
  const screens: LibraryScreenRecord[] = [];
  for (const row of result.rows) {
    const packagePath = typeof row.package_path === "string" ? row.package_path : null;
    const design_facets = packagePath ? (facetCache.get(packagePath) ?? null) : null;
    if (!screenFacetsMatch(design_facets, filter)) continue;
    screens.push({
      ...row,
      capture_run_id: String(row.capture_run_id ?? ""),
      viewport_capture_id: String(row.viewport_capture_id ?? ""),
      name: String(row.name ?? ""),
      title: typeof row.title === "string" ? row.title : null,
      site_domain: typeof row.site_domain === "string" ? row.site_domain : null,
      canonical_url: String(row.canonical_url ?? ""),
      package_path: packagePath,
      full_page_screenshot_path: libraryCardScreenshotPath(row),
      design_facets
    });
  }
  return screens;
}

export function libraryScreenFacetCatalog() {
  return {
    facet_filters: designFacetFilterCatalog(),
    facets_version: DESIGN_FACETS_VERSION
  };
}
