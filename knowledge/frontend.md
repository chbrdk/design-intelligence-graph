# Slim web UI

Added 2026-08-15. Updated 2026-08-18 (empty JSON, stale chunks, island surfaces).

## Purpose

URL entry plus live status for **detection** (capture), **ingestion** (verify + graph index), **async enrichment** ops, and **indexed LLM analyses**.

## Endpoints

Paths come from [`paths.json`](paths.json):

- `POST /api/jobs` `{ "url": "https://…" }` → `202` job snapshot
- `POST /api/jobs/batch` `{ "catalog": "automotive-oem-50" }` / `insurance-1000` → queue many URLs (`knowledge/capture-batch.md`)
- `GET /api/jobs/:id` → snapshot
- `GET /api/jobs/:id/events` → SSE `event: job`
- `GET /api/enrichment` → enrichment jobs (memory + Postgres)
- `GET /api/enrichment/:id` → single enrichment job
- `GET /api/library/analyses` → indexed LLM analyses
- `GET /api/library/analyses/:capture_run_id` → grouped items + package extras (vision/cost/stages)

## Dashboard panels

1. **Home pipeline** — `StatusMeterPanel` + `KpiStrip` + `PipelinePanel` from live `GET /api/jobs` and `GET /api/enrichment`
2. **Queue** (`/queue`) — editable capture waiting list (`LayersPanel` + `DataTable`); skip/reorder via `DELETE`/`PATCH /api/jobs/:id` once dig-api is deployed
3. **Enrichment** — queue status; link into Library when a screen exists
4. **Analyses** — design summary cards that open Library

Island `apps/web/lib/dig-api.ts` `readJson` must tolerate empty/truncated upstream bodies (Traefik 502 during Playwright batches). Do not call `response.json()` directly.

After an island Coolify deploy, an open tab can throw `ChunkLoadError` (404 on `/_next/static/chunks/…` from the previous webpack hash). Hard-refresh the tab. `ChunkLoadRecovery` reloads once per session when that happens. Do not redeploy the API for this.

Flows UI: [`docs/DIG-011-flows-ui.md`](../docs/DIG-011-flows-ui.md) · `#/library/flows`. Modules: [`library-module-gallery.md`](library-module-gallery.md) · `#/library/sections`.
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
