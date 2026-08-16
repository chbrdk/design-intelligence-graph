# DIG-011 Phase D — assemble + Library/MCP (runtime)

**Updated:** 2026-08-16  
**Specs:** [`docs/DIG-011-phase-d-process.md`](../docs/DIG-011-phase-d-process.md), [`docs/DIG-011-library-api.md`](../docs/DIG-011-library-api.md)

## Assemble

`assembleFlowGraph` → `derived/flow-graph.json` (`paths.json` → `flowGraph`)  
`indexFlowGraph` → `indexes/flows/{flow_id}.json`

Inputs: screens (CaptureRuns), Phase B edges, Phase C `flow_actions`.

## Library HTTP

| Path | Meaning |
| --- | --- |
| `GET /api/library/page-flows?capture_run_id=` | Within-page `page_flow` (also legacy `/flows?capture_run_id=`) |
| `GET /api/library/flows` | DIG-011 list (`flow_action`, `app_scope_id`, `q`, `limit`) |
| `GET /api/library/flows/:id` | Detail envelope (+ media map when Postgres has viewports) |
| `GET /api/library/flows/:id/interactive` | Hotspot playback; `image_ref` from capture screenshots when indexed |

Store: `indexes/flows/*.json` (`flowLibrary.graphsRelativeDir`); falls back to golden `fixtures/flows/*/flow-graph.json` when empty. DIG-011 flow reads work without Postgres; media enrichment needs DB.

## MCP

`dig_flow_search` · `dig_flow_get` · `dig_flow_neighbors` (read-only)

## Postgres

Applied migration: `db/migrations/011_dig011_flows.sql` (`paths.json` → `taxonomy.flowMigration`). Run `npm run db:migrate` on environments that should store flows in PG (file index remains the Library reader for now).

## UI

Library Flows + Interactive Mode in `apps/web` (`#/library/flows`).

## Not yet

- PG-backed Library reader (still file/fixture index)
- CHECKION seed worker / quality panel
- B3 live safe-activate worker

## Code

- `src/flow-assemble.ts` · `src/flow-library.ts` (`resolveFlowScreenMedia`, `indexFlowGraph`)
- `src/library-api.ts` · `src/mcp-api.ts` / `mcp-server.ts`
- Tests: `test/flow-assemble.test.ts`, `test/flow-media.test.ts`, library API coverage
