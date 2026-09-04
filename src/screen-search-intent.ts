/**
 * Infer closed craft facets from a natural-language inspiration query.
 * Explicit API/MCP facet params always win over inference.
 * Soft gate: inferred facets boost / prefer matches without hard-dropping the pool.
 * @see knowledge/design-facets.md
 */
import {
  CHROME_WEIGHT_VOCAB,
  COMPOSITION_ENERGY_VOCAB,
  CONTRAST_MODE_VOCAB,
  IMAGERY_DENSITY_VOCAB,
  INDUSTRY_VOCAB,
  LAYOUT_VOCAB,
  normalizeIndustryTags,
  normalizeLayoutLabel,
  normalizeStyleLabel,
  PALETTE_VOCAB,
  STYLE_VOCAB,
  TYPE_SCALE_VOCAB,
  VALUE_KEY_VOCAB,
  screenFacetsMatch,
  type ScreenFacetFilter,
  type ScreenFacetSummary
} from "./design-facets.js";

function slug(value: string): string {
  return value.toLowerCase().replace(/[_|/-]+/g, " ").replace(/\s+/g, " ").trim();
}

function includesAny(hay: string, needles: string[]): boolean {
  return needles.some((needle) => hay.includes(needle));
}

function hasFacetValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => String(item ?? "").trim());
  return value != null && String(value).trim() !== "";
}

const SOFT_FACET_KEYS = [
  "style",
  "layout",
  "industry",
  "imagery_density",
  "type_scale",
  "type_image_mode",
  "contrast_mode",
  "composition_energy",
  "chrome_weight",
  "value_key",
  "palette"
] as const;

export type InferredScreenSearchFacets = ScreenFacetFilter & {
  inferred: string[];
};

/** Map free-text craft intent onto closed facet filters (AND). */
export function inferScreenSearchFacetsFromQuery(query: string | null | undefined): InferredScreenSearchFacets {
  const inferred: string[] = [];
  const hay = slug(query ?? "");
  if (!hay) return { inferred };

  const out: InferredScreenSearchFacets = { inferred };

  const style =
    normalizeStyleLabel(hay) ??
    (includesAny(hay, ["quiet luxury", "ruhig luxury"]) ? "luxury-dark" : null) ??
    (includesAny(hay, ["minimalist", "minimalistisch", "sparse", "reduziert"]) ? "minimal" : null);
  if (style && (STYLE_VOCAB as readonly string[]).includes(style)) {
    out.style = style;
    inferred.push(`style:${style}`);
  }

  const layout = normalizeLayoutLabel(hay);
  if (layout && (LAYOUT_VOCAB as readonly string[]).includes(layout)) {
    out.layout = layout;
    inferred.push(`layout:${layout}`);
  }

  const industry = normalizeIndustryTags([hay])[0] ?? null;
  if (industry && (INDUSTRY_VOCAB as readonly string[]).includes(industry)) {
    out.industry = industry;
    inferred.push(`industry:${industry}`);
  }

  let contrast: string | null = null;
  if (includesAny(hay, ["monochrome", "monochrom", "black and white", "schwarzweiss", "schwarz weiß", "grayscale", "greyscale", "grau"])) {
    contrast = "monochrome";
  } else if (includesAny(hay, ["low contrast", "muted", "weich", "desaturated"])) {
    contrast = "low_contrast";
  } else if (includesAny(hay, ["saturated", "vibrant", "neon", "colorful", "bunt", "kräftig"])) {
    contrast = "saturated";
  }
  if (contrast && (CONTRAST_MODE_VOCAB as readonly string[]).includes(contrast)) {
    out.contrast_mode = contrast;
    inferred.push(`contrast_mode:${contrast}`);
  }

  let palette: string | null = null;
  if (contrast === "monochrome" || includesAny(hay, ["mono palette", "single color", "einfarbig"])) {
    palette = "mono";
  } else if (includesAny(hay, ["two tone", "duotone", "zwei farb", "accent only"])) {
    palette = "duo";
  } else if (includesAny(hay, ["multicolor", "multi color", "rainbow", "viele farben"])) {
    palette = "multi";
  }
  if (palette && (PALETTE_VOCAB as readonly string[]).includes(palette)) {
    out.palette = palette;
    inferred.push(`palette:${palette}`);
  }

  let valueKey: string | null = null;
  if (includesAny(hay, ["dark mode", "dark ui", "dunkl", "night", "noir", "black background"])) {
    valueKey = "dark";
  } else if (includesAny(hay, ["light mode", "hell", "white background", "bright airy", "paper white"])) {
    valueKey = "light";
  }
  if (style === "luxury-dark") valueKey = valueKey ?? "dark";
  if (valueKey && (VALUE_KEY_VOCAB as readonly string[]).includes(valueKey)) {
    out.value_key = valueKey;
    inferred.push(`value_key:${valueKey}`);
  }

  let imagery: string | null = null;
  if (includesAny(hay, ["no image", "text only", "ohne bild", "typografie only", "type only"])) {
    imagery = "none";
  } else if (includesAny(hay, ["few images", "wenig bild", "little imagery", "sparse imagery", "single image"])) {
    imagery = "low";
  } else if (includesAny(hay, ["many images", "gallery", "photo heavy", "bildreich", "collage"])) {
    imagery = "high";
  }
  if (imagery && (IMAGERY_DENSITY_VOCAB as readonly string[]).includes(imagery)) {
    out.imagery_density = imagery;
    inferred.push(`imagery_density:${imagery}`);
  }

  let typeScale: string | null = null;
  if (includesAny(hay, ["monumental", "huge type", "massive type", "oversized"])) {
    typeScale = "monumental";
  } else if (includesAny(hay, ["large type", "big type", "große schrift", "grosse schrift", "display type", "big headline"])) {
    typeScale = "large";
  } else if (includesAny(hay, ["small type", "kleine schrift", "compact type"])) {
    typeScale = "small";
  }
  if (typeScale && (TYPE_SCALE_VOCAB as readonly string[]).includes(typeScale)) {
    out.type_scale = typeScale;
    inferred.push(`type_scale:${typeScale}`);
  }

  let energy: string | null = null;
  if (includesAny(hay, ["calm", "quiet", "ruhig", "airy", "still"])) {
    energy = "calm";
  } else if (includesAny(hay, ["dynamic", "high energy", "asymmetric", "motion"])) {
    energy = "dynamic";
  }
  if (energy && (COMPOSITION_ENERGY_VOCAB as readonly string[]).includes(energy)) {
    out.composition_energy = energy;
    inferred.push(`composition_energy:${energy}`);
  }

  let chrome: string | null = null;
  if (includesAny(hay, ["minimal chrome", "tiny nav", "wenig chrome", "reduced chrome"])) {
    chrome = "minimal";
  } else if (includesAny(hay, ["interface heavy", "dashboard", "dense ui", "viel chrome"])) {
    chrome = "interface_heavy";
  }
  if (chrome && (CHROME_WEIGHT_VOCAB as readonly string[]).includes(chrome)) {
    out.chrome_weight = chrome;
    inferred.push(`chrome_weight:${chrome}`);
  }

  return out;
}

