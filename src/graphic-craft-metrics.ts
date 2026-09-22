/**
 * Fine-grained graphic craft metrics (~100 axes) for SPIRION artboards.
 * @see knowledge/graphic-craft-metrics.md
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { createHash } from "node:crypto";
import {
  asCompositionContract,
  aspectRatioLabel,
  type CompositionContract
} from "./composition-contract.js";
import {
  GRAPHIC_CRAFT_METRIC_BY_ID,
  GRAPHIC_CRAFT_METRIC_DEFS,
  GRAPHIC_CRAFT_METRICS_VERSION,
  graphicCraftMetricCount,
  type GraphicMetricDef
} from "./graphic-craft-metrics-catalog.js";
import { writeArtifact } from "./io.js";
import { usageToStageCost, type StageCostRecord } from "./llm-cost.js";
import { createLlmProviderFromConfig, type LlmCompleter, type LlmProviderConfig } from "./llm-provider.js";
import { evidenceSha256, type LlmStageCache } from "./llm-stage-cache.js";
import {
  findSettledScreenshot,
  resolveVisionModel,
  visionEnabled,
  visionMaxBytes
} from "./llm-vision.js";
import { loadDigPaths } from "./runtime-paths.js";
import type { CaptureManifest } from "./types.js";

export type GraphicMetricValue = number | string | boolean | null;

export type GraphicCraftMetricsDocument = {
  schema_version: "0.1.0";
  graphic_craft_metrics_version: typeof GRAPHIC_CRAFT_METRICS_VERSION;
  generated_at: string;
  source_screenshot: string;
  model: string | null;
  status: "complete" | "failed" | "skipped";
  error?: string;
  metric_count: number;
  filled_count: number;
  confidence: number;
  /** LLM + measured merged values keyed by catalog id. */
  metrics: Record<string, GraphicMetricValue>;
  /** Deterministic sharp / package measures (subset of metrics + extras). */
  measured: Record<string, GraphicMetricValue>;
  groups: Record<string, number>;
};

