import { analyzeColorUsage, type NormalizedColorUsage } from "./color-analysis.js";
import { summarizeMotion, type MotionEvidenceRecord } from "./motion.js";
import type { MeasuredStyle } from "./responsive.js";

export const VISUAL_LANGUAGE_VERSION = "0.1.0";

export interface VisualViewportEvidence {
  viewport_capture_id: string;
  viewport_name: string;
  document_width: number;
  document_height: number;
  visible_node_count: number;
  styles: MeasuredStyle[];
  boxes: Array<{ node_id: string; bbox?: { width: number; height: number } }>;
  assets: Array<{ type?: string; node_id?: string; intrinsic?: { width?: number; height?: number } }>;
  fonts: Array<{ family?: string; status?: string }>;
  motion: MotionEvidenceRecord[];
}

export interface VisualLanguageViewport {
  viewport_capture_id: string;
  viewport_name: string;
  layer: "L2";
  typography: Array<{ font_family: string; font_size: string; font_weight: string; line_height: string; letter_spacing: string; occurrences: number; node_ids: string[] }>;
  color_palette: Array<NormalizedColorUsage & { roles: Array<"foreground" | "background" | "border" | "vector"> }>;
  shape: { border_radius_values: Array<{ value: string; occurrences: number }>; shadow_values: Array<{ value: string; occurrences: number }>; border_width_values: Array<{ value: string; occurrences: number }> };
  imagery: { total: number; by_type: Record<string, number>; intrinsic_dimensioned: number };
  composition: { visible_node_count: number; estimated_box_coverage: number; document_aspect_ratio: number };
  motion: ReturnType<typeof summarizeMotion>;
  provenance: { method: "computed_styles_and_measured_assets"; confidence: 1 };
}

export interface VisualHypothesis {
  hypothesis_id: string;
  viewport_capture_id: string;
  category: "visual_character" | "motion_personality";
  value: "restrained" | "expressive" | "static" | "animated";
  confidence: number;
  evidence: Record<string, number>;
  layer: "L3";
  method: "bounded_visual_language_heuristic";
}

const round = (value: number): number => Number(value.toFixed(4));
const counts = (values: string[]) => [...values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<string, number>()).entries()]
  .filter(([value]) => Boolean(value) && value !== "none" && value !== "0px")
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value, occurrences]) => ({ value, occurrences }));

export function deriveVisualLanguageViewport(input: VisualViewportEvidence): VisualLanguageViewport {
  const typography = new Map<string, { font_family: string; font_size: string; font_weight: string; line_height: string; letter_spacing: string; occurrences: number; node_ids: string[] }>();
  for (const style of input.styles) {
    const properties = style.properties ?? {};
    const fontFamily = properties["font-family"] ?? "";
    if (!fontFamily) continue;
    const token = { font_family: fontFamily, font_size: properties["font-size"] ?? "", font_weight: properties["font-weight"] ?? "", line_height: properties["line-height"] ?? "", letter_spacing: properties["letter-spacing"] ?? "", occurrences: 0, node_ids: [] };
    const key = `${token.font_family}|${token.font_size}|${token.font_weight}|${token.line_height}|${token.letter_spacing}`;
    const current = typography.get(key) ?? token;
    current.occurrences++; current.node_ids.push(style.node_id); typography.set(key, current);
  }
  const colorPalette = analyzeColorUsage(input.styles).map((color) => ({
    ...color,
    roles: [...new Set(color.properties.flatMap((property) => property === "color" ? ["foreground" as const] : property.includes("background") ? ["background" as const] : property.includes("border") ? ["border" as const] : /fill|stroke/.test(property) ? ["vector" as const] : []))].sort()
  }));
  const allProperties = input.styles.flatMap((style) => Object.entries(style.properties ?? {}));
  const imageryByType: Record<string, number> = {};
  let intrinsicDimensioned = 0;
  for (const asset of input.assets) { const type = asset.type ?? "unknown"; imageryByType[type] = (imageryByType[type] ?? 0) + 1; if (asset.intrinsic?.width && asset.intrinsic?.height) intrinsicDimensioned++; }
  const totalArea = input.boxes.reduce((sum, box) => sum + Math.max(0, box.bbox?.width ?? 0) * Math.max(0, box.bbox?.height ?? 0), 0);
  const documentArea = Math.max(1, input.document_width * input.document_height);
  return {
    viewport_capture_id: input.viewport_capture_id, viewport_name: input.viewport_name, layer: "L2",
    typography: [...typography.values()].sort((a, b) => b.occurrences - a.occurrences || a.font_family.localeCompare(b.font_family)),
    color_palette: colorPalette,
    shape: {
      border_radius_values: counts(allProperties.filter(([property]) => property.includes("radius")).map(([, value]) => value)),
      shadow_values: counts(allProperties.filter(([property]) => property === "box-shadow").map(([, value]) => value)),
      border_width_values: counts(allProperties.filter(([property]) => /border-.*-width/.test(property)).map(([, value]) => value))
    },
    imagery: { total: input.assets.length, by_type: imageryByType, intrinsic_dimensioned: intrinsicDimensioned },
    composition: { visible_node_count: input.visible_node_count, estimated_box_coverage: round(totalArea / documentArea), document_aspect_ratio: round(input.document_width / Math.max(1, input.document_height)) },
    motion: summarizeMotion(input.motion), provenance: { method: "computed_styles_and_measured_assets", confidence: 1 }
  };
}

export function deriveVisualHypotheses(viewports: VisualLanguageViewport[]): VisualHypothesis[] {
  const result: VisualHypothesis[] = [];
  for (const viewport of viewports) {
    const colorCount = viewport.color_palette.length;
    const shapeCount = viewport.shape.border_radius_values.length + viewport.shape.shadow_values.length;
    if (colorCount <= 4 && shapeCount <= 3) result.push({ hypothesis_id: `vlh_${viewport.viewport_capture_id}_restrained`, viewport_capture_id: viewport.viewport_capture_id, category: "visual_character", value: "restrained", confidence: 0.62, evidence: { color_count: colorCount, shape_token_count: shapeCount }, layer: "L3", method: "bounded_visual_language_heuristic" });
    if (colorCount >= 8 || shapeCount >= 7) result.push({ hypothesis_id: `vlh_${viewport.viewport_capture_id}_expressive`, viewport_capture_id: viewport.viewport_capture_id, category: "visual_character", value: "expressive", confidence: 0.62, evidence: { color_count: colorCount, shape_token_count: shapeCount }, layer: "L3", method: "bounded_visual_language_heuristic" });
    const motionCount = viewport.motion.total;
    result.push({ hypothesis_id: `vlh_${viewport.viewport_capture_id}_${motionCount ? "animated" : "static"}`, viewport_capture_id: viewport.viewport_capture_id, category: "motion_personality", value: motionCount ? "animated" : "static", confidence: motionCount ? 0.7 : 0.8, evidence: { motion_record_count: motionCount, runtime_instances: viewport.motion.runtime_instances }, layer: "L3", method: "bounded_visual_language_heuristic" });
  }
  return result;
}
