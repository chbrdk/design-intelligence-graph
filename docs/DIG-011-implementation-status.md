# DIG-011 Implementation Status

**Spec:** [DIG-011 User Flow Graph](DIG-011-user-flow-graph.md)  
**Updated:** 2026-08-15  
**Policy:** Spec-driven only until an explicit implementation task — no Phase A–D runtime.

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
| Phase A candidate extraction | **Not started** | Spec only |
| Phase B measure / edges | **Not started** | Spec only |
| Phase C detect / LLM stage | **Not started** | Spec only |
| Phase D assemble / PG / Library / MCP | **Not started** | Spec only |
| Interactive Mode UI | **Not started** | Spec only |
| CHECKION URL seed worker | **Not started** | Spec only |

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
