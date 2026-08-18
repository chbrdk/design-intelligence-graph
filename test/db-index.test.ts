import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { indexCapturePackageToDatabase } from "../src/db-index.js";

test("db index is a soft no-op without database", async () => {
  const root = await mkdtemp(join(tmpdir(), "dig-db-index-"));
  await writeFile(
    join(root, "manifest.json"),
    JSON.stringify({
      capture_run_id: "cap_deadbeefdeadbeefdeadbeefdeadbeef",
      requested_url: "https://example.com",
      canonical_url: "https://example.com/",
      status: "complete",
      site: { domain: "example.com" },
      page: { route: "/" },
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      run_artifacts: {},
      viewport_captures: []
    })
  );
  const result = await indexCapturePackageToDatabase(root, null);
  assert.equal(result.indexed, false);
  assert.equal(result.reason, "database_unavailable");
});

test("db index upserts capture metadata through injectable client", async () => {
  const root = await mkdtemp(join(tmpdir(), "dig-db-index-"));
  await mkdir(join(root, "derived"), { recursive: true });
  const captureRunId = "cap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  await writeFile(
    join(root, "manifest.json"),
    JSON.stringify({
      capture_run_id: captureRunId,
      requested_url: "https://example.com",
      canonical_url: "https://example.com/",
      status: "complete",
      site: { domain: "example.com" },
      page: { route: "/" },
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      run_artifacts: {
        section_compositions: { path: "derived/section-compositions.json" },
        llm_design: { path: "derived/llm-design.json" },
        quality: { path: "quality.json" }
      },
      viewport_captures: [
        {
          viewport_capture_id: "vpc_1",
          name: "desktop",
          status: "complete",
          viewport: { width: 1440, height: 900 },
          node_count: 10,
          title: "Example",
          artifacts: {
            viewport_screenshot: { path: "viewports/desktop/screenshots/settled.webp" }
          }
        }
      ]
    })
  );
  await writeFile(join(root, "quality.json"), JSON.stringify({ overall: 0.9, rating: "good" }));
  await writeFile(
    join(root, "derived/section-compositions.json"),
    JSON.stringify({
      viewports: [
        {
          viewport_capture_id: "vpc_1",
          viewport_name: "desktop",
          sections: [
            {
              section_id: "sec_1",
              viewport_capture_id: "vpc_1",
              viewport_name: "desktop",
              root_node_id: "hero",
              taxonomy_id: "dig:section.hero_media_above",
              category: "hero",
              signature: "media>heading>cta",
              confidence: 0.9,
              method: "test",
              recipe: [
                {
                  kind: "role",
                  role: "media",
                  node_id: "m1",
                  box: { x: 10, y: 20, width: 100, height: 80 }
                },
                {
                  kind: "role",
                  role: "heading",
                  node_id: "h1",
                  box: { x: 10, y: 110, width: 200, height: 40 }
                }
              ],
              text_signals: ["Hello"]
            }
          ]
        }
      ]
    })
  );
  await writeFile(
    join(root, "derived/llm-design.json"),
    JSON.stringify({
      model: "gemma",
      base_url: "http://local/v1",
      status: "complete",
      analysis_mode: "staged",
      design_summary: "Test",
      hypotheses: [],
      generated_at: new Date().toISOString(),
      mobbin: {
        screen_patterns: [{ name: "Marketing Home", confidence: 0.8, evidence_refs: [] }],
        ui_elements: [{ name: "Button", confidence: 0.9, evidence_refs: [] }],
        recipe_insights: [],
        page_flow: [],
        visual_style_labels: []
      }
    })
  );

  const statements: string[] = [];
  const client = {
    async query(sql: string) {
      statements.push(String(sql).replace(/\s+/g, " ").trim());
      if (/schema_migrations/i.test(sql) && /SELECT/i.test(sql)) {
        return {
          rows: [
            { id: "001_library_schema.sql" },
            { id: "002_flows_hotspots_collections.sql" },
            { id: "003_embeddings_vector.sql" }
          ]
        };
      }
      return { rows: [] };
    }
  };

  const result = await indexCapturePackageToDatabase(root, client);
  assert.equal(result.indexed, true);
  assert.ok(statements.some((sql) => /INSERT INTO captures/i.test(sql)));
  assert.ok(statements.some((sql) => /INSERT INTO viewports/i.test(sql)));
  assert.ok(statements.some((sql) => /INSERT INTO sections/i.test(sql)));
  assert.ok(statements.some((sql) => /root_box/i.test(sql)));
  assert.ok(statements.some((sql) => /INSERT INTO llm_analyses/i.test(sql)));
  assert.ok(statements.some((sql) => /screen_pattern/i.test(sql)));
  assert.ok(statements.some((sql) => /recipe_insight/i.test(sql)));
  assert.ok(statements.some((sql) => /page_flow/i.test(sql)));
});

test("deriveRootBox unions role boxes", async () => {
  const { deriveRootBox } = await import("../src/db-index.js");
  const box = deriveRootBox([
    { kind: "role", role: "media", node_id: "a", box: { x: 0, y: 0, width: 100, height: 50 } },
    { kind: "gap", gap_px: 12 },
    { kind: "role", role: "heading", node_id: "b", box: { x: 10, y: 60, width: 80, height: 20 } }
  ]);
  assert.deepEqual(box, { x: 0, y: 0, width: 100, height: 80 });
});
