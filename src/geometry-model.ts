import { analyzeViewportLayout, type AlignmentGroup, type SpacingValue } from "./layout-analysis.js";
import type { LogicalElement, MatchableNode } from "./matching.js";
import type { ResponsiveTransformation, ResponsiveViewportEvidence, MeasuredBox, MeasuredStyle } from "./responsive.js";

export const GEOMETRY_MODEL_VERSION = "0.1.0";

export interface SpatialRelationship {
  relationship_id: string;
  type: "left_of" | "above" | "overlaps" | "aligned";
  from_node_id: string;
  to_node_id: string;
  axis?: "x" | "y";
  evidence: Record<string, number | string>;
  confidence: number;
  layer: "L2";
}

export interface LayoutContainer {
  node_id: string;
  mode: "block" | "flex" | "grid" | "other";
  box: { x: number; y: number; width: number; height: number };
  child_node_ids: string[];
  tracks?: { columns: number; rows: number };
  direction?: string;
  gap?: string;
  confidence: number;
}

export interface ViewportGeometryLayout {
  viewport_capture_id: string;
  viewport_name: string;
  layer: "L2";
  canvas: { width: number; height: number; document_width: number; document_height: number };
  alignment_groups: AlignmentGroup[];
  spacing_scale: SpacingValue[];
  probable_grid: ReturnType<typeof analyzeViewportLayout>["probable_grid"];
  layout_containers: LayoutContainer[];
  spatial_relationships: SpatialRelationship[];
  provenance: { method: "measured_geometry_and_computed_layout"; confidence: 1 };
}

export interface ResponsiveLayoutGraph {
  schema_version: string;
  geometry_model_version: string;
  layer: "L2";
  comparison_strategy: "adjacent_viewports_by_width";
  nodes: Array<{ logical_element_id: string; viewport_members: string[] }>;
  edges: Array<{
    edge_id: string;
    logical_element_id: string;
    transformation: ResponsiveTransformation["type"];
    from_viewport: string;
    to_viewport: string;
    from_width: number;
    to_width: number;
    evidence: Record<string, unknown>;
    confidence: number;
  }>;
}

const round = (value: number): number => Number(value.toFixed(3));
const boxMap = (boxes: MeasuredBox[]) => new Map(boxes.flatMap((box) => box.bbox ? [[box.node_id, box.bbox] as const] : []));

function trackCount(value: string | undefined): number {
  if (!value || value === "none") return 0;
  let depth = 0, count = 0, active = false;
  for (const character of value.trim()) {
    if (character === "(") { depth++; active = true; }
    else if (character === ")") { depth = Math.max(0, depth - 1); active = true; }
    else if (/\s/.test(character) && depth === 0) { if (active) count++; active = false; }
    else active = true;
  }
  return count + (active ? 1 : 0);
}

function relationId(type: string, from: string, to: string): string { return `geo_${type}_${from}_${to}`; }

