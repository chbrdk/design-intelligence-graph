import type { DesignEvidenceInput } from "./llm-design.js";
import type { LlmCompleter, LlmMessage } from "./llm-provider.js";

export type LlmStageId =
  | "screen_patterns"
  | "ui_elements"
  | "section_recipes"
  | "visual_style"
  | "synthesize";

export interface LlmStageResult {
  stage_id: LlmStageId;
  status: "complete" | "failed" | "skipped";
  raw_sha256?: string;
  error?: string;
  data?: Record<string, unknown>;
}

export interface MobbinParityContent {
  screen_patterns: Array<{ name: string; confidence: number; evidence_refs: string[] }>;
  ui_elements: Array<{ name: string; confidence: number; evidence_refs: string[] }>;
  recipe_insights: Array<{
    signature: string;
    interpretation: string;
    category?: string;
    gaps?: number[];
    evidence_refs: string[];
  }>;
  page_flow: Array<{ step: number; section_label: string; signature?: string }>;
  visual_style_labels: Array<{ name: string; confidence: number; evidence_refs: string[] }>;
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
    // Models (esp. free OpenRouter) often emit trailing commas / soft JSON.
    const repaired = slice
      .replace(/,\s*([\]}])/g, "$1")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");
    return JSON.parse(repaired);
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean).slice(0, 12) : [];
}

function clampConfidence(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0.55;
  return Math.min(0.95, Math.max(0.05, number));
}

/** Slice evidence per stage so each LLM call stays small (Mobbin-oriented). */
export function buildStageEvidence(stageId: LlmStageId, input: DesignEvidenceInput): string {
  if (stageId === "screen_patterns") {
    const ontology = (input.ontologies ?? []).flatMap((viewport) =>
      viewport.entities
        .filter((entity) => entity.entity_type === "page" || entity.taxonomy_id.startsWith("dig:page.") || entity.taxonomy_id.startsWith("dig:region."))
        .slice(0, 12)
        .map((entity) => ({
          viewport: viewport.viewport_name,
          taxonomy_id: entity.taxonomy_id,
          label: entity.label
        }))
    );
    const sections = (input.section_compositions ?? []).slice(0, 8).map((section) => ({
      viewport: section.viewport_name,
      category: section.category,
      taxonomy_id: section.taxonomy_id,
      signature: section.signature
    }));
    return JSON.stringify({
      url: input.canonical_url,
      title: input.title ?? null,
      page_signals: ontology.slice(0, 16),
      section_categories: sections
    });
  }

  if (stageId === "ui_elements") {
    const counts = new Map<string, { taxonomy_id: string; label: string; count: number }>();
    for (const viewport of input.ontologies ?? []) {
      for (const entity of viewport.entities) {
        if (!entity.taxonomy_id.startsWith("dig:component.") && !entity.taxonomy_id.startsWith("dig:pattern.")) continue;
        const existing = counts.get(entity.taxonomy_id) ?? {
          taxonomy_id: entity.taxonomy_id,
          label: entity.label,
          count: 0
        };
        existing.count += 1;
        counts.set(entity.taxonomy_id, existing);
      }
    }
    return JSON.stringify({
      url: input.canonical_url,
      components: [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 24)
    });
  }

  if (stageId === "section_recipes") {
    return JSON.stringify({
      url: input.canonical_url,
      sections: (input.section_compositions ?? []).slice(0, 10).map((section) => ({
        category: section.category,
        taxonomy_id: section.taxonomy_id,
        signature: section.signature,
        gaps: section.recipe
          .filter((step): step is { kind: "gap"; gap_px: number } => step.kind === "gap")
          .map((step) => step.gap_px),
        text_signals: section.text_signals.slice(0, 3)
      })),
      recurring: (input.section_clusters ?? []).slice(0, 6).map((cluster) => ({
        signature: cluster.signature,
        category: cluster.category,
        count: cluster.count
      }))
    });
  }

  if (stageId === "visual_style") {
    const visual = (input.visual_language ?? []).slice(0, 2).map((viewport) => ({
      typography: viewport.typography.slice(0, 4).map((token) => ({
        font_family: token.font_family,
        font_size: token.font_size,
        font_weight: token.font_weight,
        occurrences: token.occurrences
      })),
      colors: viewport.color_palette.slice(0, 6).map((color) => ({
        hex: color.hex,
        roles: color.roles,
        occurrences: color.occurrences
      })),
      shape: {
        border_radius_values: viewport.shape.border_radius_values.slice(0, 5),
        border_width_values: viewport.shape.border_width_values.slice(0, 4)
      }
    }));
    return JSON.stringify({
      url: input.canonical_url,
      visual_language: visual,
      prior_hypotheses: (input.visual_hypotheses ?? []).slice(0, 4).map((hypothesis) => ({
        category: hypothesis.category,
        value: hypothesis.value,
        confidence: hypothesis.confidence
      }))
    });
  }

  // synthesize gets only prior stage outputs — filled by caller
  return JSON.stringify({ url: input.canonical_url, title: input.title ?? null });
}

