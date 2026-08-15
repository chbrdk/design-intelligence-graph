import { createHash, randomUUID } from "node:crypto";
import { localLlmConfig, createLlmProviderFromConfig, type LlmCompleter, type LlmProviderConfig } from "./llm-provider.js";
import type { AnalysisReport } from "./analysis-pipeline.js";
import type { ViewportOntology } from "./ontology.js";
import type { SectionComposition, SectionCompositionCluster } from "./section-composition.js";
import type { VisualHypothesis, VisualLanguageViewport } from "./visual-language.js";
import {
  buildStageEvidence,
  emptyMobbinParityContent,
  parseRecipeStage,
  parseScreenPatterns,
  parseUiElements,
  parseVisualStyleLabels,
  runLlmStage,
  PARALLEL_TEXT_STAGES,
  CANONICAL_STAGE_ORDER,
  type LlmStageId,
  type LlmStageResult,
  type MobbinParityContent
} from "./llm-stages.js";
import {
  buildSectionLookEvidence,
  parseSectionLookResponse,
  selectSectionsForLook,
  type NodeStyleMap,
  type SectionLookDescription
} from "./section-look.js";
import { createDefaultStageCache, evidenceSha256, type LlmStageCache } from "./llm-stage-cache.js";
import { resolveScalingRoles, shouldEscalateStage } from "./llm-routing.js";
import { aggregateCosts, usageToStageCost, type StageCostRecord } from "./llm-cost.js";
import type { LlmTokenUsage } from "./llm-provider.js";

export const LLM_DESIGN_VERSION = "0.2.0";

export interface LlmDesignHypothesis {
  hypothesis_id: string;
  category:
    | "page_archetype"
    | "layout_system"
    | "visual_style"
    | "hierarchy"
    | "component_pattern"
    | "responsive_strategy";
  value: string;
  confidence: number;
  rationale: string;
  evidence_refs: string[];
  layer: "L3";
  method: "gemma_design_analysis";
}

export interface LlmDesignAnalysis {
  schema_version: "0.1.0";
  llm_design_version: typeof LLM_DESIGN_VERSION;
  generated_at: string;
  model: string;
  base_url: string;
  status: "complete" | "failed" | "skipped";
  design_summary: string;
  hypotheses: LlmDesignHypothesis[];
  raw_response_sha256?: string;
  error?: string;
  analysis_mode?: "staged" | "single_shot";
  stages?: LlmStageResult[];
  mobbin?: MobbinParityContent;
  vision?: import("./llm-vision.js").LlmVisionResult;
  cost?: import("./llm-cost.js").LlmCostSummary;
}

export interface DesignEvidenceInput {
  canonical_url: string;
  title?: string;
  ontologies: ViewportOntology[];
  visual_language: VisualLanguageViewport[];
  visual_hypotheses: VisualHypothesis[];
  logical_element_count: number;
  transformation_count: number;
  section_compositions?: SectionComposition[];
  section_clusters?: SectionCompositionCluster[];
  /** Computed styles keyed by node_id for section_look evidence. */
  node_styles?: NodeStyleMap;
}

const SYSTEM_PROMPT = `You are DIG design analyst. Given measured web-design evidence, infer concise design understanding.
Return ONLY valid JSON matching:
{
  "design_summary": string,
  "hypotheses": [
    {
      "category": "page_archetype"|"layout_system"|"visual_style"|"hierarchy"|"component_pattern"|"responsive_strategy",
      "value": string,
      "confidence": number,
      "rationale": string,
      "evidence_refs": string[]
    }
  ]
}
Rules:
- confidence must be in (0,1)
- use only evidence provided; do not invent unseen components
- 3 to 8 hypotheses
- category MUST be exactly one of: page_archetype, layout_system, visual_style, hierarchy, component_pattern, responsive_strategy
- keep value short (design label), rationale one or two sentences
- evidence_refs should cite taxonomy ids, colors, fonts, or counts from the input`;

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

function clampConfidence(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0.55;
  return Math.min(0.95, Math.max(0.05, number));
}

