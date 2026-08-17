/**
 * Compact page-rhythm contract for prompt packs + look_conditioned generate.
 * Spine (preferred) or vision_layout bands — so rebuilds keep vertical order, not a card-kit hero.
 */

import type { StructureSpineDocument } from "./structure-spine.js";
import { loadStructureSpineDocument } from "./structure-spine.js";
import type { VisionLayoutDocument } from "./vision-layout.js";
import { loadVisionLayoutDocument } from "./vision-layout.js";
import { loadDigPaths } from "./runtime-paths.js";

export const PAGE_RHYTHM_VERSION = "0.1.0" as const;

export type PageRhythmZone = "above_fold" | "mid" | "below";

export type PageRhythmBand = {
  zone: PageRhythmZone;
  category: string;
  signature: string | null;
  beat: string | null;
  height: number;
};

export type PageRhythm = {
  schema_version: "0.1.0";
  page_rhythm_version: typeof PAGE_RHYTHM_VERSION;
  page_arc: string;
  above_fold: {
    ingredients: string[];
    summary: string;
    height: number | null;
  };
  bands: PageRhythmBand[];
  avoid: string[];
};

function truncate(value: string | null | undefined, max: number): string | null {
  const trimmed = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!trimmed) return null;
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function round01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(Math.min(1, value) * 1000) / 1000;
}

function maxBands(): number {
  const n = loadDigPaths().pageRhythm?.maxBands;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.min(12, Math.floor(n)) : 10;
}

function zoneFromVisionY(y: number): PageRhythmZone {
  if (y < 0.2) return "above_fold";
  if (y < 0.55) return "mid";
  return "below";
}

function rhythmAvoid(input: {
  page_arc: string;
  bands: PageRhythmBand[];
  aboveHeight: number | null;
  ingredients: string[];
}): string[] {
  const avoid: string[] = [];
  const cats = input.bands.map((band) => band.category);
  const hero = input.bands.find((band) => band.category === "hero");
  const heroSig = (hero?.signature ?? "").toLowerCase();
  if (hero && !heroSig.includes("grid") && !heroSig.includes("card")) {
    avoid.push("card grid in the hero");
    avoid.push("short marketing-kit banner instead of the measured opening");
  }
  if ((input.aboveHeight ?? 0) >= 0.28) {
    avoid.push("collapse the above-fold into a compact card row");
  }
  if (input.bands.length >= 3) {
    avoid.push("single-column card kit for the whole page");
  }
  if (cats.includes("nav") && cats.includes("hero")) {
    avoid.push("bury navigation inside the hero");
  }
  if (cats.includes("footer")) {
    avoid.push("omit a distinct footer band");
  }
  if (input.ingredients.includes("media") && input.ingredients.includes("headline")) {
    avoid.push("replace the cinematic opening with a text-only hero");
  }
  if (input.page_arc.includes("hero") && input.page_arc.includes("feature")) {
    avoid.push("feature grid inside the hero");
  }
  return [...new Set(avoid)];
}

export function buildPageRhythm(input: {
  spine?: StructureSpineDocument | null;
  vision_layout?: Pick<VisionLayoutDocument, "bands" | "status"> | null;
}): PageRhythm | null {
  const cap = maxBands();
  if (input.spine?.bands.length) {
    const span = Math.max(...input.spine.bands.map((band) => band.y + band.height), 1);
    const bands: PageRhythmBand[] = input.spine.bands.slice(0, cap).map((band) => ({
      zone: band.zone,
      category: band.category,
      signature: truncate(band.signature, 48),
      beat: truncate(band.beat, 80),
      height: round01(band.height / span)
    }));
    const above = bands.filter((band) => band.zone === "above_fold");
    const aboveHeight = above.reduce((sum, band) => sum + band.height, 0) || null;
    const ingredients = input.spine.above_fold.ingredients.map(String);
    return {
      schema_version: "0.1.0",
      page_rhythm_version: PAGE_RHYTHM_VERSION,
      page_arc: input.spine.page_arc,
      above_fold: {
        ingredients,
        summary: truncate(input.spine.above_fold.summary, 120) ?? "unknown",
        height: aboveHeight ? round01(aboveHeight) : null
      },
      bands,
      avoid: rhythmAvoid({
        page_arc: input.spine.page_arc,
        bands,
        aboveHeight,
        ingredients
      })
    };
  }

  const visionBands = input.vision_layout?.status === "complete" ? input.vision_layout.bands : [];
  if (!visionBands.length) return null;
  const ordered = [...visionBands].sort((a, b) => a.box.y - b.box.y).slice(0, cap);
  const bands: PageRhythmBand[] = ordered.map((band) => ({
    zone: zoneFromVisionY(band.box.y),
    category: band.category,
    signature: truncate(band.label, 48),
    beat: null,
    height: round01(band.box.height)
  }));
  const page_arc = [...new Set(bands.map((band) => band.category))].slice(0, 8).join(" → ") || "content";
  const above = bands.filter((band) => band.zone === "above_fold");
  const aboveHeight = above.reduce((sum, band) => sum + band.height, 0) || null;
  const ingredients: string[] = [];
  if (above.some((band) => band.category === "nav")) ingredients.push("chrome");
  if (above.some((band) => band.category === "hero" || /media/i.test(band.signature ?? ""))) ingredients.push("media");
  if (above.some((band) => band.category === "hero")) ingredients.push("headline");
  if (!ingredients.length) ingredients.push("other");
  const summary = above.length
    ? above.map((band) => band.category).join(" → ")
    : bands[0]?.category ?? "unknown";
  return {
    schema_version: "0.1.0",
    page_rhythm_version: PAGE_RHYTHM_VERSION,
    page_arc,
    above_fold: {
      ingredients,
      summary,
      height: aboveHeight ? round01(aboveHeight) : null
    },
    bands,
    avoid: rhythmAvoid({ page_arc, bands, aboveHeight, ingredients })
  };
}

