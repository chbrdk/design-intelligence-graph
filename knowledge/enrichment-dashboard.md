# Enrichment + analyses dashboard

Added 2026-08-15.

## Goal

Show async enrichment ops and already-indexed LLM results in the slim DIG UI without inventing a separate product surface.

## Data sources

| Surface | Source |
| --- | --- |
| Enrichment list/detail | `GET` `api.enrichmentPath` — in-memory queue merged with `enrichment_jobs` |
| Queue page | `GET /api/jobs` + skip/reorder `DELETE`/`PATCH /api/jobs/:id` (API not live until queue-idle deploy) |
| Analyses list | `llm_analyses` via `GET /api/library/analyses` |
| Analysis detail | `llm_items` grouped by kind + optional `derived/llm-design.json` (vision, cost, stages) |
| Screen detail | Same analysis detail keyed by `capture_run_id` |

## Indexing note

`visual_style` items require migration `006_llm_visual_style_kind.sql`. Re-index a package after enrichment completes so the Analyses panel stays current.

## Paths

Never hardcode API paths — use [`paths.json`](paths.json) → `web/src/dig-config.ts`.
