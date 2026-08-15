import assert from "node:assert/strict";
import test from "node:test";
import { buildScrollOffsets, selectPositionedTargets } from "../src/scroll.js";

test("builds ordered, unique deterministic scroll offsets", () => {
  assert.deepEqual(buildScrollOffsets(3000, 800), [0, 800, 1100, 2200]);
  assert.deepEqual(buildScrollOffsets(1000, 800), [0, 100, 200]);
});

test("returns only top for a short document", () => {
  assert.deepEqual(buildScrollOffsets(600, 800), [0]);
});

test("selects fixed and sticky elements with their configured top", () => {
  const nodes = [
    { node_id: "sticky", node_type: "element", tag: "header", dom_path: "html > body > header" },
    { node_id: "normal", node_type: "element", tag: "main", dom_path: "html > body > main" }
  ];
  const styles = [
    { node_id: "sticky", properties: { position: "sticky", top: "12px" } },
    { node_id: "normal", properties: { position: "static" } }
  ];
  assert.deepEqual(selectPositionedTargets(nodes, styles), [
    { node_id: "sticky", selector: "html > body > header", position: "sticky", top: "12px" }
  ]);
});
