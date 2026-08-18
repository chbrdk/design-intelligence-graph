/**
 * Stable design facets for Library screen profile + future inspiration search.
 * Derived from vision_page / vision_layout (+ optional llm_items labels).
 */

import type { VisionLayoutBand } from "./vision-layout.js";
import type { VisionPageDocument } from "./vision-page.js";
import type { DesignTokensDocument } from "./design-tokens.js";
import { buildLookContract, type LookContract } from "./look-contract.js";

export const DESIGN_FACETS_VERSION = "0.3.0" as const;

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

export const IMAGERY_DENSITY_VOCAB = ["none", "low", "medium", "high"] as const;
export const TYPE_SCALE_VOCAB = ["small", "medium", "large", "monumental"] as const;
export const TYPE_IMAGE_MODE_VOCAB = ["separate", "adjacent", "overlap", "through_image"] as const;
export const CONTRAST_MODE_VOCAB = ["monochrome", "low_contrast", "mixed", "saturated"] as const;
export const COMPOSITION_ENERGY_VOCAB = ["calm", "balanced", "dynamic"] as const;
export const CHROME_WEIGHT_VOCAB = ["minimal", "balanced", "interface_heavy"] as const;

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
  imagery_density: string | null;
  type_scale: string | null;
  type_image_mode: string | null;
  contrast_mode: string | null;
  composition_energy: string | null;
  chrome_weight: string | null;
  craft_tags: string[];
  confidence: number | null;
  look_contract: LookContract | null;
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

function includesAny(raw: string, needles: string[]): boolean {
  return needles.some((needle) => raw.includes(needle));
}

function normalizeCraftTag(raw: string): string | null {
  const value = slug(raw).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, "_").replace(/^_+|_+$/g, "");
  if (!value) return null;
  return value.slice(0, 48);
}

function deriveImageryDensity(page: Partial<VisionPageDocument> | null): (typeof IMAGERY_DENSITY_VOCAB)[number] | null {
  const hay = slug(
    [
      page?.media_strategy,
      page?.above_the_fold,
      page?.visual_craft?.imagery_craft,
      ...(page?.notable_modules ?? [])
    ]
      .filter(Boolean)
      .join(" ")
  );
  if (!hay) return null;
  if (includesAny(hay, ["text only", "no image", "without image", "type only"])) return "none";
  if (includesAny(hay, ["few images", "little imagery", "single image", "one image", "single render", "single architectural", "grayscale reprise", "secondary imagery"])) return "low";
  if (includesAny(hay, ["gallery", "many images", "image wall", "collage", "multiple photos", "repeated images"])) return "high";
  if (includesAny(hay, ["hero image", "photo", "render", "architectural", "video", "imagery"])) return "medium";
  return null;
}

function deriveTypeScale(page: Partial<VisionPageDocument> | null): (typeof TYPE_SCALE_VOCAB)[number] | null {
  const hay = slug(
    [page?.typography_feel, page?.above_the_fold, page?.visual_craft?.typography_composition]
      .filter(Boolean)
      .join(" ")
  );
  if (!hay) return null;
  if (includesAny(hay, ["massive", "huge", "giant", "monumental", "80 100px", "oversized"])) return "monumental";
  if (includesAny(hay, ["large", "display", "bold editorial", "big headline"])) return "large";
  if (includesAny(hay, ["small", "compact", "tiny"])) return "small";
  return "medium";
}

function deriveTypeImageMode(page: Partial<VisionPageDocument> | null): (typeof TYPE_IMAGE_MODE_VOCAB)[number] | null {
  const hay = slug(
    [page?.above_the_fold, page?.visual_craft?.type_image_relationship, page?.rebuild_hints]
      .filter(Boolean)
      .join(" ")
  );
  if (!hay) return null;
  if (includesAny(hay, ["cuts through", "through image", "inside image", "knock out"])) return "through_image";
  if (includesAny(hay, ["overlap", "layered", "behind the top edge", "on the image", "overlay"])) return "overlap";
  if (includesAny(hay, ["beside", "alongside", "flanked by", "side by side"])) return "adjacent";
  return "separate";
}

