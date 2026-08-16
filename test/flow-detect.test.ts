import assert from "node:assert/strict";
import test from "node:test";
import {
  detectFlowActions,
  detectFlowActionsL2,
  mergeFlowActionDetections,
  parseFlowActionsStage
} from "../src/flow-detect.js";

test("login two-step seed expects dig:flow.logging_in via L2 path_ontology_rule", () => {
  const l2 = detectFlowActionsL2([
    {
      order: 0,
      url: "https://shop.example/home",
      screen_patterns: ["Marketing Home"],
      ui_element_labels: ["Button", "Navigation"]
    },
    {
      order: 1,
      url: "https://shop.example/login",
      has_form: true,
      ontology_taxonomy_ids: ["dig:component.form", "dig:component.input"],
      ui_element_labels: ["Password", "Button"]
    }
  ]);
  const login = l2.find((item) => item.taxonomy_id === "dig:flow.logging_in");
  assert.ok(login);
  assert.equal(login!.method, "path_ontology_rule");
  assert.ok(login!.confidence >= 0.9);
});

test("parseFlowActionsStage drops unknown ids", () => {
  const parsed = parseFlowActionsStage(
    JSON.stringify({
      flow_action_ids: ["dig:flow.onboarding", "dig:flow.not_real", "dig:flow.logging_in"],
      title: "Welcome then sign in",
      rationale: "Onboarding then login paths."
    })
  );
  assert.deepEqual(parsed.flow_action_ids, ["dig:flow.onboarding", "dig:flow.logging_in"]);
  assert.equal(parsed.title, "Welcome then sign in");
});

test("merge soft-fails to L2 when L3 fails", () => {
  const doc = detectFlowActions({
    appScopeId: "app_fixture_shop",
    flowSessionId: "fsess_login_href_join",
    screens: [
      { order: 0, url: "https://shop.example/home" },
      { order: 1, url: "https://shop.example/login", has_form: true }
    ],
    llmError: "timeout"
  });
  assert.equal(doc.layers.l3_status, "failed");
  assert.ok(doc.flow_actions.some((item) => item.taxonomy_id === "dig:flow.logging_in"));
  assert.equal(doc.layers.l3, null);
});

test("merge keeps L2 and adds valid L3 labels", () => {
  const merged = mergeFlowActionDetections(
    [{ taxonomy_id: "dig:flow.logging_in", confidence: 0.9, method: "path_ontology_rule", layer: "L2" }],
    [{ taxonomy_id: "dig:flow.onboarding", confidence: 0.7, method: "llm_flow_actions", layer: "L3" }]
  );
  assert.ok(merged.some((item) => item.taxonomy_id === "dig:flow.logging_in"));
  assert.ok(merged.some((item) => item.taxonomy_id === "dig:flow.onboarding"));
});
