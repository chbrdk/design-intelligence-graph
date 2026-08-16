import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyDestination,
  deriveFlowCandidates,
  type FlowCandidateViewportInput
} from "../src/flow-candidates.js";
import { validateAgainstSchema } from "../src/flow-schema-validate.js";
import type { MatchableNode } from "../src/matching.js";

function node(partial: Partial<MatchableNode> & Pick<MatchableNode, "node_id" | "tag">): MatchableNode {
  return {
    node_type: "element",
    rendered: true,
    text: "",
    attributes: {},
    ...partial
  };
}

function viewport(nodes: MatchableNode[]): FlowCandidateViewportInput {
  return {
    viewport_capture_id: "vpc_desktop",
    viewport_name: "desktop",
    page_url: "https://shop.example/",
    nodes,
    boxes: nodes.map((item, index) => ({
      node_id: item.node_id,
      bbox: { x: 10, y: 40 + index * 60, width: 160, height: 40 }
    }))
  };
}

test("classifyDestination marks internal paths fragments and unsafe schemes", () => {
  assert.equal(classifyDestination("/login", "https://shop.example/").destination_class, "internal_path");
  assert.equal(classifyDestination("#details", "https://shop.example/").destination_class, "fragment");
  assert.equal(classifyDestination("mailto:a@b.com", "https://shop.example/").destination_class, "action_unsafe");
  assert.equal(classifyDestination("/logout", "https://shop.example/").destination_class, "action_unsafe");
  assert.equal(
    classifyDestination("https://other.example/x", "https://shop.example/").destination_class,
    "external"
  );
});

test("deriveFlowCandidates promotes internal CTAs and demotes footer privacy", () => {
  const main = node({ node_id: "main", tag: "main", attributes: { role: "main" } });
  const cta = node({
    node_id: "n_cta_signin",
    tag: "a",
    parent_node_id: "main",
    text: "Sign in",
    attributes: { href: "/login" }
  });
  const footer = node({ node_id: "footer", tag: "footer" });
  const privacy = node({
    node_id: "n_footer_privacy",
    tag: "a",
    parent_node_id: "footer",
    text: "Privacy",
    attributes: { href: "/privacy" }
  });
  const logout = node({
    node_id: "n_logout",
    tag: "a",
    parent_node_id: "main",
    text: "Log out",
    attributes: { href: "/logout" }
  });
  const mail = node({
    node_id: "n_mail",
    tag: "a",
    parent_node_id: "main",
    text: "Email",
    attributes: { href: "mailto:ops@example.test" }
  });

  const doc = deriveFlowCandidates({
    captureRunId: "run_fixture_home",
    generatedAt: "2026-08-16T16:00:00.000Z",
    viewports: [viewport([main, cta, footer, privacy, logout, mail])]
  });

  assert.ok(doc.candidates.length >= 3);
  const signin = doc.candidates.find((item) => item.node_id === "n_cta_signin");
  assert.ok(signin);
  assert.equal(signin!.destination_class, "internal_path");
  assert.equal(signin!.safety, "href_join_only");
  assert.ok(signin!.candidacy_score > 0.6);

  const privacyCand = doc.candidates.find((item) => item.node_id === "n_footer_privacy");
  assert.ok(privacyCand);
  assert.ok(privacyCand!.candidacy_score < signin!.candidacy_score);

  const unsafe = doc.candidates.filter((item) => item.destination_class === "action_unsafe");
  assert.ok(unsafe.some((item) => item.node_id === "n_logout"));
  assert.ok(unsafe.every((item) => item.safety === "forbid"));

  assert.equal(doc.candidates[0]!.candidacy_score >= doc.candidates[1]!.candidacy_score, true);
  const schemaIssues = validateAgainstSchema("flowCandidates", doc);
  assert.equal(schemaIssues.length, 0, schemaIssues.map((item) => item.message).join("; "));
});

test("examples fixture-shaped nodes yield internal href_join_only candidate", () => {
  const main = node({ node_id: "main", tag: "main" });
  const models = node({
    node_id: "n_models",
    tag: "a",
    parent_node_id: "main",
    text: "Browse models",
    attributes: { href: "/models" }
  });
  const fragment = node({
    node_id: "n_frag",
    tag: "a",
    parent_node_id: "main",
    text: "Inspect the system",
    attributes: { href: "#details" }
  });
  const doc = deriveFlowCandidates({
    captureRunId: "cap_fixture",
    viewports: [
      {
        ...viewport([main, models, fragment]),
        page_url: "https://example.test/dig-fixture"
      }
    ]
  });
  const internal = doc.candidates.find(
    (item) => item.destination_class === "internal_path" && item.safety === "href_join_only"
  );
  assert.ok(internal, "expected internal path candidate from fixture-shaped nodes");
  assert.match(internal!.destination || "", /models/);
});
