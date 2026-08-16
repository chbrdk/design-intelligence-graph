import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSafeActivateAllowed,
  buildSafeActivateEdge,
  hrefJoinEdges,
  normalizeFlowJoinUrl,
  seedSequenceEdges
} from "../src/flow-edges.js";
import type { FlowCandidate } from "../src/flow-candidates.js";
import { validateAgainstSchema } from "../src/flow-schema-validate.js";

function candidate(partial: Partial<FlowCandidate> & Pick<FlowCandidate, "candidate_id" | "node_id">): FlowCandidate {
  return {
    viewport_capture_id: "vpc",
    control_kind: "link",
    destination: "https://shop.example/pricing",
    destination_class: "internal_path",
    candidacy_score: 0.9,
    safety: "href_join_only",
    layer: "L2",
    method: "link_href_scan",
    evidence: [{ kind: "attribute", fact: "href", value: "/pricing" }],
    hotspot_box: { x: 10, y: 20, width: 120, height: 40, space: "document" },
    ...partial
  };
}

test("normalizeFlowJoinUrl strips hash trailing slash and default ports", () => {
  assert.equal(
    normalizeFlowJoinUrl("https://Shop.Example:443/pricing/#x"),
    "https://shop.example/pricing"
  );
  assert.equal(normalizeFlowJoinUrl("https://shop.example/"), "https://shop.example/");
});

test("href-join / → /pricing yields inferred_href_only edge", () => {
  const doc = hrefJoinEdges({
    appScopeId: "app_fixture_shop",
    flowSessionId: "fsess_pricing",
    screens: [
      {
        capture_run_id: "run_home",
        canonical_url: "https://shop.example/",
        screen_id: "fs_home",
        candidates: [candidate({ candidate_id: "cand_pricing", node_id: "n_pricing" })]
      },
      {
        capture_run_id: "run_pricing",
        canonical_url: "https://shop.example/pricing",
        screen_id: "fs_pricing",
        candidates: []
      }
    ]
  });

  assert.equal(doc.edges.length, 1);
  const edge = doc.edges[0]!;
  assert.equal(edge.from_capture_run_id, "run_home");
  assert.equal(edge.to_capture_run_id, "run_pricing");
  assert.equal(edge.activation, "inferred_href_only");
  assert.equal(edge.method, "href_join");
  assert.ok(edge.confidence < 1);
  assert.ok(edge.hotspot);
  const issues = validateAgainstSchema("flowEdges", doc);
  assert.equal(issues.length, 0, issues.map((item) => item.message).join("; "));
});

test("seed_sequence consecutive URLs produce capped confidence edges", () => {
  const doc = seedSequenceEdges({
    appScopeId: "app_fixture_shop",
    flowSessionId: "fsess_checkout_seed",
    seedSource: "checkion_domain_scan",
    seedRef: "scan_1",
    steps: [
      { url: "https://shop.example/cart", capture_run_id: "run_cart", screen_id: "fs_cart" },
      { url: "https://shop.example/checkout", capture_run_id: "run_checkout", screen_id: "fs_checkout" },
      {
        url: "https://shop.example/checkout/confirm",
        capture_run_id: "run_confirm",
        screen_id: "fs_confirm"
      }
    ]
  });
  assert.equal(doc.edges.length, 2);
  assert.ok(doc.edges.every((edge) => edge.method === "seed_sequence"));
  assert.ok(doc.edges.every((edge) => edge.confidence <= 0.85));
  assert.ok(doc.edges.every((edge) => edge.activation === "none"));
  const issues = validateAgainstSchema("flowEdges", doc);
  assert.equal(issues.length, 0, issues.map((item) => item.message).join("; "));
});

test("B3 refuses forbid candidates and builds observed edge when allowed", () => {
  const forbid = candidate({
    candidate_id: "cand_logout",
    node_id: "n_logout",
    safety: "forbid",
    destination_class: "action_unsafe"
  });
  assert.equal(assertSafeActivateAllowed(forbid).ok, false);
  assert.equal(buildSafeActivateEdge({
    fromCaptureRunId: "run_a",
    toCaptureRunId: "run_b",
    candidate: forbid
  }), null);

  const allow = candidate({
    candidate_id: "cand_go",
    node_id: "n_go",
    safety: "allow_activate",
    destination: "https://shop.example/next",
    destination_class: "internal_path"
  });
  const edge = buildSafeActivateEdge({
    fromCaptureRunId: "run_a",
    toCaptureRunId: "run_b",
    candidate: allow
  });
  assert.ok(edge);
  assert.equal(edge!.activation, "observed");
  assert.equal(edge!.confidence, 1);
  assert.equal(edge!.method, "safe_activate");
});
