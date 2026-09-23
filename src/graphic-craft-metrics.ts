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
        maxTokens: options.maxTokens ?? 16_000,
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

/** Closed set of metric ids copied into MCP prompt packs as rebuild literals. */
export const GRAPHIC_CRAFT_BRIEF_LITERAL_IDS = [
  "format.orientation",
  "format.aspect_family",
  "format.channel_fit",
  "format.size_class",
  "comp.layout_family",
  "comp.focal_role",
  "comp.balance",
  "space.feel",
  "space.overall",
  "color.dominant_hex",
  "color.ground_hex",
  "color.accent_hex",
  "color.value_key",
  "color.mood_label",
  "color.contrast_punch",
  "color.saturation",
  "type.family_feel",
  "type.case_mode",
  "type.display_dominance",
  "type.scale_contrast",
  "image.media_mode",
  "image.full_bleed_photo",
  "prod.cta_present",
  "prod.primary_claim_guess",
  "narr.emotion_hook",
  "narr.benefit_clarity"
] as const;

export type GraphicCraftBrief = {
  schema_version: "0.1.0";
  graphic_craft_metrics_version: string;
  status: "complete" | "failed" | "skipped";
  confidence: number;
  filled_count: number;
  metric_count: number;
  /** Mean of filled score metrics per catalog group (0..1). */
  group_scores: Record<string, number>;
  /** High-signal enums / hex / text / bools / key scores for rebuild. */
  literals: Record<string, number | string | boolean>;
  /** Top tone.* scores (≥0.55), highest first. */
  tone_top: Array<{ id: string; score: number }>;
  /** risk.* scores ≥0.55 (higher = avoid / mitigate). */
  risks: Array<{ id: string; score: number }>;
  /** Short imperative directives for an MCP rebuild agent. */
  rebuild_directives: string[];
};

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function groupScoreMeans(metrics: Record<string, GraphicMetricValue>): Record<string, number> {
  const sums: Record<string, { sum: number; n: number }> = {};
  for (const def of GRAPHIC_CRAFT_METRIC_DEFS) {
    if (def.kind !== "score") continue;
    const v = metrics[def.id];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const bucket = sums[def.group] ?? { sum: 0, n: 0 };
    bucket.sum += v;
    bucket.n += 1;
    sums[def.group] = bucket;
  }
  const out: Record<string, number> = {};
  for (const [group, { sum, n }] of Object.entries(sums)) {
    if (n > 0) out[group] = round3(sum / n);
  }
  return out;
}

function pickLiterals(metrics: Record<string, GraphicMetricValue>): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  for (const id of GRAPHIC_CRAFT_BRIEF_LITERAL_IDS) {
    const v = metrics[id];
    if (v === null || v === undefined) continue;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) continue;
      out[id] = round3(v);
    } else if (typeof v === "boolean") {
      out[id] = v;
    } else if (typeof v === "string" && v.trim()) {
      out[id] = v.trim().slice(0, 120);
    }
  }
  return out;
}

function rankedScores(
  metrics: Record<string, GraphicMetricValue>,
  prefix: string,
  min = 0.55,
  limit = 6
): Array<{ id: string; score: number }> {
  const rows: Array<{ id: string; score: number }> = [];
  for (const [id, value] of Object.entries(metrics)) {
    if (!id.startsWith(prefix)) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min) continue;
    rows.push({ id, score: round3(value) });
  }
  return rows.sort((a, b) => b.score - a.score).slice(0, limit);
}

