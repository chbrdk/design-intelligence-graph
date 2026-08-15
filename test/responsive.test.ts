import assert from "node:assert/strict";
import test from "node:test";
import type { LogicalElement } from "../src/matching.js";
import { deriveResponsiveTransformations, type ResponsiveViewportEvidence } from "../src/responsive.js";

const logicalElement: LogicalElement = {
  logical_element_id: "lel_test",
  match_confidence: 0.98,
  match_method: "stable_anchor",
  fingerprint_hash: "sha256:test",
  members: [
    { viewport_capture_id: "vpc_mobile", viewport_name: "mobile", node_id: "m" },
    { viewport_capture_id: "vpc_desktop", viewport_name: "desktop", node_id: "d" }
  ],
  provenance: { layer: "L2", method: "test", confidence: 0.98 }
};

function evidence(
  name: string,
  width: number,
  nodeId: string,
  options: { rendered?: boolean; sibling?: number; box?: { x: number; y: number; width: number; height: number }; styles?: Record<string, string> } = {}
): ResponsiveViewportEvidence {
  return {
    viewport_capture_id: `vpc_${name}`, viewport_name: name, width, height: 1000, documentWidth: width, documentHeight: 1200,
    nodes: [{ node_id: nodeId, node_type: "element", tag: "section", rendered: options.rendered ?? true, sibling_index: options.sibling ?? 0 }],
    boxes: options.box ? [{ node_id: nodeId, bbox: options.box }] : [],
    styles: [{ node_id: nodeId, properties: options.styles ?? {} }]
  };
}

test("derives visibility and CSS reorder transformations", () => {
  const result = deriveResponsiveTransformations([logicalElement], [
    evidence("mobile", 390, "m", { rendered: false, styles: { order: "1" } }),
    evidence("desktop", 1440, "d", { rendered: true, styles: { order: "0" } })
  ]);
  assert.deepEqual(result.map((item) => item.type).sort(), ["reorder", "show"]);
  assert.equal(result.find((item) => item.type === "show")?.confidence, 1);
});

test("derives normalized resize and move transformations", () => {
  const result = deriveResponsiveTransformations([logicalElement], [
    evidence("mobile", 390, "m", { box: { x: 10, y: 10, width: 350, height: 600 } }),
    evidence("desktop", 1440, "d", { box: { x: 500, y: 300, width: 500, height: 200 } })
  ]);
  assert.ok(result.some((item) => item.type === "resize"));
  assert.ok(result.some((item) => item.type === "move"));
});

test("derives layout mode changes from computed styles", () => {
  const result = deriveResponsiveTransformations([logicalElement], [
    evidence("mobile", 390, "m", { styles: { display: "flex", "flex-direction": "column" } }),
    evidence("desktop", 1440, "d", { styles: { display: "grid", "flex-direction": "row" } })
  ]);
  const change = result.find((item) => item.type === "layout_mode_change");
  assert.deepEqual(change?.evidence.changed_properties, {
    display: { from: "flex", to: "grid" },
    "flex-direction": { from: "column", to: "row" }
  });
});

test("does not emit insignificant geometry changes", () => {
  const result = deriveResponsiveTransformations([logicalElement], [
    evidence("mobile", 390, "m", { box: { x: 10, y: 10, width: 195, height: 100 } }),
    evidence("desktop", 1440, "d", { box: { x: 37, y: 10, width: 720, height: 100 } })
  ]);
  assert.equal(result.length, 0);
});
