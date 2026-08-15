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
import type { ViewportOntology } from "./ontology.js";
import type { ArtifactReference, CaptureManifest } from "./types.js";
import type { SectionComposition, SectionCompositionCluster } from "./section-composition.js";
import type { VisualHypothesis, VisualLanguageViewport } from "./visual-language.js";

export async function applyLlmDesignAnalysis(
  packageRoot: string,
  options: {
    config?: LlmProviderConfig;
    provider?: LlmCompleter;
    stageCache?: LlmStageCache;
  } = {}
): Promise<{ llm: LlmDesignAnalysis; analysis: AnalysisReport; updated: boolean }> {
  const config = options.config ?? localLlmConfig();
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

  const llm = await analyzeDesignWithLlm(
    {
      canonical_url: manifest.canonical_url,
      ...(manifest.viewport_captures[0]?.title ? { title: manifest.viewport_captures[0].title } : {}),
      ontologies: ontologyDoc.viewports ?? [],
      visual_language: visualDoc.viewports ?? [],
      visual_hypotheses: visualDoc.hypotheses ?? [],
      logical_element_count: logicalDoc.logical_element_count ?? logicalDoc.logical_elements?.length ?? 0,
      transformation_count: responsiveDoc.transformations?.length ?? 0,
      section_compositions: sectionCompositions,
      section_clusters: sectionClusters
    },
    options
  );

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
