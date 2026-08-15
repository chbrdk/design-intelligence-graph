import assert from "node:assert/strict";
import test from "node:test";
import { hashEmbedText, vectorLiteral } from "../src/embeddings.js";
import { buildFigmaExport } from "../src/figma-export.js";

test("hashEmbedText is deterministic and normalized", () => {
  const a = hashEmbedText("hero media heading cta", 384);
  const b = hashEmbedText("hero media heading cta", 384);
  assert.equal(a.length, 384);
  assert.deepEqual(a, b);
  const norm = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(norm - 1) < 1e-6);
  assert.match(vectorLiteral(a.slice(0, 3)), /^\[/);
});

test("buildFigmaExport creates frames and section rectangles", () => {
  const doc = buildFigmaExport({
    manifest: {
      capture_run_id: "cap_test",
      canonical_url: "https://example.com/",
      site: { domain: "example.com" },
      viewport_captures: [
        {
          viewport_capture_id: "vpc_1",
          name: "desktop",
          viewport: { width: 1440, height: 900 },
          status: "complete",
          node_count: 1,
          title: "Example",
          artifacts: {}
        }
      ]
    } as never,
    sections: {
      viewports: [
        {
          viewport_capture_id: "vpc_1",
          viewport_name: "desktop",
          sections: [
            {
              section_id: "sec_1",
              viewport_capture_id: "vpc_1",
              viewport_name: "desktop",
              root_node_id: "n1",
              taxonomy_id: "dig:section.hero_media_above",
              category: "hero",
              signature: "media>heading>cta",
              confidence: 0.9,
              method: "test",
              recipe: [
                { kind: "role", role: "media", node_id: "m1", box: { x: 0, y: 0, width: 100, height: 50 } },
                { kind: "role", role: "heading", node_id: "h1", box: { x: 0, y: 60, width: 80, height: 20 } }
              ],
              text_signals: ["Hello"],
              layer: "L2"
            }
          ]
        }
      ],
      clusters: [],
      schema_version: "0.1.0",
      section_composition_version: "0.1.0",
      generated_at: new Date().toISOString()
    },
    flowLabels: ["Hero"]
  });
  assert.equal(doc.document.type, "DOCUMENT");
  assert.equal(doc.document.children?.[0]?.type, "FRAME");
  assert.ok((doc.document.children?.[0]?.children?.length ?? 0) >= 3);
});
