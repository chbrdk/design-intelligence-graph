# Storage: WebP + Postgres library

Added 2026-08-15. Updated for Phase F (embeddings / ontology nodes / Figma export).

## Screenshots

Default format is **WebP** (`knowledge/paths.json` → `captureLimits.screenshotFormat`, `webpQuality`).
All Playwright screenshots (settled, full-page, stabilized, scroll, states) use that setting.

Blobs stay on disk under `captures/`.

Matched styles default to **`essential`** (allowlisted props, no inherited dump). See `captureLimits.matchedStylesMode` in `paths.json` / [`capture-limits.md`](capture-limits.md).

## Postgres

Compose service `db` image: **`pgvector/pgvector:0.8.6-pg18-trixie`** (`knowledge/paths.json` → `database.image`).

- Env override: `DIG_DATABASE_URL`
- Migrations: `db/migrations/` via `npm run db:migrate`
- Tables: captures, viewports, sections, llm_analyses, llm_items, artifacts, collections, **design_nodes**, **embeddings** (`vector(384)`)
- Embeddings model default: `dig-hashing-v1` (`embeddings.dims` / `embeddings.model`)

### Image switch

If an older `postgres:18.6` volume was already initialized, recreate before expecting `CREATE EXTENSION vector`:

```bash
docker compose down
docker volume rm design-intelligence-graph_dig_pgdata   # wipes DB data
docker compose up -d db
npm run db:migrate
```

## Browse API

Base: `api.libraryPath` (`/api/library`)

- `GET /captures`
- `GET /sections?category=&signature=&q=`
- `GET /screens`
- `GET /screens/:viewportCaptureId` — screen + hotspots
- `GET /flows?capture_run_id=`
- `GET /search?q=` — cosine similarity over embeddings
- `GET /nodes?taxonomy_id=&q=` — ontology design nodes
- `GET /export/figma?capture_run_id=` — see [`figma-export.md`](figma-export.md)
- `GET/POST /collections`, `GET /collections/:id`, `POST|DELETE /collections/:id/captures`
- `GET /ui-elements`
- `GET /media?capture_run_id=&path=`

## Not in DB

Full DOM / `matched.jsonl` rows — keep on disk only.
