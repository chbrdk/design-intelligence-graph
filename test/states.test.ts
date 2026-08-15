import assert from "node:assert/strict";
import test from "node:test";
import { diffValues, selectStateCandidates } from "../src/states.js";

test("selects visible safe interactive elements", () => {
  const result = selectStateCandidates([
    { node_id: "link", node_type: "element", tag: "a", dom_path: "html > body > a", rendered: true, attributes: { href: "/next" } },
    { node_id: "button", node_type: "element", tag: "div", dom_path: "html > body > div", rendered: true, attributes: { role: "button" } },
    { node_id: "hidden", node_type: "element", tag: "button", dom_path: "html > body > button", rendered: false },
    { node_id: "disabled", node_type: "element", tag: "button", dom_path: "html > body > button:nth-of-type(2)", rendered: true, attributes: { disabled: "" } }
  ]);
  assert.deepEqual(result.map((item) => item.node_id), ["link", "button"]);
  assert.deepEqual(result[0]?.states, ["hover", "focus"]);
});

test("limits interaction candidates", () => {
  const nodes = Array.from({ length: 12 }, (_, index) => ({
    node_id: `node_${index}`, node_type: "element", tag: "a", dom_path: `a:nth-of-type(${index + 1})`, rendered: true
  }));
  assert.equal(selectStateCandidates(nodes, 3).length, 3);
});

test("diffValues emits only changed measurements", () => {
  assert.deepEqual(diffValues(
    { color: "black", opacity: "1", width: "10px" },
    { color: "blue", opacity: "1", width: "12px" }
  ), {
    color: { before: "black", after: "blue" },
    width: { before: "10px", after: "12px" }
  });
});
