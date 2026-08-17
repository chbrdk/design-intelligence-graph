# Slim web UI

Added 2026-08-15. Updated 2026-08-15 (enrichment + analyses dashboard).

## Purpose

URL entry plus live status for **detection** (capture), **ingestion** (verify + graph index), **async enrichment** ops, and **indexed LLM analyses**.

## Endpoints

Paths come from [`paths.json`](paths.json):

- `POST /api/jobs` `{ "url": "https://…" }` → `202` job snapshot
- `POST /api/jobs/batch` `{ "catalog": "automotive-oem-50" }` → queue many URLs (`knowledge/capture-batch.md`)
- `GET /api/jobs/:id` → snapshot
- `GET /api/jobs/:id/events` → SSE `event: job`
- `GET /api/enrichment` → enrichment jobs (memory + Postgres)
- `GET /api/enrichment/:id` → single enrichment job
- `GET /api/library/analyses` → indexed LLM analyses
- `GET /api/library/analyses/:capture_run_id` → grouped items + package extras (vision/cost/stages)

## Dashboard panels

1. **Pipeline status** — capture job timeline; shows `enrichment_job_id` when async LLM is queued
2. **Enrichment** — queue status, models, tokens, estimated USD; link to analysis
3. **Analyses** — design summary, patterns, UI elements, recipes, visual style, page flow, vision/cost
4. **Library** — Screens / Sections / **Flows** (DIG-011 list/detail/Interactive); screen detail keeps **Page narrative** (`page_flow`) separate from multi-screen Flows

Flows UI: [`docs/DIG-011-flows-ui.md`](../docs/DIG-011-flows-ui.md) · `#/library/flows`
## Local

```bash
npm run web:install
npm run web:build
npm run serve                 # http://127.0.0.1:8787
```

Dev with HMR: `npm run serve:api` + `npm run web:dev`.

## OrbStack

```bash
docker compose up --build web
```

Open `http://127.0.0.1:8787` (port from `paths.json` → `docker.webHostPort`).
