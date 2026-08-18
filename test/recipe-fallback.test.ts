import assert from "node:assert/strict";
import test from "node:test";
import { sectionsFromCompositionDoc, synthesizeRecipeParity } from "../src/recipe-fallback.js";
import { normalizeVisualStyleLabel } from "../src/llm-stages.js";
import type { SectionComposition } from "../src/section-composition.js";

const section = (overrides: Partial<SectionComposition>): SectionComposition => ({
  section_id: "s1",
  viewport_capture_id: "vpc",
  viewport_name: "desktop",
  root_node_id: "n1",
  taxonomy_id: "dig:section.hero",
  category: "hero",
  confidence: 0.9,
  method: "test",
  recipe: [
    { kind: "role", role: "media", node_id: "m", box: { x: 0, y: 0, width: 10, height: 10 } },
    { kind: "gap", gap_px: 24 },
    { kind: "role", role: "heading", node_id: "h", box: { x: 0, y: 20, width: 10, height: 10 } }
  ],
  signature: "brand_hero",
  text_signals: ["Cover"],
  layer: "L2",
  ...overrides
});

test("synthesizeRecipeParity builds flow from desktop sections", () => {
  const { recipe_insights, page_flow } = synthesizeRecipeParity([
    section({ viewport_name: "mobile", signature: "mobile_hero" }),
    section({ signature: "brand_hero" }),
    section({
      section_id: "s2",
      category: "feature",
      signature: "card_grid",
      taxonomy_id: "dig:section.feature"
    })
  ]);
  assert.equal(page_flow[0]?.section_label, "hero · brand_hero");
  assert.equal(page_flow.length, 2);
  assert.equal(recipe_insights[0]?.signature, "brand_hero");
  assert.match(recipe_insights[0]?.interpretation ?? "", /media → heading/);
});

test("sectionsFromCompositionDoc flattens viewport sections", () => {
  const sections = sectionsFromCompositionDoc({
    viewports: [{ sections: [section({ signature: "brand_hero" })] }, { sections: [] }]
  });
  assert.equal(sections.length, 1);
  assert.equal(sections[0]?.signature, "brand_hero");
});

test("normalizeVisualStyleLabel closes noisy LLM names", () => {
  assert.equal(normalizeVisualStyleLabel("high-contrast monochrome base"), "high-contrast monochrome");
  assert.equal(normalizeVisualStyleLabel("corporate sans-serif typography"), "corporate");
  assert.equal(normalizeVisualStyleLabel("subtle soft drop shadows"), "soft drop shadows");
  assert.equal(normalizeVisualStyleLabel("rounded pill-shaped UI elements"), "rounded pills");
});
