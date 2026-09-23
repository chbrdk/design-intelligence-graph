import assert from "node:assert/strict";
import test from "node:test";
import { assemblePromptPackForCaptureRun } from "../src/capture-prompt-pack.js";

test("assemblePromptPackForCaptureRun throws capture_not_found", async () => {
  const client = {
    async query() {
      return { rows: [] };
    }
  };
  await assert.rejects(
    () => assemblePromptPackForCaptureRun(client, "cap_missing", {}),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "capture_not_found");
      assert.equal((error as Error & { status?: number }).status, 404);
      return true;
    }
  );
});

test("assemblePromptPackForCaptureRun attaches graphic_craft_brief for graphic packages", async () => {
  const { mkdir, mkdtemp, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "dig-capture-pack-craft-"));
  await mkdir(join(root, "derived"), { recursive: true });
  await writeFile(
    join(root, "derived/composition-contract.json"),
    JSON.stringify({
      schema_version: "0.1.0",
      composition_contract_version: "0.1.0",
      focal: "face",
      hierarchy: ["claim"],
      negativeSpace: "airy",
      typeRoles: {},
      colorAxes: { dominant: "#ff7f33" },
      marginBleed: {},
      layoutFamily: "full-bleed-product",
      avoid: ["busy-center"],
      ctaRole: "absent"
    }),
    "utf8"
  );
  await writeFile(
    join(root, "derived/graphic-craft-metrics.json"),
    JSON.stringify({
      schema_version: "0.1.0",
      graphic_craft_metrics_version: "0.3.0",
      generated_at: new Date().toISOString(),
      source_screenshot: "artboard.webp",
      model: "test",
      status: "complete",
      metric_count: 300,
      filled_count: 12,
      confidence: 0.88,
      metrics: {
        "comp.layout_family": "full-bleed-product",
        "comp.focal_role": "face",
        "color.dominant_hex": "#ff7f33",
        "tone.editorial": 0.8,
        "risk.busy_center": 0.6,
        "prod.primary_claim_guess": "TRACK NUMBER 09"
      },
      measured: {},
      groups: { composition: 2, color: 1, tone: 1, risk: 1 }
    }),
    "utf8"
  );

  const client = {
    async query(sql: string) {
      if (sql.includes("FROM captures WHERE capture_run_id")) {
        return {
          rows: [
            {
              package_path: root,
              platform_project_id: null,
              asset_kind: "campaign_keyvisual",
              composition_contract: null
            }
          ]
        };
      }
      return { rows: [] };
    }
  };

  const pack = await assemblePromptPackForCaptureRun(client, "cap_graphic_1", {
    output_contract: "graphic"
  });
  assert.equal(pack.graphic_craft_brief?.literals["comp.layout_family"], "full-bleed-product");
  assert.equal(pack.graphic_craft_brief?.literals["color.dominant_hex"], "#ff7f33");
  assert.match(pack.ask, /graphic_craft_brief/);
  assert.ok(pack.rules.some((line) => /full-bleed-product/i.test(line)));
});
