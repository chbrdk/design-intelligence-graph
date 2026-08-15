# DIG-009 Implementation Status

**Spec:** [DIG-009 Async LLM Enrichment](DIG-009-async-llm-enrichment.md)  
**Updated:** 2026-08-15 (v0.2)

| Requirement | Status | Notes |
| --- | --- | --- |
| Async hot path | Done | `JobRunner` + `DIG_LLM_ASYNC` |
| Enrichment job lifecycle | Done | `src/enrichment-queue.ts` |
| File stage cache | Done | `src/llm-stage-cache.ts` |
| Postgres enrichment tables | Done | migrations `004`, `005` |
| Postgres claim (`SKIP LOCKED`) | Done | `src/enrichment-store.ts` |
| Confidence routing bulk → quality | Done | staged analysis |
| Parallel text stage wave | Done | `PARALLEL_TEXT_STAGES` |
| Vision stage (1 screenshot) | Done | `src/llm-vision.ts` via enrich |
| Cost telemetry | Done | `src/llm-cost.ts` + job fields |
| HTTP list/get enrichment | Done | `/api/enrichment` |
| Multi-host HA / Redis | Deferred | |
| Multi-scroll vision | Deferred | |

## Commands

```bash
npm run db:migrate
DIG_LLM_ENABLED=true DIG_LLM_ASYNC=true DIG_LLM_VISION=true npm run serve
npm test
```
