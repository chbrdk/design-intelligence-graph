import assert from "node:assert/strict";
import test from "node:test";
import { matchLogicalElements, type ViewportNodeSet } from "../src/matching.js";

function view(name: string, nodes: ViewportNodeSet["nodes"]): ViewportNodeSet {
  return { viewport_capture_id: `vpc_${name}`, viewport_name: name, nodes };
}

test("matches elements with stable anchors across viewports", () => {
  const result = matchLogicalElements([
    view("mobile", [{ node_id: "m1", node_type: "element", tag: "h1", dom_path: "html > body > h1", source_anchor: { id: "title" } }]),
    view("desktop", [{ node_id: "d1", node_type: "element", tag: "h1", dom_path: "html > body > main > h1", source_anchor: { id: "title" } }])
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.match_method, "stable_anchor");
  assert.equal(result[0]?.match_confidence, 0.98);
  assert.deepEqual(result[0]?.members.map((member) => member.node_id), ["m1", "d1"]);
});

test("falls back to structural identity", () => {
  const node = { node_type: "element", tag: "section", dom_path: "html > body > main > section:nth-of-type(1)", source_anchor: {} };
  const result = matchLogicalElements([
    view("mobile", [{ ...node, node_id: "m1" }]),
    view("desktop", [{ ...node, node_id: "d1" }])
  ]);
  assert.equal(result[0]?.match_method, "structure");
  assert.equal(result[0]?.provenance.layer, "L2");
});

test("does not emit singleton matches", () => {
  const result = matchLogicalElements([
    view("mobile", [{ node_id: "m1", node_type: "element", tag: "nav", dom_path: "html > body > nav" }]),
    view("desktop", [{ node_id: "d1", node_type: "element", tag: "aside", dom_path: "html > body > aside" }])
  ]);
  assert.equal(result.length, 0);
});

test("does not duplicate a fingerprint inside one viewport", () => {
  const duplicate = { node_type: "element", tag: "button", dom_path: "html > body > button", source_anchor: { "data-testid": "buy" } };
  const result = matchLogicalElements([
    view("mobile", [{ ...duplicate, node_id: "m1" }, { ...duplicate, node_id: "m2" }]),
    view("desktop", [{ ...duplicate, node_id: "d1" }])
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.members.length, 2);
});
