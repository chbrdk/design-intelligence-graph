import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { LlmCompleter, LlmProviderConfig, LlmTokenUsage } from "./llm-provider.js";
import { createLlmProviderFromConfig } from "./llm-provider.js";
import { VISION_SCREEN_PROMPT } from "./llm-eval-scenario.js";
import { resolveScalingRoles } from "./llm-routing.js";
import { evidenceSha256, type LlmStageCache } from "./llm-stage-cache.js";
import { usageToStageCost, type StageCostRecord } from "./llm-cost.js";
import { loadDigPaths } from "./runtime-paths.js";
import type { CaptureManifest } from "./types.js";

export interface LlmVisionResult {
  status: "complete" | "failed" | "skipped";
  model?: string;
  heading?: string;
  cta?: string;
  layout_order?: string[];
  confidence?: number;
  error?: string;
  raw_sha256?: string;
  cost?: StageCostRecord;
}

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
      { maxTokens: options.maxTokens ?? 500, model: visionModel }
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
