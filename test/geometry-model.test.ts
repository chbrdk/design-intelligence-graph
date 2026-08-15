import assert from "node:assert/strict";
import test from "node:test";
import { deriveResponsiveLayoutGraph, deriveViewportGeometryLayout } from "../src/geometry-model.js";
import type { LogicalElement } from "../src/matching.js";
import type { ResponsiveViewportEvidence } from "../src/responsive.js";

const evidence: ResponsiveViewportEvidence = {
  viewport_capture_id: "vpc_test", viewport_name: "test", width: 500, height: 600, documentWidth: 500, documentHeight: 900,
  nodes: [
    { node_id: "root", node_type: "element", tag: "main", rendered: true },
    { node_id: "grid", parent_node_id: "root", node_type: "element", tag: "section", rendered: true },
    { node_id: "a", parent_node_id: "grid", node_type: "element", tag: "article", rendered: true },
    { node_id: "b", parent_node_id: "grid", node_type: "element", tag: "article", rendered: true },
    { node_id: "c", parent_node_id: "grid", node_type: "element", tag: "article", rendered: true }
  ],
  boxes: [
    { node_id: "root", bbox: { x: 0, y: 0, width: 500, height: 900 } },
    { node_id: "grid", bbox: { x: 20, y: 40, width: 460, height: 300 } },
    { node_id: "a", bbox: { x: 20, y: 40, width: 140, height: 100 } },
    { node_id: "b", bbox: { x: 180, y: 40, width: 140, height: 100 } },
    { node_id: "c", bbox: { x: 20, y: 160, width: 140, height: 100 } }
  ],
  styles: [{ node_id: "grid", properties: { display: "grid", "grid-template-columns": "1fr 1fr 1fr", "grid-template-rows": "auto", gap: "20px" } }]
};

test("derives layout containers and sibling spatial relationships", () => {
  const result = deriveViewportGeometryLayout(evidence);
  assert.deepEqual(result.layout_containers[0]?.tracks, { columns: 3, rows: 1 });
  assert.ok(result.spatial_relationships.some((item) => item.type === "left_of" && item.from_node_id === "a" && item.to_node_id === "b"));
  assert.ok(result.spatial_relationships.some((item) => item.type === "above" && item.from_node_id === "a" && item.to_node_id === "c"));
  assert.ok(result.spatial_relationships.some((item) => item.type === "aligned"));
});

test("derives a logical responsive graph from measured transformations", () => {
  const logical: LogicalElement = { logical_element_id: "lel_test", match_confidence: 1, match_method: "stable_anchor", fingerprint_hash: "sha256:test", members: [{ viewport_capture_id: "vpc_a", viewport_name: "mobile", node_id: "a" }, { viewport_capture_id: "vpc_b", viewport_name: "desktop", node_id: "b" }], provenance: { layer: "L2", method: "test", confidence: 1 } };
  const graph = deriveResponsiveLayoutGraph([logical], [{ logical_element_id: "lel_test", type: "resize", from_viewport: "mobile", to_viewport: "desktop", from_width: 390, to_width: 1440, evidence: {}, confidence: 0.92, provenance: { layer: "L2", method: "test", confidence: 0.92 } }]);
  assert.equal(graph.nodes[0]?.viewport_members.length, 2);
  assert.equal(graph.edges[0]?.transformation, "resize");
});