export function pageRhythmHasSignal(rhythm: PageRhythm | null | undefined): boolean {
  return Boolean(rhythm?.page_arc && rhythm.bands.length);
}

export function asPageRhythm(value: unknown): PageRhythm | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const page_arc = typeof record.page_arc === "string" ? record.page_arc.trim() : "";
  const bandsRaw = Array.isArray(record.bands) ? record.bands : [];
  const bands: PageRhythmBand[] = [];
  for (const row of bandsRaw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const band = row as Record<string, unknown>;
    const category = typeof band.category === "string" ? band.category.trim() : "";
    if (!category) continue;
    const zone =
      band.zone === "above_fold" || band.zone === "mid" || band.zone === "below" ? band.zone : "mid";
    bands.push({
      zone,
      category,
      signature: typeof band.signature === "string" ? band.signature : null,
      beat: typeof band.beat === "string" ? band.beat : null,
      height: typeof band.height === "number" && Number.isFinite(band.height) ? round01(band.height) : 0
    });
  }
  if (!page_arc && !bands.length) return null;
  const aboveRaw =
    record.above_fold && typeof record.above_fold === "object" && !Array.isArray(record.above_fold)
      ? (record.above_fold as Record<string, unknown>)
      : {};
  const ingredients = Array.isArray(aboveRaw.ingredients)
    ? aboveRaw.ingredients.map(String).filter(Boolean)
    : [];
  const avoid = Array.isArray(record.avoid) ? record.avoid.map(String).filter(Boolean) : [];
  const height =
    typeof aboveRaw.height === "number" && Number.isFinite(aboveRaw.height) ? round01(aboveRaw.height) : null;
  return {
    schema_version: "0.1.0",
    page_rhythm_version: PAGE_RHYTHM_VERSION,
    page_arc: page_arc || bands.map((band) => band.category).join(" → "),
    above_fold: {
      ingredients,
      summary: typeof aboveRaw.summary === "string" ? aboveRaw.summary : "unknown",
      height
    },
    bands,
    avoid
  };
}

export function pageRhythmRules(rhythm: PageRhythm): string[] {
  const rules = [
    "Obey page_rhythm.page_arc as the vertical section order; do not reorder or collapse into a generic landing kit.",
    "If page_rhythm is present, it outranks generic hero/card-grid templates."
  ];
  if (rhythm.page_arc) {
    rules.push(`Page arc: ${rhythm.page_arc}.`);
  }
  const ingredients = rhythm.above_fold.ingredients.join(" + ");
  if (ingredients || rhythm.above_fold.summary) {
    rules.push(
      `Above-fold recipe: ${ingredients || "opening"} — ${rhythm.above_fold.summary}. Keep that opening.`
    );
  }
  if (rhythm.above_fold.height != null && rhythm.above_fold.height >= 0.2) {
    rules.push(
      `Opening height is ~${Math.round(rhythm.above_fold.height * 100)}% of the page; keep a cinematic first band, not a short banner.`
    );
  }
  const listed = rhythm.bands
    .slice(0, 8)
    .map((band) => `${band.zone}:${band.category}${band.signature ? `(${band.signature})` : ""}`)
    .join(" → ");
  if (listed) {
    rules.push(`Bands (full-width stacks unless signature says split/grid): ${listed}.`);
  }
  rules.push("Do not invent sections outside page_rhythm.bands.");
  return rules;
}

export function pageRhythmGenerateConstraints(rhythm: PageRhythm): string[] {
  const out = [...pageRhythmRules(rhythm)];
  for (const item of rhythm.avoid) out.push(`avoid:${item}`);
  return out;
}

export async function loadPageRhythmForPackage(packageRoot: string): Promise<PageRhythm | null> {
  const spine = await loadStructureSpineDocument(packageRoot).catch(() => null);
  if (spine?.bands.length) return buildPageRhythm({ spine });
  const vision_layout = await loadVisionLayoutDocument(packageRoot).catch(() => null);
  return buildPageRhythm({ vision_layout });
}