export function deriveViewportGeometryLayout(input: ResponsiveViewportEvidence): ViewportGeometryLayout {
  const analysis = analyzeViewportLayout({
    viewport_capture_id: input.viewport_capture_id, viewport_name: input.viewport_name, nodes: input.nodes, boxes: input.boxes
  });
  const boxes = boxMap(input.boxes);
  const styles = new Map(input.styles.map((style) => [style.node_id, style.properties ?? {}]));
  const children = new Map<string | null, MatchableNode[]>();
  for (const node of input.nodes) children.set(node.parent_node_id ?? null, [...(children.get(node.parent_node_id ?? null) ?? []), node]);
  const visibleElements = input.nodes.filter((node) => node.node_type === "element" && node.rendered && boxes.has(node.node_id));
  const layoutContainers: LayoutContainer[] = visibleElements.flatMap((node) => {
    const properties = styles.get(node.node_id) ?? {};
    const display = properties.display ?? "block";
    const mode = display.includes("grid") ? "grid" : display.includes("flex") ? "flex" : display === "block" || display === "flow-root" ? "block" : "other";
    if (mode === "block" || mode === "other") return [];
    const childNodeIds = (children.get(node.node_id) ?? []).filter((child) => child.node_type === "element" && child.rendered && boxes.has(child.node_id)).map((child) => child.node_id);
    if (!childNodeIds.length) return [];
    const container: LayoutContainer = { node_id: node.node_id, mode, box: boxes.get(node.node_id)!, child_node_ids: childNodeIds, confidence: 1 };
    if (mode === "grid") container.tracks = { columns: trackCount(properties["grid-template-columns"]), rows: trackCount(properties["grid-template-rows"]) };
    if (mode === "flex") container.direction = properties["flex-direction"] ?? "row";
    const gap = properties.gap || properties["row-gap"] || properties["column-gap"];
    if (gap) container.gap = gap;
    return [container];
  });

  const relationships: SpatialRelationship[] = [];
  const add = (type: SpatialRelationship["type"], from: string, to: string, evidence: SpatialRelationship["evidence"], axis?: "x" | "y") => {
    if (from === to) return;
    const qualifier = `${axis ?? ""}_${String(evidence.edge ?? "")}`;
    relationships.push({ relationship_id: `${input.viewport_capture_id}_${relationId(type, from, `${to}_${qualifier}`)}`, type, from_node_id: from, to_node_id: to, ...(axis ? { axis } : {}), evidence, confidence: 1, layer: "L2" });
  };
  for (const siblings of children.values()) {
    const items = siblings.filter((node) => node.node_type === "element" && node.rendered && boxes.has(node.node_id));
    for (let index = 0; index < items.length; index++) for (let next = index + 1; next < items.length; next++) {
      const left = items[index], right = items[next];
      if (!left || !right) continue;
      const a = boxes.get(left.node_id)!, b = boxes.get(right.node_id)!;
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (overlapX > 0 && overlapY > 0) add("overlaps", left.node_id, right.node_id, { overlap_width: round(overlapX), overlap_height: round(overlapY) });
      else if (overlapY > 0) {
        const from = a.x <= b.x ? left : right, to = from === left ? right : left;
        add("left_of", from.node_id, to.node_id, { gap: round(Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width)) }, "x");
      } else if (overlapX > 0) {
        const from = a.y <= b.y ? left : right, to = from === left ? right : left;
        add("above", from.node_id, to.node_id, { gap: round(Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height)) }, "y");
      }
    }
  }
  for (const group of analysis.alignment_groups) for (let index = 1; index < group.node_ids.length; index++) {
    const from = group.node_ids[0], to = group.node_ids[index];
    if (from && to) add("aligned", from, to, { coordinate: group.coordinate, tolerance: group.tolerance, edge: group.edge }, group.axis);
  }
  relationships.sort((a, b) => a.relationship_id.localeCompare(b.relationship_id));
  return {
    viewport_capture_id: input.viewport_capture_id, viewport_name: input.viewport_name, layer: "L2",
    canvas: { width: input.width, height: input.height, document_width: input.documentWidth, document_height: input.documentHeight },
    alignment_groups: analysis.alignment_groups, spacing_scale: analysis.spacing_scale, probable_grid: analysis.probable_grid,
    layout_containers: layoutContainers, spatial_relationships: relationships,
    provenance: { method: "measured_geometry_and_computed_layout", confidence: 1 }
  };
}

export function deriveResponsiveLayoutGraph(logicalElements: LogicalElement[], transformations: ResponsiveTransformation[]): ResponsiveLayoutGraph {
  const edges = transformations.map((transformation, index) => ({
    edge_id: `rgr_${String(index + 1).padStart(6, "0")}`,
    logical_element_id: transformation.logical_element_id, transformation: transformation.type,
    from_viewport: transformation.from_viewport, to_viewport: transformation.to_viewport,
    from_width: transformation.from_width, to_width: transformation.to_width,
    evidence: transformation.evidence, confidence: transformation.confidence
  }));
  return {
    schema_version: "0.1.0", geometry_model_version: GEOMETRY_MODEL_VERSION, layer: "L2", comparison_strategy: "adjacent_viewports_by_width",
    nodes: logicalElements.map((element) => ({ logical_element_id: element.logical_element_id, viewport_members: element.members.map((member) => member.viewport_capture_id).sort() })),
    edges
  };
}
