import assert from "node:assert/strict";
import test from "node:test";
import { buildDesignFacets, designFacetsHaveSignal } from "../src/design-facets.js";

test("buildDesignFacets from MSQ-like vision_page and bands", () => {
  const facets = buildDesignFacets({
    vision_page: {
      page_type: "marketing_agency_landing_page",
      overall_atmosphere: "high-energy_corporate",
      color_mood: "electric_blue_and_neon_green",
      typography_feel: "bold_sans_serif",
      layout_system: "full-bleed stacks",
      vertical_rhythm: "alternating_full_width_blocks",
      above_fold_job: "Establish high-energy brand identity",
      above_the_fold: "Hero basketball with centered headline",
      category_tags: ["creative", "media", "data", "technology"],
      notable_modules: ["hero_banner", "capabilities_matrix"],
      confidence: 0.85
    },
    bands: [
      { category: "hero", label: "Hero with Navigation" },
      { category: "content", label: "Intro" },
      { category: "feature", label: "Why MSQ" },
      { category: "footer", label: "Footer" }
    ],
    screen_pattern_labels: ["Marketing Home"],
    visual_style_labels: ["Should not override atmosphere"]
  });

  assert.equal(facets.page_type, "marketing_agency_landing_page");
  assert.equal(facets.style, "high-energy_corporate");
  assert.equal(facets.layout, "full-bleed stacks");
  assert.equal(facets.color_mood, "electric_blue_and_neon_green");
  assert.equal(facets.typography, "bold_sans_serif");
  assert.equal(facets.above_fold_job, "Establish high-energy brand identity");
  assert.ok(facets.industry_tags.includes("creative"));
  assert.ok(facets.industry_tags.map((t) => t.toLowerCase()).includes("marketing home"));
  assert.deepEqual(facets.section_categories, ["hero", "content", "feature", "footer"]);
  assert.equal(facets.confidence, 0.85);
  assert.equal(designFacetsHaveSignal(facets), true);
});

test("buildDesignFacets falls back to vertical_rhythm and visual_style", () => {
  const facets = buildDesignFacets({
    vision_page: {
      page_type: "finance_home",
      vertical_rhythm: "hero → products → footer",
      category_tags: []
    },
    visual_style_labels: ["Clean geometric cards"]
  });
  assert.equal(facets.layout, "hero → products → footer");
  assert.equal(facets.style, "Clean geometric cards");
  assert.equal(facets.above_fold_job, null);
});

test("designFacetsHaveSignal false when empty", () => {
  assert.equal(
    designFacetsHaveSignal(
      buildDesignFacets({ vision_page: {}, bands: [], screen_pattern_labels: [] })
    ),
    false
  );
});
