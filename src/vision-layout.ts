import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";
import { writeArtifact } from "./io.js";
import { isConsentOverlayText } from "./consent-noise.js";
import { loadDigPaths } from "./runtime-paths.js";
import type { ArtifactReference, CaptureManifest } from "./types.js";
import type { SectionLookDescription } from "./section-look.js";

export const VISION_LAYOUT_VERSION = "0.2.0";

/** After tile remap, snap gaps up to this (normalized). */
export const VISION_BAND_MAX_GAP_SNAP = 0.045;
/** Merge bands thinner than this into a neighbor. */
export const VISION_BAND_MICRO_HEIGHT = 0.025;
/** Prefer at least this height for VL crops (borrow from neighbor if needed). */
export const VISION_BAND_MIN_HEIGHT = 0.04;
/** If the first band starts within this, pull it to y=0 (nav over hero). */
export const VISION_BAND_TOP_CHROME = 0.08;

export type VisionLayoutBox = { x: number; y: number; width: number; height: number };

export type VisionLayoutBand = {
  id: string;
  label: string;
  category: string;
  box: VisionLayoutBox;
  confidence: number;
};

export type VisionLayoutDocument = {
  schema_version: "0.1.0";
  vision_layout_version: typeof VISION_LAYOUT_VERSION;
  generated_at: string;
  source_screenshot: string;
  image_width: number;
  image_height: number;
  notes?: string;
  bands: VisionLayoutBand[];
  model?: string;
  status: "complete" | "failed" | "skipped";
  error?: string;
};

export type VisionLayoutCropRecord = {
  band_id: string;
  path: string;
  bbox_px: { left: number; top: number; width: number; height: number };
  bytes: number;
  sha256: string;
};

const ALLOWED_CATEGORIES = new Set([
  "hero",
  "nav",
  "feature",
  "content",
  "commerce",
  "conversion",
  "social_proof",
  "footer",
  "other"
]);

export function visionLayoutMaxBands(environment: NodeJS.ProcessEnv = process.env): number {
  const fromEnv = Number(environment.DIG_LLM_VISION_LAYOUT_MAX_BANDS);
  if (Number.isFinite(fromEnv) && fromEnv >= 1) return Math.min(12, Math.floor(fromEnv));
  const paths = loadDigPaths() as { visionLayout?: { maxBands?: number } };
  const fromPaths = Number(paths.visionLayout?.maxBands ?? 12);
  return Number.isFinite(fromPaths) && fromPaths >= 1 ? Math.min(12, Math.floor(fromPaths)) : 12;
}

export function visionLayoutRelativePath(): string {
  const paths = loadDigPaths() as { visionLayout?: { relativePath?: string } };
  return paths.visionLayout?.relativePath ?? "derived/vision-layout.json";
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function normalizeVisionBox(raw: unknown): VisionLayoutBox | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const y = clamp01(Number(record.y));
  let height = clamp01(Number(record.height));
  // Sections are always full-bleed page bands — never card/CTA boxes.
  const x = 0;
  const width = 1;
  if (height < 0.05) return null;
  if (y + height > 1) height = Math.max(0.04, 1 - y);
  return { x, y, width, height };
}

export function parseVisionLayoutResponse(
  raw: string,
  options: { maxBands?: number; idPrefix?: string } = {}
): { bands: VisionLayoutBand[]; notes: string } {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("vision_layout response missing JSON object");
  let parsed: { bands?: unknown; notes?: unknown };
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1)) as { bands?: unknown; notes?: unknown };
  } catch {
    parsed = JSON.parse(candidate.slice(start, end + 1).replace(/,\s*([\]}])/g, "$1")) as {
      bands?: unknown;
      notes?: unknown;
    };
  }
  const maxBands = options.maxBands ?? visionLayoutMaxBands();
  const prefix = options.idPrefix ?? "band";
  const bands: VisionLayoutBand[] = [];
  let heroSeen = false;
  const rows = Array.isArray(parsed.bands) ? parsed.bands : [];
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const record = row as Record<string, unknown>;
    const label = String(record.label ?? record.id ?? `Band ${index + 1}`).trim() || `Band ${index + 1}`;
    if (isConsentOverlayText(label)) continue;
    let category = String(record.category ?? "other").toLowerCase();
    if (!ALLOWED_CATEGORIES.has(category)) category = "other";
    if (category === "hero") {
      if (heroSeen) category = "feature";
      else heroSeen = true;
    }
    const box = normalizeVisionBox(record.box);
    if (!box) continue;
    const confidence = Number(record.confidence);
    bands.push({
      id: String(record.id ?? `${prefix}_${index + 1}`).replace(/\s+/g, "_").slice(0, 64),
      label: label.slice(0, 80),
      category,
      box,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.6
    });
    if (bands.length >= maxBands) break;
  }
  bands.sort((a, b) => a.box.y - b.box.y || b.box.height - a.box.height);
  // Re-enforce single hero after sort
  let heroKept = false;
  const deduped = bands.map((band) => {
    if (band.category !== "hero") return band;
    if (heroKept) return { ...band, category: "feature" };
    heroKept = true;
    return band;
  });
  return {
    bands: deduped.slice(0, maxBands),
    notes: typeof parsed.notes === "string" ? parsed.notes.slice(0, 400) : ""
  };
}

