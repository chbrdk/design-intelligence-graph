/**
 * Stable design facets for Library screen profile + future inspiration search.
 * Derived from vision_page / vision_layout (+ optional llm_items labels).
 */

import type { VisionLayoutBand } from "./vision-layout.js";
import type { VisionPageDocument } from "./vision-page.js";

export const DESIGN_FACETS_VERSION = "0.1.0" as const;

export type DesignFacets = {
  schema_version: "0.1.0";
  facets_version: typeof DESIGN_FACETS_VERSION;
  page_type: string | null;
  industry_tags: string[];
  style: string | null;
  layout: string | null;
  color_mood: string | null;
  typography: string | null;
  above_fold_job: string | null;
  section_categories: string[];
  modules: string[];
  confidence: number | null;
};

function clean(value: unknown, max = 120): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function uniqueStrings(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const key = raw.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(raw.trim());
    if (out.length >= max) break;
  }
  return out;
}

export type DesignFacetsInput = {
  vision_page?: Partial<VisionPageDocument> | null;
  bands?: Array<Pick<VisionLayoutBand, "category" | "label">> | null;
  screen_pattern_labels?: string[] | null;
  visual_style_labels?: string[] | null;
};

/** Build searchable / scannable facets from package + indexed labels. */
export function buildDesignFacets(input: DesignFacetsInput): DesignFacets {
  const page = input.vision_page ?? null;
  const pageType = clean(page?.page_type, 80);
  const style = clean(page?.overall_atmosphere, 80);
  const layout =
    clean(page?.layout_system, 80) ??
    clean(page?.vertical_rhythm, 100) ??
    null;
  const color = clean(page?.color_mood, 80);
  const typography = clean(page?.typography_feel, 80);
  const aboveFold =
    clean(page?.above_fold_job, 160) ?? clean(page?.above_the_fold, 160);

  const industry = uniqueStrings(
    [
      ...(Array.isArray(page?.category_tags) ? page!.category_tags!.map(String) : []),
      ...(input.screen_pattern_labels ?? []).map(String)
    ],
    8
  );

  const sectionCategories = uniqueStrings(
    (input.bands ?? [])
      .map((band) => String(band.category ?? "").trim())
      .filter(Boolean),
    12
  );

  const modules = uniqueStrings(
    [
      ...(Array.isArray(page?.notable_modules) ? page!.notable_modules!.map(String) : []),
      ...(input.bands ?? []).map((band) => String(band.label ?? "").trim())
    ],
    10
  );

  // Prefer vision confidence; style labels from DOM path are secondary only for tags.
  const confidence =
    typeof page?.confidence === "number" && Number.isFinite(page.confidence)
      ? Math.max(0, Math.min(1, page.confidence))
      : null;

  // If vision style missing, fall back to first visual_style label.
  const styleFallback =
    style ??
    clean((input.visual_style_labels ?? []).map(String).find((item) => item.trim()) ?? null, 80);

  return {
    schema_version: "0.1.0",
    facets_version: DESIGN_FACETS_VERSION,
    page_type: pageType,
    industry_tags: industry,
    style: styleFallback,
    layout,
    color_mood: color,
    typography,
    above_fold_job: aboveFold,
    section_categories: sectionCategories,
    modules,
    confidence
  };
}

export function designFacetsHaveSignal(facets: DesignFacets): boolean {
  return Boolean(
    facets.page_type ||
      facets.style ||
      facets.layout ||
      facets.color_mood ||
      facets.typography ||
      facets.industry_tags.length ||
      facets.section_categories.length ||
      facets.above_fold_job
  );
}
