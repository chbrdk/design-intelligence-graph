# DIG-009 Implementation Status

**Spec:** [DIG-009 Async LLM Enrichment](DIG-009-async-llm-enrichment.md)  
**Updated:** 2026-08-15

| Requirement | Status | Notes |
| --- | --- | --- |
| Async hot path (capture without blocking LLM) | Done | `JobRunner` + `DIG_LLM_ASYNC` |
| Enrichment job lifecycle | Done | `src/enrichment-queue.ts` |
| File stage cache | Done | `src/llm-stage-cache.ts` under indexes |
| Postgres enrichment + cache tables | Done | `db/migrations/004_enrichment_queue.sql` |
| Confidence routing bulk → quality | Done | `analyzeDesignWithLlmStaged` + `paths.json` thresholds |
| HTTP list/get enrichment | Done | `/api/enrichment` |
| Vision in worker | Deferred | DIG-009 non-goal v0.1 |
| Parallel stages | Deferred | Scaling roadmap |
| Cost telemetry USD | Partial | cache may store usage later |

## Commands

```bash
npm run db:migrate
DIG_LLM_ENABLED=true DIG_LLM_ASYNC=true npm run serve
npm test
```