const CATEGORIES = new Set<LlmDesignHypothesis["category"]>([
  "page_archetype",
  "layout_system",
  "visual_style",
  "hierarchy",
  "component_pattern",
  "responsive_strategy"
]);

const CATEGORY_ALIASES: Record<string, LlmDesignHypothesis["category"]> = {
  typography: "visual_style",
  color: "visual_style",
  colour: "visual_style",
  palette: "visual_style",
  style: "visual_style",
  aesthetic: "visual_style",
  mood: "visual_style",
  brand: "visual_style",
  layout: "layout_system",
  grid: "layout_system",
  spacing: "layout_system",
  structure: "hierarchy",
  nav: "component_pattern",
  navigation: "component_pattern",
  hero: "component_pattern",
  card: "component_pattern",
  button: "component_pattern",
  form: "component_pattern",
  page: "page_archetype",
  archetype: "page_archetype",
  responsive: "responsive_strategy",
  breakpoint: "responsive_strategy",
  mobile: "responsive_strategy"
};

function normalizeCategory(raw: unknown): LlmDesignHypothesis["category"] | null {
  const value = String(raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (CATEGORIES.has(value as LlmDesignHypothesis["category"])) {
    return value as LlmDesignHypothesis["category"];
  }
  const aliased = CATEGORY_ALIASES[value];
  if (aliased) return aliased;
  for (const allowed of CATEGORIES) {
    if (value.includes(allowed) || allowed.includes(value)) return allowed;
  }
  return null;
}

export function buildDesignEvidencePrompt(input: DesignEvidenceInput): string {
  const ontologyByTaxonomy = new Map<string, { taxonomy_id: string; label: string; layer: string; max_confidence: number; viewports: string[] }>();
  for (const viewport of input.ontologies) {
    for (const entity of viewport.entities.slice(0, 40)) {
      const existing = ontologyByTaxonomy.get(entity.taxonomy_id);
      if (!existing) {
        ontologyByTaxonomy.set(entity.taxonomy_id, {
          taxonomy_id: entity.taxonomy_id,
          label: entity.label,
          layer: entity.layer,
          max_confidence: entity.confidence,
          viewports: [viewport.viewport_name]
        });
        continue;
      }
      existing.max_confidence = Math.max(existing.max_confidence, entity.confidence);
      if (!existing.viewports.includes(viewport.viewport_name)) existing.viewports.push(viewport.viewport_name);
    }
  }
  const ontologySummary = [...ontologyByTaxonomy.values()]
    .sort((a, b) => b.max_confidence - a.max_confidence)
    .slice(0, 36)
    .map((entity) => ({
      taxonomy_id: entity.taxonomy_id,
      label: entity.label,
      layer: entity.layer,
      confidence: Number(entity.max_confidence.toFixed(3)),
      viewports: entity.viewports
    }));

  const visualSummary = input.visual_language.slice(0, 3).map((viewport) => ({
    viewport_capture_id: viewport.viewport_capture_id,
    typography: viewport.typography.slice(0, 6).map((token) => ({
      font_family: token.font_family,
      font_size: token.font_size,
      font_weight: token.font_weight,
      line_height: token.line_height,
      letter_spacing: token.letter_spacing,
      occurrences: token.occurrences
    })),
    colors: viewport.color_palette.slice(0, 8).map((color) => ({
      hex: color.hex,
      roles: color.roles,
      occurrences: color.occurrences
    })),
    shape: {
      border_radius_values: viewport.shape.border_radius_values.slice(0, 8),
      shadow_values: viewport.shape.shadow_values.slice(0, 6),
      border_width_values: viewport.shape.border_width_values.slice(0, 6)
    },
    hypotheses: input.visual_hypotheses
      .filter((hypothesis) => hypothesis.viewport_capture_id === viewport.viewport_capture_id)
      .slice(0, 6)
      .map((hypothesis) => ({
        category: hypothesis.category,
        value: hypothesis.value,
        confidence: hypothesis.confidence
      }))
  }));

  const sectionSummary = (input.section_compositions ?? [])
    .slice()
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 12)
    .map((section) => ({
      viewport: section.viewport_name,
      category: section.category,
      taxonomy_id: section.taxonomy_id,
      signature: section.signature,
      gaps: section.recipe
        .filter((step): step is { kind: "gap"; gap_px: number } => step.kind === "gap")
        .map((step) => step.gap_px),
      text_signals: section.text_signals.slice(0, 4),
      confidence: Number(section.confidence.toFixed(3))
    }));

  const clusterSummary = (input.section_clusters ?? []).slice(0, 8).map((cluster) => ({
    signature: cluster.signature,
    category: cluster.category,
    taxonomy_id: cluster.taxonomy_id,
    count: cluster.count,
    viewports: cluster.viewport_names,
    text_signals: cluster.example_text_signals.slice(0, 3)
  }));

  // Compact JSON keeps local Gemma prefills under context/time limits on large sites.
  return JSON.stringify({
    url: input.canonical_url,
    title: input.title ?? null,
    logical_element_count: input.logical_element_count,
    responsive_transformation_count: input.transformation_count,
    ontology: ontologySummary,
    visual_language: visualSummary,
    section_compositions: sectionSummary,
    recurring_section_recipes: clusterSummary
  });
}

