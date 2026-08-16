# DIG-011 Phase D — Describe, store, retrieve

**Parent:** [DIG-011 User Flow Graph](DIG-011-user-flow-graph.md)  
**Status:** Draft v0.1 — **Phase D assemble + Library/MCP file store shipped**; PG `009` + Interactive UI deferred  
**Schemas:** [`schemas/flow-graph.schema.json`](../schemas/flow-graph.schema.json), [`schemas/mcp-flow-tools.schema.json`](../schemas/mcp-flow-tools.schema.json)  
**Code:** `src/flow-assemble.ts` · `src/flow-library.ts` · knowledge: [`knowledge/dig-011-phase-d.md`](../knowledge/dig-011-phase-d.md)

## Goal

Assemble, persist, and expose Flows for Library Interactive Mode and MCP — without owning quality magazine or live agents.

See [`docs/DIG-011-library-api.md`](DIG-011-library-api.md) for normative HTTP/MCP/Interactive envelopes, fixtures under `fixtures/flows/api/`, and draft SQL in `db/migrations/draft/009_dig011_flows.sql`.

## Assemble

Input: FlowScreens (CaptureRuns), edges (Phase B), actions (Phase C).  
Output: `derived/flow-graph.json` (schema `flow_schema_version: 0.1.0`).

Assembly rules:

1. Screen `order` follows primary path (seed order or longest confident path); branches recorded as extra edges, not duplicate linear orders.
2. Hotspots copy from edge records; normalize to document space when full-page media exists.
3. Optional `checkion_scan_id` per screen for Quality correlation only.
4. Manifest SHOULD reference the flow-graph artifact when present.

## Storage (planned)

Postgres (names reserved; migration not written):

| Table | Role |
|-------|------|
| `flows` | flow_id, app_scope_id, title, schema_version |
| `flow_screens` | flow_id, capture_run_id, order, checkion_scan_id |
| `flow_edges` | edge payload + hotspot jsonb |
| `flow_actions` | flow_id, taxonomy_id, confidence, method |

Portable export: same JSON as package artifact for DIG-006-style offline use.

## Library API (planned)

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/api/library/flows` | Filter `flow_action`, `app_scope_id` |
| GET | `/api/library/flows/:id` | Ordered screens + edges + hotspots |
| GET | `/api/library/flows/:id/interactive` | Step payload for hotspot playback |

Existing `/flows` that returns **`page_flow` LLM items** MUST be renamed or namespaced when Flow APIs land (e.g. `/page-flows` vs `/flows`) to avoid collision — decision recorded here: prefer **`/api/library/page-flows`** for section narrative and **`/api/library/flows`** for DIG-011.

## MCP (planned)

Tools in [`schemas/mcp-flow-tools.schema.json`](../schemas/mcp-flow-tools.schema.json):

- `dig_flow_search` — facet + text over actions/titles  
- `dig_flow_get` — full graph  
- `dig_flow_neighbors` — screens adjacent via edges  

Read-only; no activation from MCP.

## CHECKION quality panel (planned)

For each FlowScreen with URL: optional `checkion_v3.scan_start` `mode: single` (same handoff as AUDION). Store id; Library shows scores/issues via CHECKION APIs — DIG does not re-score.

## UI (planned)

- Library: Flows tab (separate from Screens)  
- Interactive Mode: hotspot click → next screen (Mobbin-like)  
- Analyses: do not merge `page_flow` and Flow into one list without labels  

## Non-goals

- Renderer that executes flows as a bot  
- Editing CHECKION issues inside DIG  

## Acceptance (when implemented)

- Schema-valid `flow-graph.json` round-trips through index + `dig_flow_get`.
- API namespace split: page-flows vs flows covered by contract tests.