function deriveContrastMode(page: Partial<VisionPageDocument> | null): (typeof CONTRAST_MODE_VOCAB)[number] | null {
  const hay = slug(
    [page?.color_mood, page?.overall_atmosphere, page?.visual_craft?.imagery_craft]
      .filter(Boolean)
      .join(" ")
  );
  if (!hay) return null;
  if (includesAny(hay, ["monochrome", "black and white", "grayscale", "monochrome slate"])) return "monochrome";
  if (includesAny(hay, ["muted", "soft contrast", "low contrast"])) return "low_contrast";
  if (includesAny(hay, ["vibrant", "saturated", "neon", "bright accent", "colorful"])) return "saturated";
  return "mixed";
}

function deriveCompositionEnergy(
  page: Partial<VisionPageDocument> | null,
  style: string | null
): (typeof COMPOSITION_ENERGY_VOCAB)[number] | null {
  const hay = slug(
    [page?.vertical_rhythm, page?.layout_system, page?.visual_craft?.spatial_craft, style]
      .filter(Boolean)
      .join(" ")
  );
  if (!hay) return null;
  if (includesAny(hay, ["dynamic", "asymmetric", "broken grid", "high energy", "motion blur"])) return "dynamic";
  if (includesAny(hay, ["minimal", "calm", "quiet", "single column", "airy"])) return "calm";
  return "balanced";
}

function deriveChromeWeight(page: Partial<VisionPageDocument> | null): (typeof CHROME_WEIGHT_VOCAB)[number] | null {
  const hay = slug(
    [page?.interaction_chrome, page?.visual_craft?.chrome_vs_content]
      .filter(Boolean)
      .join(" ")
  );
  if (!hay) return null;
  if (includesAny(hay, ["tiny nav", "minimal chrome", "simple icons", "reduced to tiny text", "pill", "minimalist"])) return "minimal";
  if (includesAny(hay, ["dashboard", "dense ui", "toolbar heavy", "interface heavy", "many controls"])) return "interface_heavy";
  return "balanced";
}

function deriveCraftTags(page: Partial<VisionPageDocument> | null): string[] {
  const tags = new Set<string>();
  const add = (value: string | null) => {
    if (!value) return;
    tags.add(value);
  };
  for (const module of page?.notable_modules ?? []) add(normalizeCraftTag(module));
  const fields = [
    page?.overall_atmosphere,
    page?.typography_feel,
    page?.color_mood,
    page?.media_strategy,
    page?.interaction_chrome,
    page?.visual_craft?.type_image_relationship,
    page?.visual_craft?.typography_composition,
    page?.visual_craft?.imagery_craft,
    page?.visual_craft?.spatial_craft,
    page?.visual_craft?.chrome_vs_content
  ]
    .filter(Boolean)
    .join(" ");
  const hay = slug(fields);
  if (!hay) return [];
  if (includesAny(hay, ["editorial", "display caps", "massive display"])) add("editorial_type");
  if (includesAny(hay, ["stats column", "stats are right aligned", "key statistics"])) add("stats_column");
  if (includesAny(hay, ["split wordmark", "city arcade", "city arcade"])) add("split_wordmark");
  if (includesAny(hay, ["black cards", "alternating white and black cards", "inverted feature"])) add("inverted_card");
  if (includesAny(hay, ["grayscale reprise", "black and white", "desaturated", "grayscale"])) add("grayscale_reprise");
  if (includesAny(hay, ["few images", "little imagery", "single image", "single render", "single architectural", "secondary imagery"])) add("low_imagery");
  if (includesAny(hay, ["overlap", "layered behind", "overlay"])) add("type_over_image");
  if (includesAny(hay, ["minimal chrome", "tiny nav", "simple icons", "pill shaped"])) add("minimal_chrome");
  if (includesAny(hay, ["motion blur", "blur"])) add("motion_blur");
  if (includesAny(hay, ["monochrome", "black and white", "grayscale"])) add("monochrome");
  return [...tags].slice(0, 12);
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
  tokens?: DesignTokensDocument | null;
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
  const imagery_density = deriveImageryDensity(page);
  const type_scale = deriveTypeScale(page);
  const type_image_mode = deriveTypeImageMode(page);
  const contrast_mode = deriveContrastMode(page);
  const composition_energy = deriveCompositionEnergy(page, style);
  const chrome_weight = deriveChromeWeight(page);
  const craft_tags = deriveCraftTags(page);

  const confidence =
    typeof page?.confidence === "number" && Number.isFinite(page.confidence)
      ? Math.max(0, Math.min(1, page.confidence))
      : null;

  const look_contract = buildLookContract({
    tokens: input.tokens ?? null,
    spacing_feel: page?.spacing_feel ?? null,
    layout,
    style
  });

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
    imagery_density,
    type_scale,
    type_image_mode,
    contrast_mode,
    composition_energy,
    chrome_weight,
    craft_tags,
    confidence,
    look_contract
  };
}