export function parseLlmDesignResponse(raw: string, model: string, baseUrl: string): LlmDesignAnalysis {
  const parsed = extractJsonObject(raw) as {
    design_summary?: unknown;
    hypotheses?: Array<Record<string, unknown>>;
  };
  if (typeof parsed.design_summary !== "string" || !parsed.design_summary.trim()) {
    throw new Error("LLM design_summary missing");
  }
  if (!Array.isArray(parsed.hypotheses) || parsed.hypotheses.length < 1) {
    throw new Error("LLM hypotheses missing");
  }
  const hypotheses: LlmDesignHypothesis[] = [];
  for (const [index, item] of parsed.hypotheses.slice(0, 12).entries()) {
    const category = normalizeCategory(item.category);
    if (!category) continue;
    const value = String(item.value ?? "").trim();
    if (!value) continue;
    const rationale = String(item.rationale ?? "").trim() || "No rationale provided";
    const evidence_refs = Array.isArray(item.evidence_refs)
      ? item.evidence_refs.map((ref) => String(ref)).filter(Boolean).slice(0, 12)
      : [];
    hypotheses.push({
      hypothesis_id: `ldh_${createHash("sha256").update(`${category}|${value}|${index}`).digest("hex").slice(0, 20)}`,
      category,
      value,
      confidence: clampConfidence(item.confidence),
      rationale,
      evidence_refs,
      layer: "L3",
      method: "gemma_design_analysis"
    });
    if (hypotheses.length >= 8) break;
  }
  if (hypotheses.length < 1) throw new Error("No valid LLM hypotheses after category normalization");
  return {
    schema_version: "0.1.0",
    llm_design_version: LLM_DESIGN_VERSION,
    generated_at: new Date().toISOString(),
    model,
    base_url: baseUrl,
    status: "complete",
    design_summary: parsed.design_summary.trim(),
    hypotheses,
    raw_response_sha256: `sha256:${createHash("sha256").update(raw).digest("hex")}`
  };
}