/** Map tile-local normalized bands onto the full image. */
export function mapBandsFromTile(
  bands: VisionLayoutBand[],
  tile: { top: number; height: number; fullHeight: number },
  idPrefix: string
): VisionLayoutBand[] {
  if (tile.fullHeight <= 0 || tile.height <= 0) return [];
  return bands.map((band, index) => {
    const absTop = tile.top + band.box.y * tile.height;
    const absHeight = band.box.height * tile.height;
    return {
      ...band,
      id: `${idPrefix}_${band.id || index + 1}`,
      box: {
        x: 0,
        y: clamp01(absTop / tile.fullHeight),
        width: 1,
        height: clamp01(absHeight / tile.fullHeight)
      }
    };
  });
}

/** Merge overlapping tile bands; keep higher confidence / larger height. */
export function mergeVisionLayoutBands(bands: VisionLayoutBand[], maxBands = visionLayoutMaxBands()): VisionLayoutBand[] {
  const sorted = [...bands].sort((a, b) => a.box.y - b.box.y);
  const merged: VisionLayoutBand[] = [];
  for (const band of sorted) {
    if (isConsentOverlayText(band.label)) continue;
    const prev = merged[merged.length - 1];
    if (prev) {
      const prevBottom = prev.box.y + prev.box.height;
      const overlap = Math.min(prevBottom, band.box.y + band.box.height) - Math.max(prev.box.y, band.box.y);
      const minH = Math.min(prev.box.height, band.box.height);
      if (overlap > minH * 0.45 || Math.abs(prev.box.y - band.box.y) < 0.03) {
        const preferBand =
          band.confidence > prev.confidence ||
          (band.confidence === prev.confidence && band.box.height > prev.box.height);
        if (preferBand) merged[merged.length - 1] = band;
        continue;
      }
    }
    merged.push(band);
  }
  let heroSeen = false;
  const capped = merged.slice(0, maxBands).map((band) => {
    if (band.category !== "hero") return band;
    if (heroSeen) return { ...band, category: "feature" };
    heroSeen = true;
    return band;
  });
  return capped;
}

export type VisionLayoutTile = {
  id: string;
  top: number;
  height: number;
  fullHeight: number;
  bytes: Buffer;
  mime: string;
};

