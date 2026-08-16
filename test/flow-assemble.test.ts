import assert from "node:assert/strict";
import test from "node:test";
import { assembleFlowGraph } from "../src/flow-assemble.js";
import { hrefJoinEdges } from "../src/flow-edges.js";
import { detectFlowActionsL2 } from "../src/flow-detect.js";
import { validateAgainstSchema } from "../src/flow-schema-validate.js";
import {
  digFlowGet,
  digFlowNeighbors,
  digFlowSearch,
  setFlowLibraryStoreForTests
} from "../src/flow-library.js";
import type { FlowCandidate } from "../src/flow-candidates.js";

function candidate(partial: Partial<FlowCandidate> & Pick<FlowCandidate, "candidate_id" | "node_id">): FlowCandidate {
  return {
    viewport_capture_id: "vpc",
    control_kind: "link",
    destination: "https://shop.example/login",
    destination_class: "internal_path",
    candidacy_score: 0.92,
    safety: "href_join_only",
    layer: "L2",
    method: "link_href_scan",
    evidence: [{ kind: "attribute", fact: "href", value: "/login" }],
    hotspot_box: { x: 640, y: 720, width: 160, height: 48, space: "document" },
    ...partial
  };
}

test("assembleFlowGraph builds schema-valid login href-join flow", () => {
  const edgesDoc = hrefJoinEdges({
    appScopeId: "app_fixture_shop",
    flowSessionId: "fsess_login_href_join",
    screens: [
      {
        capture_run_id: "run_fixture_home",
        canonical_url: "https://shop.example/home",
        screen_id: "fs_home",
        candidates: [candidate({ candidate_id: "cand_home_signin", node_id: "n_cta_signin" })]
      },
      {
        capture_run_id: "run_fixture_login",
        canonical_url: "https://shop.example/login",
        screen_id: "fs_login",
        candidates: []
      }
    ]
  });
  const actions = detectFlowActionsL2([
    { order: 0, url: "https://shop.example/home" },
    { order: 1, url: "https://shop.example/login", has_form: true }
  ]);
  const graph = assembleFlowGraph({
    flowId: "flow_fixture_login_href_join",
    appScopeId: "app_fixture_shop",
    flowSessionId: "fsess_login_href_join",
    title: "Sign in from home",
    screens: [
      {
        capture_run_id: "run_fixture_home",
        flow_screen_id: "fs_home",
        order: 0,
        primary_url: "https://shop.example/home"
      },
      {
        capture_run_id: "run_fixture_login",
        flow_screen_id: "fs_login",
        order: 1,
        primary_url: "https://shop.example/login"
      }
    ],
    edges: edgesDoc.edges,
    flow_actions: actions
  });

  assert.equal(graph.screens.length, 2);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0]!.from_screen_id, "fs_home");
  assert.equal(graph.edges[0]!.to_screen_id, "fs_login");
  assert.ok(graph.flow_actions.some((item) => item.taxonomy_id === "dig:flow.logging_in"));
  const issues = validateAgainstSchema("flowGraph", graph);
  assert.equal(issues.length, 0, issues.map((item) => item.message).join("; "));
});

test("dig_flow_search/get/neighbors round-trip via library store", async () => {
  const graph = assembleFlowGraph({
    flowId: "flow_test_roundtrip",
    appScopeId: "app_fixture_shop",
    title: "Round trip",
    screens: [
      { capture_run_id: "run_a", flow_screen_id: "fs_a", order: 0, primary_url: "https://shop.example/" },
      { capture_run_id: "run_b", flow_screen_id: "fs_b", order: 1, primary_url: "https://shop.example/login" }
    ],
    edges: [
      {
        edge_id: "fe_ab",
        from_capture_run_id: "run_a",
        to_capture_run_id: "run_b",
        trigger: { kind: "href", href: "/login", destination_url: "https://shop.example/login" },
        hotspot: { x: 10, y: 20, width: 30, height: 40, space: "document" },
        activation: "inferred_href_only",
        method: "href_join",
        confidence: 0.8,
        provenance: { layer: "L2" }
      }
    ],
    flow_actions: [
      { taxonomy_id: "dig:flow.logging_in", confidence: 0.9, method: "path_ontology_rule", layer: "L2" }
    ]
  });

  setFlowLibraryStoreForTests([graph]);
  try {
    const list = await digFlowSearch({ flow_action: "dig:flow.logging_in" });
    assert.ok(list.items.some((item) => item.flow_id === "flow_test_roundtrip"));
    const detail = await digFlowGet("flow_test_roundtrip");
    assert.ok(detail);
    assert.equal(detail!.flow.flow_id, "flow_test_roundtrip");
    const neighbors = await digFlowNeighbors("flow_test_roundtrip", "fs_a");
    assert.ok(neighbors);
    assert.equal(neighbors!.outbound.length, 1);
    assert.equal(neighbors!.outbound[0]!.screen_id, "fs_b");
  } finally {
    setFlowLibraryStoreForTests(null);
  }
});
