/**
 * Graphic / campaign artboard LLM enrichment.
 * Vision-only (no page_rhythm / section bands / DOM web stages).
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  asCompositionContract,
  loadCompositionContract,
  writeCompositionContract,
  type CompositionContract
} from "./composition-contract.js";
import { isGraphicIngestPackage } from "./graphic-package.js";
import { writeArtifact } from "./io.js";
import { aggregateCosts } from "./llm-cost.js";
import { LLM_DESIGN_VERSION, type LlmDesignAnalysis } from "./llm-design.js";
import { localLlmConfig, type LlmCompleter, type LlmProviderConfig } from "./llm-provider.js";
import { createDefaultStageCache, type LlmStageCache } from "./llm-stage-cache.js";
import { runVisionPageAnalysis } from "./llm-vision.js";
import type { CaptureManifest } from "./types.js";
import { designSummaryFromVisionPage, type VisionPageDocument } from "./vision-page.js";

const GRAPHIC_VISION_USER_PROMPT =
  "Catalog this single graphic / campaign artboard (print ad, key visual, or social post) in rich visual detail. Treat it as one artboard — not a scrollable web page. Return JSON only.";

export function refineCompositionFromVision(
  base: CompositionContract,
  page: VisionPageDocument
): CompositionContract {
  const avoid = [...base.avoid];
  for (const risk of page.ux_risks ?? []) {
    const trimmed = risk.trim();
    if (trimmed && !avoid.includes(trimmed)) avoid.push(trimmed);
  }
  if (page.visual_craft?.chrome_vs_content?.toLowerCase().includes("heavy")) {
    if (!avoid.includes("interface_heavy chrome on artboard")) {
      avoid.push("interface_heavy chrome on artboard");
    }
  }
  const spacing = (page.spacing_feel ?? "").toLowerCase();
  const negativeSpace =
    spacing.includes("airy") || spacing.includes("open")
      ? ("airy" as const)
      : spacing.includes("tight") || spacing.includes("dense")
        ? ("tight" as const)
        : base.negativeSpace;

  const layoutHint = (page.layout_system ?? page.media_strategy ?? "").toLowerCase();
  let layoutFamily = base.layoutFamily;
  if (!layoutFamily || layoutFamily === "centered-lockup") {
    if (layoutHint.includes("split") || layoutHint.includes("two column")) {
      layoutFamily = "split-claim-media";
    } else if (layoutHint.includes("full bleed") || layoutHint.includes("product")) {
      layoutFamily = "full-bleed-product";
    } else if (layoutHint.includes("editorial") || layoutHint.includes("column")) {
      layoutFamily = "editorial-column";
    }
  }

  const focal =
    base.focal ??
    (page.heading?.trim()
      ? "claim"
      : page.layout_order?.[0]?.toLowerCase().includes("product")
        ? "product"
        : base.focal);

  return asCompositionContract({
    ...base,
    focal,
    negativeSpace: negativeSpace ?? base.negativeSpace,
    layoutFamily: layoutFamily ?? base.layoutFamily,
    avoid: avoid.slice(0, 16),
    typeRoles: {
      ...base.typeRoles,
      ...(page.typography_feel ? { display: page.typography_feel.slice(0, 80) } : {})
    }
  })!;
}

export async function applyGraphicLlmEnrichment(
  packageRoot: string,
  options: {
    config?: LlmProviderConfig;
    provider?: LlmCompleter;
    stageCache?: LlmStageCache;
  } = {}
): Promise<{ llm: LlmDesignAnalysis; updated: boolean }> {
  const config = options.config ?? localLlmConfig();
  const stageCache = options.stageCache ?? createDefaultStageCache();
  const manifestPath = resolve(packageRoot, "manifest.json");
  let manifest = JSON.parse(await readFile(manifestPath, "utf8")) as CaptureManifest;

  if (!isGraphicIngestPackage(manifest)) {
    throw new Error("graphic_llm_enrichment_requires_graphic_package");
  }

  if (!config.enabled) {
    const skipped: LlmDesignAnalysis = {
      schema_version: "0.1.0",
      llm_design_version: LLM_DESIGN_VERSION,
      generated_at: new Date().toISOString(),
      model: config.model,
      base_url: config.baseUrl,
      status: "skipped",
      design_summary: "",
      hypotheses: [],
      analysis_mode: "staged",
      stages: [{ stage_id: "graphic_vision", status: "skipped", error: "LLM disabled" }]
    };
    return { llm: skipped, updated: false };
  }

  const visionTimeoutMs = Math.max(
    config.timeoutMs,
    Number(process.env.DIG_LLM_VISION_TIMEOUT_MS ?? 300_000)
  );
  const visionPage = await runVisionPageAnalysis(packageRoot, manifest, {
    config: { ...config, timeoutMs: visionTimeoutMs },
    ...(options.provider ? { provider: options.provider } : {}),
    stageCache,
    persist: true,
    userPrompt: GRAPHIC_VISION_USER_PROMPT
  });

  const stages = [
    {
      stage_id: "graphic_vision",
      status: visionPage.status,
      ...(visionPage.raw_sha256 ? { raw_sha256: visionPage.raw_sha256 } : {}),
      ...(visionPage.error ? { error: visionPage.error } : {}),
      data: {
        page_type: visionPage.document?.page_type ?? null,
        category_tags: visionPage.document?.category_tags ?? [],
        pipeline: "graphic"
      }
    }
  ];
  const cost = visionPage.cost ? aggregateCosts([visionPage.cost]) : undefined;

  let design_summary = "";
  if (visionPage.status === "complete" && visionPage.document) {
    design_summary = designSummaryFromVisionPage(visionPage.document, []);
    const existing = (await loadCompositionContract(packageRoot)) ?? asCompositionContract({})!;
    const refined = refineCompositionFromVision(existing, visionPage.document);
    await writeCompositionContract(packageRoot, refined);
  }

  const status: LlmDesignAnalysis["status"] =
    visionPage.status === "complete"
      ? "complete"
      : visionPage.status === "skipped"
        ? "skipped"
        : "failed";

  const llm: LlmDesignAnalysis = {
    schema_version: "0.1.0",
    llm_design_version: LLM_DESIGN_VERSION,
    generated_at: new Date().toISOString(),
    model: visionPage.model ?? config.visionModel ?? config.model,
    base_url: config.baseUrl,
    status,
    design_summary,
    hypotheses: [],
    analysis_mode: "staged",
    stages,
    vision_page: visionPage,
    ...(visionPage.compat ? { vision: visionPage.compat } : {}),
    ...(cost ? { cost } : {}),
    ...(visionPage.error ? { error: visionPage.error } : {})
  };

  if (status !== "complete") {
    return { llm, updated: false };
  }

  const llmArtifact = await writeArtifact(
    packageRoot,
    "derived/llm-design.json",
    JSON.stringify(llm, null, 2),
    "application/json"
  );

  manifest = {
    ...manifest,
    run_artifacts: {
      ...manifest.run_artifacts,
      llm_design: llmArtifact
    },
    completed_at: new Date().toISOString()
  };
  await writeArtifact(packageRoot, "manifest.json", JSON.stringify(manifest, null, 2), "application/json");

  return { llm, updated: true };
}
