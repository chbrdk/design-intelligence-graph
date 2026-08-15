#!/usr/bin/env node
/**
 * Unified DIG LLM quality eval (text staged + vision screenshot).
 *
 * Same fixture + golden expectations for every model so scores are comparable.
 *
 * Usage:
 *   npm run llm:quality-eval
 *   DIG_EVAL_MODELS=nvidia/nemotron-3-nano-30b-a3b:free npm run llm:quality-eval
 *   DIG_EVAL_TRACKS=text|vision|both  DIG_EVAL_SCENARIO=marketing-hero
 *
 * Needs OPENROUTER_API_KEY in .env when provider=openrouter (default for this script).
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { analyzeDesignWithLlm, type LlmDesignAnalysis } from "../src/llm-design.js";
import {
  VISION_SCREEN_PROMPT,
  buildEvidenceFromScenario,
  loadEvalScenario,
  type EvalScenario
} from "../src/llm-eval-scenario.js";
import {
  OpenAiCompatibleLlmProvider,
  type LlmProviderConfig
} from "../src/llm-provider.js";
import {
  combineScorecards,
  scoreTextTrack,
  scoreVisionTrack,
  type TextTrackResult,
  type VisionTrackResult
} from "../src/llm-quality-score.js";
import { loadDigPaths } from "../src/runtime-paths.js";

interface EvalModelSpec {
  id: string;
  label: string;
  tracks: Array<"text" | "vision">;
  /** Override chat model for text track; defaults to id. */
  text_model?: string;
  /** Override VL model for vision track; defaults to id. */
  vision_model?: string;
}

interface EvalPathsConfig {
  scenarioDefault?: string;
  scenariosDir?: string;
  reportDir?: string;
  models?: EvalModelSpec[];
}

async function loadEnvFile(root: string): Promise<Record<string, string>> {
  const raw = await readFile(resolve(root, ".env"), "utf8").catch(() => "");
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function extractJsonObject(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("LLM response did not contain a JSON object");
  const slice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    const repaired = slice
      .replace(/,\s*([\]}])/g, "$1")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");
    return JSON.parse(repaired);
  }
}

function toTextTrackResult(analysis: LlmDesignAnalysis): TextTrackResult {
  const stages = analysis.stages ?? [];
  const stages_complete = stages.filter((stage) => stage.status === "complete").length;
  const mobbin = analysis.mobbin;
  return {
    status: analysis.status,
    stages_complete,
    stages_total: stages.length || 5,
    screen_patterns: (mobbin?.screen_patterns ?? []).map((item) => item.name),
    ui_elements: (mobbin?.ui_elements ?? []).map((item) => item.name),
    recipe_signatures: (mobbin?.recipe_insights ?? []).map((item) => item.signature),
    flow_labels: (mobbin?.page_flow ?? []).map((item) => item.section_label),
    style_labels: (mobbin?.visual_style_labels ?? []).map((item) => item.name),
    design_summary: analysis.design_summary ?? "",
    json_parse_ok: analysis.status === "complete" && !analysis.error
  };
}

async function ensureScreenshot(scenarioDir: string, scenario: EvalScenario): Promise<string> {
  const shotPath = resolve(scenarioDir, scenario.screenshot);
  try {
    await access(shotPath);
    return shotPath;
  } catch {
    // regenerate
  }
  const htmlPath = resolve(scenarioDir, scenario.page_html);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: scenario.viewport
    });
    await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });
    await mkdir(dirname(shotPath), { recursive: true });
    await page.screenshot({ path: shotPath, type: "webp", quality: 80, fullPage: false });
  } finally {
    await browser.close();
  }
  return shotPath;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function isRetryableVisionError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("429") ||
    lower.includes("aborted") ||
    lower.includes("timeout") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("504")
  );
}

