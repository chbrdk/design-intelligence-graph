import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AnalysisReport } from "./analysis-pipeline.js";
import { writeArtifact } from "./io.js";
import {
  analyzeDesignWithLlm,
  mergeLlmIntoAnalysisReport,
  type LlmDesignAnalysis
} from "./llm-design.js";
import { localLlmConfig, type LlmCompleter, type LlmProviderConfig } from "./llm-provider.js";
import type { LlmStageCache } from "./llm-stage-cache.js";
import { createDefaultStageCache } from "./llm-stage-cache.js";
import { aggregateCosts } from "./llm-cost.js";
import { runVisionScreenAnalysis } from "./llm-vision.js";
import type { ViewportOntology } from "./ontology.js";
import type { ArtifactReference, CaptureManifest } from "./types.js";
import type { SectionComposition, SectionCompositionCluster } from "./section-composition.js";
import type { NodeStyleMap } from "./section-look.js";
import type { VisualHypothesis, VisualLanguageViewport } from "./visual-language.js";

async function loadNodeStylesFromPackage(
  packageRoot: string,
  manifest: CaptureManifest,
  sections: SectionComposition[]
): Promise<NodeStyleMap> {
  const needed = new Set<string>();
  for (const section of sections) {
    needed.add(section.root_node_id);
    for (const step of section.recipe) {
      if (step.kind === "role") needed.add(step.node_id);
    }
  }
  if (!needed.size) return {};

  const preferredNames = new Set(sections.map((section) => section.viewport_name));
  const viewports = [...manifest.viewport_captures].sort((a, b) => {
    const aScore = preferredNames.has(a.name) ? 1 : 0;
    const bScore = preferredNames.has(b.name) ? 1 : 0;
    if (a.name === "desktop") return -1;
    if (b.name === "desktop") return 1;
    return bScore - aScore;
  });

  const styles: NodeStyleMap = {};
  for (const viewport of viewports) {
    const stylePath =
      viewport.artifacts.computed_styles?.path ?? `viewports/${viewport.name}/styles/computed.jsonl`;
    try {
      const raw = await readFile(resolve(packageRoot, stylePath), "utf8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        const row = JSON.parse(line) as { node_id?: string; properties?: Record<string, string> };
        if (!row.node_id || !needed.has(row.node_id) || !row.properties) continue;
        styles[row.node_id] = row.properties;
      }
    } catch {
      /* viewport may lack styles */
    }
    if (Object.keys(styles).length >= needed.size) break;
  }
  return styles;
}

