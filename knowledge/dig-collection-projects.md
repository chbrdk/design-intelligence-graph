# DIG Collection projects — durable + capture scope

**Date:** 2026-08-15  
**Spec:** `docs/DIG-013-plexon-app.md` §5

## Structured slices

| Slice | Status |
|-------|--------|
| P2a Island PUT/GET (memory) | Done |
| P2b Postgres `dig_projects` + capture columns | Done |
| **P2c Wave 2 Library/MCP `dig_reference_*`** | Done |
| P2d Live MCP Bearer gate / Assistant wiring | Later |

## Durable SoT

- Migration: `db/migrations/009_dig_projects.sql`
- dig-api: `PUT/GET /api/platform/provisioning/projects/{platformProjectId}` (`src/platform-provisioning-api.ts`)
- Island route proxies to dig-api when healthy + `PLEXON_SERVICE_SECRET`; else memory fallback

## Capture scope

- `POST /api/jobs` body may include `platformProjectId` / `digProjectId`
- Index writes `captures.platform_project_id` + `captures.dig_project_id`
- Library: `GET /api/library/captures?platformProjectId=`
- Capture UI reads `?platformProjectId=` from Collection deep link

## Coolify note

Redeploy **dig-v3:api** (migrate on start) **and** island after this lands. Shared secret must match plexon ↔ island ↔ api for durable upserts.