export function designFacetsHaveSignal(facets: DesignFacets): boolean {
  return Boolean(
    facets.page_type ||
      facets.style ||
      facets.layout ||
      facets.color_mood ||
      facets.typography ||
      facets.imagery_density ||
      facets.type_scale ||
      facets.type_image_mode ||
      facets.contrast_mode ||
      facets.composition_energy ||
      facets.chrome_weight ||
      facets.craft_tags.length ||
      facets.industry_tags.length ||
      facets.section_categories.length ||
      facets.above_fold_job ||
      Boolean(facets.look_contract?.colors.bg)
  );
}

/** Compact labels for Library screen cards + GET /screens filters. */
export type ScreenFacetSummary = {
  page_type: string | null;
  style: string | null;
  layout: string | null;
  industry_tags: string[];
  modules?: string[];
  typography?: string | null;
  color_mood?: string | null;
  above_fold_job?: string | null;
  imagery_density?: string | null;
  type_scale?: string | null;
  type_image_mode?: string | null;
  contrast_mode?: string | null;
  composition_energy?: string | null;
  chrome_weight?: string | null;
  craft_tags?: string[];
};

export type ScreenFacetFilter = {
  q?: string | null | undefined;
  style?: string | null | undefined;
  layout?: string | null | undefined;
  industry?: string | null | undefined;
  modules?: string[] | null | undefined;
  craft_tags?: string[] | null | undefined;
  imagery_density?: string | null | undefined;
  type_scale?: string | null | undefined;
  type_image_mode?: string | null | undefined;
  contrast_mode?: string | null | undefined;
  composition_energy?: string | null | undefined;
  chrome_weight?: string | null | undefined;
};

export function summarizeDesignFacets(facets: DesignFacets): ScreenFacetSummary {
  return {
    page_type: facets.page_type,
    style: facets.style,
    layout: facets.layout,
    industry_tags: [...facets.industry_tags],
    modules: [...facets.modules],
    typography: facets.typography,
    color_mood: facets.color_mood,
    above_fold_job: facets.above_fold_job,
    imagery_density: facets.imagery_density,
    type_scale: facets.type_scale,
    type_image_mode: facets.type_image_mode,
    contrast_mode: facets.contrast_mode,
    composition_energy: facets.composition_energy,
    chrome_weight: facets.chrome_weight,
    craft_tags: [...facets.craft_tags]
  };
}

