import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  FLOW_ACTIONS_VERSION,
  assertFlowActionIds,
  getFlowActionsCatalog,
  isFlowActionId,
  listFlowActions,
  suggestFlowActionsFromPath
} from "../src/flow-actions.js";

test("flow-actions catalog version matches paths.json and loader", async () => {
  const paths = JSON.parse(await readFile(resolve("knowledge/paths.json"), "utf8")) as {
    taxonomy?: { flowActionsCatalog?: string; flowActionsVersion?: string };
  };
  assert.equal(paths.taxonomy?.flowActionsCatalog, "knowledge/flow-actions-catalog.json");
  assert.equal(paths.taxonomy?.flowActionsVersion, FLOW_ACTIONS_VERSION);
  assert.equal(getFlowActionsCatalog().version, FLOW_ACTIONS_VERSION);
});

test("flow-actions catalog has unique dig:flow.* ids", () => {
  const actions = listFlowActions();
  assert.ok(actions.length >= 10);
  const ids = new Set(actions.map((action) => action.id));
  assert.equal(ids.size, actions.length);
  for (const action of actions) {
    assert.match(action.id, /^dig:flow\./);
    assert.ok(action.label.length > 0);
    assert.ok(Array.isArray(action.aliases));
    assert.ok(Array.isArray(action.path_hints));
  }
  assert.ok(isFlowActionId("dig:flow.onboarding"));
  assert.ok(isFlowActionId("dig:flow.logging_in"));
  assert.equal(isFlowActionId("dig:flow.not_a_real_action"), false);
});

test("assertFlowActionIds rejects unknown ids", () => {
  assert.doesNotThrow(() => assertFlowActionIds(["dig:flow.checkout"]));
  assert.throws(() => assertFlowActionIds(["dig:flow.nope"]), /Unknown flow action id/);
});

test("suggestFlowActionsFromPath uses path_hints deterministically", () => {
  assert.deepEqual(suggestFlowActionsFromPath("/login"), ["dig:flow.logging_in"]);
  assert.deepEqual(suggestFlowActionsFromPath("/checkout/confirm"), ["dig:flow.checkout"]);
  assert.deepEqual(suggestFlowActionsFromPath("/about"), ["dig:flow.unknown"]);
});

test("page_flow remains distinct from DIG-011 Flow naming in docs", async () => {
  const spec = await readFile(resolve("docs/DIG-011-user-flow-graph.md"), "utf8");
  assert.match(spec, /page_flow.*within-page/i);
  assert.match(spec, /CHECKION/);
  assert.match(spec, /AUDION/);
  assert.match(spec, /Non-goals:.*Journey Agent soft-fork/i);
  assert.match(spec, /runtime not implemented/i);
});
