import assert from "node:assert/strict";
import test from "node:test";
import { buildDesignEvidencePrompt } from "../src/llm-design.js";
import {
  clusterSectionCompositions,
  deriveViewportSectionCompositions,
  type SectionComposition
} from "../src/section-composition.js";

test("derives media>heading>cta signature and hero-like category", () => {
  const nodes = [
    { node_id: "main", parent_node_id: null, node_type: "element", tag: "main", rendered: true },
    { node_id: "hero", parent_node_id: "main", node_type: "element", tag: "section", rendered: true, text: "Hero" },
    { node_id: "img", parent_node_id: "hero", node_type: "element", tag: "img", rendered: true },
    { node_id: "h1", parent_node_id: "hero", node_type: "element", tag: "h1", rendered: true, text: "Meet the new Mac" },
    { node_id: "cta", parent_node_id: "hero", node_type: "element", tag: "a", rendered: true, text: "Buy" }
  ];
  const boxes = [
    { node_id: "main", bbox: { x: 0, y: 0, width: 1200, height: 900 } },
    { node_id: "hero", bbox: { x: 0, y: 0, width: 1200, height: 700 } },
    { node_id: "img", bbox: { x: 100, y: 20, width: 1000, height: 320 } },
    { node_id: "h1", bbox: { x: 100, y: 380, width: 600, height: 48 } },
    { node_id: "cta", bbox: { x: 100, y: 460, width: 120, height: 40 } }
  ];
  const sections = deriveViewportSectionCompositions({
    viewport_capture_id: "vpc_desktop",
    viewport_name: "desktop",
    viewport_height: 900,
    nodes,
    boxes,
    styles: []
  });
  assert.ok(sections.length >= 1);
  const hero = sections.find((section) => section.root_node_id === "hero") ?? sections[0]!;
  assert.equal(hero.signature, "media>heading>cta");
  assert.equal(hero.category, "hero");
  assert.match(hero.taxonomy_id, /hero/);
  assert.ok(hero.recipe.some((step) => step.kind === "gap" && step.gap_px >= 0));
  assert.ok(hero.text_signals.some((signal) => /Mac|Buy/i.test(signal)));
});

test("clusters recurring signatures across viewports", () => {
  const base: Omit<SectionComposition, "section_id" | "viewport_capture_id" | "viewport_name"> = {
    root_node_id: "hero",
    taxonomy_id: "dig:section.hero_media_above",
    category: "hero",
    confidence: 0.86,
    method: "test",
    recipe: [
      { kind: "role", role: "media", node_id: "img", box: { x: 0, y: 0, width: 10, height: 10 } },
      { kind: "gap", gap_px: 40 },
      { kind: "role", role: "heading", node_id: "h1", box: { x: 0, y: 50, width: 10, height: 10 } },
      { kind: "gap", gap_px: 16 },
      { kind: "role", role: "cta", node_id: "a", box: { x: 0, y: 80, width: 10, height: 10 } }
    ],
    signature: "media>heading>cta",
    text_signals: ["Meet Mac"],
    layer: "L2"
  };
  const clusters = clusterSectionCompositions([
    { ...base, section_id: "s1", viewport_capture_id: "v1", viewport_name: "mobile" },
    { ...base, section_id: "s2", viewport_capture_id: "v2", viewport_name: "desktop" }
  ]);
  assert.equal(clusters[0]?.count, 2);
  assert.deepEqual(clusters[0]?.viewport_names.sort(), ["desktop", "mobile"]);
});

test("LLM evidence prompt includes section composition signatures", () => {
  const prompt = buildDesignEvidencePrompt({
    canonical_url: "https://example.com/",
    ontologies: [],
    visual_language: [],
    visual_hypotheses: [],
    logical_element_count: 10,
    transformation_count: 2,
    section_compositions: [
      {
        section_id: "sec_1",
        viewport_capture_id: "vpc",
        viewport_name: "desktop",
        root_node_id: "hero",
        taxonomy_id: "dig:section.hero_media_above",
        category: "hero",
        confidence: 0.9,
        method: "test",
        recipe: [
          { kind: "role", role: "media_large", node_id: "img", box: { x: 0, y: 0, width: 1, height: 1 } },
          { kind: "gap", gap_px: 48 },
          { kind: "role", role: "heading", node_id: "h1", text_preview: "Headline", box: { x: 0, y: 60, width: 1, height: 1 } },
          { kind: "gap", gap_px: 16 },
          { kind: "role", role: "cta", node_id: "a", text_preview: "Buy", box: { x: 0, y: 90, width: 1, height: 1 } }
        ],
        signature: "media>heading>cta",
        text_signals: ["Headline", "Buy"],
        layer: "L2"
      }
    ],
    section_clusters: [
      {
        signature: "media>heading>cta",
        category: "hero",
        taxonomy_id: "dig:section.hero_media_above",
        count: 3,
        viewport_names: ["mobile", "tablet", "desktop"],
        example_text_signals: ["Headline"]
      }
    ]
  });
  assert.match(prompt, /section_compositions/);
  assert.match(prompt, /media>heading>cta/);
  assert.match(prompt, /recurring_section_recipes/);
  assert.doesNotThrow(() => JSON.parse(prompt));
});
