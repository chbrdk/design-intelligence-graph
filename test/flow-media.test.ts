import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { projectFlowGraphToInteractive } from "../src/flow-api-project.js";
import { assembleFlowGraph } from "../src/flow-assemble.js";
import { indexFlowGraph, resolveFlowScreenMedia } from "../src/flow-library.js";

test("interactive projector fills image_ref from media map", () => {
  const graph = {
    flow_id: "flow_media",
    app_scope_id: "app_x",
    screens: [
      {
        flow_screen_id: "fs_a",
        order: 0,
        capture_run_id: "run_a",
        primary_url: "https://example.com/"
      }
    ],
    edges: []
  };
  const projected = projectFlowGraphToInteractive(graph, {
    fs_a: {
      image_ref: "/api/library/media?capture_run_id=run_a&path=viewports/desktop/screenshots/full-page.webp",
      primary_url: "https://example.com/"
    }
  });
  assert.equal(
    projected.steps[0]!.image_ref,
    "/api/library/media?capture_run_id=run_a&path=viewports/desktop/screenshots/full-page.webp"
  );
});

test("resolveFlowScreenMedia prefers desktop full-page screenshot", async () => {
  const client = {
    async query(_sql: string, values?: unknown[]) {
      assert.deepEqual(values?.[0], ["run_a"]);
      return {
        rows: [
          {
            capture_run_id: "run_a",
            name: "mobile",
            settled_screenshot_path: "viewports/mobile/screenshots/settled.webp",
            full_page_screenshot_path: null
          },
          {
            capture_run_id: "run_a",
            name: "desktop",
            settled_screenshot_path: "viewports/desktop/screenshots/settled.webp",
            full_page_screenshot_path: "viewports/desktop/screenshots/full-page.webp"
          }
        ] as Record<string, unknown>[]
      };
    }
  };
  const media = await resolveFlowScreenMedia(client, [
    { flow_screen_id: "fs_a", capture_run_id: "run_a", primary_url: "https://example.com/" }
  ]);
  assert.match(media.fs_a!.image_ref || "", /full-page\.webp/);
  assert.match(media.fs_a!.image_ref || "", /capture_run_id=run_a/);
});

test("indexFlowGraph writes JSON under indexes/flows", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dig-flow-index-"));
  const previous = process.env.DIG_INDEXES_DIR;
  process.env.DIG_INDEXES_DIR = dir;
  try {
    // indexesDirectory reads paths.json runtime — override via cwd indexes is hard.
    // Call write through indexFlowGraph then read from default indexes if env unused.
    const graph = assembleFlowGraph({
      flowId: "flow_index_test_unique",
      appScopeId: "app_t",
      screens: [{ capture_run_id: "run_1", flow_screen_id: "fs_1", order: 0 }],
      edges: [],
      flow_actions: [
        { taxonomy_id: "dig:flow.unknown", confidence: 0.4, method: "no_match", layer: "L2" }
      ]
    });
    const path = await indexFlowGraph(graph);
    const raw = await readFile(path, "utf8");
    assert.match(raw, /flow_index_test_unique/);
    await rm(path, { force: true });
  } finally {
    if (previous === undefined) delete process.env.DIG_INDEXES_DIR;
    else process.env.DIG_INDEXES_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
