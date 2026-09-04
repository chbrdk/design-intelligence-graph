/**
 * Stable design facets for Library screen profile + future inspiration search.
 * Derived from vision_page / vision_layout (+ optional llm_items labels).
 */

import { industryTagsForHost } from "./catalog-industry.js";
import type { VisionLayoutBand } from "./vision-layout.js";
import type { VisionPageDocument } from "./vision-page.js";
import type { DesignTokensDocument } from "./design-tokens.js";
import { buildLookContract, type LookContract } from "./look-contract.js";

export const DESIGN_FACETS_VERSION = "0.5.0" as const;

export const INDUSTRY_VOCAB = [
  "automotive",
  "insurance",
  "finance",
  "manufacturing",
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
  "government",
  "other"
] as const;

export type IndustryTag = (typeof INDUSTRY_VOCAB)[number];

export const PAGE_TYPE_VOCAB = [
  "corporate_homepage",
  "corporate_landing",
  "marketing_landing",
  "article",
  "legal",
  "portal",
  "newsroom",
  "product",
  "blank",
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
/** Light/dark key of the page (bg-led). */
export const VALUE_KEY_VOCAB = ["light", "dark", "mixed"] as const;
/** Palette cardinality for fine differentiation beyond style. */
export const PALETTE_VOCAB = ["mono", "duo", "multi"] as const;

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
  value_key: string | null;
  palette: string | null;
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
  if (includesAny(hay, ["hero image", "photo", "photograph", "portrait", "render", "architectural", "video", "imagery", "lifestyle"])) return "medium";
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
  if (includesAny(hay, ["overlap", "layered", "behind the top edge", "on the image", "overlay", "superimposed", "over the hero", "over the photograph"])) return "overlap";
  if (includesAny(hay, ["beside", "alongside", "flanked by", "side by side"])) return "adjacent";
  return "separate";
}

function deriveContrastMode(page: Partial<VisionPageDocument> | null): (typeof CONTRAST_MODE_VOCAB)[number] | null {
  const hay = slug(
    [page?.color_mood, page?.overall_atmosphere, page?.visual_craft?.imagery_craft, page?.typography_feel]
      .filter(Boolean)
      .join(" ")
  );
  if (!hay) return null;
  if (includesAny(hay, ["monochrome", "black and white", "schwarzweiss", "grayscale", "greyscale", "monochrome slate", "bw "])) {
    return "monochrome";
  }
  if (includesAny(hay, ["muted", "soft contrast", "low contrast", "desaturated", "washed"])) return "low_contrast";
  if (includesAny(hay, ["vibrant", "saturated", "neon", "bright accent", "colorful", "multicolor"])) return "saturated";
  return "mixed";
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(raw)) return null;
  const n = Number.parseInt(raw, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

function chromaSpan(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return (Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b)) / 255;
}

function tokenHexes(tokens: DesignTokensDocument | null | undefined): string[] {
  const out: string[] = [];
  for (const item of tokens?.roles.colors ?? []) {
    const hex = item.hex_rgb ?? null;
    if (hex) out.push(hex);
  }
  return out;
}

export function deriveValueKey(
  page: Partial<VisionPageDocument> | null,
  tokens: DesignTokensDocument | null | undefined,
  look: LookContract | null | undefined
): (typeof VALUE_KEY_VOCAB)[number] | null {
  const hay = slug([page?.color_mood, page?.overall_atmosphere, page?.visual_craft?.imagery_craft].filter(Boolean).join(" "));
  if (includesAny(hay, ["dark mode", "dark ui", "noir", "night", "black background", "dunkl"])) return "dark";
  if (includesAny(hay, ["light mode", "white background", "paper", "bright airy", "hell"])) return "light";

  const bg = look?.colors.bg ?? tokens?.roles.colors.find((c) => c.role === "bg")?.hex_rgb ?? null;
  if (bg) {
    const L = relativeLuminance(bg);
    if (L != null) {
      if (L < 0.28) return "dark";
      if (L > 0.72) return "light";
      return "mixed";
    }
  }
  return null;
}

