/** Deterministic DIG LLM quality scoring (text + vision tracks). */

export interface VisionGolden {
  expected_heading_keywords: string[];
  expected_cta_keywords: string[];
  expected_layout_order: string[];
}

export interface EvalGolden {
  expected_screen_patterns: string[];
  expected_ui_elements: string[];
  expected_recipe_signatures: string[];
  expected_flow_labels: string[];
  expected_style_keywords: string[];
  vision: VisionGolden;
}

export interface TextTrackResult {
  status: string;
  stages_complete: number;
  stages_total: number;
  screen_patterns: string[];
  ui_elements: string[];
  recipe_signatures: string[];
  flow_labels: string[];
  style_labels: string[];
  design_summary: string;
  json_parse_ok: boolean;
}

export interface VisionTrackResult {
  status: "complete" | "failed" | "skipped";
  heading?: string;
  cta?: string;
  layout_order?: string[];
  raw_preview?: string;
  error?: string;
}

export interface DimensionScore {
  id: string;
  label: string;
  score: number;
  max: number;
  detail: string;
}

export interface TrackScorecard {
  track: "text_staged" | "vision_screen";
  total: number;
  max: number;
  percent: number;
  dimensions: DimensionScore[];
}

function norm(value: string): string {
  return value.toLocaleLowerCase();
}

function anyKeywordMatch(haystacks: string[], keywords: string[]): { hits: number; matched: string[] } {
  const matched: string[] = [];
  for (const keyword of keywords) {
    const needle = norm(keyword);
    if (haystacks.some((item) => norm(item).includes(needle))) matched.push(keyword);
  }
  return { hits: matched.length, matched };
}

function ratioScore(hits: number, total: number, maxPoints: number): number {
  if (total <= 0) return 0;
  return Math.round((hits / total) * maxPoints * 100) / 100;
}

export function scoreTextTrack(result: TextTrackResult, golden: EvalGolden): TrackScorecard {
  const dimensions: DimensionScore[] = [];

  const stageMax = 15;
  const stageScore = result.stages_total
    ? ratioScore(result.stages_complete, result.stages_total, stageMax)
    : 0;
  dimensions.push({
    id: "stage_completion",
    label: "Staged JSON completion",
    score: stageScore,
    max: stageMax,
    detail: `${result.stages_complete}/${result.stages_total} stages`
  });

  const patternMax = 15;
  const patternHits = anyKeywordMatch(result.screen_patterns, golden.expected_screen_patterns);
  dimensions.push({
    id: "screen_patterns",
    label: "Screen patterns",
    score: ratioScore(patternHits.hits, golden.expected_screen_patterns.length, patternMax),
    max: patternMax,
    detail: patternHits.matched.join(", ") || "none"
  });

  const uiMax = 15;
  const uiHits = anyKeywordMatch(result.ui_elements, golden.expected_ui_elements);
  dimensions.push({
    id: "ui_elements",
    label: "UI elements",
    score: ratioScore(uiHits.hits, Math.min(3, golden.expected_ui_elements.length), uiMax),
    max: uiMax,
    detail: uiHits.matched.join(", ") || "none"
  });

  const recipeMax = 20;
  const recipeHits = anyKeywordMatch(result.recipe_signatures, golden.expected_recipe_signatures);
  const exactRecipe = result.recipe_signatures.some((signature) =>
    golden.expected_recipe_signatures.some((expected) => norm(signature) === norm(expected))
  );
  dimensions.push({
    id: "recipes",
    label: "Section recipes",
    score: exactRecipe ? recipeMax : ratioScore(recipeHits.hits, golden.expected_recipe_signatures.length, recipeMax * 0.5),
    max: recipeMax,
    detail: result.recipe_signatures.join(" | ") || "none"
  });

  const flowMax = 10;
  const flowHits = anyKeywordMatch(result.flow_labels, golden.expected_flow_labels);
  dimensions.push({
    id: "page_flow",
    label: "Page flow",
    score: ratioScore(flowHits.hits, golden.expected_flow_labels.length, flowMax),
    max: flowMax,
    detail: result.flow_labels.join(" → ") || "none"
  });

  const styleMax = 15;
  const styleCorpus = [...result.style_labels, result.design_summary];
  const styleHits = anyKeywordMatch(styleCorpus, golden.expected_style_keywords);
  dimensions.push({
    id: "visual_style",
    label: "Visual style labels",
    score: ratioScore(styleHits.hits, Math.min(3, golden.expected_style_keywords.length), styleMax),
    max: styleMax,
    detail: styleHits.matched.join(", ") || "none"
  });

  const jsonMax = 10;
  dimensions.push({
    id: "json_validity",
    label: "JSON validity signal",
    score: result.json_parse_ok ? jsonMax : Math.min(jsonMax, stageScore > 0 ? 4 : 0),
    max: jsonMax,
    detail: result.json_parse_ok ? "ok" : "partial/failed parses"
  });

  const total = dimensions.reduce((sum, item) => sum + item.score, 0);
  const max = dimensions.reduce((sum, item) => sum + item.max, 0);
  return {
    track: "text_staged",
    total: Math.round(total * 100) / 100,
    max,
    percent: max ? Math.round((total / max) * 1000) / 10 : 0,
    dimensions
  };
}

