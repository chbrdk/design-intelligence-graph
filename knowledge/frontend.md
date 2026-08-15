# Slim web UI

Added 2026-08-15.

## Purpose

URL entry plus live status for **detection** (capture) and **ingestion** (verify + graph index).

## Endpoints

Paths come from [`paths.json`](paths.json):

- `POST /api/jobs` `{ "url": "https://…" }` → `202` job snapshot
- `GET /api/jobs/:id` → snapshot
- `GET /api/jobs/:id/events` → SSE `event: job`

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
