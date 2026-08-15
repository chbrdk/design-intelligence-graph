# Schemas

Machine-readable JSON Schemas live here and are versioned independently.

- `capture-manifest.schema.json` validates the DIG-001 v0.1 capture manifest emitted by `dig-capture`.
- `node.schema.json` defines persisted DOM, text, and synthetic pseudo nodes.
- `geometry.schema.json` defines measured boxes, normalized coordinates, box models, and layout context.
- `ontology.schema.json` defines DIG-002 viewport ontologies, entities, evidence, and relationships.
- `geometry-layout.schema.json` defines DIG-003 deterministic layout containers, spatial relationships, alignment, spacing, and grid hypotheses.
- `visual-language.schema.json` defines DIG-004 measured visual tokens and bounded L3 visual-language hypotheses.
- `analysis-report.schema.json` defines DIG-005 pipeline stages, deterministic findings, semantic inputs, and quality gate.
- `knowledge-graph.schema.json` defines the portable DIG-006 node, edge, and immutable artifact-lineage index.
- `mcp-tools.schema.json` names the stable DIG-007 MCP retrieval-tool contract.
- `layout-spec.schema.json` defines the evidence-linked DIG-008 generated layout specification.
- `flow-candidates.schema.json` defines DIG-011 Phase A transition candidates (spec; producer deferred).
- `flow-edges.schema.json` defines DIG-011 Phase B measured flow edges (spec; producer deferred).
- `flow-graph.schema.json` defines the assembled DIG-011 Flow artifact (spec; producer deferred).
- `mcp-flow-tools.schema.json` names planned DIG-011 MCP tools (`dig_flow_search|get|neighbors`).
- `flow-library-list.schema.json` / `flow-library-detail.schema.json` — planned Library list/detail envelopes.
- `flow-interactive.schema.json` — Interactive Mode playback payload.
- `mcp-flow-neighbors.schema.json` — `dig_flow_neighbors` output.
- `design-reference.schema.json` / `design-reference-pack.schema.json` — DIG-012 agent retrieval units.
- `mcp-reference-tools.schema.json` — planned `dig_reference_search|get|pack`.

Viewport, state, and artifact schemas will be split into reusable documents as the capture model evolves.
