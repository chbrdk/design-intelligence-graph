import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  assertFlowGraphInvariants,
  flowFixturesDir,
  listPositiveScenarioDirs,
  loadScenario,
  validateAgainstSchema,
  validateScenarioFolder
} from "../src/flow-schema-validate.js";
import { readFileSync } from "node:fs";

test("positive DIG-011 scenarios validate schema + expects", () => {
  const dirs = listPositiveScenarioDirs();
  assert.ok(dirs.length >= 4, `expected ≥4 scenarios, got ${dirs.length}`);
  for (const dir of dirs) {
    const { scenario, issues, expectFailures } = validateScenarioFolder(dir);
    assert.equal(issues.length, 0, `${scenario.id}: ${issues.map((i) => i.message).join("; ")}`);
    assert.equal(expectFailures.length, 0, `${scenario.id}: ${expectFailures.join("; ")}`);
  }
});

test("scenario catalog matches knowledge dig-011-test-scenarios ids", () => {
  const ids = listPositiveScenarioDirs().map((dir) => loadScenario(dir).scenario.id).sort();
  assert.deepEqual(ids, [
    "checkout-seed-walk",
    "login-href-join",
    "onboarding-branch",
    "settings-mixed-actions"
  ]);
});

test("invalid fixtures fail schema or invariants as designed", () => {
  const invalidDir = join(flowFixturesDir(), "_invalid");
  const cases = readdirSync(invalidDir).filter((name) => name.endsWith(".json"));
  assert.ok(cases.length >= 4);

  const missing = JSON.parse(readFileSync(join(invalidDir, "missing-schema-version.json"), "utf8"));
  assert.ok(validateAgainstSchema("flowGraph", missing).length > 0);

  const dangling = JSON.parse(readFileSync(join(invalidDir, "dangling-edge.json"), "utf8"));
  assert.equal(validateAgainstSchema("flowGraph", dangling).length, 0);
  assert.ok(assertFlowGraphInvariants(dangling).some((i) => i.code === "invariant"));

  const unknown = JSON.parse(readFileSync(join(invalidDir, "unknown-flow-action.json"), "utf8"));
  assert.ok(assertFlowGraphInvariants(unknown).some((i) => i.code === "catalog"));

  const conf = JSON.parse(readFileSync(join(invalidDir, "inferred-confidence-one.json"), "utf8"));
  assert.ok(assertFlowGraphInvariants(conf).some((i) => /confidence < 1/.test(i.message)));
});

test("login-href-join encodes hotspot Interactive Mode evidence", () => {
  const dir = listPositiveScenarioDirs().find((path) => path.endsWith("login-href-join"));
  assert.ok(dir);
  const { scenario } = loadScenario(dir!);
  assert.ok(scenario.phase_coverage.includes("B1"));
  assert.equal(scenario.expect.require_hotspot_on_edges, true);
  const graph = JSON.parse(readFileSync(join(dir!, "flow-graph.json"), "utf8")) as {
    edges: Array<{ hotspot?: { space: string } }>;
  };
  assert.equal(graph.edges[0]?.hotspot?.space, "document");
});
