# DIG-009 — Async LLM Enrichment Queue

**Status:** Draft v0.2 — implemented  
**Layers:** L2 orchestration; L3 semantic enrichment  
**Upstream:** DIG-005 Analysis, DIG-006 Storage  
**Downstream:** Library search, MCP, Mobbin-parity facets  
**Ops knowledge:** [`knowledge/llm-scaling-mobbin.md`](../knowledge/llm-scaling-mobbin.md)

## Purpose

DIG-009 separates **deterministic capture/ingest** from **probabilistic LLM enrichment** so library-scale ingestion can continue while design labels are produced asynchronously, cached, and optionally escalated to a stronger model.

## Normative requirements

### Hot path

1. A capture job MUST complete capture → verify → index without waiting on LLM round-trips when async enrichment is enabled (`DIG_LLM_ASYNC` default `true` when LLM is enabled).
2. When LLM is disabled, enrichment MUST be `skipped` with an explicit reason.
3. Capture packages MUST remain valid DIG-001 packages if enrichment has not yet run.

### Enrichment jobs

4. Each enrichment job MUST reference `capture_run_id` and `package_path`.
5. Enrichment job status MUST be one of: `queued` | `running` | `complete` | `failed` | `skipped`.
6. Successful enrichment MUST write `derived/llm-design.json`, update `analysis-report.json` / `manifest.json`, and SHOULD re-index LLM rows into Postgres when a database is configured.
7. When Postgres is configured, enrichment jobs MUST be persisted to `enrichment_jobs` and workers MUST claim work with `FOR UPDATE SKIP LOCKED` (or equivalent) so restarts do not lose the queue.

### Stage cache

8. Before calling a model for stage `S`, the system MUST compute `evidence_sha256` over the stage evidence payload and look up cache key `(stage_id, model, evidence_sha256)`.
9. Cache hits MUST reuse stored raw responses and MUST NOT bill another provider call.
10. Cache entries MUST record `created_at` and SHOULD record token counts when the provider returns usage.

### Parallel text stages (v0.2)

11. Stages that depend only on measured evidence (`screen_patterns`, `ui_elements`, `section_recipes`, `visual_style`) MUST run concurrently as one wave.
12. `synthesize` MUST wait until the parallel wave finishes (success or soft-fail per stage).
13. Stage result order in `llm-design.json` SHOULD remain deterministic (canonical stage order).

### Vision stage (v0.2)

14. When `DIG_LLM_VISION` is not `false` and a settled screenshot exists for a primary viewport, enrichment MUST attempt one vision call (budget: one screenshot by default).
15. Vision model MUST come from `llm.scaling.roles.bulkVision` / `DIG_LLM_VISION_MODEL` / OpenRouter `visionModel`.
16. Vision output MUST be stored on `llm-design.json` as `vision` without inventing unseen UI beyond the screenshot JSON contract.
17. Vision failure MUST NOT fail the whole enrichment if text stages produced usable hypotheses (soft-fail).

### Confidence routing

18. Bulk model id MUST come from `knowledge/paths.json` → `llm.scaling.roles.bulkText` (override via env).
19. If a stage parse fails or mean item confidence is below `llm.scaling.confidenceEscalateBelow` (default `0.55`), the stage MUST retry once with `roles.qualityText` when configured and distinct from bulk.
20. Bulk Qwen-class models SHOULD run with `reasoning.effort=none` for structured JSON (`DIG_LLM_REASONING_EFFORT`).

### Cost telemetry (v0.2)

21. Each provider completion SHOULD record `prompt_tokens`, `completion_tokens`, and optional `cost` / estimated USD on the stage ledger.
22. Enrichment jobs SHOULD expose aggregate `cost` on the job record and in `llm-design.json`.

### Observability

23. Enrichment APIs MUST expose job list/get suitable for the web UI (`/api/enrichment`).
24. Stage results recorded on `llm-design.json` (`stages[]`) remain the package-local ledger (DIG-005 compatible).

## Non-goals (v0.2)

- Multi-worker HA across hosts / Redis / Bull  
- Multi-scroll vision budgets  
- Cost dashboards UI  

## Validation

Unit tests cover parallel wave ordering, stage-cache hit/miss, confidence escalate, vision soft-fail, cost aggregation, Postgres claim helper, and job runner completing without awaiting LLM when async.
