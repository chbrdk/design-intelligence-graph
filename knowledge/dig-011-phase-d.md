# DIG-011 Phase D — assemble + Library/MCP (runtime)

**Updated:** 2026-08-16  
**Specs:** [`docs/DIG-011-phase-d-process.md`](../docs/DIG-011-phase-d-process.md), [`docs/DIG-011-library-api.md`](../docs/DIG-011-library-api.md)

## Assemble

`assembleFlowGraph` → `derived/flow-graph.json` (`paths.json` → `flowGraph`)

Inputs: screens (CaptureRuns), Phase B edges, Phase C `flow_actions`.

## Library HTTP

| Path | Meaning |
| --- | --- |
| `GET /api/library/page-flows?capture_run_id=` | Within-page `page_flow` (also legacy `/flows?capture_run_id=`) |
| `GET /api/library/flows` | DIG-011 list (`flow_action`, `app_scope_id`, `q`, `limit`) |
| `GET /api/library/flows/:id` | Detail envelope |
| `GET /api/library/flows/:id/interactive` | Hotspot playback steps |

Store: `indexes/flows/*.json` (`flowLibrary.graphsRelativeDir`); falls back to golden `fixtures/flows/*/flow-graph.json` when empty.

## MCP

`dig_flow_search` · `dig_flow_get` · `dig_flow_neighbors` (read-only)

## Not yet

- Applied Postgres migration `009` (draft only)
- Interactive Mode React UI
- CHECKION quality panel wiring

## Code

- `src/flow-assemble.ts`
- `src/flow-library.ts`
- `src/library-api.ts` · `src/mcp-api.ts` / `mcp-server.ts`
- Tests: `test/flow-assemble.test.ts`, library API coverage
