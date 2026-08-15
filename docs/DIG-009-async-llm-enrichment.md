# DIG-009 — Async LLM Enrichment Queue

**Status:** Draft v0.1 — implemented  
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

### Stage cache

7. Before calling a model for stage `S`, the system MUST compute `evidence_sha256` over the stage evidence payload and look up cache key `(stage_id, model, evidence_sha256)`.
8. Cache hits MUST reuse stored raw responses and MUST NOT bill another provider call.
9. Cache entries MUST record `created_at` and MAY record token/cost estimates when available.

### Confidence routing

10. Bulk model id MUST come from `knowledge/paths.json` → `llm.scaling.roles.bulkText` (override via env).
11. If a stage parse fails or mean item confidence is below `llm.scaling.confidenceEscalateBelow` (default `0.55`), the stage MUST retry once with `roles.qualityText` when configured and distinct from bulk.
12. Bulk Qwen-class models SHOULD run with `reasoning.effort=none` for structured JSON (`DIG_LLM_REASONING_EFFORT`).

### Observability

13. Enrichment APIs MUST expose job list/get suitable for the web UI.
14. Stage results already recorded on `llm-design.json` (`stages[]`) remain the package-local ledger (DIG-005 compatible).

## Non-goals (v0.1)

- Multi-worker HA / Redis / Bull  
- Parallel stage fan-out  
- Vision stages in the enrichment worker  
- Cost dashboards  

## Validation

Unit tests cover stage-cache hit/miss, confidence escalate, and job runner completing without awaiting LLM when async. Migration `004_enrichment_queue.sql` defines durable tables when Postgres is used.
