import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveDesignTokens,
  formatDesignTokensBriefSection,
  guessColorRole
} from "../src/design-tokens.js";
import { buildRebuildBriefMarkdown } from "../src/rebuild-brief.js";
import type { VisualLanguageViewport } from "../src/visual-language.js";

function fixtureViewport(): VisualLanguageViewport {
  return {
    viewport_capture_id: "vp_desktop",
    viewport_name: "desktop",
    layer: "L2",
    typography: [
      {
        font_family: '"Porsche Next", "Arial Narrow", Arial, sans-serif',
        font_size: "16px",
        font_weight: "400",
        line_height: "24px",
        letter_spacing: "normal",
        occurrences: 1000,
        node_ids: ["a"]
      },
      {
        font_family: '"Porsche Next", Arial, sans-serif',
        font_size: "48px",
        font_weight: "600",
        line_height: "52px",
        letter_spacing: "normal",
        occurrences: 4,
        node_ids: ["b"]
      },
      {
        font_family: '"Porsche Next", Arial, sans-serif',
        font_size: "14px",
        font_weight: "400",
        line_height: "20px",
        letter_spacing: "normal",
        occurrences: 40,
        node_ids: ["c"]
      }
    ],
    color_palette: [
      {
        rgba: { r: 0, g: 0, b: 0, a: 1 },
        hex: "#000000ff",
        occurrences: 3000,
        properties: ["background-color", "color"],
        node_ids: ["n1"],
        roles: ["background", "foreground"]
      },
      {
        rgba: { r: 250, g: 251, b: 255, a: 1 },
        hex: "#fafbffff",
        occurrences: 1500,
        properties: ["color"],
        node_ids: ["n2"],
        roles: ["foreground"]
      },
      {
        rgba: { r: 158, g: 158, b: 255, a: 1 },
        hex: "#9e9effff",
        occurrences: 170,
        properties: ["border-color", "color"],
        node_ids: ["n3"],
        roles: ["border", "foreground"]
      },
      {
        rgba: { r: 0, g: 0, b: 0, a: 0 },
        hex: "#00000000",
        occurrences: 1000,
        properties: ["background-color"],
        node_ids: ["n4"],
        roles: ["background"]
      }
    ],
    shape: {
      border_radius_values: [
        { value: "24px", occurrences: 120 },
        { value: "12px", occurrences: 80 },
        { value: "8px", occurrences: 24 },
        { value: "3.35544e+07px", occurrences: 92 },
        { value: "50%", occurrences: 4 }
      ],
      shadow_values: [],
      border_width_values: []
    },
    imagery: { total: 10, by_type: { img: 10 }, intrinsic_dimensioned: 8 },
    composition: { visible_node_count: 100, estimated_box_coverage: 0.8, document_aspect_ratio: 0.5 },
    motion: {
      total: 10,
      declarations: 5,
      runtime_instances: 5,
      by_source: { css_animation: 5 },
      compositor_friendly_runtime_instances: 4,
      animated_properties: ["opacity", "transform"]
    },
    provenance: { method: "computed_styles_and_measured_assets", confidence: 1 }
  };
}

test("guessColorRole maps dark bg and light ink", () => {
  assert.equal(
    guessColorRole({ hex: "#000000ff", roles: ["background"], occurrences: 10 }, {}),
    "bg"
  );
  assert.equal(
    guessColorRole({ hex: "#ffffffff", roles: ["foreground"], occurrences: 10 }, { bg: "#000000" }),
    "ink"
  );
  assert.equal(
    guessColorRole({ hex: "#00000000", roles: ["background"], occurrences: 10 }, {}),
    "transparent"
  );
});

test("deriveDesignTokens builds roles recipes and dtcg primitives", () => {
  const doc = deriveDesignTokens([fixtureViewport()]);
  assert.ok(doc);
  assert.equal(doc.source.viewport_name, "desktop");
  assert.ok(doc.roles.colors.some((item) => item.role === "bg"));
  assert.ok(doc.roles.colors.some((item) => item.role === "ink"));
  assert.ok(!doc.roles.colors.some((item) => item.hex.endsWith("00") && item.role !== "transparent"));
  assert.ok(doc.roles.typography.some((item) => item.role === "body" && item.family === "Porsche Next"));
  assert.ok(doc.roles.typography.some((item) => item.role === "display" && item.size_px === 48));
  assert.ok(doc.roles.radii.some((item) => item.value_px === 12 || item.value_px === 24));
  assert.ok(!doc.roles.radii.some((item) => item.value_px > 100000));
  assert.equal(doc.recipes.primary_cta.style, "outline");
  assert.equal(doc.recipes.scrim.style, "dark_gradient");
  assert.equal((doc.dtcg.fontFamily as { brand: { $type: string } }).brand.$type, "fontFamily");
});

test("rebuild brief leads with measured tokens", () => {
  const tokens = deriveDesignTokens([fixtureViewport()]);
  assert.ok(tokens);
  const md = buildRebuildBriefMarkdown({
    captureRunId: "cap_x",
    url: "https://example.com",
    designTokens: tokens,
    llm: {
      schema_version: "0.1.0",
      llm_design_version: "0.2.0",
      generated_at: new Date().toISOString(),
      model: "test",
      base_url: "http://local",
      status: "complete",
      design_summary: "Marketing homepage with media-led hero storytelling for rebuild tests.",
      hypotheses: [],
      mobbin: {
        screen_patterns: [],
        ui_elements: [],
        recipe_insights: [],
        page_flow: [],
        visual_style_labels: [],
        section_descriptions: []
      }
    }
  });
  assert.match(md, /## Design tokens \(measured\)/);
  assert.match(md, /Porsche Next/);
  assert.ok(md.indexOf("## Design tokens") < md.indexOf("## Page reading"));
  assert.match(formatDesignTokensBriefSection(tokens), /CTA recipe/);
});
