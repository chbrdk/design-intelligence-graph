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
import {
  designFacetHintsFromGraphicMetrics,
  refineCompositionFromCraftMetrics,
  runGraphicCraftMetricsAnalysis,
  graphicCraftMetricCount
} from "./graphic-craft-metrics.js";

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
      stages: [{ stage_id: "vision_page", status: "skipped", error: "LLM disabled" }]
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

  const stages: LlmDesignAnalysis["stages"] = [
    {
      stage_id: "vision_page",
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
  const costRecords = visionPage.cost ? [visionPage.cost] : [];

  let design_summary = "";
  let composition = (await loadCompositionContract(packageRoot)) ?? asCompositionContract({})!;
  if (visionPage.status === "complete" && visionPage.document) {
    design_summary = designSummaryFromVisionPage(visionPage.document, []);
    composition = refineCompositionFromVision(composition, visionPage.document);
  }

  const craftMetrics = await runGraphicCraftMetricsAnalysis(packageRoot, manifest, {
    config: { ...config, timeoutMs: visionTimeoutMs },
    ...(options.provider ? { provider: options.provider } : {}),
    stageCache,
    persist: true,
    maxTokens: 16_000
  });
  stages.push({
    stage_id: "vision_page",
    status: craftMetrics.status,
    ...(craftMetrics.raw_sha256 ? { raw_sha256: craftMetrics.raw_sha256 } : {}),
    ...(craftMetrics.error ? { error: craftMetrics.error } : {}),
    data: {
      kind: "graphic_craft_metrics",
      metric_count: craftMetrics.document?.metric_count ?? graphicCraftMetricCount(),
      filled_count: craftMetrics.document?.filled_count ?? 0,
      confidence: craftMetrics.document?.confidence ?? null,
      groups: craftMetrics.document?.groups ?? null
    }
  });
  if (craftMetrics.cost) costRecords.push(craftMetrics.cost);

  if (craftMetrics.status === "complete" && craftMetrics.document) {
    composition = refineCompositionFromCraftMetrics(composition, craftMetrics.document.metrics);
    const hints = designFacetHintsFromGraphicMetrics(craftMetrics.document.metrics);
    const claim =
      typeof craftMetrics.document.metrics["prod.primary_claim_guess"] === "string"
        ? String(craftMetrics.document.metrics["prod.primary_claim_guess"])
        : "";
    const metricLine = [
      hints.style ? `style=${hints.style}` : null,
      hints.layout ? `layout=${hints.layout}` : null,
      hints.color_mood ? `mood=${hints.color_mood}` : null,
      `metrics=${craftMetrics.document.filled_count}/${craftMetrics.document.metric_count}`
    ]
      .filter(Boolean)
      .join("; ");
    design_summary = [design_summary, claim ? `Claim guess: ${claim}` : "", metricLine]
      .filter(Boolean)
      .join(" ");
  }

  await writeCompositionContract(packageRoot, composition);
  const cost = costRecords.length ? aggregateCosts(costRecords) : undefined;

  const status: LlmDesignAnalysis["status"] =
    visionPage.status === "complete" || craftMetrics.status === "complete"
      ? "complete"
      : visionPage.status === "skipped" && craftMetrics.status === "skipped"
        ? "skipped"
        : "failed";

  const llm: LlmDesignAnalysis = {
    schema_version: "0.1.0",
    llm_design_version: LLM_DESIGN_VERSION,
    generated_at: new Date().toISOString(),
    model: craftMetrics.model ?? visionPage.model ?? config.visionModel ?? config.model,
    base_url: config.baseUrl,
    status,
    design_summary,
    hypotheses: [],
    analysis_mode: "staged",
    stages,
    vision_page: visionPage,
    ...(visionPage.compat ? { vision: visionPage.compat } : {}),
    ...(cost ? { cost } : {}),
    ...(visionPage.error || craftMetrics.error
      ? { error: [visionPage.error, craftMetrics.error].filter(Boolean).join("; ") }
      : {})
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