/** Build vertical JPEG tiles for tall pages so VL payloads stay under size caps. */
export async function buildVisionLayoutTiles(
  imagePath: string,
  options: { maxBytes?: number; maxWidth?: number; targetTileHeight?: number } = {}
): Promise<{ tiles: VisionLayoutTile[]; width: number; height: number; sourceBytes: Buffer }> {
  const maxBytes = options.maxBytes ?? 2_200_000;
  const maxWidth = options.maxWidth ?? 1280;
  const targetTileHeight = options.targetTileHeight ?? 1600;
  const sourceBytes = await readFile(imagePath);
  const base = sharp(sourceBytes, { failOn: "none" }).rotate();
  const meta = await base.metadata();
  const width = Math.max(1, meta.width ?? 1);

  // Materialize resize first — sharp.metadata() ignores pending ops, so extract
  // must use post-resize pixel dimensions (otherwise: extract_area bad extract area).
  const prepared = await (width > maxWidth
    ? base.clone().resize({ width: maxWidth, withoutEnlargement: true })
    : base.clone()
  )
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const whole = prepared.data;
  const rw = Math.max(1, prepared.info.width ?? 1);
  const rh = Math.max(1, prepared.info.height ?? 1);

  if (whole.length <= maxBytes && rh <= targetTileHeight * 1.25) {
    return {
      tiles: [{ id: "full", top: 0, height: rh, fullHeight: rh, bytes: whole, mime: "image/jpeg" }],
      width: rw,
      height: rh,
      sourceBytes
    };
  }

  const overlap = Math.floor(targetTileHeight * 0.12);
  const stride = Math.max(400, targetTileHeight - overlap);
  const tiles: VisionLayoutTile[] = [];
  let top = 0;
  let index = 0;
  while (top < rh) {
    const tileHeight = Math.min(targetTileHeight, rh - top);
    if (tileHeight < 1 || top + tileHeight > rh + 1) break;
    const left = 0;
    const extractWidth = rw;
    const extractHeight = Math.min(tileHeight, rh - top);
    const tileBuf = await sharp(whole, { failOn: "none" })
      .extract({ left, top, width: extractWidth, height: extractHeight })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer();
    tiles.push({
      id: `tile_${index + 1}`,
      top,
      height: extractHeight,
      fullHeight: rh,
      bytes: tileBuf,
      mime: "image/jpeg"
    });
    index += 1;
    if (top + extractHeight >= rh) break;
    top += stride;
    if (tiles.length >= 4) {
      // Cover remaining page with a final tile from the bottom if we hit the cap early.
      if (top < rh) {
        const restTop = Math.max(0, rh - targetTileHeight);
        if (restTop > top - stride) {
          const restHeight = rh - restTop;
          const restBuf = await sharp(whole, { failOn: "none" })
            .extract({ left: 0, top: restTop, width: rw, height: restHeight })
            .jpeg({ quality: 70, mozjpeg: true })
            .toBuffer();
          tiles.push({
            id: `tile_${index + 1}`,
            top: restTop,
            height: restHeight,
            fullHeight: rh,
            bytes: restBuf,
            mime: "image/jpeg"
          });
        }
      }
      break;
    }
  }
  if (!tiles.length) {
    // Fallback: send the whole downscaled JPEG even if oversized for the model.
    return {
      tiles: [{ id: "full", top: 0, height: rh, fullHeight: rh, bytes: whole, mime: "image/jpeg" }],
      width: rw,
      height: rh,
      sourceBytes
    };
  }
  return { tiles, width: rw, height: rh, sourceBytes };
}

export function visionBandToCssBox(
  band: VisionLayoutBand,
  document: { width: number; height: number }
): { x: number; y: number; width: number; height: number } {
  return {
    x: band.box.x * document.width,
    y: band.box.y * document.height,
    width: band.box.width * document.width,
    height: band.box.height * document.height
  };
}