export function stageSystemPrompt(stageId: LlmStageId): string {
  if (stageId === "screen_patterns") {
    return `You label web/app screen patterns like Mobbin screen filters.
Return ONLY JSON: {"screen_patterns":[{"name":string,"confidence":number,"evidence_refs":string[]}]}
Rules: 1-5 patterns; names short (e.g. "Marketing Home", "Product Showcase"); use only provided evidence.`;
  }
  if (stageId === "ui_elements") {
    return `You list notable UI elements like Mobbin UI element filters.
Return ONLY JSON: {"ui_elements":[{"name":string,"confidence":number,"evidence_refs":string[]}]}
Rules: 3-12 elements; prefer concrete names (Button, Navigation, Card, Media); cite taxonomy ids.`;
  }
  if (stageId === "section_recipes") {
    return `You interpret measured section composition recipes (role chains + gaps).
Return ONLY a single minified JSON object (no markdown, no trailing commas, no comments):
{"recipe_insights":[{"signature":string,"interpretation":string,"category":string,"gaps":number[],"evidence_refs":string[]}],"page_flow":[{"step":number,"section_label":string,"signature":string}]}
Rules: explain stacks like "media then headline then CTA with ~Npx gaps"; 1-8 insights; ordered page_flow; keep interpretations under 160 chars.`;
  }
  if (stageId === "visual_style") {
    return `You label visual style from measured fonts/colors/shape.
Return ONLY JSON: {"visual_style_labels":[{"name":string,"confidence":number,"evidence_refs":string[]}]}
Rules: 2-6 labels (e.g. "SF Pro system sans", "high-contrast monochrome"); cite hex/fonts.`;
  }
  return `You synthesize prior DIG stage results into a short design reading.
Return ONLY a single minified JSON object (no markdown, no trailing commas, no comments):
{"design_summary":string,"hypotheses":[{"category":"page_archetype"|"layout_system"|"visual_style"|"hierarchy"|"component_pattern"|"responsive_strategy","value":string,"confidence":number,"rationale":string,"evidence_refs":string[]}]}
Rules: 3-8 hypotheses; confidence in (0,1); do not invent unseen UI; keep summary <= 2 sentences.`;
}

export function stageUserPrompt(stageId: LlmStageId, evidenceJson: string): string {
  return `Stage=${stageId}. Evidence JSON:\n${evidenceJson}\nReturn JSON only.`;
}

export function parseScreenPatterns(raw: string): MobbinParityContent["screen_patterns"] {
  const parsed = extractJsonObject(raw) as { screen_patterns?: unknown };
  if (!Array.isArray(parsed.screen_patterns)) return [];
  return parsed.screen_patterns.slice(0, 8).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = String(record.name ?? "").trim();
    if (!name) return [];
    return [{ name, confidence: clampConfidence(record.confidence), evidence_refs: asStringArray(record.evidence_refs) }];
  });
}

export function parseUiElements(raw: string): MobbinParityContent["ui_elements"] {
  const parsed = extractJsonObject(raw) as { ui_elements?: unknown };
  if (!Array.isArray(parsed.ui_elements)) return [];
  return parsed.ui_elements.slice(0, 16).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = String(record.name ?? "").trim();
    if (!name) return [];
    return [{ name, confidence: clampConfidence(record.confidence), evidence_refs: asStringArray(record.evidence_refs) }];
  });
}

export function parseRecipeStage(raw: string): Pick<MobbinParityContent, "recipe_insights" | "page_flow"> {
  const parsed = extractJsonObject(raw) as { recipe_insights?: unknown; page_flow?: unknown };
  const recipe_insights = Array.isArray(parsed.recipe_insights)
    ? parsed.recipe_insights.slice(0, 10).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const signature = String(record.signature ?? "").trim();
      const interpretation = String(record.interpretation ?? "").trim();
      if (!signature || !interpretation) return [];
      return [{
        signature,
        interpretation,
        ...(typeof record.category === "string" ? { category: record.category } : {}),
        ...(Array.isArray(record.gaps) ? { gaps: record.gaps.map((gap) => Number(gap)).filter((gap) => Number.isFinite(gap)).slice(0, 12) } : {}),
        evidence_refs: asStringArray(record.evidence_refs)
      }];
    })
    : [];
  const page_flow = Array.isArray(parsed.page_flow)
    ? parsed.page_flow.slice(0, 12).flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const section_label = String(record.section_label ?? "").trim();
      if (!section_label) return [];
      return [{
        step: Number.isFinite(Number(record.step)) ? Number(record.step) : index + 1,
        section_label,
        ...(typeof record.signature === "string" ? { signature: record.signature } : {})
      }];
    })
    : [];
  return { recipe_insights, page_flow };
}

export function parseVisualStyleLabels(raw: string): MobbinParityContent["visual_style_labels"] {
  const parsed = extractJsonObject(raw) as { visual_style_labels?: unknown };
  if (!Array.isArray(parsed.visual_style_labels)) return [];
  return parsed.visual_style_labels.slice(0, 8).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = String(record.name ?? "").trim();
    if (!name) return [];
    return [{ name, confidence: clampConfidence(record.confidence), evidence_refs: asStringArray(record.evidence_refs) }];
  });
}

export async function runLlmStage(
  provider: LlmCompleter,
  stageId: LlmStageId,
  evidenceJson: string,
  maxTokens: number,
  options: { model?: string; reasoningEffort?: "none" | "low" | "medium" | "high" | "max" } = {}
): Promise<{ raw: string; model: string }> {
  const messages: LlmMessage[] = [
    { role: "system", content: stageSystemPrompt(stageId) },
    { role: "user", content: stageUserPrompt(stageId, evidenceJson) }
  ];
  const completion = await provider.complete(messages, {
    maxTokens,
    ...(options.model ? { model: options.model } : {}),
    ...(options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {})
  });
  return { raw: completion.content, model: completion.model };
}

export function emptyMobbinParityContent(): MobbinParityContent {
  return {
    screen_patterns: [],
    ui_elements: [],
    recipe_insights: [],
    page_flow: [],
    visual_style_labels: []
  };
}
