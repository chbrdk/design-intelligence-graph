import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  projectFlowGraphToInteractive,
  projectFlowGraphToListItem,
  projectFlowGraphToNeighbors
} from "../src/flow-api-project.js";
import {
  flowFixturesDir,
  listPositiveScenarioDirs,
  loadScenario,
  validateAgainstSchema
} from "../src/flow-schema-validate.js";

test("library list fixture validates and covers all golden flows", () => {
  const list = JSON.parse(readFileSync(join(flowFixturesDir(), "api/flows.list.json"), "utf8"));
  assert.equal(validateAgainstSchema("flowLibraryList", list).length, 0);
  assert.equal(list.items.length, listPositiveScenarioDirs().length);
  assert.ok(list.items.some((item: { flow_action_ids: string[] }) => item.flow_action_ids.includes("dig:flow.logging_in")));
});

test("login interactive + detail + neighbors fixtures validate", () => {
  const api = join(flowFixturesDir(), "api");
  const interactive = JSON.parse(readFileSync(join(api, "login-href-join.interactive.json"), "utf8"));
  const detail = JSON.parse(readFileSync(join(api, "login-href-join.detail.json"), "utf8"));
  const neighbors = JSON.parse(readFileSync(join(api, "login-href-join.neighbors-home.json"), "utf8"));

  assert.equal(validateAgainstSchema("flowInteractive", interactive).length, 0);
  assert.equal(validateAgainstSchema("flowLibraryDetail", detail).length, 0);
  assert.equal(validateAgainstSchema("mcpFlowNeighbors", neighbors).length, 0);

  assert.equal(interactive.start_screen_id, "fs_home");
  assert.equal(interactive.steps[0].hotspots.length, 1);
  assert.equal(interactive.steps[0].hotspots[0].to_screen_id, "fs_login");
  assert.equal(neighbors.outbound.length, 1);
});

test("projector regenerates login interactive from golden graph", () => {
  const dir = listPositiveScenarioDirs().find((path) => path.endsWith("login-href-join"));
  assert.ok(dir);
  const { scenario } = loadScenario(dir!);
  const graph = JSON.parse(readFileSync(join(dir!, scenario.artifacts.flow_graph), "utf8"));
  const projected = projectFlowGraphToInteractive(graph);
  const golden = JSON.parse(
    readFileSync(join(flowFixturesDir(), "api/login-href-join.interactive.json"), "utf8")
  );
  assert.deepEqual(projected, golden);
  assert.deepEqual(
    projectFlowGraphToListItem(graph).flow_action_ids,
    ["dig:flow.logging_in"]
  );
});

test("onboarding welcome has two outbound neighbors (branch)", () => {
  const neighbors = JSON.parse(
    readFileSync(join(flowFixturesDir(), "api/onboarding-branch.neighbors-welcome.json"), "utf8")
  );
  assert.equal(validateAgainstSchema("mcpFlowNeighbors", neighbors).length, 0);
  assert.equal(neighbors.outbound.length, 2);
  const targets = new Set(neighbors.outbound.map((n: { screen_id: string }) => n.screen_id));
  assert.ok(targets.has("fs_tips"));
  assert.ok(targets.has("fs_skip_done"));

  const dir = listPositiveScenarioDirs().find((path) => path.endsWith("onboarding-branch"));
  const graph = JSON.parse(readFileSync(join(dir!, "flow-graph.json"), "utf8"));
  assert.deepEqual(projectFlowGraphToNeighbors(graph, "fs_welcome"), neighbors);
});

test("draft SQL migration is not in applied migrations folder", async () => {
  const { readdirSync, existsSync } = await import("node:fs");
  assert.ok(existsSync("db/migrations/draft/009_dig011_flows.sql"));
  const applied = readdirSync("db/migrations").filter((name) => name.endsWith(".sql"));
  assert.ok(!applied.includes("009_dig011_flows.sql"));
});