export async function applyLlmDesignAnalysis(
  packageRoot: string,
  options: {
    config?: LlmProviderConfig;
    provider?: LlmCompleter;
    stageCache?: LlmStageCache;
  } = {}
): Promise<{ llm: LlmDesignAnalysis; analysis: AnalysisReport; updated: boolean }> {
  const config = options.config ?? localLlmConfig();
  const stageCache = options.stageCache ?? createDefaultStageCache();
  const manifestPath = resolve(packageRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as CaptureManifest;
  const analysisPath = resolve(packageRoot, manifest.run_artifacts.analysis?.path ?? "derived/analysis-report.json");
  const ontologyPath = resolve(packageRoot, manifest.run_artifacts.ontology?.path ?? "derived/ontology.json");
  const visualPath = resolve(packageRoot, manifest.run_artifacts.visual_language?.path ?? "derived/visual-language.json");
  const logicalPath = resolve(packageRoot, manifest.run_artifacts.logical_elements?.path ?? "derived/logical-elements.json");
  const responsivePath = resolve(
    packageRoot,
    manifest.run_artifacts.responsive_transformations?.path ?? "derived/responsive-transformations.json"
  );
  const sectionPath = resolve(
    packageRoot,
    manifest.run_artifacts.section_compositions?.path ?? "derived/section-compositions.json"
  );

  const analysis = JSON.parse(await readFile(analysisPath, "utf8")) as AnalysisReport;
  const ontologyDoc = JSON.parse(await readFile(ontologyPath, "utf8")) as { viewports: ViewportOntology[] };
  const visualDoc = JSON.parse(await readFile(visualPath, "utf8")) as {
    viewports: VisualLanguageViewport[];
    hypotheses: VisualHypothesis[];
  };
  const logicalDoc = JSON.parse(await readFile(logicalPath, "utf8")) as { logical_element_count?: number; logical_elements?: unknown[] };
  const responsiveDoc = JSON.parse(await readFile(responsivePath, "utf8")) as { transformations?: unknown[] };
  let sectionCompositions: SectionComposition[] = [];
  let sectionClusters: SectionCompositionCluster[] = [];
  try {
    const sectionDoc = JSON.parse(await readFile(sectionPath, "utf8")) as {
      viewports?: Array<{ sections?: SectionComposition[] }>;
      clusters?: SectionCompositionCluster[];
    };
    sectionCompositions = sectionDoc.viewports?.flatMap((viewport) => viewport.sections ?? []) ?? [];
    sectionClusters = sectionDoc.clusters ?? [];
  } catch {
    /* older packages may lack section compositions */
  }

  const nodeStyles = await loadNodeStylesFromPackage(packageRoot, manifest, sectionCompositions);

  let llm = await analyzeDesignWithLlm(
    {
      canonical_url: manifest.canonical_url,
      ...(manifest.viewport_captures[0]?.title ? { title: manifest.viewport_captures[0].title } : {}),
      ontologies: ontologyDoc.viewports ?? [],
      visual_language: visualDoc.viewports ?? [],
      visual_hypotheses: visualDoc.hypotheses ?? [],
      logical_element_count: logicalDoc.logical_element_count ?? logicalDoc.logical_elements?.length ?? 0,
      transformation_count: responsiveDoc.transformations?.length ?? 0,
      section_compositions: sectionCompositions,
      section_clusters: sectionClusters,
      node_styles: nodeStyles
    },
    { ...options, stageCache }
  );

  const vision = await runVisionScreenAnalysis(packageRoot, manifest, {
    config,
    ...(options.provider ? { provider: options.provider } : {}),
    stageCache
  });
  const stages = [...(llm.stages ?? [])];
  if (vision.status === "complete") {
    stages.push({
      stage_id: "vision_screen",
      status: "complete",
      ...(vision.raw_sha256 ? { raw_sha256: vision.raw_sha256 } : {}),
      data: {
        heading: vision.heading,
        cta: vision.cta,
        layout_order: vision.layout_order,
        ...(vision.cost
          ? {
              prompt_tokens: vision.cost.prompt_tokens,
              completion_tokens: vision.cost.completion_tokens,
              estimated_usd: vision.cost.estimated_usd,
              cache_hit: vision.cost.cache_hit
            }
          : {})
      }
    });
  } else if (vision.status === "failed" || vision.status === "skipped") {
    stages.push({
      stage_id: "vision_screen",
      status: vision.status === "skipped" ? "skipped" : "failed",
      ...(vision.error ? { error: vision.error } : {})
    });
  }
  const cost = vision.cost
    ? aggregateCosts([...(llm.cost?.by_stage ?? []), vision.cost])
    : llm.cost;
  llm = {
    ...llm,
    vision,
    stages,
    ...(cost ? { cost } : {})
  };

  if (llm.status !== "complete") {
    return { llm, analysis, updated: false };
  }

  const merged = mergeLlmIntoAnalysisReport(
    analysis,
    llm,
    ontologyDoc.viewports[0]?.viewport_capture_id ?? manifest.viewport_captures[0]?.viewport_capture_id
  );
  const llmArtifact = await writeArtifact(
    packageRoot,
    "derived/llm-design.json",
    JSON.stringify(llm, null, 2),
    "application/json"
  );
  const analysisArtifact = await writeArtifact(
    packageRoot,
    "derived/analysis-report.json",
    JSON.stringify(merged, null, 2),
    "application/json"
  );

  const runArtifacts: Record<string, ArtifactReference> = {
    ...manifest.run_artifacts,
    analysis: analysisArtifact,
    llm_design: llmArtifact
  };
  const updatedManifest: CaptureManifest = {
    ...manifest,
    run_artifacts: runArtifacts,
    completed_at: new Date().toISOString()
  };
  await writeArtifact(packageRoot, "manifest.json", JSON.stringify(updatedManifest, null, 2), "application/json");
  return { llm, analysis: merged, updated: true };
}
