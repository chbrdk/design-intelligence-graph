import type { ViewportGeometryLayout } from "./geometry-model.js";
import type { LogicalElement } from "./matching.js";
import type { ViewportOntology } from "./ontology.js";
import type { QualityEvaluation } from "./quality.js";
import type { ResponsiveTransformation } from "./responsive.js";
import type { VisualHypothesis, VisualLanguageViewport } from "./visual-language.js";

export const ANALYSIS_PIPELINE_VERSION = "0.1.0";

type StageStatus = "complete" | "not_attempted";

export interface AnalysisReport {
  schema_version: string;
  analysis_pipeline_version: string;
  generated_at: string;
  stages: Array<{ stage_id: string; kind: "deterministic" | "vision" | "llm" | "quality"; status: StageStatus; method: string; reason?: string; input_artifacts: string[]; output_record_count: number }>;
  findings: Array<{ finding_id: string; kind: "coverage" | "responsive_complexity" | "visual_consistency"; layer: "L2"; value: number; unit: "ratio" | "count"; confidence: number; method: string; evidence: Record<string, number> }>;
  semantic_inputs: Array<{ source: "ontology" | "visual_language" | "llm"; source_id: string; viewport_capture_id: string; confidence: number; method: string; layer: "L3" }>;
  quality: { overall: number; rating: QualityEvaluation["rating"]; formula_version: string; gate: "pass" | "review" };
  provenance: { method: "deterministic_analysis_orchestration" | "deterministic_plus_llm_analysis"; confidence: 1 };
  llm_design?: {
    model: string;
    design_summary: string;
    hypothesis_count: number;
    analysis_mode?: "staged" | "single_shot";
    screen_pattern_count?: number;
    ui_element_count?: number;
    recipe_insight_count?: number;
  };
}

const round = (value: number) => Number(value.toFixed(4));

export function deriveAnalysisReport(input: {
  logical_elements: LogicalElement[];
  transformations: ResponsiveTransformation[];
  geometry_layouts: ViewportGeometryLayout[];
  ontologies: ViewportOntology[];
  visual_language: VisualLanguageViewport[];
  visual_hypotheses: VisualHypothesis[];
  quality: QualityEvaluation;
}): AnalysisReport {
  const ontologyEntities = input.ontologies.reduce((sum, viewport) => sum + viewport.entities.length, 0);
  const visualViewportIds = new Set(input.visual_language.map((viewport) => viewport.viewport_capture_id));
  const ontologyViewportIds = new Set(input.ontologies.map((viewport) => viewport.viewport_capture_id));
  const viewportCount = new Set([...visualViewportIds, ...ontologyViewportIds]).size;
  const coveredViewports = [...ontologyViewportIds].filter((id) => visualViewportIds.has(id)).length;
  const visualSignatures = new Set(input.visual_language.map((viewport) => JSON.stringify({
    typography: viewport.typography.map((token) => [token.font_family, token.font_size, token.font_weight]),
    colors: viewport.color_palette.map((color) => color.hex),
    shape: viewport.shape.border_radius_values.map((token) => token.value)
  })));
  const semanticInputs = [
    ...input.visual_hypotheses.map((hypothesis) => ({ source: "visual_language" as const, source_id: hypothesis.hypothesis_id, viewport_capture_id: hypothesis.viewport_capture_id, confidence: hypothesis.confidence, method: hypothesis.method, layer: "L3" as const })),
    ...input.ontologies.flatMap((viewport) => viewport.entities.filter((entity) => entity.layer === "L3").map((entity) => ({ source: "ontology" as const, source_id: entity.ontology_entity_id, viewport_capture_id: viewport.viewport_capture_id, confidence: entity.confidence, method: entity.method, layer: "L3" as const })))
  ].sort((a, b) => a.source.localeCompare(b.source) || a.source_id.localeCompare(b.source_id));
  return {
    schema_version: "0.1.0", analysis_pipeline_version: ANALYSIS_PIPELINE_VERSION, generated_at: new Date().toISOString(),
    stages: [
      { stage_id: "deterministic_derivation", kind: "deterministic", status: "complete", method: "cross_artifact_aggregation", input_artifacts: ["derived/ontology.json", "derived/geometry-layout.json", "derived/visual-language.json", "derived/responsive-transformations.json"], output_record_count: ontologyEntities + input.geometry_layouts.length + input.visual_language.length },
      { stage_id: "vision_analysis", kind: "vision", status: "not_attempted", method: "no_vision_provider_configured", reason: "No configured vision model or pixel-analysis policy", input_artifacts: ["screenshots"], output_record_count: 0 },
      { stage_id: "llm_analysis", kind: "llm", status: "not_attempted", method: "no_llm_provider_configured", reason: "No configured LLM model or prompt policy", input_artifacts: ["derived/ontology.json", "derived/geometry-layout.json", "derived/visual-language.json"], output_record_count: 0 },
      { stage_id: "quality_evaluation", kind: "quality", status: "complete", method: "capture_quality_formula", input_artifacts: ["quality.json"], output_record_count: 1 }
    ],
    findings: [
      { finding_id: "afn_viewport_coverage", kind: "coverage", layer: "L2", value: viewportCount ? round(coveredViewports / viewportCount) : 0, unit: "ratio", confidence: 1, method: "ontology_visual_viewport_join", evidence: { covered_viewports: coveredViewports, total_viewports: viewportCount } },
      { finding_id: "afn_responsive_complexity", kind: "responsive_complexity", layer: "L2", value: input.transformations.length, unit: "count", confidence: 1, method: "responsive_transformation_count", evidence: { transformations: input.transformations.length, logical_elements: input.logical_elements.length } },
      { finding_id: "afn_visual_consistency", kind: "visual_consistency", layer: "L2", value: input.visual_language.length ? round(1 / visualSignatures.size) : 0, unit: "ratio", confidence: 1, method: "exact_cross_viewport_token_signature", evidence: { viewports: input.visual_language.length, distinct_signatures: visualSignatures.size } }
    ],
    semantic_inputs: semanticInputs,
    quality: { overall: input.quality.overall, rating: input.quality.rating, formula_version: input.quality.formula_version, gate: input.quality.overall >= 0.8 ? "pass" : "review" },
    provenance: { method: "deterministic_analysis_orchestration", confidence: 1 }
  };
}
