import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveStructureSpine,
  formatStructureSpineBriefSection,
  isThinWrapperSection
} from "../src/structure-spine.js";
import { buildRebuildBriefMarkdown } from "../src/rebuild-brief.js";
import type { SectionComposition } from "../src/section-composition.js";

function section(partial: Partial<SectionComposition> & Pick<SectionComposition, "section_id" | "signature" | "category">): SectionComposition {
  return {
    viewport_capture_id: "vp",
    viewport_name: "desktop",
    root_node_id: "n1",
    taxonomy_id: "dig:section.content_block",
    confidence: 0.9,
    method: "catalog_composition_hint",
    recipe: [
      {
        kind: "role",
        role: "body",
        node_id: "n1",
        box: { x: 0, y: partial.recipe?.[0]?.box?.y ?? 100, width: 400, height: partial.recipe?.[0]?.box?.height ?? 200 }
      }
    ],
    text_signals: [],
    layer: "L2",
    ...partial
  };
}

test("isThinWrapperSection demotes bare commerce body without cues", () => {
  const thin = section({
    section_id: "a",
    signature: "body",
    category: "commerce",
    text_signals: ["x"],
    method: "catalog_composition_hint",
    confidence: 0.9
  });
  assert.equal(isThinWrapperSection(thin).demote, true);

  const rich = section({
    section_id: "b",
    signature: "body",
    category: "commerce",
    text_signals: ["Konfigurator entdecken"],
    recipe: [{ kind: "role", role: "body", node_id: "n", box: { x: 0, y: 400, width: 400, height: 300 } }]
  });
  assert.equal(isThinWrapperSection(rich).demote, false);
});

test("deriveStructureSpine promotes hero and demotes wrapper bodies", () => {
  const spine = deriveStructureSpine({
    viewportHeight: 900,
    viewportName: "desktop",
    viewportCaptureId: "vp",
    sections: [
      section({
        section_id: "hero",
        signature: "media>heading>cta",
        category: "hero",
        confidence: 0.86,
        method: "hero_position_heuristic",
        text_signals: ["Flachbau RS"],
        recipe: [
          { kind: "role", role: "media", node_id: "m", box: { x: 0, y: 0, width: 1200, height: 800 } },
          { kind: "role", role: "heading", node_id: "h", box: { x: 40, y: 600, width: 400, height: 40 } },
          { kind: "role", role: "cta", node_id: "c", box: { x: 40, y: 660, width: 160, height: 40 } }
        ]
      }),
      section({
        section_id: "junk1",
        signature: "body",
        category: "commerce",
        text_signals: ["."],
        recipe: [{ kind: "role", role: "body", node_id: "j", box: { x: 0, y: 900, width: 400, height: 80 } }]
      }),
      section({
        section_id: "feature",
        signature: "media>heading",
        category: "feature",
        confidence: 0.78,
        method: "media_heading_cta_heuristic",
        text_signals: ["Macan GTS"],
        recipe: [
          { kind: "role", role: "media", node_id: "m2", box: { x: 0, y: 1000, width: 600, height: 400 } },
          { kind: "role", role: "heading", node_id: "h2", box: { x: 0, y: 1400, width: 300, height: 40 } }
        ]
      })
    ],
    looks: [
      {
        section_id: "hero",
        signature: "media>heading>cta",
        category: "hero",
        stack_summary: "media → heading → cta",
        look_summary: "Dark hero. Vision: white car night scene with scrim",
        confidence: 0.8,
        evidence_refs: []
      }
    ]
  });

  assert.ok(spine.bands.some((band) => band.section_id === "hero"));
  assert.ok(!spine.bands.some((band) => band.section_id === "junk1"));
  assert.ok(spine.demoted_count >= 1);
  assert.match(spine.page_arc, /hero/);
  assert.ok(spine.above_fold.ingredients.includes("media"));
  assert.ok(spine.above_fold.ingredients.includes("headline"));
  assert.match(spine.bands[0]!.beat, /car|scrim|hero/i);
  assert.match(formatStructureSpineBriefSection(spine), /Structure spine/);
});

test("rebuild brief includes structure spine before page reading", () => {
  const spine = deriveStructureSpine({
    viewportHeight: 900,
    viewportName: "desktop",
    viewportCaptureId: "vp",
    sections: [
      section({
        section_id: "hero",
        signature: "media>heading>cta",
        category: "hero",
        confidence: 0.86,
        method: "hero_position_heuristic",
        text_signals: ["Headline"],
        recipe: [
          { kind: "role", role: "media", node_id: "m", box: { x: 0, y: 0, width: 800, height: 700 } },
          { kind: "role", role: "heading", node_id: "h", box: { x: 0, y: 500, width: 200, height: 40 } },
          { kind: "role", role: "cta", node_id: "c", box: { x: 0, y: 560, width: 120, height: 36 } }
        ]
      })
    ]
  });
  const md = buildRebuildBriefMarkdown({
    captureRunId: "cap_x",
    url: "https://example.com",
    structureSpine: spine,
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
  assert.match(md, /## Structure spine/);
  assert.ok(md.indexOf("## Structure spine") < md.indexOf("## Page reading"));
});
