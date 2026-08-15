export const QUALITY_FORMULA_VERSION = "0.2.0";

export interface QualityMetrics {
  subsystem_success: number;
  geometry_coverage: number;
  style_coverage: number;
  screenshot_completeness: number;
  accessibility_coverage: number;
  asset_completeness: number;
  font_completeness: number;
  network_completion: number;
  state_restoration: number;
  scroll_restoration: number;
}

export interface QualityEvaluation {
  formula_version: string;
  overall: number;
  rating: "excellent" | "good" | "partial" | "poor";
  metrics: QualityMetrics;
  weights: QualityMetrics;
}

export const QUALITY_WEIGHTS: QualityMetrics = {
  subsystem_success: 0.1,
  geometry_coverage: 0.15,
  style_coverage: 0.12,
  screenshot_completeness: 0.12,
  accessibility_coverage: 0.1,
  asset_completeness: 0.08,
  font_completeness: 0.08,
  network_completion: 0.1,
  state_restoration: 0.08,
  scroll_restoration: 0.07
};

export const ZERO_QUALITY_METRICS: QualityMetrics = {
  subsystem_success: 0, geometry_coverage: 0, style_coverage: 0, screenshot_completeness: 0,
  accessibility_coverage: 0, asset_completeness: 0, font_completeness: 0, network_completion: 0,
  state_restoration: 0, scroll_restoration: 0
};

const bounded = (value: number): number => Number(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)).toFixed(4));

export function evaluateQuality(input: QualityMetrics): QualityEvaluation {
  const metrics = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, bounded(value)])) as unknown as QualityMetrics;
  const overall = bounded((Object.keys(QUALITY_WEIGHTS) as Array<keyof QualityMetrics>)
    .reduce((sum, key) => sum + metrics[key] * QUALITY_WEIGHTS[key], 0));
  const rating = overall >= 0.95 ? "excellent" : overall >= 0.8 ? "good" : overall >= 0.5 ? "partial" : "poor";
  return { formula_version: QUALITY_FORMULA_VERSION, overall, rating, metrics, weights: QUALITY_WEIGHTS };
}

export function aggregateQuality(evaluations: QualityEvaluation[]): QualityEvaluation {
  if (!evaluations.length) return evaluateQuality(ZERO_QUALITY_METRICS);
  const metrics = Object.fromEntries((Object.keys(QUALITY_WEIGHTS) as Array<keyof QualityMetrics>).map((key) => [
    key,
    evaluations.reduce((sum, evaluation) => sum + evaluation.metrics[key], 0) / evaluations.length
  ])) as unknown as QualityMetrics;
  return evaluateQuality(metrics);
}