export function derivePalette(
  page: Partial<VisionPageDocument> | null,
  tokens: DesignTokensDocument | null | undefined,
  contrastMode: string | null
): (typeof PALETTE_VOCAB)[number] | null {
  if (contrastMode === "monochrome") return "mono";
  const hay = slug([page?.color_mood, page?.overall_atmosphere].filter(Boolean).join(" "));
  if (includesAny(hay, ["monochrome", "black and white", "grayscale", "greyscale", "einfarbig"])) return "mono";
  if (includesAny(hay, ["two tone", "duotone", "duo chrome"])) return "duo";
  if (includesAny(hay, ["multicolor", "colorful", "rainbow", "vibrant palette"])) return "multi";

  const hexes = tokenHexes(tokens);
  if (hexes.length) {
    const chromas = hexes.map(chromaSpan).filter((v): v is number => v != null);
    const chromatic = chromas.filter((c) => c > 0.12).length;
    if (chromatic <= 1 && chromas.every((c) => c <= 0.18)) return "mono";
    if (chromatic <= 2) return "duo";
    return "multi";
  }
  return null;
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
  insurance: "insurance",
  insurtech: "insurance",
  reinsurance: "insurance",
  versicherung: "insurance",
  assurance: "insurance",
  takaful: "insurance",
  manufacturing: "manufacturing",
  industrial: "manufacturing",
  engineering: "manufacturing",
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
  ngo: "nonprofit",
  government: "government",
  gov: "government",
  civic: "government",
  municipality: "government",
  ministry: "government",
  "public sector": "government",
  governance: "government",
  city: "government"
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
  const hay = slug(cleaned);
  if (!hay) return null;
  if (includesAny(hay, ["blank", "empty canvas", "empty_canvas"])) return "blank";
  if (includesAny(hay, ["legal", "terms", "policy"])) return "legal";
  if (includesAny(hay, ["article", "archive", "guide"])) return "article";
  if (includesAny(hay, ["newsroom", "news hub", "news"])) return "newsroom";
  if (includesAny(hay, ["portal", "directory", "intranet"])) return "portal";
  if (includesAny(hay, ["product showcase", "pdp", "product"])) return "product";
  if (includesAny(hay, ["homepage", "home page"]) || hay.endsWith(" home") || hay.endsWith("_home") || hay === "home") {
    return "corporate_homepage";
  }
  if (hay.includes("corporate") && hay.includes("landing")) return "corporate_landing";
  if (hay.includes("landing")) return "marketing_landing";
  if (hay.includes("corporate")) return "corporate_homepage";
  const matched = matchVocab(hay.replace(/_/g, " "), PAGE_TYPE_VOCAB);
  return matched ?? "other";
}

const SUMMARY_LABELS = [
  ["above_fold", /Above the fold job:/i],
  ["layout", /Layout:/i],
  ["rhythm", /Rhythm:/i],
  ["look", /Look:/i],
  ["media", /Media:/i],
  ["type_image", /Type\/image:/i],
  ["type_craft", /Type craft:/i],
  ["ux", /UX flow:/i],
  ["chrome", /chrome:/i]
] as const;

function summarySlice(summary: string, label: (typeof SUMMARY_LABELS)[number][1], next: RegExp[]): string {
  const match = summary.match(label);
  if (!match || match.index == null) return "";
  const rest = summary.slice(match.index + match[0].length);
  let end = rest.length;
  for (const marker of next) {
    const hit = rest.search(marker);
    if (hit >= 0) end = Math.min(end, hit);
  }
  return rest.slice(0, end).replace(/^[—\-\s]+/, "").replace(/[.;]+$/g, "").trim();
}

/** Reconstruct vision_page fields from the staged design_summary when vision_page.json is missing. */
export function visionPageFromDesignSummary(summary: string): Partial<VisionPageDocument> {
  const text = summary.trim();
  if (!text) return {};
  const reads = text.match(/This reads as an?\s+([^.]+)\./i);
  const nextAfter = (index: number) => SUMMARY_LABELS.slice(index + 1).map((item) => item[1]);
  const layout = summarySlice(text, /Layout:/i, nextAfter(1));
  const look = summarySlice(text, /Look:/i, nextAfter(3));
  const media = summarySlice(text, /Media:/i, nextAfter(4));
  const typeImage = summarySlice(text, /Type\/image:/i, nextAfter(5));
  const typeCraft = summarySlice(text, /Type craft:/i, nextAfter(6));
  const above = summarySlice(text, /Above the fold job:/i, nextAfter(0));
  const rhythm = summarySlice(text, /Rhythm:/i, nextAfter(2));
  const lookParts = look.split(";").map((part) => part.trim()).filter(Boolean);
  return {
    page_type: reads?.[1]?.trim() ?? "",
    layout_system: layout.split(";")[0]?.trim() ?? "",
    vertical_rhythm: rhythm || layout,
    overall_atmosphere: lookParts[0] ?? "",
    color_mood: lookParts[1] ?? look,
    typography_feel: lookParts[2] || typeCraft,
    media_strategy: media,
    above_fold_job: above,
    above_the_fold: above,
    visual_craft: {
      type_image_relationship: typeImage,
      typography_composition: typeCraft,
      imagery_craft: media,
      spatial_craft: rhythm || layout,
      chrome_vs_content: /minimal(?:ist)? chrome|tiny nav/i.test(text)
        ? "minimal chrome"
        : /interface heavy|dense ui|dashboard/i.test(text)
          ? "interface heavy"
          : "",
      rebuild_spec: ""
    }
  };
}

