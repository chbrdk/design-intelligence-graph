/**
 * Desktop full-page visual catalog (vision_page) + optional UX pass (vision_page_ux).
 * Split for Flash-sized calls: visual VL, then text-only UX grounded on catalog + bands.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { writeArtifact } from "./io.js";
import { loadDigPaths } from "./runtime-paths.js";
import type { ArtifactReference } from "./types.js";
import type { VisionLayoutBand } from "./vision-layout.js";

export const VISION_PAGE_VERSION = "0.2.0";

export type VisualCraft = {
  type_image_relationship: string;
  typography_composition: string;
  imagery_craft: string;
  spatial_craft: string;
  chrome_vs_content: string;
  rebuild_spec: string;
};

export const EMPTY_VISUAL_CRAFT: VisualCraft = {
  type_image_relationship: "",
  typography_composition: "",
  imagery_craft: "",
  spatial_craft: "",
  chrome_vs_content: "",
  rebuild_spec: ""
};

export function visualCraftHasSignal(craft: VisualCraft | null | undefined): boolean {
  if (!craft) return false;
  return Boolean(
    craft.rebuild_spec.trim() ||
      craft.type_image_relationship.trim() ||
      craft.typography_composition.trim() ||
      craft.imagery_craft.trim()
  );
}

function parseVisualCraft(value: unknown): VisualCraft {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    type_image_relationship: String(record.type_image_relationship ?? "").trim(),
    typography_composition: String(record.typography_composition ?? "").trim(),
    imagery_craft: String(record.imagery_craft ?? "").trim(),
    spatial_craft: String(record.spatial_craft ?? "").trim(),
    chrome_vs_content: String(record.chrome_vs_content ?? "").trim(),
    rebuild_spec: String(record.rebuild_spec ?? "").trim()
  };
}

export type VisionPageUxFields = {
  layout_system: string;
  spacing_feel: string;
  alignment: string;
  above_fold_job: string;
  ux_flow: string[];
  ux_strengths: string[];
  ux_risks: string[];
};

export type VisionPageDocument = {
  schema_version: "0.1.0";
  vision_page_version: string;
  generated_at: string;
  source_screenshot: string;
  page_type: string;
  overall_atmosphere: string;
  color_mood: string;
  typography_feel: string;
  above_the_fold: string;
  vertical_rhythm: string;
  media_strategy: string;
  notable_modules: string[];
  brand_cues: string;
  interaction_chrome: string;
  category_tags: string[];
  rebuild_hints: string;
  visual_craft?: VisualCraft;
  heading: string;
  cta: string;
  layout_order: string[];
  confidence: number;
  layout_system?: string;
  spacing_feel?: string;
  alignment?: string;
  above_fold_job?: string;
  ux_flow?: string[];
  ux_strengths?: string[];
  ux_risks?: string[];
  model?: string;
  status: "complete" | "failed" | "skipped";
  error?: string;
};

export function visionPageRelativePath(): string {
  const paths = loadDigPaths() as { visionPage?: { relativePath?: string } };
  return paths.visionPage?.relativePath ?? "derived/vision-page.json";
}

function asStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, max);
}

function clampConfidence(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0.55;
  return Math.min(0.95, Math.max(0.05, number));
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`${label} response missing JSON object`);
  const slice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(slice) as Record<string, unknown>;
  } catch {
    return JSON.parse(slice.replace(/,\s*([\]}])/g, "$1")) as Record<string, unknown>;
  }
}

export function parseVisionPageResponse(raw: string): Omit<
  VisionPageDocument,
  | "schema_version"
  | "vision_page_version"
  | "generated_at"
  | "source_screenshot"
  | "model"
  | "status"
  | "error"
  | "layout_system"
  | "spacing_feel"
  | "alignment"
  | "above_fold_job"
  | "ux_flow"
  | "ux_strengths"
  | "ux_risks"
> {
  const parsed = parseJsonObject(raw, "vision_page");
  return {
    page_type: String(parsed.page_type ?? "").trim(),
    overall_atmosphere: String(parsed.overall_atmosphere ?? "").trim(),
    color_mood: String(parsed.color_mood ?? "").trim(),
    typography_feel: String(parsed.typography_feel ?? "").trim(),
    above_the_fold: String(parsed.above_the_fold ?? "").trim(),
    vertical_rhythm: String(parsed.vertical_rhythm ?? "").trim(),
    media_strategy: String(parsed.media_strategy ?? "").trim(),
    notable_modules: asStringArray(parsed.notable_modules, 6),
    brand_cues: String(parsed.brand_cues ?? "").trim(),
    interaction_chrome: String(parsed.interaction_chrome ?? "").trim(),
    category_tags: asStringArray(parsed.category_tags, 6).map((tag) => tag.toLowerCase()),
    rebuild_hints: String(parsed.rebuild_hints ?? "").trim(),
    visual_craft: parseVisualCraft(parsed.visual_craft),
    heading: String(parsed.heading ?? "").trim(),
    cta: String(parsed.cta ?? "").trim(),
    layout_order: asStringArray(parsed.layout_order, 8),
    confidence: clampConfidence(parsed.confidence)
  };
}

export function parseVisionPageUxResponse(raw: string): VisionPageUxFields & { confidence: number } {
  const parsed = parseJsonObject(raw, "vision_page_ux");
  return {
    layout_system: String(parsed.layout_system ?? "").trim(),
    spacing_feel: String(parsed.spacing_feel ?? "").trim(),
    alignment: String(parsed.alignment ?? "").trim(),
    above_fold_job: String(parsed.above_fold_job ?? "").trim(),
    ux_flow: asStringArray(parsed.ux_flow, 6),
    ux_strengths: asStringArray(parsed.ux_strengths, 4),
    ux_risks: asStringArray(parsed.ux_risks, 4),
    confidence: clampConfidence(parsed.confidence)
  };
}

/** Deterministic page summary for Library — prefers vision over stale text synthesize. */
export function designSummaryFromVisionPage(
  page: Pick<
    VisionPageDocument,
    | "page_type"
    | "above_the_fold"
    | "vertical_rhythm"
    | "overall_atmosphere"
    | "color_mood"
    | "typography_feel"
    | "media_strategy"
    | "above_fold_job"
    | "ux_flow"
    | "ux_strengths"
    | "ux_risks"
    | "layout_system"
    | "spacing_feel"
    | "visual_craft"
  >,
  bands: Array<Pick<VisionLayoutBand, "label" | "category">> = []
): string {
  const parts: string[] = [];
  if (page.page_type) parts.push(`This reads as a ${page.page_type}.`);
  if (page.above_fold_job) parts.push(`Above the fold job: ${page.above_fold_job}`);
  else if (page.above_the_fold) parts.push(`Above the fold: ${page.above_the_fold}`);
  if (page.layout_system || page.spacing_feel) {
    parts.push(
      `Layout: ${[page.layout_system, page.spacing_feel].filter(Boolean).join("; ")}.`
    );
  }
  if (page.vertical_rhythm) parts.push(`Rhythm: ${page.vertical_rhythm}`);
  parts.push(
    `Look: ${[page.overall_atmosphere, page.color_mood, page.typography_feel].filter(Boolean).join("; ")}.`
  );
  if (page.media_strategy) parts.push(`Media: ${page.media_strategy}`);
  if (page.visual_craft?.type_image_relationship) {
    parts.push(`Type/image: ${page.visual_craft.type_image_relationship}`);
  }
  if (page.visual_craft?.typography_composition) {
    parts.push(`Type craft: ${page.visual_craft.typography_composition}`);
  }
  if (page.ux_flow?.length) parts.push(`UX flow: ${page.ux_flow.join(" → ")}.`);
  else if (bands.length) {
    parts.push(`Sections: ${bands.map((band) => `${band.category}:${band.label}`).join(" → ")}.`);
  }
  if (page.ux_strengths?.length) parts.push(`Strengths: ${page.ux_strengths.join("; ")}.`);
  if (page.ux_risks?.length) parts.push(`Risks: ${page.ux_risks.join("; ")}.`);
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 1800);
}