export async function emitVisionBandCrops(input: {
  packageRoot: string;
  screenshotRelative: string;
  imageWidth: number;
  imageHeight: number;
  bands: VisionLayoutBand[];
  maxCrops?: number;
}): Promise<VisionLayoutCropRecord[]> {
  const maxCrops = input.maxCrops ?? Math.min(8, input.bands.length);
  const absolute = resolve(input.packageRoot, input.screenshotRelative);
  let pipeline = sharp(absolute, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();
  const iw = meta.width ?? input.imageWidth;
  const ih = meta.height ?? input.imageHeight;
  const crops: VisionLayoutCropRecord[] = [];
  for (const band of input.bands.slice(0, maxCrops)) {
    const left = Math.floor(band.box.x * iw);
    const top = Math.floor(band.box.y * ih);
    const width = Math.max(1, Math.ceil(band.box.width * iw));
    const height = Math.max(1, Math.ceil(band.box.height * ih));
    const leftClamped = Math.max(0, Math.min(left, Math.max(0, iw - 1)));
    const topClamped = Math.max(0, Math.min(top, Math.max(0, ih - 1)));
    const bbox_px = {
      left: leftClamped,
      top: topClamped,
      width: Math.max(1, Math.min(width, iw - leftClamped)),
      height: Math.max(1, Math.min(height, ih - topClamped))
    };
    if (bbox_px.width < 1 || bbox_px.height < 1) continue;
    const relative = `viewports/desktop/sections/vision_${band.id}.webp`;
    const outPath = resolve(input.packageRoot, relative);
    await mkdir(dirname(outPath), { recursive: true });
    const bytes = await sharp(absolute, { failOn: "none" })
      .rotate()
      .extract(bbox_px)
      .webp({ quality: 72 })
      .toBuffer();
    await writeArtifact(input.packageRoot, relative, bytes, "image/webp");
    crops.push({
      band_id: band.id,
      path: relative,
      bbox_px,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex")
    });
  }
  return crops;
}

export function visionBandsToSectionLooks(
  bands: VisionLayoutBand[],
  crops: VisionLayoutCropRecord[],
  _notes?: string
): SectionLookDescription[] {
  const cropById = new Map(crops.map((crop) => [crop.band_id, crop]));
  return bands.map((band) => {
    const crop = cropById.get(band.id);
    const stack = `${band.category} band · ${band.label}`;
    // Do not attach page/tile notes here — they pollute every section look.
    const look = [
      `Vision-detected ${band.category} section labeled "${band.label}".`,
      `Full-width band y=${band.box.y.toFixed(2)} h=${band.box.height.toFixed(2)}.`
    ].join(" ");
    return {
      section_id: band.id,
      signature: band.category === "hero" ? "media" : "vision_band",
      category: band.category,
      stack_summary: stack,
      look_summary: look,
      confidence: band.confidence,
      evidence_refs: crop ? [crop.path, `vision_layout:${band.id}`] : [`vision_layout:${band.id}`],
      media: {
        role: band.category === "hero" ? "hero" : "inline",
        notes: crop ? `crop ${crop.path}` : "vision band"
      }
    } satisfies SectionLookDescription;
  });
}

/** Stable ids after tile merge: band_1 … band_n top-to-bottom. */
export function renumberVisionBands(bands: VisionLayoutBand[]): VisionLayoutBand[] {
  return bands.map((band, index) => ({ ...band, id: `band_${index + 1}` }));
}

/** Drop last-tile prose that leaks into page-level layout notes. */
export function sanitizeVisionLayoutNotes(notes: string): string {
  const trimmed = notes.trim();
  if (!trimmed) return "";
  if (/^the tile\b/i.test(trimmed)) return "";
  if (/\btile_\d+\b/i.test(trimmed)) return "";
  if (/\btiles?\b/i.test(trimmed) && /(capture|captures|shows|showing|contains|bottom of)/i.test(trimmed)) {
    return "";
  }
  return trimmed.slice(0, 400);
}

function cloneBands(bands: VisionLayoutBand[]): VisionLayoutBand[] {
  return bands.map((band) => ({
    ...band,
    box: { x: 0, y: band.box.y, width: 1, height: band.box.height }
  }));
}

/**
 * Post-process merged bands: include top chrome, close small gaps (ticker undershoot),
 * drop micro legal strips, enforce a usable min height for section VL crops.
 */
export function refineVisionLayoutBands(bands: VisionLayoutBand[]): VisionLayoutBand[] {
  if (!bands.length) return [];
  const next = cloneBands(bands).sort((a, b) => a.box.y - b.box.y || b.box.height - a.box.height);

  const first = next[0]!;
  if (first.box.y > 0 && first.box.y <= VISION_BAND_TOP_CHROME) {
    first.box.height = clamp01(first.box.height + first.box.y);
    first.box.y = 0;
  }

  for (let i = 0; i < next.length - 1; i++) {
    const a = next[i]!;
    const b = next[i + 1]!;
    const aBottom = a.box.y + a.box.height;
    const gap = b.box.y - aBottom;
    if (gap <= 0 || gap > VISION_BAND_MAX_GAP_SNAP) continue;
    // Undershot thin bands (tickers/dividers) usually need the gap below them.
    if (a.box.height <= b.box.height) {
      a.box.height = clamp01(a.box.height + gap);
    } else {
      b.box.y = clamp01(aBottom);
      b.box.height = clamp01(b.box.height + gap);
    }
  }

  const last = next[next.length - 1]!;
  const tail = 1 - (last.box.y + last.box.height);
  if (tail > 0 && tail <= VISION_BAND_MAX_GAP_SNAP) {
    last.box.height = clamp01(last.box.height + tail);
  }

  const merged: VisionLayoutBand[] = [];
  for (const band of next) {
    if (band.box.height < VISION_BAND_MICRO_HEIGHT && merged.length) {
      const prev = merged[merged.length - 1]!;
      const bottom = Math.max(prev.box.y + prev.box.height, band.box.y + band.box.height);
      prev.box.height = clamp01(bottom - prev.box.y);
      continue;
    }
    merged.push(band);
  }
  if (merged.length >= 2 && merged[0]!.box.height < VISION_BAND_MICRO_HEIGHT) {
    const head = merged[0]!;
    const second = merged[1]!;
    const top = Math.min(head.box.y, second.box.y);
    const bottom = Math.max(head.box.y + head.box.height, second.box.y + second.box.height);
    merged[1] = {
      ...second,
      box: { x: 0, y: top, width: 1, height: clamp01(bottom - top) }
    };
    merged.shift();
  }

  for (let i = 0; i < merged.length; i++) {
    const band = merged[i]!;
    if (band.box.height >= VISION_BAND_MIN_HEIGHT) continue;
    const need = VISION_BAND_MIN_HEIGHT - band.box.height;
    const neighbor = merged[i + 1];
    if (neighbor && neighbor.box.height > VISION_BAND_MIN_HEIGHT + need) {
      band.box.height = VISION_BAND_MIN_HEIGHT;
      const newNextY = band.box.y + band.box.height;
      neighbor.box.height = clamp01(neighbor.box.y + neighbor.box.height - newNextY);
      neighbor.box.y = newNextY;
      continue;
    }
    const prev = merged[i - 1];
    if (prev && prev.box.height > VISION_BAND_MIN_HEIGHT + need) {
      const newY = Math.max(prev.box.y + VISION_BAND_MIN_HEIGHT, band.box.y - need);
      const bottom = band.box.y + band.box.height;
      prev.box.height = clamp01(newY - prev.box.y);
      band.box.y = newY;
      band.box.height = clamp01(Math.max(VISION_BAND_MIN_HEIGHT, bottom - newY));
    }
  }

  for (let i = 0; i < merged.length - 1; i++) {
    const a = merged[i]!;
    const b = merged[i + 1]!;
    const aBottom = a.box.y + a.box.height;
    if (aBottom <= b.box.y) continue;
    const overlap = aBottom - b.box.y;
    if (a.box.height >= b.box.height) {
      a.box.height = Math.max(VISION_BAND_MICRO_HEIGHT, a.box.height - overlap);
    } else {
      b.box.height = Math.max(VISION_BAND_MICRO_HEIGHT, b.box.y + b.box.height - aBottom);
      b.box.y = aBottom;
    }
  }

  return merged.map((band) => ({
    ...band,
    box: {
      x: 0,
      y: clamp01(band.box.y),
      width: 1,
      height: clamp01(band.box.height)
    }
  }));
}

export function shouldPreferVisionLooks(domLooks: SectionLookDescription[]): boolean {
  if (!domLooks.length) return true;
  const thin = domLooks.filter((item) => {
    const sig = (item.signature ?? "").toLowerCase();
    const cat = (item.category ?? "").toLowerCase();
    return sig === "body" || sig === "unknown" || cat === "commerce";
  }).length;
  return thin / domLooks.length >= 0.6;
}

export async function loadVisionLayoutDocument(
  packageRoot: string
): Promise<VisionLayoutDocument | null> {
  try {
    const raw = await readFile(resolve(packageRoot, visionLayoutRelativePath()), "utf8");
    return JSON.parse(raw) as VisionLayoutDocument;
  } catch {
    return null;
  }
}

export async function writeVisionLayoutDocument(
  packageRoot: string,
  doc: VisionLayoutDocument
): Promise<ArtifactReference> {
  return writeArtifact(
    packageRoot,
    visionLayoutRelativePath(),
    JSON.stringify(doc, null, 2),
    "application/json"
  );
}

export function findLayoutScreenshot(
  packageRoot: string,
  manifest: CaptureManifest
): { absolute: string; relative: string } | null {
  const preferred =
    manifest.viewport_captures.find((viewport) => viewport.name === "desktop") ??
    manifest.viewport_captures[0];
  if (!preferred?.artifacts) return null;
  const relative =
    preferred.artifacts.playwright_full_page_screenshot?.path ??
    preferred.artifacts.full_page_screenshot?.path ??
    preferred.artifacts.viewport_screenshot?.path;
  if (!relative) return null;
  return { absolute: resolve(packageRoot, relative), relative };
}
