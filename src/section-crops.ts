import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import sharp from "sharp";
import { writeArtifact } from "./io.js";
import { loadDigPaths } from "./runtime-paths.js";
import { selectSectionsForLook, sectionLookMaxSections } from "./section-look.js";
import type { SectionComposition } from "./section-composition.js";
import type { ArtifactReference, CaptureManifest } from "./types.js";

export const SECTION_CROPS_VERSION = "0.1.0";

export type CssBox = { x: number; y: number; width: number; height: number };

export interface SectionCropRecord {
  section_id: string;
  viewport_name: string;
  viewport_capture_id: string;
  category: string;
  signature: string;
  path: string;
  bbox_css: CssBox;
  bbox_px: { left: number; top: number; width: number; height: number };
  source_screenshot: string;
  bytes: number;
  sha256: string;
  reason: string;
}

export interface SectionCropsDocument {
  schema_version: "0.1.0";
  section_crops_version: typeof SECTION_CROPS_VERSION;
  generated_at: string;
  crops: SectionCropRecord[];
}

export function sectionCropSettings(environment: NodeJS.ProcessEnv = process.env): {
  maxPerViewport: number;
  padPx: number;
  minWidth: number;
  minHeight: number;
  maxHeight: number;
  maxWrapperHeight: number;
  webpQuality: number;
} {
  const paths = loadDigPaths();
  const cfg = (paths as { sectionCrops?: Record<string, number> }).sectionCrops ?? {};
  const fromEnv = (key: string, fallback: number) => {
    const value = Number(environment[key]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    maxPerViewport: fromEnv("DIG_SECTION_CROPS_MAX", Number(cfg.maxPerViewport ?? sectionLookMaxSections(environment))),
    padPx: fromEnv("DIG_SECTION_CROPS_PAD", Number(cfg.padPx ?? 12)),
    minWidth: fromEnv("DIG_SECTION_CROPS_MIN_WIDTH", Number(cfg.minWidth ?? 280)),
    minHeight: fromEnv("DIG_SECTION_CROPS_MIN_HEIGHT", Number(cfg.minHeight ?? 120)),
    maxHeight: fromEnv("DIG_SECTION_CROPS_MAX_HEIGHT", Number(cfg.maxHeight ?? 1600)),
    maxWrapperHeight: fromEnv("DIG_SECTION_CROPS_MAX_WRAPPER", Number(cfg.maxWrapperHeight ?? 2800)),
    webpQuality: fromEnv("DIG_SECTION_CROPS_WEBP_QUALITY", Number(cfg.webpQuality ?? 72))
  };
}

function roleBoxes(section: SectionComposition): CssBox[] {
  return section.recipe
    .filter((step): step is Extract<(typeof section.recipe)[number], { kind: "role" }> => step.kind === "role")
    .map((step) => step.box);
}

/** Union box of measured role geometry (CSS px). */
export function sectionFrameBox(section: SectionComposition): CssBox | null {
  const boxes = roleBoxes(section);
  if (!boxes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY)
  };
}

export function padCssBox(box: CssBox, pad: number, document?: { width: number; height: number }): CssBox {
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const right = box.x + box.width + pad;
  const bottom = box.y + box.height + pad;
  const maxW = document?.width && document.width > 0 ? document.width : right;
  const maxH = document?.height && document.height > 0 ? document.height : bottom;
  return {
    x,
    y,
    width: Math.max(1, Math.min(right, maxW) - x),
    height: Math.max(1, Math.min(bottom, maxH) - y)
  };
}

/** Step-1 crop gate: sane geometry for selected look sections (vision gating comes later). */
export function isCroppableSection(
  section: SectionComposition,
  settings = sectionCropSettings()
): { ok: boolean; reason: string } {
  const frame = sectionFrameBox(section);
  if (!frame) return { ok: false, reason: "no_geometry" };
  const thin = section.signature === "body" || section.signature === "unknown";
  if (thin && frame.height >= settings.maxWrapperHeight) {
    return { ok: false, reason: "page_wrapper" };
  }
  if (frame.width < settings.minWidth) return { ok: false, reason: "too_narrow" };
  if (frame.height < settings.minHeight) return { ok: false, reason: "too_short" };
  if (frame.height > settings.maxHeight) return { ok: false, reason: "too_tall" };
  const category = section.category.toLowerCase();
  if (category === "nav" && frame.height < 160 && !section.signature.includes("cta")) {
    return { ok: false, reason: "nav_chrome" };
  }
  return { ok: true, reason: "selected_geometry" };
}

export function selectSectionsForCrops(
  sections: SectionComposition[],
  maxSections = sectionCropSettings().maxPerViewport
): SectionComposition[] {
  // Keep crop set aligned with look selection (desktop-biased), then geometry-gate.
  const preferred = selectSectionsForLook(sections, Math.max(maxSections, sectionLookMaxSections()));
  const croppable = preferred.filter((section) => isCroppableSection(section).ok);
  return croppable.slice(0, maxSections);
}

