import assert from "node:assert/strict";
import test from "node:test";
import { analyzeColorUsage } from "../src/color-analysis.js";

test("normalizes and aggregates computed RGB colors", () => {
  const result = analyzeColorUsage([
    { node_id: "a", properties: { color: "rgb(23, 32, 38)", "background-color": "rgba(91, 91, 214, 0.5)" } },
    { node_id: "b", properties: { color: "rgb(23 32 38)", "border-top-color": "rgb(23, 32, 38)" } }
  ]);
  assert.equal(result[0]?.hex, "#172026ff");
  assert.equal(result[0]?.occurrences, 3);
  assert.deepEqual(result[0]?.node_ids, ["a", "b"]);
  assert.equal(result[1]?.hex, "#5b5bd680");
});

test("ignores gradients and non-color values", () => {
  assert.deepEqual(analyzeColorUsage([{ node_id: "a", properties: { color: "currentcolor", "background-image": "linear-gradient(red, blue)" } }]), []);
});
