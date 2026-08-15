import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSectionLookEvidence,
  parseSectionLookResponse,
  selectSectionsForLook,
  type SectionLookDescription
} from "../src/section-look.js";
import type { SectionComposition } from "../src/section-composition.js";

function sampleSection(overrides: Partial<SectionComposition> = {}): SectionComposition {
  return {
    section_id: "sec_hero",
    viewport_capture_id: "vpc_1",
    viewport_name: "desktop",
    root_node_id: "node_root",
    taxonomy_id: "dig:section.hero_media_above",
    category: "hero",
    confidence: 0.9,
    method: "test",
    recipe: [
      {
        kind: "role",
        role: "media_large",
        node_id: "node_media",
        box: { x: 0, y: 0, width: 1440, height: 700 }
      },
      { kind: "gap", gap_px: 24 },
      {
        kind: "role",
        role: "heading",
        node_id: "node_heading",
        text_preview: "Think different",
        box: { x: 520, y: 280, width: 400, height: 48 }
      },
      {
        kind: "role",
        role: "cta",
        node_id: "node_cta",
        text_preview: "Buy",
        box: { x: 640, y: 360, width: 160, height: 44 }
      }
    ],
    signature: "media>heading>cta",
    text_signals: ["Think different", "Buy"],
    layer: "L2",
    ...overrides
  };
}

test("selectSectionsForLook prefers hero and caps count", () => {
  const sections = [
    sampleSection({ section_id: "a", category: "footer", confidence: 0.5 }),
    sampleSection({ section_id: "b", category: "hero", confidence: 0.7 }),
    sampleSection({ section_id: "c", category: "pricing", confidence: 0.8, signature: "heading>cta" })
  ];
  const picked = selectSectionsForLook(sections, 2);
  assert.equal(picked.length, 2);
  assert.equal(picked[0]?.section_id, "b");
});

test("selectSectionsForLook diversifies categories and signatures", () => {
  const sections = [
    sampleSection({
      section_id: "m1",
      category: "social_proof",
      signature: "media",
      confidence: 0.9,
      recipe: [{ kind: "role", role: "media", node_id: "n1", box: { x: 0, y: 0, width: 10, height: 10 } }]
    }),
    sampleSection({
      section_id: "m2",
      category: "social_proof",
      signature: "media",
      confidence: 0.89,
      recipe: [{ kind: "role", role: "media", node_id: "n2", box: { x: 0, y: 0, width: 10, height: 10 } }]
    }),
    sampleSection({
      section_id: "m3",
      category: "social_proof",
      signature: "media",
      confidence: 0.88,
      recipe: [{ kind: "role", role: "media", node_id: "n3", box: { x: 0, y: 0, width: 10, height: 10 } }]
    }),
    sampleSection({
      section_id: "h1",
      category: "hero",
      signature: "media>heading>cta",
      confidence: 0.7
    }),
    sampleSection({
      section_id: "f1",
      category: "feature",
      signature: "heading>list",
      confidence: 0.75,
      recipe: [
        { kind: "role", role: "heading", node_id: "nh", box: { x: 0, y: 0, width: 10, height: 10 } },
        { kind: "role", role: "list", node_id: "nl", box: { x: 0, y: 20, width: 10, height: 10 } }
      ]
    })
  ];
  const picked = selectSectionsForLook(sections, 4);
  const categories = new Set(picked.map((section) => section.category));
  assert.ok(categories.has("hero"));
  assert.ok(categories.has("feature"));
  assert.ok(picked.filter((section) => section.signature === "media").length <= 1);
});

test("buildSectionLookEvidence includes allowlisted CSS and alignment hints", () => {
  const evidence = JSON.parse(
    buildSectionLookEvidence(sampleSection(), {
      node_root: { "background-image": "linear-gradient(black, transparent)", "box-shadow": "none" },
      node_media: { "background-image": "url(hero.jpg)", "object-fit": "cover" },
      node_heading: { "font-style": "italic", "text-align": "center", "font-weight": "600" },
      node_cta: { "box-shadow": "0 8px 24px rgba(0,0,0,.25)", "text-align": "center" }
    })
  );
  assert.equal(evidence.section.signature, "media>heading>cta");
  assert.match(evidence.section.root_styles["background-image"], /gradient/i);
  const heading = evidence.section.roles.find((role: { role: string }) => role.role === "heading");
  assert.equal(heading.styles["font-style"], "italic");
  assert.equal(heading.alignment_hint, "center");
});

test("parseSectionLookResponse keeps compositional fields", () => {
  const raw = JSON.stringify({
    section_id: "sec_hero",
    signature: "media>heading>cta",
    category: "hero",
    stack_summary: "full-bleed media → centered headline → CTA",
    background: { kind: "image", treatment: "photo with dark gradient scrim" },
    overlay: { present: true, kind: "gradient", notes: "scrim over lower half" },
    shadows: { present: true, targets: ["cta"], notes: "soft drop shadow" },
    typography_emphasis: ["italic"],
    alignment: { text: "center", cta: "center" },
    media: { role: "background", object_fit: "cover" },
    look_summary: "Minimalist hero with full-bleed photo, gradient overlay, italic highlight, centered CTA.",
    interaction_summary: "Primary buy CTA centered under headline.",
    confidence: 0.88,
    evidence_refs: ["node_cta", "box-shadow"]
  });
  const parsed = parseSectionLookResponse(raw, {
    section_id: "sec_hero",
    signature: "media>heading>cta",
    category: "hero"
  }) as SectionLookDescription;
  assert.equal(parsed.overlay?.kind, "gradient");
  assert.deepEqual(parsed.typography_emphasis, ["italic"]);
  assert.match(parsed.look_summary, /gradient/i);
});