export function cssBoxToImagePixels(
  box: CssBox,
  image: { width: number; height: number },
  document: { width: number; height: number }
): { left: number; top: number; width: number; height: number } {
  const scaleX = document.width > 0 ? image.width / document.width : 1;
  const scaleY = document.height > 0 ? image.height / document.height : 1;
  let left = Math.floor(box.x * scaleX);
  let top = Math.floor(box.y * scaleY);
  let width = Math.ceil(box.width * scaleX);
  let height = Math.ceil(box.height * scaleY);
  left = Math.max(0, Math.min(left, Math.max(0, image.width - 1)));
  top = Math.max(0, Math.min(top, Math.max(0, image.height - 1)));
  width = Math.max(1, Math.min(width, image.width - left));
  height = Math.max(1, Math.min(height, image.height - top));
  return { left, top, width, height };
}

function findViewportSource(
  packageRoot: string,
  viewports: CaptureManifest["viewport_captures"],
  viewportName: string
): { absolute: string; relative: string; document: { width: number; height: number } } | null {
  const viewport =
    viewports.find((item) => item.name === viewportName) ??
    viewports.find((item) => item.name === "desktop") ??
    viewports[0];
  if (!viewport) return null;
  // Prefer DIG Playwright full-page (post cookie-dismiss) for crops; CHECKION JPEG is page SoT but may retain CMP chrome.
  const playwright = viewport.artifacts?.playwright_full_page_screenshot?.path;
  const full = viewport.artifacts?.full_page_screenshot?.path;
  const settled = viewport.artifacts?.viewport_screenshot?.path;
  const relative = playwright ?? full ?? settled;
  if (!relative) return null;
  return {
    absolute: resolve(packageRoot, relative),
    relative,
    document: {
      width: Math.max(1, viewport.document?.width ?? viewport.viewport?.width ?? 1440),
      height: Math.max(1, viewport.document?.height ?? viewport.viewport?.height ?? 900)
    }
  };
}

export async function emitSectionCrops(input: {
  packageRoot: string;
  viewportCaptures: CaptureManifest["viewport_captures"];
  sections: SectionComposition[];
  viewportName?: string;
}): Promise<{ document: SectionCropsDocument; artifact: ArtifactReference; crops: SectionCropRecord[] }> {
  const settings = sectionCropSettings();
  const viewportName = input.viewportName ?? "desktop";
  const source = findViewportSource(input.packageRoot, input.viewportCaptures, viewportName);
  if (!source) {
    const empty: SectionCropsDocument = {
      schema_version: "0.1.0",
      section_crops_version: SECTION_CROPS_VERSION,
      generated_at: new Date().toISOString(),
      crops: []
    };
    const artifact = await writeArtifact(
      input.packageRoot,
      "derived/section-crops.json",
      JSON.stringify(empty, null, 2),
      "application/json"
    );
    return { document: empty, artifact, crops: [] };
  }

  const pool = input.sections.filter((section) => section.viewport_name === viewportName);
  const selected = selectSectionsForCrops(pool.length ? pool : input.sections, settings.maxPerViewport);

  const imageBytes = await readFile(source.absolute);
  const meta = await sharp(imageBytes).metadata();
  const imageWidth = meta.width ?? 0;
  const imageHeight = meta.height ?? 0;
  if (!imageWidth || !imageHeight) {
    throw new Error(`Section crop source has no dimensions: ${source.relative}`);
  }

  const crops: SectionCropRecord[] = [];
  for (const section of selected) {
    const gate = isCroppableSection(section, settings);
    if (!gate.ok) continue;
    const frame = sectionFrameBox(section);
    if (!frame) continue;
    const padded = padCssBox(frame, settings.padPx, source.document);
    const bbox_px = cssBoxToImagePixels(padded, { width: imageWidth, height: imageHeight }, source.document);
    const cropBuffer = await sharp(imageBytes)
      .extract(bbox_px)
      .webp({ quality: settings.webpQuality })
      .toBuffer();
    const relativePath = `viewports/${section.viewport_name}/sections/${section.section_id}.webp`;
    const artifact = await writeArtifact(input.packageRoot, relativePath, cropBuffer, "image/webp");
    crops.push({
      section_id: section.section_id,
      viewport_name: section.viewport_name,
      viewport_capture_id: section.viewport_capture_id,
      category: section.category,
      signature: section.signature,
      path: artifact.path,
      bbox_css: padded,
      bbox_px,
      source_screenshot: source.relative,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
      reason: gate.reason
    });
  }

  const document: SectionCropsDocument = {
    schema_version: "0.1.0",
    section_crops_version: SECTION_CROPS_VERSION,
    generated_at: new Date().toISOString(),
    crops
  };
  const artifact = await writeArtifact(
    input.packageRoot,
    "derived/section-crops.json",
    JSON.stringify(document, null, 2),
    "application/json"
  );
  return { document, artifact, crops };
}

export function cropPathBySectionId(document: SectionCropsDocument | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const crop of document?.crops ?? []) {
    map.set(crop.section_id, crop.path);
  }
  return map;
}

export async function loadSectionCropsDocument(packageRoot: string): Promise<SectionCropsDocument | null> {
  try {
    const raw = await readFile(resolve(packageRoot, "derived/section-crops.json"), "utf8");
    return JSON.parse(raw) as SectionCropsDocument;
  } catch {
    return null;
  }
}

export function sectionCropFileName(sectionId: string): string {
  return `${basename(sectionId)}.webp`;
}