export function buildVisionPageUxEvidence(
  page: VisionPageDocument,
  bands: VisionLayoutBand[]
): string {
  return JSON.stringify({
    page_type: page.page_type,
    overall_atmosphere: page.overall_atmosphere,
    color_mood: page.color_mood,
    typography_feel: page.typography_feel,
    above_the_fold: page.above_the_fold,
    vertical_rhythm: page.vertical_rhythm,
    media_strategy: page.media_strategy,
    notable_modules: page.notable_modules,
    visual_craft: page.visual_craft,
    heading: page.heading,
    cta: page.cta,
    bands: bands.map((band) => ({
      id: band.id,
      label: band.label,
      category: band.category,
      y: Number(band.box.y.toFixed(3)),
      h: Number(band.box.height.toFixed(3))
    }))
  });
}

export async function loadVisionPageDocument(packageRoot: string): Promise<VisionPageDocument | null> {
  try {
    const raw = await readFile(resolve(packageRoot, visionPageRelativePath()), "utf8");
    return JSON.parse(raw) as VisionPageDocument;
  } catch {
    return null;
  }
}

export async function writeVisionPageDocument(
  packageRoot: string,
  doc: VisionPageDocument
): Promise<ArtifactReference> {
  return writeArtifact(packageRoot, visionPageRelativePath(), JSON.stringify(doc, null, 2), "application/json");
}
