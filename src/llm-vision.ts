import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { LlmCompleter, LlmProviderConfig, LlmTokenUsage } from "./llm-provider.js";
import { createLlmProviderFromConfig } from "./llm-provider.js";
import {
  VISION_SCREEN_PROMPT,
  VISION_SECTION_PROMPT,
  VISION_LAYOUT_PROMPT,
  VISION_PAGE_PROMPT,
  VISION_PAGE_UX_PROMPT
} from "./llm-eval-scenario.js";
import { resolveScalingRoles } from "./llm-routing.js";
import { evidenceSha256, type LlmStageCache } from "./llm-stage-cache.js";
import { usageToStageCost, type StageCostRecord } from "./llm-cost.js";
import { loadDigPaths } from "./runtime-paths.js";
import type { SectionCropRecord } from "./section-crops.js";
import type { SectionLookDescription } from "./section-look.js";
import { isConsentOverlaySection, isConsentOverlayVision } from "./consent-noise.js";
import type { CaptureManifest } from "./types.js";
import {
  buildVisionLayoutTiles,
  findLayoutScreenshot,
  mapBandsFromTile,
  mergeVisionLayoutBands,
  parseVisionLayoutResponse,
  refineVisionLayoutBands,
  renumberVisionBands,
  sanitizeVisionLayoutNotes,
  VISION_LAYOUT_VERSION,
  visionLayoutMaxBands,
  writeVisionLayoutDocument,
  type VisionLayoutDocument,
  type VisionLayoutBand
} from "./vision-layout.js";
import {
  buildVisionPageUxEvidence,
  parseVisionPageResponse,
  parseVisionPageUxResponse,
  VISION_PAGE_VERSION,
  writeVisionPageDocument,
  type VisionPageDocument
} from "./vision-page.js";

export interface LlmVisionResult {
  status: "complete" | "failed" | "skipped";
  model?: string;
  heading?: string;
  cta?: string;
  layout_order?: string[];
  notes?: string;
  confidence?: number;
  error?: string;
  raw_sha256?: string;
  cost?: StageCostRecord;
}

export type LlmVisionPageResult = {
  status: "complete" | "failed" | "skipped";
  model?: string;
  document?: VisionPageDocument;
  /** Compat projection for quality-eval / rebuild-brief (same shape as vision_screen). */
  compat?: LlmVisionResult;
  error?: string;
  raw_sha256?: string;
  cost?: StageCostRecord;
};

export interface LlmSectionVisionResult {
  section_id: string;
  status: "complete" | "failed" | "skipped";
  model?: string;
  crop_path?: string;
  visible_text?: string[];
  media_subject?: string;
  atmosphere?: string;
  overlay?: string;
  cta_chrome?: string;
  composition?: string;
  confidence?: number;
  gate_reason?: string;
  error?: string;
  raw_sha256?: string;
  cost?: StageCostRecord;
}

export type LlmVisionLayoutResult = {
  status: "complete" | "failed" | "skipped";
  model?: string;
  document?: VisionLayoutDocument;
  bands: VisionLayoutBand[];
  notes?: string;
  error?: string;
  raw_sha256?: string;
  cost?: StageCostRecord;
  tile_count?: number;
};

function extractJsonObject(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Vision response did not contain a JSON object");
  const slice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return JSON.parse(slice.replace(/,\s*([\]}])/g, "$1"));
  }
}

export function visionEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (environment.DIG_LLM_VISION ?? "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0";
}

export function resolveVisionModel(config: LlmProviderConfig, environment: NodeJS.ProcessEnv = process.env): string {
  const roles = resolveScalingRoles(environment);
  return (
    environment.DIG_LLM_VISION_MODEL ??
    config.visionModel ??
    roles.bulkVision ??
    config.model
  );
}

export function findSettledScreenshot(packageRoot: string, manifest: CaptureManifest): string | null {
  const preferred =
    manifest.viewport_captures.find((viewport) => viewport.name === "desktop") ??
    manifest.viewport_captures[0];
  const preferFull =
    (process.env.DIG_LLM_VISION_FULL_PAGE ?? "true").trim().toLowerCase() !== "false" &&
    (process.env.DIG_LLM_VISION_FULL_PAGE ?? "true").trim() !== "0";
  const artifact = preferFull
    ? preferred?.artifacts?.full_page_screenshot ?? preferred?.artifacts?.viewport_screenshot
    : preferred?.artifacts?.viewport_screenshot ?? preferred?.artifacts?.full_page_screenshot;
  if (!artifact?.path) return null;
  return resolve(packageRoot, artifact.path);
}

export function visionMaxBytes(environment: NodeJS.ProcessEnv = process.env): number {
  const fromEnv = Number(environment.DIG_LLM_VISION_MAX_BYTES);
  if (Number.isFinite(fromEnv) && fromEnv >= 100_000) return Math.floor(fromEnv);
  const fromPaths = Number(loadDigPaths().llm.scaling?.visionMaxBytes);
  if (Number.isFinite(fromPaths) && fromPaths >= 100_000) return Math.floor(fromPaths);
  // Free VL models + OpenRouter often reject multi‑MB full-page marketing shots.
  return 2_500_000;
}