export type GraphicCraftMetricsResult = {
  status: "complete" | "failed" | "skipped";
  document: GraphicCraftMetricsDocument | null;
  model?: string;
  error?: string;
  cost?: StageCostRecord;
  raw_sha256?: string;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeHex(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t.toLowerCase()}`;
  return null;
}

function coerceValue(def: GraphicMetricDef, raw: unknown): GraphicMetricValue {
  if (raw === null || raw === undefined) return null;
  switch (def.kind) {
    case "score": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) return null;
      // Accept 0-100 and normalize.
      return clamp01(n > 1.5 ? n / 100 : n);
    }
    case "boolean":
      if (typeof raw === "boolean") return raw;
      if (raw === 1 || raw === "1" || raw === "true") return true;
      if (raw === 0 || raw === "0" || raw === "false") return false;
      return null;
    case "enum": {
      const s = String(raw).trim().toLowerCase().replace(/\s+/g, "_");
      if (!def.vocab?.length) return s || null;
      const hit = def.vocab.find((v) => v.toLowerCase() === s || v.toLowerCase() === String(raw).trim().toLowerCase());
      return hit ?? null;
    }
    case "hex":
      return normalizeHex(raw);
    case "text": {
      const s = String(raw).trim().slice(0, 160);
      return s || null;
    }
    default:
      return null;
  }
}

export function graphicCraftMetricsRelativePath(root = process.cwd()): string {
  return (
    loadDigPaths(root).graphicCraftMetrics?.relativePath ??
    "derived/graphic-craft-metrics.json"
  );
}

export async function loadGraphicCraftMetricsDocument(
  packageRoot: string,
  root = process.cwd()
): Promise<GraphicCraftMetricsDocument | null> {
  try {
    const raw = JSON.parse(
      await readFile(resolve(packageRoot, graphicCraftMetricsRelativePath(root)), "utf8")
    ) as GraphicCraftMetricsDocument;
    return raw?.schema_version === "0.1.0" ? raw : null;
  } catch {
    return null;
  }
}

export async function writeGraphicCraftMetricsDocument(
  packageRoot: string,
  doc: GraphicCraftMetricsDocument,
  root = process.cwd()
): Promise<string> {
  const rel = graphicCraftMetricsRelativePath(root);
  await writeArtifact(packageRoot, rel, `${JSON.stringify(doc, null, 2)}\n`, "application/json");
  return rel;
}

/** Deterministic metrics from image bytes (no LLM). */
export async function measureGraphicCraftMetrics(
  image: Buffer
): Promise<Record<string, GraphicMetricValue>> {
  const pipeline = sharp(image, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const aspect = aspectRatioLabel(width, height);
  const stats = await sharp(image, { failOn: "none" }).stats();
  const channels = stats.channels ?? [];
  const r = channels[0]?.mean ?? 128;
  const g = channels[1]?.mean ?? 128;
  const b = channels[2]?.mean ?? 128;
  const std =
    (channels[0]?.stdev ?? 0) + (channels[1]?.stdev ?? 0) + (channels[2]?.stdev ?? 0);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const toHex = (rr: number, gg: number, bb: number) =>
    `#${[rr, gg, bb]
      .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0"))
      .join("")}`;

  const orientation =
    width > 0 && height > 0
      ? Math.abs(width - height) / Math.max(width, height) < 0.06
        ? "square"
        : width > height
          ? "landscape"
          : "portrait"
      : "square";

  const aspectFamily = ["1:1", "4:5", "9:16", "16:9", "3:2", "2:3"].includes(aspect)
    ? aspect
    : "other";

  const sizeClass =
    width * height < 200_000 ? "thumbnail" : width * height > 2_000_000 ? "ooh" : "social";

  return {
    "format.orientation": orientation,
    "format.aspect_family": aspectFamily,
    "format.size_class": sizeClass,
    "color.value_key": luminance > 0.62 ? "light" : luminance < 0.38 ? "dark" : "mixed",
    "color.saturation": clamp01(std / 120),
    "color.contrast_punch": clamp01(std / 100),
    "color.dominant_hex": toHex(r, g, b),
    "color.ground_hex": toHex(r * 0.85, g * 0.85, b * 0.85),
    "color.accent_hex": toHex(Math.min(255, r + 40), Math.max(0, g - 15), Math.min(255, b + 25)),
    "space.overall": clamp01(1 - std / 140),
    "space.feel": std < 40 ? "airy" : std > 90 ? "tight" : "balanced",
    "risk.craft_thin": width < 64 || height < 64 || (width * height < 10_000 && std < 8) ? 0.9 : 0.05,
    "meas.width_px": width,
    "meas.height_px": height,
    "meas.entropy_proxy": Math.round(std * 10) / 10,
    "meas.luminance": Math.round(luminance * 1000) / 1000
  };
}

export function parseGraphicCraftMetricsResponse(
  raw: unknown,
  measured: Record<string, GraphicMetricValue> = {}
): { metrics: Record<string, GraphicMetricValue>; filled_count: number; confidence: number } {
  const root =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const bag =
    root.metrics && typeof root.metrics === "object" && !Array.isArray(root.metrics)
      ? (root.metrics as Record<string, unknown>)
      : root;

  const metrics: Record<string, GraphicMetricValue> = { ...measured };
  let filled = 0;
  for (const def of GRAPHIC_CRAFT_METRIC_DEFS) {
    const fromLlm = coerceValue(def, bag[def.id]);
    if (fromLlm !== null) {
      metrics[def.id] = fromLlm;
      filled += 1;
      continue;
    }
    if (metrics[def.id] === undefined || metrics[def.id] === null) {
      // leave measured if present
      if (measured[def.id] !== undefined && measured[def.id] !== null) {
        metrics[def.id] = measured[def.id]!;
        filled += 1;
      } else {
        metrics[def.id] = null;
      }
    } else {
      filled += 1;
    }
  }

  const confRaw = root.confidence;
  const confidence =
    typeof confRaw === "number" && Number.isFinite(confRaw)
      ? clamp01(confRaw > 1.5 ? confRaw / 100 : confRaw)
      : clamp01(filled / Math.max(1, graphicCraftMetricCount()));

  return { metrics, filled_count: filled, confidence };
}

export function buildGraphicCraftMetricsPrompt(): string {
  const lines = GRAPHIC_CRAFT_METRIC_DEFS.map((d) => {
    if (d.kind === "score") return `- "${d.id}": number 0..1 — ${d.label}`;
    if (d.kind === "boolean") return `- "${d.id}": true|false — ${d.label}`;
    if (d.kind === "hex") return `- "${d.id}": "#rrggbb" — ${d.label}`;
    if (d.kind === "text") return `- "${d.id}": short string — ${d.label}`;
    return `- "${d.id}": one of [${(d.vocab ?? []).join("|")}] — ${d.label}`;
  });
  return `You are SPIRION graphic craft analyst. Score a SINGLE artboard (print/social/key visual) with fine-grained craft metrics.