export function designFacetFilterCatalog(): {
  style: Array<(typeof STYLE_VOCAB)[number]>;
  layout: Array<(typeof LAYOUT_VOCAB)[number]>;
  industry: Array<(typeof INDUSTRY_VOCAB)[number]>;
  imagery_density: Array<(typeof IMAGERY_DENSITY_VOCAB)[number]>;
  type_scale: Array<(typeof TYPE_SCALE_VOCAB)[number]>;
  type_image_mode: Array<(typeof TYPE_IMAGE_MODE_VOCAB)[number]>;
  contrast_mode: Array<(typeof CONTRAST_MODE_VOCAB)[number]>;
  composition_energy: Array<(typeof COMPOSITION_ENERGY_VOCAB)[number]>;
  chrome_weight: Array<(typeof CHROME_WEIGHT_VOCAB)[number]>;
} {
  return {
    style: [...STYLE_VOCAB],
    layout: [...LAYOUT_VOCAB],
    industry: [...INDUSTRY_VOCAB],
    imagery_density: [...IMAGERY_DENSITY_VOCAB],
    type_scale: [...TYPE_SCALE_VOCAB],
    type_image_mode: [...TYPE_IMAGE_MODE_VOCAB],
    contrast_mode: [...CONTRAST_MODE_VOCAB],
    composition_energy: [...COMPOSITION_ENERGY_VOCAB],
    chrome_weight: [...CHROME_WEIGHT_VOCAB]
  };
}

export function normalizeFacetFilterValue(
  value: string | null | undefined,
  vocab: readonly string[]
): string | null {
  const trimmed = value?.trim() || null;
  if (!trimmed) return null;
  return vocab.includes(trimmed) ? trimmed : null;
}

/** AND across dimensions. Screens without facets drop out once any filter is set. */
export function screenFacetsMatch(
  summary: ScreenFacetSummary | null | undefined,
  filter: ScreenFacetFilter
): boolean {
  const q = filter.q?.trim().toLowerCase() || null;
  const style = filter.style?.trim() || null;
  const layout = filter.layout?.trim() || null;
  const industry = filter.industry?.trim() || null;
  const imagery_density = filter.imagery_density?.trim() || null;
  const type_scale = filter.type_scale?.trim() || null;
  const type_image_mode = filter.type_image_mode?.trim() || null;
  const contrast_mode = filter.contrast_mode?.trim() || null;
  const composition_energy = filter.composition_energy?.trim() || null;
  const chrome_weight = filter.chrome_weight?.trim() || null;
  const modules = (filter.modules ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean);
  const craft_tags = (filter.craft_tags ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (
    !q &&
    !style &&
    !layout &&
    !industry &&
    !imagery_density &&
    !type_scale &&
    !type_image_mode &&
    !contrast_mode &&
    !composition_energy &&
    !chrome_weight &&
    !modules.length &&
    !craft_tags.length
  ) return true;
  if (!summary) return false;
  if (q) {
    const hay = [
      summary.page_type,
      summary.style,
      summary.layout,
      summary.typography,
      summary.color_mood,
      summary.above_fold_job,
      ...(summary.industry_tags ?? []),
      ...(summary.modules ?? []),
      ...(summary.craft_tags ?? [])
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (style && summary.style !== style) return false;
  if (layout && summary.layout !== layout) return false;
  if (industry && !summary.industry_tags.includes(industry)) return false;
  if (imagery_density && summary.imagery_density !== imagery_density) return false;
  if (type_scale && summary.type_scale !== type_scale) return false;
  if (type_image_mode && summary.type_image_mode !== type_image_mode) return false;
  if (contrast_mode && summary.contrast_mode !== contrast_mode) return false;
  if (composition_energy && summary.composition_energy !== composition_energy) return false;
  if (chrome_weight && summary.chrome_weight !== chrome_weight) return false;
  if (modules.length && !modules.every((item) => (summary.modules ?? []).map((value) => value.toLowerCase()).includes(item))) return false;
  if (craft_tags.length && !craft_tags.every((item) => (summary.craft_tags ?? []).map((value) => value.toLowerCase()).includes(item))) return false;
  return true;
}
