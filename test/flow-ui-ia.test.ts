import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { flowFixturesDir } from "../src/flow-schema-validate.js";

test("UI IA manifest references existing fixtures and API paths", () => {
  const manifestPath = join(flowFixturesDir(), "api/ui-ia.manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    library_modes: string[];
    views: Array<{ id: string; fixture: string; hash: string }>;
    copy: { flows_label: string; page_flow_label: string; forbidden_aliases_for_page_flow: string[] };
    api_planned: Record<string, string>;
  };

  assert.deepEqual(manifest.library_modes, ["screens", "sections", "flows"]);
  assert.equal(manifest.copy.flows_label, "Flows");
  assert.equal(manifest.copy.page_flow_label, "Page narrative");
  assert.ok(manifest.copy.forbidden_aliases_for_page_flow.includes("User flow"));

  assert.equal(manifest.api_planned.list, "/api/library/flows");
  assert.equal(manifest.api_planned.page_flows_rename, "/api/library/page-flows");

  for (const view of manifest.views) {
    assert.ok(existsSync(view.fixture), `missing fixture for ${view.id}: ${view.fixture}`);
    assert.match(view.hash, /^#\/library\/flows/);
  }

  const paths = JSON.parse(readFileSync("knowledge/paths.json", "utf8")) as {
    taxonomy?: { flowUiSpec?: string; flowUiWireframes?: string };
    api?: { libraryPath?: string };
  };
  assert.equal(paths.taxonomy?.flowUiSpec, "docs/DIG-011-flows-ui.md");
  assert.equal(paths.taxonomy?.flowUiWireframes, "knowledge/dig-011-flows-ui.md");
  assert.equal(paths.api?.libraryPath, "/api/library");
});

test("flows UI spec forbids implementing before Phase D HTTP", async () => {
  const spec = await import("node:fs/promises").then((fs) => fs.readFile("docs/DIG-011-flows-ui.md", "utf8"));
  assert.match(spec, /Do not build React panels until Phase D/i);
  assert.match(spec, /Page narrative/i);
  assert.match(spec, /Interactive Mode/i);
  assert.match(spec, /CHECKION/);
});