export async function analyzeDesignWithLlm(
  input: DesignEvidenceInput,
  options: {
    config?: LlmProviderConfig;
    provider?: LlmCompleter;
    stageCache?: LlmStageCache;
  } = {}
): Promise<LlmDesignAnalysis> {
  const config = options.config ?? localLlmConfig();
  if (!config.enabled) {
    return {
      schema_version: "0.1.0",
      llm_design_version: LLM_DESIGN_VERSION,
      generated_at: new Date().toISOString(),
      model: config.model,
      base_url: config.baseUrl,
      status: "skipped",
      design_summary: "",
      hypotheses: [],
      error: "LLM disabled",
      analysis_mode: config.stagedAnalysis === false ? "single_shot" : "staged",
      mobbin: emptyMobbinParityContent()
    };
  }
  const provider = options.provider ?? createLlmProviderFromConfig(config);
  if (config.stagedAnalysis === false) {
    try {
      const completion = await provider.complete([
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analyze this DIG capture evidence and return JSON only.\n\n${buildDesignEvidencePrompt(input)}`
        }
      ], { maxTokens: 1200 });
      const parsed = parseLlmDesignResponse(completion.content, completion.model, config.baseUrl);
      return { ...parsed, analysis_mode: "single_shot", mobbin: emptyMobbinParityContent() };
    } catch (error: unknown) {
      return {
        schema_version: "0.1.0",
        llm_design_version: LLM_DESIGN_VERSION,
        generated_at: new Date().toISOString(),
        model: config.model,
        base_url: config.baseUrl,
        status: "failed",
        design_summary: "",
        hypotheses: [],
        error: error instanceof Error ? error.message : String(error),
        analysis_mode: "single_shot",
        mobbin: emptyMobbinParityContent()
      };
    }
  }

  return analyzeDesignWithLlmStaged(input, provider, config, options.stageCache ?? createDefaultStageCache());
}

async function runStageWithCacheAndRouting(
  provider: LlmCompleter,
  stageId: LlmStageId,
  evidence: string,
  maxTokens: number,
  cache: LlmStageCache,
  bulkModel: string,
  qualityModel: string | null,
  threshold: number,
  reasoningEffort: LlmProviderConfig["reasoningEffort"]
): Promise<{
  raw: string;
  model: string;
  escalated: boolean;
  cacheHit: boolean;
  cost: StageCostRecord;
}> {
  const evidenceHash = evidenceSha256(evidence);

  const tryModel = async (
    model: string
  ): Promise<{ raw: string; model: string; cacheHit: boolean; usage?: LlmTokenUsage }> => {
    const cached = await cache.get(stageId, model, evidenceHash);
    if (cached?.raw_response) {
      return { raw: cached.raw_response, model, cacheHit: true };
    }
    const result = await runLlmStage(provider, stageId, evidence, maxTokens, {
      model,
      ...(reasoningEffort ? { reasoningEffort } : {})
    });
    await cache.set({
      stage_id: stageId,
      model,
      evidence_sha256: evidenceHash,
      raw_response: result.raw,
      status: "complete"
    });
    return { raw: result.raw, model: result.model, cacheHit: false, ...(result.usage ? { usage: result.usage } : {}) };
  };

  const bulk = await tryModel(bulkModel);
  let parseOk = true;
  let itemCount = 0;
  let confidences: number[] = [];
  try {
    if (stageId === "screen_patterns") {
      const items = parseScreenPatterns(bulk.raw);
      itemCount = items.length;
      confidences = items.map((item) => item.confidence);
    } else if (stageId === "ui_elements") {
      const items = parseUiElements(bulk.raw);
      itemCount = items.length;
      confidences = items.map((item) => item.confidence);
    } else if (stageId === "section_recipes") {
      const parsed = parseRecipeStage(bulk.raw);
      itemCount = parsed.recipe_insights.length + parsed.page_flow.length;
      confidences = parsed.recipe_insights.map(() => 0.7);
    } else if (stageId === "visual_style") {
      const items = parseVisualStyleLabels(bulk.raw);
      itemCount = items.length;
      confidences = items.map((item) => item.confidence);
    } else if (stageId === "section_look") {
      const parsed = parseSectionLookResponse(bulk.raw, { section_id: "unknown", signature: "unknown" });
      itemCount = parsed ? 1 : 0;
      confidences = parsed ? [parsed.confidence] : [];
      parseOk = Boolean(parsed);
    } else if (stageId === "synthesize") {
      const synthesized = parseLlmDesignResponse(bulk.raw, bulk.model, "");
      itemCount = synthesized.hypotheses.length;
      confidences = synthesized.hypotheses.map((item) => item.confidence);
      parseOk = synthesized.status === "complete";
    }
  } catch {
    parseOk = false;
  }

  const escalate =
    Boolean(qualityModel) && shouldEscalateStage({ parseOk, itemCount, confidences, threshold });
  if (!escalate || !qualityModel) {
    return {
      ...bulk,
      escalated: false,
      cost: usageToStageCost(stageId, bulk.model, bulk.usage, bulk.cacheHit)
    };
  }
  const quality = await tryModel(qualityModel);
  return {
    ...quality,
    escalated: true,
    cost: usageToStageCost(stageId, quality.model, quality.usage, quality.cacheHit)
  };
}

function applyParsedStage(
  stageId: LlmStageId,
  raw: string,
  model: string,
  escalated: boolean,
  cacheHit: boolean,
  cost: StageCostRecord,
  configBaseUrl: string
): {
  stage: LlmStageResult;
  synthesized?: LlmDesignAnalysis;
  patch: Partial<MobbinParityContent>;
} {
  const raw_sha256 = `sha256:${createHash("sha256").update(raw).digest("hex")}`;
  const costData = {
    escalated,
    cache_hit: cacheHit,
    prompt_tokens: cost.prompt_tokens,
    completion_tokens: cost.completion_tokens,
    estimated_usd: cost.estimated_usd
  };
  if (stageId === "screen_patterns") {
    const screen_patterns = parseScreenPatterns(raw);
    return {
      stage: { stage_id: stageId, status: "complete", raw_sha256, data: { count: screen_patterns.length, ...costData } },
      patch: { screen_patterns }
    };
  }
  if (stageId === "ui_elements") {
    const ui_elements = parseUiElements(raw);
    return {
      stage: { stage_id: stageId, status: "complete", raw_sha256, data: { count: ui_elements.length, ...costData } },
      patch: { ui_elements }
    };
  }
  if (stageId === "section_recipes") {
    const parsed = parseRecipeStage(raw);
    return {
      stage: {
        stage_id: stageId,
        status: "complete",
        raw_sha256,
        data: { insights: parsed.recipe_insights.length, flow_steps: parsed.page_flow.length, ...costData }
      },
      patch: { recipe_insights: parsed.recipe_insights, page_flow: parsed.page_flow }
    };
  }
  if (stageId === "visual_style") {
    const visual_style_labels = parseVisualStyleLabels(raw);
    return {
      stage: {
        stage_id: stageId,
        status: "complete",
        raw_sha256,
        data: { count: visual_style_labels.length, ...costData }
      },
      patch: { visual_style_labels }
    };
  }
  if (stageId === "section_look") {
    const description = parseSectionLookResponse(raw, { section_id: "unknown", signature: "unknown" });
    return {
      stage: {
        stage_id: stageId,
        status: description ? "complete" : "failed",
        raw_sha256,
        data: { count: description ? 1 : 0, ...costData },
        ...(description ? {} : { error: "section_look_parse_failed" })
      },
      patch: description ? { section_descriptions: [description] } : {}
    };
  }
  const synthesized = parseLlmDesignResponse(raw, model, configBaseUrl);
  return {
    stage: {
      stage_id: stageId,
      status: "complete",
      raw_sha256,
      data: { hypotheses: synthesized.hypotheses.length, ...costData }
    },
    synthesized,
    patch: {}
  };
}

async function analyzeDesignWithLlmStaged(
  input: DesignEvidenceInput,
  provider: LlmCompleter,
  config: LlmProviderConfig,
  stageCache: LlmStageCache
): Promise<LlmDesignAnalysis> {
  const maxTokens = config.stageMaxTokens ?? 700;
  const roles = resolveScalingRoles();
  const bulkModel = config.model || roles.bulkText;
  const qualityModel = roles.qualityText;
  const reasoningEffort = config.reasoningEffort ?? roles.bulkReasoningEffort;
  const stages: LlmStageResult[] = [];
  const costRecords: StageCostRecord[] = [];
  const mobbin = emptyMobbinParityContent();
  let model = bulkModel;
  const rawChunks: string[] = [];

  const runOne = async (stageId: LlmStageId, evidence: string) => {
    try {
      const result = await runStageWithCacheAndRouting(
        provider,
        stageId,
        evidence,
        maxTokens,
        stageCache,
        bulkModel,
        qualityModel,
        roles.confidenceEscalateBelow,
        reasoningEffort
      );
      model = result.model;
      rawChunks.push(`${stageId}:${result.raw}`);
      costRecords.push(result.cost);
      return applyParsedStage(
        stageId,
        result.raw,
        result.model,
        result.escalated,
        result.cacheHit,
        result.cost,
        config.baseUrl
      );
    } catch (error: unknown) {
      return {
        stage: {
          stage_id: stageId,
          status: "failed" as const,
          error: error instanceof Error ? error.message : String(error)
        },
        patch: {} as Partial<MobbinParityContent>
      };
    }
  };

  const parallelResults = await Promise.all(
    PARALLEL_TEXT_STAGES.map(async (stageId) => {
      const evidence = buildStageEvidence(stageId, input);
      const outcome = await runOne(stageId, evidence);
      return { stageId, outcome };
    })
  );

  for (const stageId of PARALLEL_TEXT_STAGES) {
    const found = parallelResults.find((item) => item.stageId === stageId);
    if (!found) continue;
    stages.push(found.outcome.stage);
    Object.assign(mobbin, found.outcome.patch);
  }

  // Wave B: per-section look & feel (measured recipes + CSS), parallel and budgeted.
  const selectedSections = selectSectionsForLook(input.section_compositions ?? []);
  const nodeStyles = input.node_styles ?? {};
  if (selectedSections.length) {
    const lookResults = await Promise.all(
      selectedSections.map(async (section) => {
        const evidence = buildSectionLookEvidence(section, nodeStyles, {
          url: input.canonical_url,
          title: input.title ?? null,
          page_style_labels: mobbin.visual_style_labels.map((label) => label.name)
        });
        try {
          const result = await runStageWithCacheAndRouting(
            provider,
            "section_look",
            evidence,
            maxTokens,
            stageCache,
            bulkModel,
            qualityModel,
            roles.confidenceEscalateBelow,
            reasoningEffort
          );
          model = result.model;
          rawChunks.push(`section_look:${section.section_id}:${result.raw}`);
          costRecords.push(result.cost);
          const description = parseSectionLookResponse(result.raw, {
            section_id: section.section_id,
            signature: section.signature,
            category: section.category
          });
          return {
            stage: {
              stage_id: "section_look" as const,
              status: description ? ("complete" as const) : ("failed" as const),
              raw_sha256: `sha256:${createHash("sha256").update(result.raw).digest("hex")}`,
              data: {
                section_id: section.section_id,
                escalated: result.escalated,
                cache_hit: result.cacheHit,
                prompt_tokens: result.cost.prompt_tokens,
                completion_tokens: result.cost.completion_tokens,
                estimated_usd: result.cost.estimated_usd
              },
              ...(description ? {} : { error: "section_look_parse_failed" })
            },
            description
          };
        } catch (error: unknown) {
          return {
            stage: {
              stage_id: "section_look" as const,
              status: "failed" as const,
              error: error instanceof Error ? error.message : String(error),
              data: { section_id: section.section_id }
            },
            description: null as SectionLookDescription | null
          };
        }
      })
    );
    const descriptions = lookResults
      .map((item) => item.description)
      .filter((item): item is SectionLookDescription => Boolean(item));
    mobbin.section_descriptions = descriptions;
    stages.push({
      stage_id: "section_look",
      status: descriptions.length ? "complete" : "failed",
      data: {
        count: descriptions.length,
        attempted: selectedSections.length,
        failed: lookResults.filter((item) => !item.description).length
      },
      ...(descriptions.length ? {} : { error: lookResults.map((item) => item.stage.error).filter(Boolean).join("; ") })
    });
  }

  const synthesizeEvidence = JSON.stringify({
    url: input.canonical_url,
    title: input.title ?? null,
    prior_stages: {
      screen_patterns: mobbin.screen_patterns,
      ui_elements: mobbin.ui_elements,
      recipe_insights: mobbin.recipe_insights,
      page_flow: mobbin.page_flow,
      visual_style_labels: mobbin.visual_style_labels,
      section_descriptions: mobbin.section_descriptions.map((item) => ({
        section_id: item.section_id,
        category: item.category,
        signature: item.signature,
        stack_summary: item.stack_summary,
        look_summary: item.look_summary,
        interaction_summary: item.interaction_summary,
        confidence: item.confidence
      }))
    }
  });
  const synthesizeOutcome = await runOne("synthesize", synthesizeEvidence);
  stages.push(synthesizeOutcome.stage);

  const orderedStages = [...stages].sort(
    (a, b) => CANONICAL_STAGE_ORDER.indexOf(a.stage_id) - CANONICAL_STAGE_ORDER.indexOf(b.stage_id)
  );
  const cost = aggregateCosts(costRecords);

  if (synthesizeOutcome.synthesized) {
    const completedStages = orderedStages.filter((stage) => stage.status === "complete").length;
    return {
      ...synthesizeOutcome.synthesized,
      model,
      analysis_mode: "staged",
      stages: orderedStages,
      mobbin,
      cost,
      raw_response_sha256: `sha256:${createHash("sha256").update(rawChunks.join("\n")).digest("hex")}`,
      status: completedStages >= 2 ? "complete" : synthesizeOutcome.synthesized.status
    };
  }

  const successful = orderedStages.filter((stage) => stage.status === "complete").length;
  if (successful === 0) {
    return {
      schema_version: "0.1.0",
      llm_design_version: LLM_DESIGN_VERSION,
      generated_at: new Date().toISOString(),
      model,
      base_url: config.baseUrl,
      status: "failed",
      design_summary: "",
      hypotheses: [],
      error: orderedStages.map((stage) => stage.error).filter(Boolean).join("; ") || "All LLM stages failed",
      analysis_mode: "staged",
      stages: orderedStages,
      mobbin,
      cost
    };
  }

  // Soft-complete from partial stages when synthesize failed.
  const summaryParts = [
    mobbin.screen_patterns[0]?.name,
    mobbin.section_descriptions[0]?.look_summary,
    mobbin.recipe_insights[0]?.interpretation,
    mobbin.visual_style_labels[0]?.name
  ].filter(Boolean);
  const hypotheses: LlmDesignHypothesis[] = [];
  for (const pattern of mobbin.screen_patterns.slice(0, 2)) {
    hypotheses.push({
      hypothesis_id: `ldh_${createHash("sha256").update(`page_archetype|${pattern.name}`).digest("hex").slice(0, 20)}`,
      category: "page_archetype",
      value: pattern.name,
      confidence: pattern.confidence,
      rationale: "Derived from staged screen_patterns analysis",
      evidence_refs: pattern.evidence_refs,
      layer: "L3",
      method: "gemma_design_analysis"
    });
  }
  for (const label of mobbin.visual_style_labels.slice(0, 2)) {
    hypotheses.push({
      hypothesis_id: `ldh_${createHash("sha256").update(`visual_style|${label.name}`).digest("hex").slice(0, 20)}`,
      category: "visual_style",
      value: label.name,
      confidence: label.confidence,
      rationale: "Derived from staged visual_style analysis",
      evidence_refs: label.evidence_refs,
      layer: "L3",
      method: "gemma_design_analysis"
    });
  }
  for (const insight of mobbin.recipe_insights.slice(0, 2)) {
    hypotheses.push({
      hypothesis_id: `ldh_${createHash("sha256").update(`component_pattern|${insight.signature}`).digest("hex").slice(0, 20)}`,
      category: "component_pattern",
      value: insight.signature,
      confidence: 0.7,
      rationale: insight.interpretation,
      evidence_refs: insight.evidence_refs,
      layer: "L3",
      method: "gemma_design_analysis"
    });
  }

  if (hypotheses.length < 1) {
    return {
      schema_version: "0.1.0",
      llm_design_version: LLM_DESIGN_VERSION,
      generated_at: new Date().toISOString(),
      model,
      base_url: config.baseUrl,
      status: "failed",
      design_summary: "",
      hypotheses: [],
      error: "Staged LLM produced no usable hypotheses",
      analysis_mode: "staged",
      stages: orderedStages,
      mobbin,
      cost
    };
  }

  return {
    schema_version: "0.1.0",
    llm_design_version: LLM_DESIGN_VERSION,
    generated_at: new Date().toISOString(),
    model,
    base_url: config.baseUrl,
    status: "complete",
    design_summary: summaryParts.join(" — ") || "Staged design analysis complete",
    hypotheses: hypotheses.slice(0, 8),
    raw_response_sha256: `sha256:${createHash("sha256").update(rawChunks.join("\n")).digest("hex")}`,
    analysis_mode: "staged",
    stages: orderedStages,
    mobbin,
    cost
  };
}

export function mergeLlmIntoAnalysisReport(
  report: AnalysisReport,
  llm: LlmDesignAnalysis,
  viewportCaptureId?: string
): AnalysisReport {
  const stages = report.stages.map((stage) => {
    if (stage.stage_id !== "llm_analysis") return stage;
    if (llm.status === "complete") {
      const { reason: _ignored, ...rest } = stage;
      return {
        ...rest,
        status: "complete" as const,
        method: llm.analysis_mode === "staged" ? "gemma_staged_design_analysis" : "gemma_design_analysis",
        output_record_count: llm.hypotheses.length + (llm.mobbin?.recipe_insights.length ?? 0)
      };
    }
    if (llm.status === "failed") {
      return {
        ...stage,
        status: "not_attempted" as const,
        method: "llm_provider_error",
        reason: llm.error ?? "LLM analysis failed",
        output_record_count: 0
      };
    }
    return stage;
  });
  const fallbackViewport =
    viewportCaptureId ??
    report.semantic_inputs.find((item) => item.viewport_capture_id)?.viewport_capture_id ??
    "";
  const semantic_inputs = [
    ...report.semantic_inputs,
    ...llm.hypotheses.map((hypothesis) => ({
      source: "llm" as const,
      source_id: hypothesis.hypothesis_id,
      viewport_capture_id: fallbackViewport || "unscoped",
      confidence: hypothesis.confidence,
      method: hypothesis.method,
      layer: "L3" as const
    }))
  ];
  const next: AnalysisReport = {
    ...report,
    stages,
    semantic_inputs,
    provenance: {
      method: llm.status === "complete" ? "deterministic_plus_llm_analysis" : report.provenance.method,
      confidence: 1
    }
  };
  if (llm.status === "complete") {
    next.llm_design = {
      model: llm.model,
      design_summary: llm.design_summary,
      hypothesis_count: llm.hypotheses.length,
      ...(llm.analysis_mode ? { analysis_mode: llm.analysis_mode } : {}),
      ...(llm.mobbin
        ? {
          screen_pattern_count: llm.mobbin.screen_patterns.length,
          ui_element_count: llm.mobbin.ui_elements.length,
          recipe_insight_count: llm.mobbin.recipe_insights.length,
          section_look_count: llm.mobbin.section_descriptions.length
        }
        : {})
    };
  }
  return next;
}

export function createSkippedLlmDesign(config = localLlmConfig()): LlmDesignAnalysis {
  return {
    schema_version: "0.1.0",
    llm_design_version: LLM_DESIGN_VERSION,
    generated_at: new Date().toISOString(),
    model: config.model,
    base_url: config.baseUrl,
    status: "skipped",
    design_summary: "",
    hypotheses: [],
    error: "LLM disabled",
    analysis_mode: config.stagedAnalysis === false ? "single_shot" : "staged",
    mobbin: emptyMobbinParityContent()
  };
}

export function newHypothesisId(seed = randomUUID()): string {
  return `ldh_${createHash("sha256").update(seed).digest("hex").slice(0, 20)}`;
}
