# DIG-011 Implementation Status

**Spec:** [DIG-011 User Flow Graph](DIG-011-user-flow-graph.md)  
**Updated:** 2026-08-16  
**Policy:** Phases A–D core runtime shipped (assemble + Library/MCP file store). PG migrate + Interactive UI still deferred.

| Requirement | Status | Notes |
| --- | --- | --- |
| ADR-011 ownership decision | Done | `architecture/ADR-011-user-flow-graph.md` |
| Parent + phase A–D docs | Done | `docs/DIG-011*.md` |
| JSON Schemas (candidates/edges/graph/MCP) | Done | `schemas/flow-*.schema.json` |
| Golden scenarios + invalid fixtures | Done | `fixtures/flows/` + `knowledge/dig-011-test-scenarios.md` |
| Schema/invariant validator (fixtures only) | Done | `src/flow-schema-validate.ts` + `test/flow-schema-fixtures.test.ts` |
| Closed `flow_actions` catalog | Done | `knowledge/flow-actions-catalog.json` |
| Seed bridge knowledge (CHECKION/AUDION) | Done | `knowledge/flow-seed-bridges.md` |
| Library/Interactive/MCP contracts + API fixtures | Done | `docs/DIG-011-library-api.md`, `fixtures/flows/api/` |
| Flows Library UI / Interactive IA | Done | `docs/DIG-011-flows-ui.md`, `knowledge/dig-011-flows-ui.md` |
| Goal challenge (LLM design value) | Done | `knowledge/dig-011-challenge.md` — **prefer section_look/retrieval→gen over Flow runtime** |
| Draft PG migration (not applied) | Done | `db/migrations/draft/009_dig011_flows.sql` |
| Catalog loader (vocab only) | Done | `src/flow-actions.ts` — not a flow pipeline |
| Phase A candidate extraction | **Done** | `src/flow-candidates.ts` → `derived/flow-candidates.json`; `knowledge/dig-011-phase-a.md` |
| Phase B measure / edges | **Done** | `src/flow-edges.ts` — B1/B2/B3-refuse/B4; local sibling href-join on capture; `knowledge/dig-011-phase-b.md` |
| Phase C detect / LLM stage | **Done** | `src/flow-detect.ts` — C1 L2 + C2 parse/soft-fail; `knowledge/dig-011-phase-c.md` |
| Phase D assemble / Library / MCP | **Done (file store)** | `src/flow-assemble.ts` + `src/flow-library.ts`; `/page-flows` vs `/flows`; MCP `dig_flow_*`; `knowledge/dig-011-phase-d.md` |
| Interactive Mode UI | **Done** | `apps/web` Library Flows tab + Interactive (`#/library/flows…`) |
| CHECKION URL seed worker | **Not started** | Spec only |
| Apply `009` Postgres migration | **Not started** | Draft only |

## Spec entrypoints

```text
docs/DIG-011-user-flow-graph.md
docs/DIG-011-phase-a-recognize.md
docs/DIG-011-phase-b-measure.md
docs/DIG-011-phase-c-detect.md
docs/DIG-011-phase-d-process.md
architecture/ADR-011-user-flow-graph.md
knowledge/dig-011-flow-graph.md
```
