import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDesignFacets,
  designFacetFilterCatalog,
  designFacetsHaveSignal,
  normalizeFacetFilterValue,
  normalizeIndustryTags,
  normalizeLayoutLabel,
  normalizeStyleLabel,
  screenFacetsMatch,
  STYLE_VOCAB,
  summarizeDesignFacets
} from "../src/design-facets.js";
import { libraryScreenFacetQueryKeys } from "../src/runtime-paths.js";

test("normalizeIndustryTags keeps sector labels and drops campaign noise", () => {
  assert.deepEqual(
    normalizeIndustryTags(["creative", "cannes lions", "media", "sustainability", "ai technology"]),
    ["marketing_agency", "media", "tech"]
  );
  assert.deepEqual(normalizeIndustryTags(["Automotive landing"]), ["automotive"]);
  assert.deepEqual(normalizeIndustryTags(["hero_banner", "ticker"]), []);
});

test("normalizeStyleLabel and layout map prose onto vocab", () => {
  assert.equal(normalizeStyleLabel("high-energy_corporate"), "high-energy");
  assert.equal(normalizeStyleLabel("dark luxury night shoot"), "luxury-dark");
  assert.equal(normalizeLayoutLabel("full-bleed stacks"), "full-bleed stacks");
  assert.equal(normalizeLayoutLabel("alternating full width blocks"), "full-bleed stacks");
});

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
      category_tags: ["creative", "media", "cannes_lions", "sustainability"],
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
  assert.equal(facets.style, "high-energy");
  assert.equal(facets.layout, "full-bleed stacks");
  assert.deepEqual(facets.industry_tags, ["marketing_agency", "media"]);
  assert.ok(!facets.industry_tags.includes("cannes_lions"));
  assert.deepEqual(facets.section_categories, ["hero", "content", "feature", "footer"]);
  assert.equal(facets.confidence, 0.85);
  assert.equal(designFacetsHaveSignal(facets), true);
  assert.equal(facets.facets_version, "0.3.0");
  assert.ok(facets.look_contract?.avoid.some((item) => item.includes("glassmorphism")));
  assert.ok(facets.look_contract?.avoid.includes("card grid in the hero"));
});

test("buildDesignFacets falls back to vertical_rhythm and visual_style", () => {
  const facets = buildDesignFacets({
    vision_page: {
      page_type: "finance_home",
      vertical_rhythm: "hero → products → footer card grid",
      category_tags: []
    },
    visual_style_labels: ["Clean geometric cards"]
  });
  assert.equal(facets.layout, "card grid");
  assert.equal(facets.industry_tags.includes("finance"), true);
  assert.equal(facets.style, null);
});

test("buildDesignFacets attaches measured look_contract from tokens", () => {
  const facets = buildDesignFacets({
    vision_page: {
      page_type: "marketing_agency_landing_page",
      overall_atmosphere: "high-energy",
      layout_system: "full-bleed stacks",
      spacing_feel: "uneven cinematic gaps"
    },
    tokens: {
      schema_version: "0.1.0",
      design_tokens_version: "0.1.0",
      generated_at: "2026-08-17T00:00:00.000Z",
      source: {
        viewport_name: "desktop",
        viewport_capture_id: "vpc",
        visual_language_path: "derived/visual-language.json"
      },
      roles: {
        colors: [
          { hex: "#050505", hex_rgb: "#050505", role: "bg", occurrences: 1, source_roles: ["background"] }
        ],
        typography: [],
        radii: [{ role: "md", value_px: 2, occurrences: 1 }],
        motion: { animated: false, properties: [], runtime_instances: 0 }
      },
      recipes: {
        primary_cta: { style: "outline", fill: null, ink: "#fff", radius_px: 2, notes: "" },
        scrim: { style: "none", stops: [], notes: "" },
        surface: { bg: "#050505", ink: "#fff", notes: "" }
      },
      dtcg: {}
    }
  });
  assert.equal(facets.look_contract?.colors.bg, "#050505");
  assert.equal(facets.look_contract?.cta_chrome, "outline");
  assert.equal(facets.look_contract?.density, "uneven");
  assert.equal(designFacetsHaveSignal(facets), true);
});

test("designFacetsHaveSignal false when empty", () => {
  assert.equal(
    designFacetsHaveSignal(
      buildDesignFacets({ vision_page: {}, bands: [], screen_pattern_labels: [] })
    ),
    false
  );
});

test("screenFacetsMatch ANDs style layout industry and drops unfaceted rows", () => {
  const summary = summarizeDesignFacets(
    buildDesignFacets({
      vision_page: {
        overall_atmosphere: "high-energy_corporate",
        layout_system: "full-bleed stacks",
        category_tags: ["media"]
      }
    })
  );
  assert.equal(screenFacetsMatch(summary, {}), true);
  assert.equal(screenFacetsMatch(summary, { style: "high-energy" }), true);
  assert.equal(screenFacetsMatch(summary, { layout: "full-bleed stacks", industry: "media" }), true);
  assert.equal(screenFacetsMatch(summary, { style: "minimal" }), false);
  assert.equal(screenFacetsMatch(null, { style: "high-energy" }), false);
  assert.equal(screenFacetsMatch(null, {}), true);
  assert.equal(normalizeFacetFilterValue("high-energy", STYLE_VOCAB), "high-energy");
  assert.equal(normalizeFacetFilterValue("nope", STYLE_VOCAB), null);
  assert.ok(designFacetFilterCatalog().style.includes("high-energy"));
  assert.deepEqual(libraryScreenFacetQueryKeys(), {
    style: "style",
    layout: "layout",
    industry: "industry"
  });
});