Return ONLY valid JSON:
{
  "confidence": 0.0-1.0,
  "metrics": {
${lines.join("\n")}
  }
}
Rules:
- Fill EVERY metric key listed.
- Scores are 0..1 (not 0..100). Higher risk.* = more risk.
- Do NOT invent scroll page / hero section bands.
- Hex must be #rrggbb.
- Be concrete; avoid defaulting everything to 0.5.`;
}

function groupFillCounts(metrics: Record<string, GraphicMetricValue>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const def of GRAPHIC_CRAFT_METRIC_DEFS) {
    if (metrics[def.id] === null || metrics[def.id] === undefined) continue;
    out[def.group] = (out[def.group] ?? 0) + 1;
  }
  return out;
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence?.[1]?.trim() ?? trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("graphic_craft_metrics_json_missing");
  return JSON.parse(body.slice(start, end + 1));
}

export async function runGraphicCraftMetricsAnalysis(
  packageRoot: string,
  manifest: CaptureManifest,
  options: {
    config: LlmProviderConfig;
    provider?: LlmCompleter;
    stageCache?: LlmStageCache;
    maxTokens?: number;
    persist?: boolean;
  }
): Promise<GraphicCraftMetricsResult> {
  if (!visionEnabled()) {
    return { status: "skipped", document: null, error: "DIG_LLM_VISION=false" };
  }

  const shotPath = findSettledScreenshot(packageRoot, manifest);
  if (!shotPath) {
    return { status: "skipped", document: null, error: "No artboard screenshot" };
  }

  let bytes = await readFile(shotPath);
  const maxBytes = visionMaxBytes();
  if (bytes.length > maxBytes) {
    bytes = await sharp(bytes, { failOn: "none" })
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
  }

  const measured = await measureGraphicCraftMetrics(bytes);
  const relative = shotPath.replace(`${packageRoot}/`, "").replace(`${packageRoot}\\`, "");
  const visionModel = resolveVisionModel(options.config);
  const mime = shotPath.endsWith(".png") ? "image/png" : "image/jpeg";
  const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
  const evidenceKey = evidenceSha256(
    `graphic_craft_metrics:${GRAPHIC_CRAFT_METRICS_VERSION}:${relative}:${createHash("sha256")
      .update(bytes)
      .digest("hex")}`
  );

  const toDoc = (
    parsed: ReturnType<typeof parseGraphicCraftMetricsResponse>,
    model: string,
    status: "complete" | "failed" = "complete",
    error?: string
  ): GraphicCraftMetricsDocument => ({
    schema_version: "0.1.0",
    graphic_craft_metrics_version: GRAPHIC_CRAFT_METRICS_VERSION,
    generated_at: new Date().toISOString(),
    source_screenshot: relative,
    model,
    status,
    ...(error ? { error } : {}),
    metric_count: graphicCraftMetricCount(),
    filled_count: parsed.filled_count,
    confidence: parsed.confidence,
    metrics: parsed.metrics,
    measured,
    groups: groupFillCounts(parsed.metrics)
  });

  const cache = options.stageCache;
  if (cache) {
    const hit = await cache.get("vision_page", visionModel, evidenceKey);
    if (hit?.raw_response) {
      try {
        const parsed = parseGraphicCraftMetricsResponse(extractJsonObject(hit.raw_response), measured);
        const document = toDoc(parsed, visionModel);
        if (options.persist !== false) await writeGraphicCraftMetricsDocument(packageRoot, document);
        return {
          status: "complete",
          document,
          model: visionModel,
          raw_sha256: `sha256:${createHash("sha256").update(hit.raw_response).digest("hex")}`,
          cost: usageToStageCost("vision_page", visionModel, undefined, true)
        };
      } catch {
        /* fall through */
      }
    }
  }

  const provider =
    options.provider ??
    createLlmProviderFromConfig({
      ...options.config,
      model: visionModel,
      visionModel
    });

  try {
    const completion = await provider.complete(
      [
        { role: "system", content: buildGraphicCraftMetricsPrompt() },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Score this artboard on all ${graphicCraftMetricCount()} craft metrics. JSON only.`
            },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
      ],
      {
        maxTokens: options.maxTokens ?? 12_000,
        model: visionModel,
        reasoningEffort: "none" as const
      }
    );

    await cache?.set({
      stage_id: "vision_page",
      model: visionModel,
      evidence_sha256: evidenceKey,
      raw_response: completion.content,
      status: "complete"
    });

    const parsed = parseGraphicCraftMetricsResponse(extractJsonObject(completion.content), measured);
    const document = toDoc(parsed, completion.model);
    if (options.persist !== false) await writeGraphicCraftMetricsDocument(packageRoot, document);
    return {
      status: "complete",
      document,
      model: completion.model,
      raw_sha256: `sha256:${createHash("sha256").update(completion.content).digest("hex")}`,
      cost: usageToStageCost("vision_page", completion.model, completion.usage, false)
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const parsed = parseGraphicCraftMetricsResponse({}, measured);
    const document = toDoc(parsed, visionModel, "failed", message);
    if (options.persist !== false) {
      await writeGraphicCraftMetricsDocument(packageRoot, document).catch(() => undefined);
    }
    return { status: "failed", document, model: visionModel, error: message };
  }
}