async function runVisionTrack(
  baseConfig: LlmProviderConfig,
  visionModel: string,
  screenshotPath: string,
  maxTokens: number
): Promise<VisionTrackResult> {
  const bytes = await readFile(screenshotPath);
  const dataUrl = `data:image/webp;base64,${bytes.toString("base64")}`;
  const visionTimeoutMs = Number(
    process.env.DIG_EVAL_VISION_TIMEOUT_MS ?? Math.max(baseConfig.timeoutMs, 180_000)
  );
  const attempts = Number(process.env.DIG_EVAL_VISION_RETRIES ?? "3");
  let lastError = "vision failed";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const provider = new OpenAiCompatibleLlmProvider({
      ...baseConfig,
      model: visionModel,
      visionModel,
      timeoutMs: visionTimeoutMs
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
        { maxTokens, model: visionModel }
      );
      const parsed = extractJsonObject(completion.content) as {
        heading?: unknown;
        cta?: unknown;
        layout_order?: unknown;
      };
      return {
        status: "complete",
        heading: typeof parsed.heading === "string" ? parsed.heading : String(parsed.heading ?? ""),
        cta: typeof parsed.cta === "string" ? parsed.cta : String(parsed.cta ?? ""),
        layout_order: Array.isArray(parsed.layout_order)
          ? parsed.layout_order.map((item) => String(item))
          : [],
        raw_preview: completion.content.slice(0, 400)
      };
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < attempts && isRetryableVisionError(lastError)) {
        const backoffMs = 4000 * attempt;
        console.log(`  vision retry ${attempt}/${attempts} after ${lastError} (wait ${backoffMs}ms)`);
        await sleep(backoffMs);
        continue;
      }
      break;
    }
  }

  return {
    status: "failed",
    error: lastError
  };
}

function defaultModels(paths: ReturnType<typeof loadDigPaths>): EvalModelSpec[] {
  const evalCfg = (paths.llm as { qualityEval?: EvalPathsConfig }).qualityEval;
  if (evalCfg?.models?.length) return evalCfg.models;
  const openrouter = paths.llm.openrouter;
  return [
    {
      id: openrouter?.defaultModel ?? "nvidia/nemotron-3-nano-30b-a3b:free",
      label: "Nemotron 3 Nano (text)",
      tracks: ["text"]
    },
    {
      id: openrouter?.visionModel ?? "nvidia/nemotron-nano-12b-v2-vl:free",
      label: "Nemotron Nano 12B VL",
      tracks: ["vision"]
    },
    {
      id: "google/gemma-4-26b-a4b-it:free",
      label: "Gemma 4 26B A4B (text+vision)",
      tracks: ["text", "vision"]
    }
  ];
}

function resolveModels(paths: ReturnType<typeof loadDigPaths>, trackFilter: "text" | "vision" | "both"): EvalModelSpec[] {
  const fromEnv = (process.env.DIG_EVAL_MODELS ?? "").trim();
  let models = defaultModels(paths);
  if (fromEnv) {
    models = fromEnv.split(",").map((id) => {
      const trimmed = id.trim();
      const known = models.find((item) => item.id === trimmed);
      return (
        known ?? {
          id: trimmed,
          label: trimmed,
          tracks: trackFilter === "text" ? (["text"] as const) : trackFilter === "vision" ? (["vision"] as const) : (["text", "vision"] as const)
        }
      );
    });
  }
  if (trackFilter === "both") return models;
  return models
    .map((model) => ({
      ...model,
      tracks: model.tracks.filter((track) => track === trackFilter)
    }))
    .filter((model) => model.tracks.length > 0);
}

