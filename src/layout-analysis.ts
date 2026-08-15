import type { MatchableNode } from "./matching.js";
import type { MeasuredBox } from "./responsive.js";

export interface AlignmentGroup {
  axis: "x" | "y";
  edge: "start" | "center" | "end";
  coordinate: number;
  node_ids: string[];
  tolerance: number;
}

export interface SpacingValue {
  value: number;
  count: number;
  directions: Array<"horizontal" | "vertical">;
}

export interface ViewportLayoutAnalysis {
  viewport_capture_id: string;
  viewport_name: string;
  layer: "L2";
  alignment_groups: AlignmentGroup[];
  spacing_scale: SpacingValue[];
  probable_grid: {
    column_count: number;
    column_starts: number[];
    confidence: number;
    method: "repeated_left_edges";
  } | null;
  provenance: { method: "deterministic_geometry_clustering"; confidence: number };
}

const rounded = (value: number, precision = 0.5): number => Math.round(value / precision) * precision;

function clusterCoordinates(
  entries: Array<{ nodeId: string; coordinate: number }>,
  tolerance: number
): Array<{ coordinate: number; nodeIds: string[] }> {
  const clusters: Array<{ values: number[]; nodeIds: string[] }> = [];
  for (const entry of [...entries].sort((a, b) => a.coordinate - b.coordinate)) {
    const cluster = clusters.find((candidate) => Math.abs(candidate.values.reduce((a, b) => a + b, 0) / candidate.values.length - entry.coordinate) <= tolerance);
    if (cluster) { cluster.values.push(entry.coordinate); cluster.nodeIds.push(entry.nodeId); }
    else clusters.push({ values: [entry.coordinate], nodeIds: [entry.nodeId] });
  }
  return clusters.filter((cluster) => cluster.nodeIds.length >= 2).map((cluster) => ({
    coordinate: rounded(cluster.values.reduce((a, b) => a + b, 0) / cluster.values.length),
    nodeIds: cluster.nodeIds
  }));
}

export function analyzeViewportLayout(input: {
  viewport_capture_id: string;
  viewport_name: string;
  nodes: MatchableNode[];
  boxes: MeasuredBox[];
}): ViewportLayoutAnalysis {
  const nodesById = new Map(input.nodes.map((node) => [node.node_id, node]));
  const boxes = input.boxes.flatMap((box) => {
    const node = nodesById.get(box.node_id);
    return box.bbox && node?.node_type === "element" && node.rendered
      ? [{ nodeId: box.node_id, parentId: node.parent_node_id ?? null, ...box.bbox }]
      : [];
  }).filter((box) => box.width > 0 && box.height > 0);
  const tolerance = 2;
  const alignmentGroups: AlignmentGroup[] = [];
  const dimensions = [
    { axis: "x" as const, edge: "start" as const, coordinate: (item: typeof boxes[number]) => item.x },
    { axis: "x" as const, edge: "center" as const, coordinate: (item: typeof boxes[number]) => item.x + item.width / 2 },
    { axis: "x" as const, edge: "end" as const, coordinate: (item: typeof boxes[number]) => item.x + item.width },
    { axis: "y" as const, edge: "start" as const, coordinate: (item: typeof boxes[number]) => item.y },
    { axis: "y" as const, edge: "center" as const, coordinate: (item: typeof boxes[number]) => item.y + item.height / 2 },
    { axis: "y" as const, edge: "end" as const, coordinate: (item: typeof boxes[number]) => item.y + item.height }
  ];
  for (const dimension of dimensions) {
    for (const cluster of clusterCoordinates(boxes.map((item) => ({ nodeId: item.nodeId, coordinate: dimension.coordinate(item) })), tolerance)) {
      alignmentGroups.push({ axis: dimension.axis, edge: dimension.edge, coordinate: cluster.coordinate, node_ids: cluster.nodeIds, tolerance });
    }
  }

  const spacingObservations = new Map<number, { count: number; directions: Set<"horizontal" | "vertical"> }>();
  const siblings = new Map<string | null, typeof boxes>();
  for (const item of boxes) siblings.set(item.parentId, [...(siblings.get(item.parentId) ?? []), item]);
  const recordGap = (value: number, direction: "horizontal" | "vertical") => {
    if (value < 0 || value > 512) return;
    const key = rounded(value);
    const observation = spacingObservations.get(key) ?? { count: 0, directions: new Set() };
    observation.count++;
    observation.directions.add(direction);
    spacingObservations.set(key, observation);
  };
  for (const group of siblings.values()) {
    for (const previous of group) {
      for (const current of group) {
        if (current.y >= previous.y + previous.height &&
          Math.min(previous.x + previous.width, current.x + current.width) > Math.max(previous.x, current.x))
          recordGap(current.y - (previous.y + previous.height), "vertical");
        if (current.x >= previous.x + previous.width &&
          Math.min(previous.y + previous.height, current.y + current.height) > Math.max(previous.y, current.y))
          recordGap(current.x - (previous.x + previous.width), "horizontal");
      }
    }
  }
  const spacingScale = [...spacingObservations.entries()].filter(([, value]) => value.count >= 2)
    .sort(([a], [b]) => a - b)
    .map(([value, observation]) => ({ value, count: observation.count, directions: [...observation.directions].sort() }));
  const columnClusters = clusterCoordinates(boxes.map((item) => ({ nodeId: item.nodeId, coordinate: item.x })), tolerance)
    .filter((cluster) => cluster.nodeIds.length >= 2);
  const probableGrid = columnClusters.length >= 2 ? {
    column_count: columnClusters.length,
    column_starts: columnClusters.map((cluster) => cluster.coordinate),
    confidence: Number(Math.min(0.95, 0.55 + columnClusters.reduce((sum, cluster) => sum + cluster.nodeIds.length, 0) / Math.max(1, boxes.length) * 0.4).toFixed(4)),
    method: "repeated_left_edges" as const
  } : null;
  return {
    viewport_capture_id: input.viewport_capture_id,
    viewport_name: input.viewport_name,
    layer: "L2",
    alignment_groups: alignmentGroups,
    spacing_scale: spacingScale,
    probable_grid: probableGrid,
    provenance: { method: "deterministic_geometry_clustering", confidence: 0.85 }
  };
}