/** Map fine metrics → coarse Library design_facets-friendly labels. */
export function designFacetHintsFromGraphicMetrics(
  metrics: Record<string, GraphicMetricValue>
): {
  style: string | null;
  layout: string | null;
  contrast_mode: string | null;
  palette: string | null;
  value_key: string | null;
  color_mood: string | null;
  composition_energy: string | null;
} {
  const toneEntries: Array<[string, string]> = [
    ["tone.luxury", "luxury-dark"],
    ["tone.editorial", "editorial"],
    ["tone.brutal", "brutalist"],
    ["tone.playful", "playful"],
    ["tone.corporate", "corporate"],
    ["tone.minimal", "minimal"]
  ];
  let style: string | null = null;
  let best = 0;
  for (const [key, label] of toneEntries) {
    const v = metrics[key];
    if (typeof v === "number" && v > best) {
      best = v;
      style = label;
    }
  }
  if ((metrics["image.media_mode"] === "photo" || metrics["image.full_bleed_photo"] === true) && best < 0.55) {
    style = "photographic";
  }

  const layoutFamily = metrics["comp.layout_family"];
  const layout =
    layoutFamily === "split-claim-media"
      ? "split columns"
      : layoutFamily === "editorial-column"
        ? "single column"
        : layoutFamily === "full-bleed-product" || layoutFamily === "poster-stack"
          ? "full-bleed stacks"
          : layoutFamily === "collage"
            ? "mixed"
            : "full-bleed stacks";

  const punch = typeof metrics["color.contrast_punch"] === "number" ? metrics["color.contrast_punch"] : 0.5;
  const sat = typeof metrics["color.saturation"] === "number" ? metrics["color.saturation"] : 0.5;
  const contrast_mode =
    punch < 0.25 ? "low_contrast" : sat > 0.7 && punch > 0.55 ? "saturated" : punch > 0.65 ? "mixed" : "mixed";

  const chroma = typeof metrics["color.chroma_count_feel"] === "number" ? metrics["color.chroma_count_feel"] : 0.5;
  const palette = chroma < 0.25 ? "mono" : chroma < 0.55 ? "duo" : "multi";

  const value_key =
    typeof metrics["color.value_key"] === "string" ? String(metrics["color.value_key"]) : null;
  const color_mood =
    typeof metrics["color.mood_label"] === "string" ? String(metrics["color.mood_label"]) : null;

  const diagonal = typeof metrics["comp.diagonal_energy"] === "number" ? metrics["comp.diagonal_energy"] : 0.4;
  const calm = typeof metrics["tone.calm"] === "number" ? metrics["tone.calm"] : 0.4;
  const composition_energy =
    diagonal > 0.65 || (typeof metrics["tone.urgency"] === "number" && metrics["tone.urgency"] > 0.6)
      ? "dynamic"
      : calm > 0.6
        ? "calm"
        : "balanced";

  return { style, layout, contrast_mode, palette, value_key, color_mood, composition_energy };
}

