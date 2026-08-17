/**
 * Stable design facets for Library screen profile + future inspiration search.
 * Derived from vision_page / vision_layout (+ optional llm_items labels).
 */

import type { VisionLayoutBand } from "./vision-layout.js";
import type { VisionPageDocument } from "./vision-page.js";

export const DESIGN_FACETS_VERSION = "0.2.0" as const;

export const INDUSTRY_VOCAB = [
  "automotive",
  "finance",
  "marketing_agency",
  "luxury",
  "ecommerce",
  "media",
  "tech",
  "healthcare",
  "travel",
  "food",
  "fashion",
  "real_estate",
  "nonprofit",
  "other"
] as const;

export const STYLE_VOCAB = [
  "minimal",
  "editorial",
  "high-energy",
  "luxury-dark",
  "corporate",
  "playful",
  "brutalist",
  "photographic"
] as const;

export const LAYOUT_VOCAB = [
  "full-bleed stacks",
  "split columns",
  "card grid",
  "single column",
  "mixed"
] as const;

const LAYOUT_ALIASES: Record<string, (typeof LAYOUT_VOCAB)[number]> = {
  "full bleed": "full-bleed stacks",
  "full-bleed": "full-bleed stacks",
  "full width": "full-bleed stacks",
  stacks: "full-bleed stacks",
  split: "split columns",
  "two column": "split columns",
  grid: "card grid",
  cards: "card grid",
  "single-column": "single column"
};

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

function slug(value: string): string {
  return value.toLowerCase().replace(/[_|/-]+/g, " ").replace(/\s+/g, " ").trim();
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

function matchVocab(raw: string | null | undefined, vocab: readonly string[]): string | null {
  if (!raw) return null;
  const hay = slug(raw);
  for (const token of vocab) {
    const needle = slug(token);
    if (hay === needle) return token;
  }
  // Prefer longer tokens so "card grid" beats "grid" fragments in prose.
  const ranked = [...vocab].sort((a, b) => slug(b).length - slug(a).length);
  for (const token of ranked) {
    const needle = slug(token);
    if (needle.length < 4) continue;
    if (hay.includes(needle)) return token;
  }
  return null;
}

const INDUSTRY_ALIASES: Record<string, (typeof INDUSTRY_VOCAB)[number]> = {
  agency: "marketing_agency",
  "marketing agency": "marketing_agency",
  "marketing home": "marketing_agency",
  advertising: "marketing_agency",
  creative: "marketing_agency",
  auto: "automotive",
  car: "automotive",
  bank: "finance",
  insurance: "finance",
  fintech: "finance",
  shop: "ecommerce",
  retail: "ecommerce",
  commerce: "ecommerce",
  news: "media",
  publishing: "media",
  software: "tech",
  saas: "tech",
  technology: "tech",
  "ai technology": "tech",
  hospital: "healthcare",
  medical: "healthcare",
  hotel: "travel",
  airline: "travel",
  restaurant: "food",
  grocery: "food",
  apparel: "fashion",
  clothing: "fashion",
  property: "real_estate",
  housing: "real_estate",
  charity: "nonprofit",
  ngo: "nonprofit"
};

const CONTENT_NOISE = [
  "cannes",
  "lions",
  "sustainability",
  "b corp",
  "bcorp",
  "hero",
  "ticker",
  "carousel",
  "footer",
  "nav",
  "cta",
  "grid",
  "card"
];

export function normalizeIndustryTags(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const hay = slug(item);
    if (!hay) continue;
    if (CONTENT_NOISE.some((noise) => hay.includes(noise))) continue;
    const alias = INDUSTRY_ALIASES[hay];
    const matched = alias ?? matchVocab(item, INDUSTRY_VOCAB);
    if (!matched) continue;
    if (seen.has(matched)) continue;
    seen.add(matched);
    out.push(matched);
    if (out.length >= 3) break;
  }
  return out;
}

export function normalizeStyleLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hay = slug(raw);
  if (hay.includes("luxury") || (hay.includes("dark") && hay.includes("premium"))) return "luxury-dark";
  if (hay.includes("high energy") || hay.includes("high-energy")) return "high-energy";
  if (hay.includes("editorial")) return "editorial";
  if (hay.includes("minimal")) return "minimal";
  if (hay.includes("playful")) return "playful";
  if (hay.includes("brutal")) return "brutalist";
  if (hay.includes("photo")) return "photographic";
  if (hay.includes("corporate")) return "corporate";
  return matchVocab(raw, STYLE_VOCAB);
}

export function normalizeLayoutLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hay = slug(raw);
  const aliasHit = Object.entries(LAYOUT_ALIASES).find(([alias]) => hay.includes(alias));
  if (aliasHit) return aliasHit[1];
  return matchVocab(raw, LAYOUT_VOCAB);
}

export function normalizePageType(raw: string | null | undefined): string | null {
  const cleaned = clean(raw, 48);
  if (!cleaned) return null;
  return slug(cleaned).replace(/\s+/g, "_").slice(0, 48);
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
  const pageType = normalizePageType(page?.page_type);
  const style =
    normalizeStyleLabel(page?.overall_atmosphere) ??
    normalizeStyleLabel((input.visual_style_labels ?? []).find((item) => item.trim()) ?? null);
  const layout =
    normalizeLayoutLabel(page?.layout_system) ??
    normalizeLayoutLabel(page?.vertical_rhythm);
  const color = clean(page?.color_mood, 48);
  const typography = clean(page?.typography_feel, 40);
  const aboveFold =
    clean(page?.above_fold_job, 120) ?? clean(page?.above_the_fold, 120);

  const industry = normalizeIndustryTags([
    ...(Array.isArray(page?.category_tags) ? page!.category_tags!.map(String) : []),
    page?.page_type ?? "",
    ...(input.screen_pattern_labels ?? []).map(String)
  ]);

  const sectionCategories = uniqueStrings(
    (input.bands ?? [])
      .map((band) => String(band.category ?? "").trim())
      .filter(Boolean),
    12
  );

  const modules = uniqueStrings(
    Array.isArray(page?.notable_modules) ? page!.notable_modules!.map(String) : [],
    6
  );

  const confidence =
    typeof page?.confidence === "number" && Number.isFinite(page.confidence)
      ? Math.max(0, Math.min(1, page.confidence))
      : null;

  return {
    schema_version: "0.1.0",
    facets_version: DESIGN_FACETS_VERSION,
    page_type: pageType,
    industry_tags: industry,
    style,
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