export function scoreVisionTrack(result: VisionTrackResult, golden: EvalGolden): TrackScorecard {
  const dimensions: DimensionScore[] = [];
  if (result.status === "skipped") {
    return {
      track: "vision_screen",
      total: 0,
      max: 100,
      percent: 0,
      dimensions: [
        {
          id: "vision_skipped",
          label: "Vision skipped",
          score: 0,
          max: 100,
          detail: result.error ?? "model has no vision track"
        }
      ]
    };
  }

  const headingMax = 30;
  const headingHits = anyKeywordMatch([result.heading ?? ""], golden.vision.expected_heading_keywords);
  dimensions.push({
    id: "vision_heading",
    label: "Heading from screenshot",
    score: ratioScore(headingHits.hits, golden.vision.expected_heading_keywords.length, headingMax),
    max: headingMax,
    detail: result.heading ?? result.error ?? "missing"
  });

  const ctaMax = 30;
  const ctaHits = anyKeywordMatch([result.cta ?? ""], golden.vision.expected_cta_keywords);
  dimensions.push({
    id: "vision_cta",
    label: "CTA from screenshot",
    score: ratioScore(ctaHits.hits, golden.vision.expected_cta_keywords.length, ctaMax),
    max: ctaMax,
    detail: result.cta ?? result.error ?? "missing"
  });

  const layoutMax = 40;
  const expected = golden.vision.expected_layout_order.map(norm);
  const actual = (result.layout_order ?? []).map(norm);
  let layoutScore = 0;
  if (actual.length) {
    const sameLengthBonus = actual.length === expected.length ? 0.25 : 0;
    let orderedHits = 0;
    for (let index = 0; index < expected.length; index += 1) {
      if (actual[index] === expected[index]) orderedHits += 1;
    }
    const containment = expected.filter((item) => actual.includes(item)).length / expected.length;
    layoutScore = Math.round(layoutMax * (0.55 * (orderedHits / expected.length) + 0.2 * containment + sameLengthBonus) * 100) / 100;
  }
  dimensions.push({
    id: "vision_layout",
    label: "Layout order from screenshot",
    score: Math.min(layoutMax, layoutScore),
    max: layoutMax,
    detail: (result.layout_order ?? []).join(">") || result.error || "missing"
  });

  const total = dimensions.reduce((sum, item) => sum + item.score, 0);
  const max = dimensions.reduce((sum, item) => sum + item.max, 0);
  return {
    track: "vision_screen",
    total: Math.round(total * 100) / 100,
    max,
    percent: max ? Math.round((total / max) * 1000) / 10 : 0,
    dimensions
  };
}

export function combineScorecards(cards: TrackScorecard[]): {
  overall_percent: number;
  text_percent: number | null;
  vision_percent: number | null;
} {
  const text = cards.find((card) => card.track === "text_staged") ?? null;
  const vision = cards.find((card) => card.track === "vision_screen") ?? null;
  const parts: TrackScorecard[] = [];
  if (text && text.max > 0) parts.push(text);
  if (vision && vision.max > 0 && vision.dimensions[0]?.id !== "vision_skipped") parts.push(vision);
  const overall =
    parts.length === 0
      ? 0
      : Math.round((parts.reduce((sum, card) => sum + card.percent, 0) / parts.length) * 10) / 10;
  return {
    overall_percent: overall,
    text_percent: text ? text.percent : null,
    vision_percent: vision && vision.dimensions[0]?.id !== "vision_skipped" ? vision.percent : null
  };
}
