/**
 * Desktop full-page visual catalog (vision_page stage).
 * Artifact for later LLMs — not a hero score.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { writeArtifact } from "./io.js";
import { loadDigPaths } from "./runtime-paths.js";
import type { ArtifactReference } from "./types.js";

export const VISION_PAGE_VERSION = "0.1.0";

export type VisionPageDocument = {
  schema_version: "0.1.0";
  vision_page_version: typeof VISION_PAGE_VERSION;
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
  heading: string;
  cta: string;
  layout_order: string[];
  confidence: number;
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

export function parseVisionPageResponse(raw: string): Omit<
  VisionPageDocument,
  | "schema_version"
  | "vision_page_version"
  | "generated_at"
  | "source_screenshot"
  | "model"
  | "status"
  | "error"
> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("vision_page response missing JSON object");
  const slice = candidate.slice(start, end + 1);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(slice) as Record<string, unknown>;
  } catch {
    parsed = JSON.parse(slice.replace(/,\s*([\]}])/g, "$1")) as Record<string, unknown>;
  }
  const layout_order = asStringArray(parsed.layout_order, 8);
  return {
    page_type: String(parsed.page_type ?? "").trim(),
    overall_atmosphere: String(parsed.overall_atmosphere ?? "").trim(),
    color_mood: String(parsed.color_mood ?? "").trim(),
    typography_feel: String(parsed.typography_feel ?? "").trim(),
    above_the_fold: String(parsed.above_the_fold ?? "").trim(),
    vertical_rhythm: String(parsed.vertical_rhythm ?? "").trim(),
    media_strategy: String(parsed.media_strategy ?? "").trim(),
    notable_modules: asStringArray(parsed.notable_modules, 8),
    brand_cues: String(parsed.brand_cues ?? "").trim(),
    interaction_chrome: String(parsed.interaction_chrome ?? "").trim(),
    category_tags: asStringArray(parsed.category_tags, 8).map((tag) => tag.toLowerCase()),
    rebuild_hints: String(parsed.rebuild_hints ?? "").trim(),
    heading: String(parsed.heading ?? "").trim(),
    cta: String(parsed.cta ?? "").trim(),
    layout_order,
    confidence: clampConfidence(parsed.confidence)
  };
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