function screenshotCandidates(packageRoot: string, manifest: CaptureManifest): string[] {
  const preferred =
    manifest.viewport_captures.find((viewport) => viewport.name === "desktop") ??
    manifest.viewport_captures[0];
  if (!preferred?.artifacts) return [];
  const preferFull =
    (process.env.DIG_LLM_VISION_FULL_PAGE ?? "true").trim().toLowerCase() !== "false" &&
    (process.env.DIG_LLM_VISION_FULL_PAGE ?? "true").trim() !== "0";
  const full = preferred.artifacts.full_page_screenshot?.path;
  const settled = preferred.artifacts.viewport_screenshot?.path;
  const ordered = preferFull ? [full, settled] : [settled, full];
  return [...new Set(ordered.filter(Boolean).map((path) => resolve(packageRoot, path!)))];
}

/** Prefer full-page marketing capture for vision; fall back to settled viewport. */
export function findVisionScreenshot(packageRoot: string, manifest: CaptureManifest): string | null {
  return findSettledScreenshot(packageRoot, manifest);
}

async function loadVisionImage(
  packageRoot: string,
  manifest: CaptureManifest
): Promise<{ path: string; bytes: Buffer; mime: string } | { error: string }> {
  const maxBytes = visionMaxBytes();
  const candidates = screenshotCandidates(packageRoot, manifest);
  if (!candidates.length) return { error: "No full-page or settled screenshot artifact" };

  const oversized: string[] = [];
  for (const screenshotPath of candidates) {
    try {
      const bytes = await readFile(screenshotPath);
      if (bytes.length > maxBytes) {
        oversized.push(`${screenshotPath.split("/").slice(-2).join("/")} (${bytes.length}b)`);
        continue;
      }
      const lower = screenshotPath.toLowerCase();
      const mime =
        lower.endsWith(".jpg") || lower.endsWith(".jpeg")
          ? "image/jpeg"
          : lower.endsWith(".png")
            ? "image/png"
            : "image/webp";
      return { path: screenshotPath, bytes, mime };
    } catch {
      continue;
    }
  }
  if (oversized.length) {
    return {
      error: `Vision screenshot(s) exceed DIG_LLM_VISION_MAX_BYTES=${maxBytes}: ${oversized.join("; ")}`
    };
  }
  return { error: "No readable screenshot artifact for vision" };
}

