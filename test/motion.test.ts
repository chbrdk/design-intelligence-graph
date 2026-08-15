import assert from "node:assert/strict";
import test from "node:test";
import { isCompositorFriendly, summarizeMotion } from "../src/motion.js";

test("classifies compositor-friendly property sets", () => {
  assert.equal(isCompositorFriendly(["opacity", "transform"]), true);
  assert.equal(isCompositorFriendly(["transform", "width"]), false);
  assert.equal(isCompositorFriendly([]), false);
});

test("summarizes declarations, runtime sources, and properties", () => {
  assert.deepEqual(summarizeMotion([
    { source: "computed_css", transition: {} },
    { source: "css_animation", animated_properties: ["transform", "opacity"], compositor_friendly: true },
    { source: "web_animations_api", animated_properties: ["width"], compositor_friendly: false }
  ]), {
    total: 3,
    declarations: 1,
    runtime_instances: 2,
    by_source: { computed_css: 1, css_animation: 1, web_animations_api: 1 },
    compositor_friendly_runtime_instances: 1,
    animated_properties: ["opacity", "transform", "width"]
  });
});
