import assert from "node:assert/strict";
import test from "node:test";
import { deriveVisualHypotheses, deriveVisualLanguageViewport } from "../src/visual-language.js";

test("derives typography, color, shape, imagery, and motion tokens", () => {
  const result = deriveVisualLanguageViewport({
    viewport_capture_id: "vpc_test", viewport_name: "test", document_width: 400, document_height: 800, visible_node_count: 3,
    styles: [
      { node_id: "a", properties: { "font-family": "Inter", "font-size": "16px", "font-weight": "400", "line-height": "24px", "letter-spacing": "0px", color: "rgb(1, 2, 3)", "background-color": "rgb(255, 255, 255)", "border-top-left-radius": "8px", "box-shadow": "rgb(0, 0, 0) 0px 1px 2px 0px" } },
      { node_id: "b", properties: { "font-family": "Inter", "font-size": "16px", "font-weight": "400", "line-height": "24px", "letter-spacing": "0px", color: "rgb(1, 2, 3)" } }
    ], boxes: [{ node_id: "a", bbox: { width: 200, height: 100 } }], assets: [{ type: "image", intrinsic: { width: 400, height: 300 } }], fonts: [], motion: []
  });
  assert.equal(result.typography[0]?.occurrences, 2);
  assert.ok(result.color_palette.some((color) => color.roles.includes("foreground")));
  assert.equal(result.imagery.by_type.image, 1);
  assert.equal(result.motion.total, 0);
});

test("marks L3 hypotheses with bounded confidence", () => {
  const viewport = deriveVisualLanguageViewport({ viewport_capture_id: "vpc_test", viewport_name: "test", document_width: 100, document_height: 100, visible_node_count: 0, styles: [], boxes: [], assets: [], fonts: [], motion: [] });
  const hypotheses = deriveVisualHypotheses([viewport]);
  assert.ok(hypotheses.some((item) => item.value === "restrained"));
  assert.ok(hypotheses.every((item) => item.layer === "L3" && item.confidence < 1));
});