export async function runVisionScreenAnalysis(
  packageRoot: string,
  manifest: CaptureManifest,
  options: {
    config: LlmProviderConfig;
    provider?: LlmCompleter;
    stageCache?: LlmStageCache;
    maxTokens?: number;
  }
): Promise<LlmVisionResult> {
  if (!visionEnabled()) {
    return { status: "skipped", error: "DIG_LLM_VISION=false" };
  }
  const image = await loadVisionImage(packageRoot, manifest);
  if ("error" in image) {
    const skipped = /No (full-page or settled|readable) screenshot/i.test(image.error);
    return { status: skipped ? "skipped" : "failed", error: image.error };
  }

  const visionModel = resolveVisionModel(options.config);
  const { path: screenshotPath, bytes, mime } = image;
  const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
  const evidenceKey = evidenceSha256(`${screenshotPath}:${createHash("sha256").update(bytes).digest("hex")}`);
  const cache = options.stageCache;

  if (cache) {
    const hit = await cache.get("vision_screen", visionModel, evidenceKey);
    if (hit?.raw_response) {
      try {
        const parsed = extractJsonObject(hit.raw_response) as {
          heading?: unknown;
          cta?: unknown;
          layout_order?: unknown;
          confidence?: unknown;
        };
        return {
          status: "complete",
          model: visionModel,
          heading: String(parsed.heading ?? ""),
          cta: String(parsed.cta ?? ""),
          layout_order: Array.isArray(parsed.layout_order) ? parsed.layout_order.map(String) : [],
          ...(typeof parsed.confidence === "number" ? { confidence: parsed.confidence } : {}),
          raw_sha256: `sha256:${createHash("sha256").update(hit.raw_response).digest("hex")}`,
          cost: usageToStageCost("vision_screen", visionModel, undefined, true)
        };
      } catch {
        /* fall through to live call */
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
        { role: "system", content: VISION_SCREEN_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Score this marketing hero screenshot. Return JSON only." },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
      ],
      { maxTokens: options.maxTokens ?? 2000, model: visionModel, reasoningEffort: "none" as const }
    );
    await cache?.set({
      stage_id: "vision_screen",
      model: visionModel,
      evidence_sha256: evidenceKey,
      raw_response: completion.content,
      status: "complete"
    });
    const parsed = extractJsonObject(completion.content) as {
      heading?: unknown;
      cta?: unknown;
      layout_order?: unknown;
      confidence?: unknown;
    };
    const usage: LlmTokenUsage | undefined = completion.usage;
    return {
      status: "complete",
      model: completion.model,
      heading: String(parsed.heading ?? ""),
      cta: String(parsed.cta ?? ""),
      layout_order: Array.isArray(parsed.layout_order) ? parsed.layout_order.map(String) : [],
      ...(typeof parsed.confidence === "number" ? { confidence: parsed.confidence } : {}),
      raw_sha256: `sha256:${createHash("sha256").update(completion.content).digest("hex")}`,
      cost: usageToStageCost("vision_screen", completion.model, usage, false)
    };
  } catch (error: unknown) {
    return {
      status: "failed",
      model: visionModel,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function runVisionPageAnalysis(
  packageRoot: string,
  manifest: CaptureManifest,
  options: {
    config: LlmProviderConfig;
    provider?: LlmCompleter;
    stageCache?: LlmStageCache;
    maxTokens?: number;
    persist?: boolean;
  }
): Promise<LlmVisionPageResult> {
  if (!visionEnabled()) {
    return { status: "skipped", error: "DIG_LLM_VISION=false" };
  }
  const image = await loadVisionImage(packageRoot, manifest);
  if ("error" in image) {
    const skipped = /No (full-page or settled|readable) screenshot/i.test(image.error);
    return { status: skipped ? "skipped" : "failed", error: image.error };
  }

  const visionModel = resolveVisionModel(options.config);
  const { path: screenshotPath, bytes, mime } = image;
  const relative =
    findLayoutScreenshot(packageRoot, manifest)?.relative ??
    screenshotPath.replace(`${packageRoot}/`, "").replace(`${packageRoot}\\`, "");
  const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
  const evidenceKey = evidenceSha256(
    `vision_page:${VISION_PAGE_VERSION}:${relative}:${createHash("sha256").update(bytes).digest("hex")}`
  );
  const cache = options.stageCache;

  const toResult = (raw: string, model: string, cost: StageCostRecord): LlmVisionPageResult => {
    const parsed = parseVisionPageResponse(raw);
    const document: VisionPageDocument = {
      schema_version: "0.1.0",
      vision_page_version: VISION_PAGE_VERSION,
      generated_at: new Date().toISOString(),
      source_screenshot: relative,
      ...parsed,
      model,
      status: "complete"
    };
    const notes = [parsed.overall_atmosphere, parsed.vertical_rhythm].filter(Boolean).join(" ");
    const raw_sha256 = `sha256:${createHash("sha256").update(raw).digest("hex")}`;
    const compat: LlmVisionResult = {
      status: "complete",
      model,
      heading: parsed.heading,
      cta: parsed.cta,
      layout_order: parsed.layout_order,
      ...(notes ? { notes } : {}),
      confidence: parsed.confidence,
      raw_sha256,
      cost
    };
    return {
      status: "complete",
      model,
      document,
      compat,
      raw_sha256,
      cost
    };
  };

  if (cache) {
    const hit = await cache.get("vision_page", visionModel, evidenceKey);
    if (hit?.raw_response) {
      try {
        const result = toResult(
          hit.raw_response,
          visionModel,
          usageToStageCost("vision_page", visionModel, undefined, true)
        );
        if (options.persist !== false && result.document) {
          await writeVisionPageDocument(packageRoot, result.document);
        }
        return result;
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
        { role: "system", content: VISION_PAGE_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Catalog this desktop full-page marketing screenshot in rich visual detail. Return JSON only."
            },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
      ],
      { maxTokens: options.maxTokens ?? 4200, model: visionModel, reasoningEffort: "none" as const }
    );
    await cache?.set({
      stage_id: "vision_page",
      model: visionModel,
      evidence_sha256: evidenceKey,
      raw_response: completion.content,
      status: "complete"
    });
    const result = toResult(
      completion.content,
      completion.model,
      usageToStageCost("vision_page", completion.model, completion.usage, false)
    );
    if (options.persist !== false && result.document) {
      await writeVisionPageDocument(packageRoot, result.document);
    }
    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const failedDoc: VisionPageDocument = {
      schema_version: "0.1.0",
      vision_page_version: VISION_PAGE_VERSION,
      generated_at: new Date().toISOString(),
      source_screenshot: relative,
      page_type: "",
      overall_atmosphere: "",
      color_mood: "",
      typography_feel: "",
      above_the_fold: "",
      vertical_rhythm: "",
      media_strategy: "",
      notable_modules: [],
      brand_cues: "",
      interaction_chrome: "",
      category_tags: [],
      rebuild_hints: "",
      visual_craft: {
        type_image_relationship: "",
        typography_composition: "",
        imagery_craft: "",
        spatial_craft: "",
        chrome_vs_content: "",
        rebuild_spec: ""
      },
      heading: "",
      cta: "",
      layout_order: [],
      confidence: 0.05,
      model: visionModel,
      status: "failed",
      error: message
    };
    if (options.persist !== false) {
      await writeVisionPageDocument(packageRoot, failedDoc).catch(() => undefined);
    }
    return { status: "failed", model: visionModel, document: failedDoc, error: message };
  }
}

/** Text-only UX/layout pass — small JSON, grounded on visual catalog + bands (no second image). */
export async function runVisionPageUxAnalysis(
  page: VisionPageDocument,
  bands: VisionLayoutBand[],
  options: {
    config: LlmProviderConfig;
    provider?: LlmCompleter;
    stageCache?: LlmStageCache;
    maxTokens?: number;
    packageRoot?: string;
    persist?: boolean;
  }
): Promise<LlmVisionPageResult> {
  if (!visionEnabled()) {
    return { status: "skipped", error: "DIG_LLM_VISION=false", document: page };
  }
  if (page.status !== "complete") {
    return { status: "skipped", error: "vision_page not complete", document: page };
  }

  const textModel = options.config.model;
  const evidence = buildVisionPageUxEvidence(page, bands);
  const evidenceKey = evidenceSha256(`vision_page_ux:${evidence}`);
  const cache = options.stageCache;

  const mergeUx = (ux: ReturnType<typeof parseVisionPageUxResponse>, model: string, cost: StageCostRecord) => {
    const document: VisionPageDocument = {
      ...page,
      layout_system: ux.layout_system,
      spacing_feel: ux.spacing_feel,
      alignment: ux.alignment,
      above_fold_job: ux.above_fold_job,
      ux_flow: ux.ux_flow,
      ux_strengths: ux.ux_strengths,
      ux_risks: ux.ux_risks,
      confidence: Math.min(page.confidence, ux.confidence),
      model,
      generated_at: new Date().toISOString()
    };
    return {
      status: "complete" as const,
      model,
      document,
      cost,
      raw_sha256: `sha256:${createHash("sha256").update(evidence + ux.layout_system).digest("hex")}`
    };
  };

  if (cache) {
    const hit = await cache.get("vision_page_ux", textModel, evidenceKey);
    if (hit?.raw_response) {
      try {
        const ux = parseVisionPageUxResponse(hit.raw_response);
        const result = mergeUx(ux, textModel, usageToStageCost("vision_page_ux", textModel, undefined, true));
        if (options.persist !== false && options.packageRoot && result.document) {
          await writeVisionPageDocument(options.packageRoot, result.document);
        }
        return result;
      } catch {
        /* fall through */
      }
    }
  }

  const provider =
    options.provider ??
    createLlmProviderFromConfig({
      ...options.config,
      model: textModel,
      reasoningEffort: "none"
    });

  const messages = [
    { role: "system" as const, content: VISION_PAGE_UX_PROMPT },
    {
      role: "user" as const,
      content: `Evidence JSON:\n${evidence}\nReturn UX/layout JSON only.`
    }
  ];

  const runOnce = async (maxTokens: number) => {
    const completion = await provider.complete(messages, {
      maxTokens,
      model: textModel,
      reasoningEffort: "none"
    });
    const ux = parseVisionPageUxResponse(completion.content);
    if (!ux.layout_system.trim() && !ux.above_fold_job.trim()) {
      throw new Error("vision_page_ux JSON missing layout_system and above_fold_job");
    }
    return {
      completion,
      result: mergeUx(
        ux,
        completion.model,
        usageToStageCost("vision_page_ux", completion.model, completion.usage, false)
      )
    };
  };

  try {
    let packed;
    try {
      packed = await runOnce(options.maxTokens ?? 900);
    } catch (firstError: unknown) {
      try {
        packed = await runOnce(Math.max(options.maxTokens ?? 900, 1400));
      } catch {
        throw firstError;
      }
    }
    await cache?.set({
      stage_id: "vision_page_ux",
      model: textModel,
      evidence_sha256: evidenceKey,
      raw_response: packed.completion.content,
      status: "complete"
    });
    if (options.persist !== false && options.packageRoot && packed.result.document) {
      await writeVisionPageDocument(options.packageRoot, packed.result.document);
    }
    return packed.result;
  } catch (error: unknown) {
    return {
      status: "failed",
      model: textModel,
      document: page,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function runVisionLayoutAnalysis(
  packageRoot: string,
  manifest: CaptureManifest,
  options: {
    config: LlmProviderConfig;
    provider?: LlmCompleter;
    stageCache?: LlmStageCache;
    maxTokens?: number;
    persist?: boolean;
  }
): Promise<LlmVisionLayoutResult> {
  if (!visionEnabled()) {
    return { status: "skipped", bands: [], error: "DIG_LLM_VISION=false" };
  }
  const shot = findLayoutScreenshot(packageRoot, manifest);
  if (!shot) {
    return { status: "skipped", bands: [], error: "No full-page or settled screenshot artifact" };
  }

  const visionModel = resolveVisionModel(options.config);
  const maxBands = visionLayoutMaxBands();
  let tiles;
  let width = 1;
  let height = 1;
  try {
    const built = await buildVisionLayoutTiles(shot.absolute, {
      maxBytes: Math.min(visionMaxBytes(), 2_200_000)
    });
    tiles = built.tiles;
    width = built.width;
    height = built.height;
  } catch (error: unknown) {
    return {
      status: "failed",
      bands: [],
      model: visionModel,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  const provider =
    options.provider ??
    createLlmProviderFromConfig({
      ...options.config,
      model: visionModel,
      visionModel
    });
  const cache = options.stageCache;
  const allBands: VisionLayoutBand[] = [];
  const rawChunks: string[] = [];
  const costParts: StageCostRecord[] = [];
  let notes = "";
  let lastModel = visionModel;

  try {
    for (const tile of tiles) {
      const dataUrl = `data:${tile.mime};base64,${tile.bytes.toString("base64")}`;
      const evidenceKey = evidenceSha256(
        `vision_layout:${shot.relative}:${tile.id}:${createHash("sha256").update(tile.bytes).digest("hex")}`
      );
      let raw: string | null = null;
      if (cache) {
        const hit = await cache.get("vision_layout", visionModel, evidenceKey);
        if (hit?.raw_response) {
          raw = hit.raw_response;
          costParts.push(usageToStageCost("vision_layout", visionModel, undefined, true));
        }
      }
      if (!raw) {
        const completion = await provider.complete(
          [
            { role: "system", content: VISION_LAYOUT_PROMPT },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    tiles.length > 1
                      ? `Segment this vertical TILE (${tile.id}) of a taller marketing page. Return JSON only.`
                      : "Segment this marketing page screenshot into vertical design bands. Return JSON only."
                },
                { type: "image_url", image_url: { url: dataUrl } }
              ]
            }
          ],
          { maxTokens: options.maxTokens ?? 2000, model: visionModel, reasoningEffort: "none" as const }
        );
        raw = completion.content;
        lastModel = completion.model;
        costParts.push(usageToStageCost("vision_layout", completion.model, completion.usage, false));
        await cache?.set({
          stage_id: "vision_layout",
          model: visionModel,
          evidence_sha256: evidenceKey,
          raw_response: raw,
          status: "complete"
        });
      }
      rawChunks.push(raw);
      const parsed = parseVisionLayoutResponse(raw, {
        maxBands: Math.ceil(maxBands / Math.max(1, tiles.length)) + 2,
        idPrefix: tile.id
      });
      if (parsed.notes) notes = parsed.notes;
      const mapped =
        tiles.length === 1 && tile.id === "full"
          ? parsed.bands
          : mapBandsFromTile(parsed.bands, tile, tile.id);
      allBands.push(...mapped);
    }

    const bands = renumberVisionBands(
      refineVisionLayoutBands(mergeVisionLayoutBands(allBands, maxBands))
    );
    const cleanedNotes = sanitizeVisionLayoutNotes(notes);
    const document: VisionLayoutDocument = {
      schema_version: "0.1.0",
      vision_layout_version: VISION_LAYOUT_VERSION,
      generated_at: new Date().toISOString(),
      source_screenshot: shot.relative,
      image_width: width,
      image_height: height,
      ...(cleanedNotes ? { notes: cleanedNotes } : {}),
      bands,
      model: lastModel,
      status: "complete"
    };
    if (options.persist !== false) {
      await writeVisionLayoutDocument(packageRoot, document);
    }
    const joined = rawChunks.join("\n---\n");
    const totalCost = costParts.reduce(
      (acc, part) => ({
        stage_id: "vision_layout" as const,
        model: lastModel,
        prompt_tokens: (acc.prompt_tokens ?? 0) + (part.prompt_tokens ?? 0),
        completion_tokens: (acc.completion_tokens ?? 0) + (part.completion_tokens ?? 0),
        estimated_usd: (acc.estimated_usd ?? 0) + (part.estimated_usd ?? 0),
        cache_hit: costParts.every((item) => item.cache_hit)
      }),
      {
        stage_id: "vision_layout" as const,
        model: lastModel,
        prompt_tokens: 0,
        completion_tokens: 0,
        estimated_usd: 0,
        cache_hit: false
      }
    );
    return {
      status: "complete",
      model: lastModel,
      document,
      bands,
      ...(cleanedNotes ? { notes: cleanedNotes } : {}),
      tile_count: tiles.length,
      raw_sha256: `sha256:${createHash("sha256").update(joined).digest("hex")}`,
      cost: totalCost
    };
  } catch (error: unknown) {
    const failedDoc: VisionLayoutDocument = {
      schema_version: "0.1.0",
      vision_layout_version: VISION_LAYOUT_VERSION,
      generated_at: new Date().toISOString(),
      source_screenshot: shot.relative,
      image_width: width,
      image_height: height,
      bands: [],
      model: visionModel,
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    };
    if (options.persist !== false) {
      await writeVisionLayoutDocument(packageRoot, failedDoc).catch(() => undefined);
    }
    return {
      status: "failed",
      model: visionModel,
      document: failedDoc,
      bands: [],
      ...(failedDoc.error ? { error: failedDoc.error } : {})
    };
  }
}

export function sectionVisionMaxPerCapture(environment: NodeJS.ProcessEnv = process.env): number {
  const fromEnv = Number(environment.DIG_LLM_SECTION_VISION_MAX);
  if (Number.isFinite(fromEnv) && fromEnv >= 0) return Math.floor(fromEnv);
  const fromPaths = Number(loadDigPaths().llm.scaling?.sectionVisionMaxPerCapture ?? 8);
  return Number.isFinite(fromPaths) && fromPaths >= 0 ? Math.floor(fromPaths) : 8;
}

/** Gate: only spend VL tokens where text/CSS look is thin or high-value. */
export function shouldRunSectionVision(
  description: Pick<
    SectionLookDescription,
    "section_id" | "signature" | "category" | "confidence" | "media" | "look_summary" | "stack_summary" | "role_notes"
  >,
  crop: SectionCropRecord | undefined
): { ok: boolean; reason: string } {
  if (!crop?.path) return { ok: false, reason: "no_crop" };
  if (
    isConsentOverlaySection({
      ...(description.category ? { category: description.category } : {}),
      ...(description.signature ? { signature: description.signature } : {}),
      ...(description.look_summary ? { look_summary: description.look_summary } : {}),
      ...(description.stack_summary ? { stack_summary: description.stack_summary } : {}),
      ...(description.role_notes ? { role_notes: description.role_notes } : {})
    })
  ) {
    return { ok: false, reason: "consent_overlay" };
  }
  const signature = (description.signature || "").toLowerCase();
  const category = (description.category || "").toLowerCase();
  const thin = signature === "media" || signature === "body" || signature === "unknown" || signature === "media_large";
  const lowConfidence = (description.confidence ?? 1) < 0.7;
  const highValue = ["hero", "feature", "conversion", "commerce"].some((item) => category.includes(item));
  const hasMedia =
    signature.includes("media") ||
    description.media?.role === "hero" ||
    description.media?.role === "background" ||
    description.media?.role === "inline";
  if (thin) return { ok: true, reason: "thin_signature" };
  if (lowConfidence) return { ok: true, reason: "low_confidence" };
  if (highValue && hasMedia) return { ok: true, reason: "high_value_media" };
  if (highValue) return { ok: true, reason: "high_value_category" };
  return { ok: false, reason: "text_css_sufficient" };
}

async function loadCropImage(
  packageRoot: string,
  relativePath: string
): Promise<{ path: string; bytes: Buffer; mime: string } | { error: string }> {
  const maxBytes = visionMaxBytes();
  const absolute = resolve(packageRoot, relativePath);
  try {
    const bytes = await readFile(absolute);
    if (bytes.length > maxBytes) {
      return { error: `Section crop exceeds DIG_LLM_VISION_MAX_BYTES=${maxBytes} (${bytes.length}b)` };
    }
    const lower = absolute.toLowerCase();
    const mime =
      lower.endsWith(".jpg") || lower.endsWith(".jpeg")
        ? "image/jpeg"
        : lower.endsWith(".png")
          ? "image/png"
          : "image/webp";
    return { path: absolute, bytes, mime };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runVisionSectionAnalysis(
  packageRoot: string,
  crop: SectionCropRecord,
  meta: { category?: string; signature?: string },
  options: {
    config: LlmProviderConfig;
    provider?: LlmCompleter;
    stageCache?: LlmStageCache;
    maxTokens?: number;
    gateReason?: string;
  }
): Promise<LlmSectionVisionResult> {
  if (!visionEnabled()) {
    return { section_id: crop.section_id, status: "skipped", error: "DIG_LLM_VISION=false", crop_path: crop.path };
  }
  const image = await loadCropImage(packageRoot, crop.path);
  if ("error" in image) {
    return {
      section_id: crop.section_id,
      status: "failed",
      crop_path: crop.path,
      error: image.error,
      ...(options.gateReason ? { gate_reason: options.gateReason } : {})
    };
  }

  const visionModel = resolveVisionModel(options.config);
  const dataUrl = `data:${image.mime};base64,${image.bytes.toString("base64")}`;
  const evidenceKey = evidenceSha256(`${crop.path}:${createHash("sha256").update(image.bytes).digest("hex")}`);
  const cache = options.stageCache;

  const parsePayload = (raw: string) => {
    const parsed = extractJsonObject(raw) as Record<string, unknown>;
    return {
      visible_text: Array.isArray(parsed.visible_text) ? parsed.visible_text.map(String).slice(0, 6) : [],
      media_subject: String(parsed.media_subject ?? "").trim(),
      atmosphere: String(parsed.atmosphere ?? "").trim(),
      overlay: String(parsed.overlay ?? "").trim(),
      cta_chrome: String(parsed.cta_chrome ?? "").trim(),
      composition: String(parsed.composition ?? "").trim(),
      confidence:
        typeof parsed.confidence === "number" ? Math.min(0.95, Math.max(0.05, parsed.confidence)) : undefined
    };
  };

  if (cache) {
    const hit = await cache.get("vision_section", visionModel, evidenceKey);
    if (hit?.raw_response) {
      try {
        const parsed = parsePayload(hit.raw_response);
        return {
          section_id: crop.section_id,
          status: "complete",
          model: visionModel,
          crop_path: crop.path,
          visible_text: parsed.visible_text,
          media_subject: parsed.media_subject,
          atmosphere: parsed.atmosphere,
          overlay: parsed.overlay,
          cta_chrome: parsed.cta_chrome,
          composition: parsed.composition,
          ...(parsed.confidence !== undefined ? { confidence: parsed.confidence } : {}),
          ...(options.gateReason ? { gate_reason: options.gateReason } : {}),
          raw_sha256: `sha256:${createHash("sha256").update(hit.raw_response).digest("hex")}`,
          cost: usageToStageCost("vision_section", visionModel, undefined, true)
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
        { role: "system", content: VISION_SECTION_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Stage=vision_section. category=${meta.category ?? "unknown"} signature=${meta.signature ?? "unknown"}. Return JSON only.`
            },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
      ],
      { maxTokens: options.maxTokens ?? 1200, model: visionModel, reasoningEffort: "none" as const }
    );
    await cache?.set({
      stage_id: "vision_section",
      model: visionModel,
      evidence_sha256: evidenceKey,
      raw_response: completion.content,
      status: "complete"
    });
    const parsed = parsePayload(completion.content);
    return {
      section_id: crop.section_id,
      status: "complete",
      model: completion.model,
      crop_path: crop.path,
      visible_text: parsed.visible_text,
      media_subject: parsed.media_subject,
      atmosphere: parsed.atmosphere,
      overlay: parsed.overlay,
      cta_chrome: parsed.cta_chrome,
      composition: parsed.composition,
      ...(parsed.confidence !== undefined ? { confidence: parsed.confidence } : {}),
      ...(options.gateReason ? { gate_reason: options.gateReason } : {}),
      raw_sha256: `sha256:${createHash("sha256").update(completion.content).digest("hex")}`,
      cost: usageToStageCost("vision_section", completion.model, completion.usage, false)
    };
  } catch (error: unknown) {
    return {
      section_id: crop.section_id,
      status: "failed",
      model: visionModel,
      crop_path: crop.path,
      ...(options.gateReason ? { gate_reason: options.gateReason } : {}),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function mergeSectionVisionIntoLook(
  description: SectionLookDescription,
  vision: LlmSectionVisionResult
): SectionLookDescription {
  if (vision.status !== "complete") return description;
  const visionSentence = [
    vision.composition,
    vision.atmosphere ? `Atmosphere: ${vision.atmosphere}` : "",
    vision.media_subject ? `Media: ${vision.media_subject}` : "",
    vision.overlay ? `Overlay: ${vision.overlay}` : "",
    vision.cta_chrome ? `CTA: ${vision.cta_chrome}` : ""
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  const look_summary = visionSentence
    ? `${description.look_summary} Vision: ${visionSentence}`.slice(0, 900)
    : description.look_summary;
  const role_notes = [...(description.role_notes ?? [])];
  if (vision.media_subject) {
    role_notes.push({ role: "media", notes: `vision:${vision.media_subject}`.slice(0, 220) });
  }
  if (vision.cta_chrome) {
    role_notes.push({ role: "cta", notes: `vision:${vision.cta_chrome}`.slice(0, 220) });
  }
  const evidence_refs = [
    ...description.evidence_refs,
    ...(vision.crop_path ? [`crop:${vision.crop_path}`] : []),
    "vision_section"
  ].slice(0, 16);
  const confidence = Math.min(
    0.95,
    Math.max(description.confidence, vision.confidence ?? description.confidence) + 0.03
  );
  return {
    ...description,
    look_summary,
    ...(role_notes.length ? { role_notes: role_notes.slice(0, 10) } : {}),
    evidence_refs,
    confidence
  };
}

export async function runGatedSectionVisions(input: {
  packageRoot: string;
  descriptions: SectionLookDescription[];
  crops: SectionCropRecord[];
  config: LlmProviderConfig;
  provider?: LlmCompleter;
  stageCache?: LlmStageCache;
  maxSections?: number;
}): Promise<{
  results: LlmSectionVisionResult[];
  descriptions: SectionLookDescription[];
  costs: StageCostRecord[];
}> {
  const maxSections = input.maxSections ?? sectionVisionMaxPerCapture();
  if (maxSections <= 0 || !visionEnabled()) {
    return { results: [], descriptions: input.descriptions, costs: [] };
  }
  const byId = new Map(input.crops.map((crop) => [crop.section_id, crop]));
  const gated: Array<{ description: SectionLookDescription; crop: SectionCropRecord; reason: string }> = [];
  for (const description of input.descriptions) {
    const crop = byId.get(description.section_id);
    const gate = shouldRunSectionVision(description, crop);
    if (!gate.ok || !crop) continue;
    gated.push({ description, crop, reason: gate.reason });
    if (gated.length >= maxSections) break;
  }

  const results = await Promise.all(
    gated.map(({ description, crop, reason }) =>
      runVisionSectionAnalysis(
        input.packageRoot,
        crop,
        {
          ...(description.category ? { category: description.category } : {}),
          ...(description.signature ? { signature: description.signature } : {})
        },
        {
          config: input.config,
          ...(input.provider ? { provider: input.provider } : {}),
          ...(input.stageCache ? { stageCache: input.stageCache } : {}),
          gateReason: reason
        }
      )
    )
  );

  const filtered: LlmSectionVisionResult[] = results.map((result) => {
    if (result.status !== "complete") return result;
    if (
      !isConsentOverlayVision({
        ...(result.visible_text ? { visible_text: result.visible_text } : {}),
        ...(result.cta_chrome ? { cta_chrome: result.cta_chrome } : {}),
        ...(result.composition ? { composition: result.composition } : {}),
        ...(result.media_subject ? { media_subject: result.media_subject } : {})
      })
    ) {
      return result;
    }
    return {
      section_id: result.section_id,
      status: "skipped",
      ...(result.crop_path ? { crop_path: result.crop_path } : {}),
      gate_reason: "consent_overlay_vision",
      error: "vision detected cookie/consent chrome",
      ...(result.cost ? { cost: result.cost } : {})
    };
  });

  const bySection = new Map(filtered.map((result) => [result.section_id, result]));
  const descriptions = input.descriptions.map((description) => {
    const vision = bySection.get(description.section_id);
    return vision ? mergeSectionVisionIntoLook(description, vision) : description;
  });
  const costs = filtered.flatMap((result) => (result.cost ? [result.cost] : []));
  return { results: filtered, descriptions, costs };
}

/** Run C — detailed VL for every vision-band crop (no DOM gate). Desktop max default 8. */
export async function runVisionBandSectionVisions(input: {
  packageRoot: string;
  crops: SectionCropRecord[];
  bands?: VisionLayoutBand[];
  config: LlmProviderConfig;
  provider?: LlmCompleter;
  stageCache?: LlmStageCache;
  maxSections?: number;
}): Promise<{
  results: LlmSectionVisionResult[];
  costs: StageCostRecord[];
}> {
  const maxSections = input.maxSections ?? Math.min(8, sectionVisionMaxPerCapture());
  if (maxSections <= 0 || !visionEnabled()) {
    return { results: [], costs: [] };
  }
  const bandById = new Map((input.bands ?? []).map((band) => [band.id, band]));
  const selected = input.crops
    .filter((crop) => crop.path && crop.reason === "vision_layout_band")
    .slice(0, maxSections);

  const results = await Promise.all(
    selected.map((crop) => {
      const band = bandById.get(crop.section_id);
      return runVisionSectionAnalysis(
        input.packageRoot,
        crop,
        {
          ...(crop.category ? { category: crop.category } : band?.category ? { category: band.category } : {}),
          ...(crop.signature
            ? { signature: crop.signature }
            : { signature: band?.category === "hero" ? "media" : "vision_band" })
        },
        {
          config: input.config,
          ...(input.provider ? { provider: input.provider } : {}),
          ...(input.stageCache ? { stageCache: input.stageCache } : {}),
          gateReason: "vision_layout_band"
        }
      );
    })
  );

  const filtered: LlmSectionVisionResult[] = results.map((result) => {
    if (result.status !== "complete") return result;
    if (
      !isConsentOverlayVision({
        ...(result.visible_text ? { visible_text: result.visible_text } : {}),
        ...(result.cta_chrome ? { cta_chrome: result.cta_chrome } : {}),
        ...(result.composition ? { composition: result.composition } : {}),
        ...(result.media_subject ? { media_subject: result.media_subject } : {})
      })
    ) {
      return result;
    }
    return {
      section_id: result.section_id,
      status: "skipped",
      ...(result.crop_path ? { crop_path: result.crop_path } : {}),
      gate_reason: "consent_overlay_vision",
      error: "vision detected cookie/consent chrome",
      ...(result.cost ? { cost: result.cost } : {})
    };
  });

  return {
    results: filtered,
    costs: filtered.flatMap((result) => (result.cost ? [result.cost] : []))
  };
}