function pageHasCraft(page: Partial<VisionPageDocument> | null | undefined): boolean {
  if (!page) return false;
  return Boolean(
    page.layout_system?.trim() ||
      page.media_strategy?.trim() ||
      page.overall_atmosphere?.trim() ||
      page.visual_craft?.type_image_relationship?.trim() ||
      page.visual_craft?.typography_composition?.trim()
  );
}

export type DesignFacetsInput = {
  vision_page?: Partial<VisionPageDocument> | null;
  bands?: Array<Pick<VisionLayoutBand, "category" | "label">> | null;
  screen_pattern_labels?: string[] | null;
  visual_style_labels?: string[] | null;
  tokens?: DesignTokensDocument | null;
  design_summary?: string | null;
  site_domain?: string | null;
  canonical_url?: string | null;
};

/** Build searchable / scannable facets from package + indexed labels. */
export function buildDesignFacets(input: DesignFacetsInput): DesignFacets {
  const summaryPage = input.design_summary?.trim()
    ? visionPageFromDesignSummary(input.design_summary)
    : {};
  const page: Partial<VisionPageDocument> | null = pageHasCraft(input.vision_page ?? null)
    ? { ...summaryPage, ...(input.vision_page ?? {}) }
    : Object.keys(summaryPage).length
      ? { ...summaryPage, ...(input.vision_page ?? {}) }
      : (input.vision_page ?? null);
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

  const industry = uniqueStrings(
    [
      ...industryTagsForHost(input.canonical_url, input.site_domain),
      ...normalizeIndustryTags([
        ...(Array.isArray(page?.category_tags) ? page!.category_tags!.map(String) : []),
        page?.page_type ?? "",
        ...(input.screen_pattern_labels ?? []).map(String),
        input.design_summary ?? ""
      ])
    ],
    3
  );

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
  let contrast_mode = deriveContrastMode(page);
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

  // Token-backed palette can upgrade prose contrast to monochrome.
  const palette = derivePalette(page, input.tokens ?? null, contrast_mode);
  if (!contrast_mode && palette === "mono") contrast_mode = "monochrome";
  if (palette === "mono" && contrast_mode === "mixed") contrast_mode = "monochrome";
  const value_key = deriveValueKey(page, input.tokens ?? null, look_contract);

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
    value_key,
    palette,
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
      facets.value_key ||
      facets.palette ||
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
  value_key?: string | null;
  palette?: string | null;
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
  value_key?: string | null | undefined;
  palette?: string | null | undefined;
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
    value_key: facets.value_key,
    palette: facets.palette,
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
  value_key: Array<(typeof VALUE_KEY_VOCAB)[number]>;
  palette: Array<(typeof PALETTE_VOCAB)[number]>;
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
    chrome_weight: [...CHROME_WEIGHT_VOCAB],
    value_key: [...VALUE_KEY_VOCAB],
    palette: [...PALETTE_VOCAB]
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
  const value_key = filter.value_key?.trim() || null;
  const palette = filter.palette?.trim() || null;
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
    !value_key &&
    !palette &&
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
      summary.contrast_mode,
      summary.value_key,
      summary.palette,
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
  if (value_key && summary.value_key !== value_key) return false;
  if (palette && summary.palette !== palette) return false;
  if (modules.length && !modules.every((item) => (summary.modules ?? []).map((value) => value.toLowerCase()).includes(item))) return false;
  if (craft_tags.length && !craft_tags.every((item) => (summary.craft_tags ?? []).map((value) => value.toLowerCase()).includes(item))) return false;
  return true;
}
