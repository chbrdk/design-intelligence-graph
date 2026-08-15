import assert from "node:assert/strict";
import test from "node:test";
import { analyzeViewportLayout } from "../src/layout-analysis.js";

test("derives alignments, repeated spacing, and probable columns", () => {
  const nodes = [
    { node_id: "a", parent_node_id: "root", node_type: "element", tag: "div", rendered: true },
    { node_id: "b", parent_node_id: "root", node_type: "element", tag: "div", rendered: true },
    { node_id: "c", parent_node_id: "root", node_type: "element", tag: "div", rendered: true },
    { node_id: "d", parent_node_id: "root", node_type: "element", tag: "div", rendered: true }
  ];
  const boxes = [
    { node_id: "a", bbox: { x: 16, y: 0, width: 100, height: 40 } },
    { node_id: "b", bbox: { x: 16, y: 64, width: 100, height: 40 } },
    { node_id: "c", bbox: { x: 160, y: 0, width: 100, height: 40 } },
    { node_id: "d", bbox: { x: 160, y: 64, width: 100, height: 40 } }
  ];
  const result = analyzeViewportLayout({ viewport_capture_id: "vpc_test", viewport_name: "test", nodes, boxes });
  assert.ok(result.alignment_groups.some((group) => group.axis === "x" && group.edge === "start" && group.coordinate === 16));
  assert.ok(result.spacing_scale.some((spacing) => spacing.value === 24 && spacing.count === 2));
  assert.deepEqual(result.probable_grid?.column_starts, [16, 160]);
});

test("does not infer a grid from a single repeated edge", () => {
  const result = analyzeViewportLayout({
    viewport_capture_id: "vpc_test", viewport_name: "test",
    nodes: [
      { node_id: "a", node_type: "element", tag: "p", rendered: true },
      { node_id: "b", node_type: "element", tag: "p", rendered: true }
    ],
    boxes: [
      { node_id: "a", bbox: { x: 16, y: 0, width: 100, height: 20 } },
      { node_id: "b", bbox: { x: 16, y: 40, width: 100, height: 20 } }
    ]
  });
  assert.equal(result.probable_grid, null);
});