function buildRebuildDirectives(
  literals: Record<string, number | string | boolean>,
  toneTop: Array<{ id: string; score: number }>,
  risks: Array<{ id: string; score: number }>
): string[] {
  const directives: string[] = [];
  const push = (line: string | null | undefined) => {
    if (!line || directives.includes(line)) return;
    directives.push(line);
  };

  const layout = literals["comp.layout_family"];
  if (typeof layout === "string") push(`Use layoutFamily=${layout} as the primary artboard pattern.`);
  const focal = literals["comp.focal_role"];
  if (typeof focal === "string") push(`Keep focal attention on: ${focal}.`);
  const orientation = literals["format.orientation"];
  const aspect = literals["format.aspect_family"];
  if (typeof orientation === "string" || typeof aspect === "string") {
    push(
      `Respect format ${[orientation, aspect].filter((v): v is string => typeof v === "string").join(" / ")}.`
    );
  }
  const space = literals["space.feel"];
  if (typeof space === "string") push(`Negative space feel: ${space}.`);
  const hexes = [
    literals["color.dominant_hex"],
    literals["color.ground_hex"],
    literals["color.accent_hex"]
  ].filter((v): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v));
  if (hexes.length) push(`Lock palette hexes: ${hexes.join(", ")}.`);
  const valueKey = literals["color.value_key"];
  if (typeof valueKey === "string") push(`Value key: ${valueKey}.`);
  const mood = literals["color.mood_label"];
  if (typeof mood === "string") push(`Color mood: ${mood}.`);
  const media = literals["image.media_mode"];
  if (typeof media === "string") push(`Imagery mode: ${media}.`);
  if (literals["image.full_bleed_photo"] === true) push("Run photography edge-to-edge (full-bleed).");
  if (literals["prod.cta_present"] === false) push("No web CTA required — claim/lockup may stand alone.");
  if (literals["prod.cta_present"] === true) push("Include a clear CTA treatment matching the artboard craft.");
  const claim = literals["prod.primary_claim_guess"];
  if (typeof claim === "string") {
    push(`Echo claim structure (do not copy brand 1:1): “${claim}”.`);
  }
  const typeFeel = literals["type.family_feel"];
  if (typeof typeFeel === "string") push(`Typography family feel: ${typeFeel}.`);
  const caseMode = literals["type.case_mode"];
  if (typeof caseMode === "string") push(`Type case mode: ${caseMode}.`);
  if (toneTop[0]) {
    const leaf = toneTop[0].id.includes(".") ? toneTop[0].id.slice(toneTop[0].id.indexOf(".") + 1) : toneTop[0].id;
    push(`Lead tone: ${leaf} (${toneTop[0].score}).`);
  }
  for (const risk of risks.slice(0, 4)) {
    const leaf = risk.id.includes(".") ? risk.id.slice(risk.id.indexOf(".") + 1) : risk.id;
    push(`Mitigate risk.${leaf} (score ${risk.score}).`);
  }
  return directives.slice(0, 12);
}

/**
 * Compact craft map for MCP rebuild agents — NOT the full ~300 metric dump.
 * Fits inside DesignPromptPack budget alongside composition_contract.
 */
export function compactGraphicCraftBrief(
  doc: GraphicCraftMetricsDocument | null | undefined
): GraphicCraftBrief | null {
  if (!doc || doc.status !== "complete" || !doc.metrics) return null;
  const literals = pickLiterals(doc.metrics);
  const tone_top = rankedScores(doc.metrics, "tone.", 0.55, 5);
  const risks = rankedScores(doc.metrics, "risk.", 0.55, 6);
  const group_scores = groupScoreMeans(doc.metrics);
  const rebuild_directives = buildRebuildDirectives(literals, tone_top, risks);
  if (!Object.keys(literals).length && !rebuild_directives.length && !tone_top.length) {
    return null;
  }
  return {
    schema_version: "0.1.0",
    graphic_craft_metrics_version: doc.graphic_craft_metrics_version ?? GRAPHIC_CRAFT_METRICS_VERSION,
    status: doc.status,
    confidence: round3(clamp01(doc.confidence ?? 0)),
    filled_count: doc.filled_count ?? 0,
    metric_count: doc.metric_count ?? graphicCraftMetricCount(),
    group_scores,
    literals,
    tone_top,
    risks,
    rebuild_directives
  };
}

export function graphicCraftBriefHasSignal(brief: GraphicCraftBrief | null | undefined): boolean {
  if (!brief) return false;
  return (
    Object.keys(brief.literals).length > 0 ||
    brief.rebuild_directives.length > 0 ||
    brief.tone_top.length > 0 ||
    brief.risks.length > 0
  );
}

export function graphicCraftBriefRules(brief: GraphicCraftBrief): string[] {
  const rules: string[] = [
    "If graphic_craft_brief is present, treat literals + rebuild_directives as soft craft truth for the artboard rebuild.",
    "Prefer graphic_craft_brief.literals hex/layout/focal over vibe adjectives; composition_contract still wins on avoid[] / hierarchy when both exist."
  ];
  for (const line of brief.rebuild_directives.slice(0, 8)) {
    rules.push(line);
  }
  for (const risk of brief.risks.slice(0, 4)) {
    const leaf = risk.id.includes(".") ? risk.id.slice(risk.id.indexOf(".") + 1) : risk.id;
    rules.push(`Avoid / mitigate: ${leaf.replace(/_/g, "-")}.`);
  }
  return rules;
}

export async function loadGraphicCraftBriefForPackage(
  packageRoot: string,
  root = process.cwd()
): Promise<GraphicCraftBrief | null> {
  const doc = await loadGraphicCraftMetricsDocument(packageRoot, root);
  return compactGraphicCraftBrief(doc);
}

export { GRAPHIC_CRAFT_METRIC_BY_ID, graphicCraftMetricCount, GRAPHIC_CRAFT_METRICS_VERSION };
