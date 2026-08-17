import assert from "node:assert/strict";
import test from "node:test";
import { attachLogicalElements, deriveViewportOntology, uniquifyOntologyViewports } from "../src/ontology.js";

const nodes = [
  { node_id: "body", parent_node_id: null, node_type: "element", tag: "body", rendered: true },
  { node_id: "header", parent_node_id: "body", node_type: "element", tag: "header", rendered: true },
  { node_id: "main", parent_node_id: "body", node_type: "element", tag: "main", rendered: true },
  { node_id: "hero", parent_node_id: "main", node_type: "element", tag: "section", rendered: true },
  { node_id: "h1", parent_node_id: "hero", node_type: "element", tag: "h1", rendered: true },
  { node_id: "cta", parent_node_id: "hero", node_type: "element", tag: "a", rendered: true },
  { node_id: "form", parent_node_id: "main", node_type: "element", tag: "form", rendered: true },
  { node_id: "label", parent_node_id: "form", node_type: "element", tag: "label", rendered: true, attributes: { for: "email" } },
  { node_id: "input", parent_node_id: "form", node_type: "element", tag: "input", rendered: true, attributes: { type: "email", id: "email" } }
];

test("derives hierarchy, components, content, and UX patterns", () => {
  const ontology = deriveViewportOntology({
    viewport_capture_id: "vpc_mobile", viewport_name: "mobile", viewport_height: 800, title: "Example",
    nodes,
    boxes: nodes.map((node, index) => ({ node_id: node.node_id, bbox: { x: 0, y: index * 20, width: 300, height: 20 } })),
    styles: [{ node_id: "header", properties: { position: "sticky" } }]
  });
  const taxonomyIds = new Set(ontology.entities.map((entity) => entity.taxonomy_id));
  assert.ok(taxonomyIds.has("dig:page.landing"));
  assert.ok(taxonomyIds.has("dig:region.banner"));
  assert.ok(taxonomyIds.has("dig:pattern.hero"));
  assert.ok(taxonomyIds.has("dig:pattern.primary_action"));
  assert.ok(taxonomyIds.has("dig:component.form_control"));
  assert.ok(taxonomyIds.has("dig:pattern.sticky_header"));
  assert.ok(ontology.relationships.some((relationship) => relationship.type === "contains"));
  assert.ok(ontology.relationships.some((relationship) => relationship.type === "implements"));
  assert.ok(ontology.relationships.some((relationship) => relationship.type === "labels"));
  assert.ok(ontology.entities.filter((entity) => entity.source_node_id).every((entity) => entity.parent_entity_id));
});

test("links ontology entities to logical elements across viewports", () => {
  const ontology = deriveViewportOntology({
    viewport_capture_id: "vpc_mobile", viewport_name: "mobile", viewport_height: 800, title: "Example",
    nodes, boxes: [], styles: []
  });
  const [linked] = attachLogicalElements([ontology], [{
    logical_element_id: "lel_cta", match_confidence: 0.98, match_method: "stable_anchor", fingerprint_hash: "sha256:test",
    members: [{ viewport_capture_id: "vpc_mobile", viewport_name: "mobile", node_id: "cta" }],
    provenance: { layer: "L2", method: "test", confidence: 0.98 }
  }]);
  assert.ok(linked?.entities.some((entity) => entity.source_node_id === "cta" && entity.logical_element_id === "lel_cta"));
});

test("ontology entity ids stay unique across viewports", () => {
  const boxes = nodes.map((node, index) => ({
    node_id: node.node_id,
    bbox: { x: 0, y: index * 20, width: 300, height: 20 }
  }));
  const mobile = deriveViewportOntology({
    viewport_capture_id: "vpc_mobile",
    viewport_name: "mobile",
    viewport_height: 800,
    title: "Example",
    nodes,
    boxes,
    styles: []
  });
  const desktop = deriveViewportOntology({
    viewport_capture_id: "vpc_desktop",
    viewport_name: "desktop",
    viewport_height: 900,
    title: "Example",
    nodes,
    boxes,
    styles: []
  });
  const ids = [...mobile.entities, ...desktop.entities].map((entity) => entity.ontology_entity_id);
  assert.equal(ids.length, new Set(ids).size);
  const relIds = [...mobile.relationships, ...desktop.relationships].map((rel) => rel.relationship_id);
  assert.equal(relIds.length, new Set(relIds).size);
});

test("deriveViewportOntology skips duplicate node+taxonomy rows", () => {
  const header = nodes.find((node) => node.node_id === "header")!;
  const ontology = deriveViewportOntology({
    viewport_capture_id: "vpc_mobile",
    viewport_name: "mobile",
    viewport_height: 800,
    title: "Example",
    nodes: [...nodes, { ...header }],
    boxes: [],
    styles: [{ node_id: "header", properties: { position: "sticky" } }]
  });
  const ids = ontology.entities.map((entity) => entity.ontology_entity_id);
  assert.equal(ids.length, new Set(ids).size);
  const relIds = ontology.relationships.map((rel) => rel.relationship_id);
  assert.equal(relIds.length, new Set(relIds).size);
});

test("uniquifyOntologyViewports rekeys colliding ids copied across viewports", () => {
  const boxes = nodes.map((node, index) => ({
    node_id: node.node_id,
    bbox: { x: 0, y: index * 20, width: 300, height: 20 }
  }));
  const mobile = deriveViewportOntology({
    viewport_capture_id: "vpc_mobile",
    viewport_name: "mobile",
    viewport_height: 800,
    title: "Example",
    nodes,
    boxes,
    styles: []
  });
  const clonedDesktop: typeof mobile = {
    ...mobile,
    viewport_capture_id: "vpc_desktop",
    viewport_name: "desktop"
  };
  const unique = uniquifyOntologyViewports([mobile, clonedDesktop]);
  assert.equal(unique.length, 2);
  const ids = unique.flatMap((viewport) => viewport.entities.map((entity) => entity.ontology_entity_id));
  assert.equal(ids.length, new Set(ids).size);
  const relIds = unique.flatMap((viewport) => viewport.relationships.map((rel) => rel.relationship_id));
  assert.equal(relIds.length, new Set(relIds).size);
});

test("uses only registered taxonomy identifiers", () => {
  const ontology = deriveViewportOntology({
    viewport_capture_id: "vpc_mobile", viewport_name: "mobile", viewport_height: 800, title: "Example",
    nodes, boxes: [], styles: []
  });
  assert.ok(ontology.entities.every((entity) => entity.taxonomy_id.startsWith("dig:")));
});