function markdownReport(rows: Array<Record<string, unknown>>): string {
  const lines = [
    "# DIG LLM quality eval",
    "",
    `| model | overall% | text% | vision% | notes |`,
    `| --- | ---: | ---: | ---: | --- |`
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.label} | ${row.overall_percent} | ${row.text_percent ?? "—"} | ${row.vision_percent ?? "—"} | ${row.notes ?? ""} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const root = process.cwd();
  const envFile = await loadEnvFile(root);
  for (const [key, value] of Object.entries(envFile)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  const paths = loadDigPaths(root);
  const evalCfg = ((paths.llm as { qualityEval?: EvalPathsConfig }).qualityEval ?? {}) as EvalPathsConfig;
  const scenarioId = process.env.DIG_EVAL_SCENARIO ?? evalCfg.scenarioDefault ?? "marketing-hero";
  const scenariosDir = resolve(root, evalCfg.scenariosDir ?? "fixtures/eval");
  const scenarioDir = resolve(scenariosDir, scenarioId);
  const reportDir = resolve(root, evalCfg.reportDir ?? "tmp/llm-quality-eval");
  const trackFilter = ((process.env.DIG_EVAL_TRACKS ?? "both").toLowerCase() as "text" | "vision" | "both");

  const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.DIG_LLM_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY (or DIG_LLM_API_KEY) in env/.env");
  }

  const scenario = await loadEvalScenario(scenarioDir);
  const screenshotPath = await ensureScreenshot(scenarioDir, scenario);
  const evidence = buildEvidenceFromScenario(scenario);
  const models = resolveModels(paths, trackFilter);
  const openrouter = paths.llm.openrouter;

  await mkdir(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const summaryRows: Array<Record<string, unknown>> = [];

  console.log(`Scenario: ${scenario.id} (${scenario.title})`);
  console.log(`Screenshot: ${screenshotPath}`);
  console.log(`Models: ${models.map((m) => m.id).join(", ")}`);
  console.log(`Tracks: ${trackFilter}`);

  for (const model of models) {
    const textModel = model.text_model ?? model.id;
    const visionModel = model.vision_model ?? model.id;
    const config: LlmProviderConfig = {
      enabled: true,
      provider: "openrouter",
      baseUrl: openrouter?.baseUrl ?? "https://openrouter.ai/api/v1",
      model: textModel,
      visionModel,
      apiKey,
      timeoutMs: Number(process.env.DIG_LLM_TIMEOUT_MS ?? String(paths.llm.timeoutMs)),
      stagedAnalysis: true,
      stageMaxTokens: Number(process.env.DIG_LLM_STAGE_MAX_TOKENS ?? String(paths.llm.stageMaxTokens ?? 700)),
      // Structured DIG JSON: disable thinking so Qwen etc. don't burn max_tokens on reasoning.
      reasoningEffort: ((process.env.DIG_LLM_REASONING_EFFORT ?? "none").toLowerCase() as LlmProviderConfig["reasoningEffort"]),
      headers: {
        ...(openrouter?.httpReferer ? { "HTTP-Referer": openrouter.httpReferer } : {}),
        ...(openrouter?.appTitle ? { "X-Title": openrouter.appTitle } : {})
      }
    };
    const provider = new OpenAiCompatibleLlmProvider(config);
    const cards = [];
    let notes: string[] = [];
    let textResult: TextTrackResult | null = null;
    let visionResult: VisionTrackResult | null = null;

    if (model.tracks.includes("text")) {
      console.log(`\n[${model.label}] text track → ${textModel}`);
      const analysis = await analyzeDesignWithLlm(evidence, { config, provider });
      textResult = toTextTrackResult(analysis);
      cards.push(scoreTextTrack(textResult, scenario.golden));
      if (analysis.error) notes.push(`text:${analysis.error}`);
      if (analysis.status !== "complete") notes.push(`text_status=${analysis.status}`);
    }

    if (model.tracks.includes("vision")) {
      console.log(`[${model.label}] vision track → ${visionModel}`);
      visionResult = await runVisionTrack(config, visionModel, screenshotPath, 500);
      cards.push(scoreVisionTrack(visionResult, scenario.golden));
      if (visionResult.error) notes.push(`vision:${visionResult.error}`);
      if (visionResult.status !== "complete") notes.push(`vision_status=${visionResult.status}`);
    } else {
      cards.push(
        scoreVisionTrack({ status: "skipped", error: "model roster marks text-only" }, scenario.golden)
      );
    }

    const combined = combineScorecards(cards);
    const row = {
      id: model.id,
      label: model.label,
      text_model: model.tracks.includes("text") ? textModel : null,
      vision_model: model.tracks.includes("vision") ? visionModel : null,
      ...combined,
      notes: notes.join("; "),
      text: textResult,
      vision: visionResult,
      scorecards: cards
    };
    summaryRows.push(row);
    console.log(
      `  → overall ${combined.overall_percent}% (text ${combined.text_percent ?? "—"} / vision ${combined.vision_percent ?? "—"})`
    );

    await writeFile(
      resolve(reportDir, `${stamp}__${model.id.replace(/[/:]/g, "_")}.json`),
      `${JSON.stringify(row, null, 2)}\n`,
      "utf8"
    );

    const gapMs = Number(process.env.DIG_EVAL_MODEL_GAP_MS ?? "2500");
    if (gapMs > 0) await sleep(gapMs);
  }

  const summary = {
    generated_at: new Date().toISOString(),
    scenario: scenario.id,
    track_filter: trackFilter,
    models: summaryRows.map((row) => ({
      id: row.id,
      label: row.label,
      overall_percent: row.overall_percent,
      text_percent: row.text_percent,
      vision_percent: row.vision_percent,
      notes: row.notes
    })),
    details: summaryRows
  };
  const summaryPath = resolve(reportDir, `${stamp}__summary.json`);
  const mdPath = resolve(reportDir, `${stamp}__summary.md`);
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(mdPath, markdownReport(summary.models as Array<Record<string, unknown>>), "utf8");
  console.log(`\nWrote ${summaryPath}`);
  console.log(`Wrote ${mdPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