/** Explicit request filters override inferred ones. */
export function mergeScreenSearchFacets(
  explicit: ScreenFacetFilter,
  inferred: InferredScreenSearchFacets
): ScreenFacetFilter & { inferred: string[] } {
  const pick = <T,>(a: T | null | undefined, b: T | null | undefined): T | null | undefined =>
    a != null && String(a).trim() !== "" ? a : b;

  return {
    style: pick(explicit.style, inferred.style),
    layout: pick(explicit.layout, inferred.layout),
    industry: pick(explicit.industry, inferred.industry),
    modules: explicit.modules?.length ? explicit.modules : inferred.modules,
    craft_tags: explicit.craft_tags?.length ? explicit.craft_tags : inferred.craft_tags,
    imagery_density: pick(explicit.imagery_density, inferred.imagery_density),
    type_scale: pick(explicit.type_scale, inferred.type_scale),
    type_image_mode: pick(explicit.type_image_mode, inferred.type_image_mode),
    contrast_mode: pick(explicit.contrast_mode, inferred.contrast_mode),
    composition_energy: pick(explicit.composition_energy, inferred.composition_energy),
    chrome_weight: pick(explicit.chrome_weight, inferred.chrome_weight),
    value_key: pick(explicit.value_key, inferred.value_key),
    palette: pick(explicit.palette, inferred.palette),
    inferred: inferred.inferred
  };
}

/** Facets present on the request (hard AND filters). */
export function explicitScreenFacetFilter(explicit: ScreenFacetFilter): ScreenFacetFilter {
  const out: ScreenFacetFilter = {};
  for (const key of SOFT_FACET_KEYS) {
    const value = explicit[key];
    if (hasFacetValue(value)) (out as Record<string, unknown>)[key] = value;
  }
  if (explicit.modules?.length) out.modules = explicit.modules;
  if (explicit.craft_tags?.length) out.craft_tags = explicit.craft_tags;
  return out;
}

/**
 * Inferred facets that were not supplied explicitly — soft prefer / boost only.
 */
export function softScreenFacetFilter(
  explicit: ScreenFacetFilter,
  merged: ScreenFacetFilter
): ScreenFacetFilter {
  const out: ScreenFacetFilter = {};
  for (const key of SOFT_FACET_KEYS) {
    if (hasFacetValue(explicit[key])) continue;
    const value = merged[key];
    if (hasFacetValue(value)) (out as Record<string, unknown>)[key] = value;
  }
  if (!explicit.modules?.length && merged.modules?.length) out.modules = merged.modules;
  if (!explicit.craft_tags?.length && merged.craft_tags?.length) out.craft_tags = merged.craft_tags;
  return out;
}

export function softFacetFilterActive(filter: ScreenFacetFilter): boolean {
  return SOFT_FACET_KEYS.some((key) => hasFacetValue(filter[key])) || Boolean(filter.modules?.length || filter.craft_tags?.length);
}

/** Small additive score when a screen matches inferred craft intent. */
export function softFacetMatchBoost(summary: ScreenFacetSummary | null | undefined, soft: ScreenFacetFilter): number {
  if (!softFacetFilterActive(soft) || !summary) return 0;
  let hits = 0;
  let checks = 0;
  for (const key of SOFT_FACET_KEYS) {
    const want = soft[key];
    if (!hasFacetValue(want)) continue;
    checks += 1;
    if (key === "industry") {
      if ((summary.industry_tags ?? []).includes(String(want))) hits += 1;
      continue;
    }
    const have = summary[key as keyof ScreenFacetSummary];
    if (have === want) hits += 1;
  }
  if (!checks) return 0;
  return (hits / checks) * 0.08;
}

/**
 * Prefer screens that match inferred facets when enough remain; otherwise keep the pool.
 */
export function preferSoftFacetMatches<T extends { design_facets?: ScreenFacetSummary | null }>(
  screens: T[],
  soft: ScreenFacetFilter,
  minCount: number
): T[] {
  if (!softFacetFilterActive(soft) || screens.length <= minCount) return screens;
  const matched = screens.filter((row) => screenFacetsMatch(row.design_facets, soft));
  return matched.length >= minCount ? matched : screens;
}
