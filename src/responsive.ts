import type { LogicalElement, MatchableNode } from "./matching.js";

export interface MeasuredBox {
  node_id: string;
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface MeasuredStyle {
  node_id: string;
  properties?: Record<string, string>;
}

export interface ResponsiveViewportEvidence {
  viewport_capture_id: string;
  viewport_name: string;
  width: number;
  height: number;
  documentWidth: number;
  documentHeight: number;
  nodes: MatchableNode[];
  boxes: MeasuredBox[];
  styles: MeasuredStyle[];
}

export type TransformationType = "hide" | "show" | "resize" | "move" | "reorder" | "layout_mode_change";

export interface ResponsiveTransformation {
  logical_element_id: string;
  type: TransformationType;
  from_viewport: string;
  to_viewport: string;
  from_width: number;
  to_width: number;
  evidence: Record<string, unknown>;
  confidence: number;
  provenance: { layer: "L2"; method: string; confidence: number };
}

const ROUND = (value: number): number => Number(value.toFixed(4));

function gridTrackCount(value: string | undefined): number {
  if (!value || value === "none") return 0;
  let depth = 0;
  let count = 0;
  let inToken = false;
  for (const character of value.trim()) {
    if (character === "(") { depth++; inToken = true; }
    else if (character === ")") { depth = Math.max(0, depth - 1); inToken = true; }
    else if (/\s/.test(character) && depth === 0) {
      if (inToken) count++;
      inToken = false;
    } else inToken = true;
  }
  return count + (inToken ? 1 : 0);
}

export function deriveResponsiveTransformations(
  logicalElements: LogicalElement[],
  viewports: ResponsiveViewportEvidence[]
): ResponsiveTransformation[] {
  const ordered = [...viewports].sort((a, b) => a.width - b.width);
  const viewportMaps = new Map(ordered.map((viewport) => [viewport.viewport_capture_id, {
    viewport,
    nodes: new Map(viewport.nodes.map((node) => [node.node_id, node])),
    boxes: new Map(viewport.boxes.map((box) => [box.node_id, box])),
    styles: new Map(viewport.styles.map((style) => [style.node_id, style]))
  }]));
  const transformations: ResponsiveTransformation[] = [];

  const emit = (
    element: LogicalElement,
    type: TransformationType,
    from: ResponsiveViewportEvidence,
    to: ResponsiveViewportEvidence,
    evidence: Record<string, unknown>,
    confidence: number
  ) => transformations.push({
    logical_element_id: element.logical_element_id,
    type,
    from_viewport: from.viewport_name,
    to_viewport: to.viewport_name,
    from_width: from.width,
    to_width: to.width,
    evidence,
    confidence,
    provenance: { layer: "L2", method: `pairwise_viewport_${type}`, confidence }
  });

  for (const element of logicalElements) {
    const memberByViewport = new Map(element.members.map((member) => [member.viewport_capture_id, member]));
    for (let index = 0; index < ordered.length - 1; index++) {
      const from = ordered[index];
      const to = ordered[index + 1];
      if (!from || !to) continue;
      const fromMember = memberByViewport.get(from.viewport_capture_id);
      const toMember = memberByViewport.get(to.viewport_capture_id);
      if (!fromMember || !toMember) continue;
      const fromMaps = viewportMaps.get(from.viewport_capture_id);
      const toMaps = viewportMaps.get(to.viewport_capture_id);
      if (!fromMaps || !toMaps) continue;
      const fromNode = fromMaps.nodes.get(fromMember.node_id);
      const toNode = toMaps.nodes.get(toMember.node_id);
      const fromBox = fromMaps.boxes.get(fromMember.node_id)?.bbox;
      const toBox = toMaps.boxes.get(toMember.node_id)?.bbox;
      const fromStyle = fromMaps.styles.get(fromMember.node_id)?.properties ?? {};
      const toStyle = toMaps.styles.get(toMember.node_id)?.properties ?? {};
      if (!fromNode || !toNode) continue;

      if (fromNode.rendered !== toNode.rendered) {
        emit(element, toNode.rendered ? "show" : "hide", from, to,
          { from_rendered: Boolean(fromNode.rendered), to_rendered: Boolean(toNode.rendered) }, 1);
      }
      if (fromNode.sibling_index !== undefined && toNode.sibling_index !== undefined && fromNode.sibling_index !== toNode.sibling_index) {
        emit(element, "reorder", from, to,
          { from_sibling_index: fromNode.sibling_index, to_sibling_index: toNode.sibling_index }, 0.95);
      }
      if ((fromStyle.order ?? "0") !== (toStyle.order ?? "0")) {
        emit(element, "reorder", from, to,
          { from_css_order: fromStyle.order ?? "0", to_css_order: toStyle.order ?? "0" }, 1);
      }
      if (fromBox && toBox && fromNode.rendered && toNode.rendered) {
        const fromWidthRatio = fromBox.width / from.width;
        const toWidthRatio = toBox.width / to.width;
        const fromHeightRatio = fromBox.height / from.height;
        const toHeightRatio = toBox.height / to.height;
        const widthDelta = toWidthRatio - fromWidthRatio;
        const heightDelta = toHeightRatio - fromHeightRatio;
        if (Math.abs(widthDelta) >= 0.05 || Math.abs(heightDelta) >= 0.05) {
          emit(element, "resize", from, to, {
            from: { width: fromBox.width, height: fromBox.height, viewport_width_ratio: ROUND(fromWidthRatio), viewport_height_ratio: ROUND(fromHeightRatio) },
            to: { width: toBox.width, height: toBox.height, viewport_width_ratio: ROUND(toWidthRatio), viewport_height_ratio: ROUND(toHeightRatio) },
            ratio_delta: { width: ROUND(widthDelta), height: ROUND(heightDelta) }, threshold: 0.05
          }, 0.92);
        }
        const fromX = fromBox.x / from.width;
        const toX = toBox.x / to.width;
        const fromY = fromBox.y / Math.max(1, from.documentHeight);
        const toY = toBox.y / Math.max(1, to.documentHeight);
        const xDelta = toX - fromX;
        const yDelta = toY - fromY;
        if (Math.abs(xDelta) >= 0.05 || Math.abs(yDelta) >= 0.08) {
          emit(element, "move", from, to, {
            from: { normalized_x: ROUND(fromX), normalized_y: ROUND(fromY) },
            to: { normalized_x: ROUND(toX), normalized_y: ROUND(toY) },
            normalized_delta: { x: ROUND(xDelta), y: ROUND(yDelta) },
            references: { x: "viewport_width", y: "document_height" }, thresholds: { x: 0.05, y: 0.08 }
          }, 0.88);
        }
      }
      const layoutProperties = ["display", "flex-direction", "flex-wrap", "grid-auto-flow"];
      const changed = Object.fromEntries(layoutProperties.flatMap((property) =>
        fromStyle[property] !== toStyle[property] ? [[property, { from: fromStyle[property] ?? "", to: toStyle[property] ?? "" }]] : []));
      const fromGridTracks = gridTrackCount(fromStyle["grid-template-columns"]);
      const toGridTracks = gridTrackCount(toStyle["grid-template-columns"]);
      if (fromGridTracks !== toGridTracks) {
        changed["grid-column-count"] = { from: String(fromGridTracks), to: String(toGridTracks) };
      }
      if (Object.keys(changed).length) emit(element, "layout_mode_change", from, to, { changed_properties: changed }, 1);
    }
  }
  return transformations.sort((a, b) =>
    a.logical_element_id.localeCompare(b.logical_element_id) || a.from_width - b.from_width || a.type.localeCompare(b.type));
}