/** Prefer craft-metric labels when present; keep vision-derived fields as fallback. */
export function mergeFacetsWithGraphicCraftHints<T extends Record<string, unknown>>(
  facets: T,
  metrics: Record<string, GraphicMetricValue> | null | undefined
): T {
  if (!metrics) return facets;
  const hints = designFacetHintsFromGraphicMetrics(metrics);
  return {
    ...facets,
    ...(hints.style ? { style: hints.style } : {}),
    ...(hints.layout ? { layout: hints.layout } : {}),
    ...(hints.contrast_mode ? { contrast_mode: hints.contrast_mode } : {}),
    ...(hints.palette ? { palette: hints.palette } : {}),
    ...(hints.value_key ? { value_key: hints.value_key } : {}),
    ...(hints.color_mood ? { color_mood: hints.color_mood } : {}),
    ...(hints.composition_energy ? { composition_energy: hints.composition_energy } : {})
  };
}

export function refineCompositionFromCraftMetrics(
  base: CompositionContract,
  metrics: Record<string, GraphicMetricValue>
): CompositionContract {
  const avoid = [...base.avoid];
  const riskMap: Array<[string, string]> = [
    ["risk.busy_center", "busy-center"],
    ["risk.tiny_legal_collision", "tiny-legal-collision"],
    ["risk.equal_three_icons", "equal-three-icon-row"],
    ["risk.fake_web_hero_bands", "fake web hero scroll bands"],
    ["risk.generic_gradient", "generic purple-to-indigo gradient fill"],
    ["risk.craft_thin", "craft-thin empty canvas"]
  ];
  for (const [key, label] of riskMap) {
    const v = metrics[key];
    if (typeof v === "number" && v >= 0.55 && !avoid.includes(label)) avoid.push(label);
  }

  const spaceFeel = metrics["space.feel"];
  const negativeSpace =
    spaceFeel === "tight" || spaceFeel === "balanced" || spaceFeel === "airy"
      ? spaceFeel
      : base.negativeSpace;

  const layoutFamily =
    typeof metrics["comp.layout_family"] === "string"
      ? String(metrics["comp.layout_family"])
      : base.layoutFamily;

  const focalRole =
    typeof metrics["comp.focal_role"] === "string" ? String(metrics["comp.focal_role"]) : base.focal;

  const ctaRole =
    metrics["prod.cta_present"] === true
      ? ("present" as const)
      : metrics["prod.cta_present"] === false
        ? ("absent" as const)
        : base.ctaRole;

  return asCompositionContract({
    ...base,
    focal: focalRole,
    negativeSpace,
    layoutFamily,
    ctaRole,
    avoid: avoid.slice(0, 20),
    colorAxes: {
      ...base.colorAxes,
      ...(typeof metrics["color.dominant_hex"] === "string"
        ? { dominant: String(metrics["color.dominant_hex"]) }
        : {}),
      ...(typeof metrics["color.accent_hex"] === "string"
        ? { accent: String(metrics["color.accent_hex"]) }
        : {}),
      ...(typeof metrics["color.ground_hex"] === "string"
        ? { ground: String(metrics["color.ground_hex"]) }
        : {})
    }
  })!;
}

export { GRAPHIC_CRAFT_METRIC_BY_ID, graphicCraftMetricCount, GRAPHIC_CRAFT_METRICS_VERSION };
