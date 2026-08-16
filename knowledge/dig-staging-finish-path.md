# DIG staging finish path — Island auth + Collection continuity (2026-08-15)

## Shipped

1. Island `/api/dig/*` proxy injects `Authorization: Bearer $DIG_API_TOKEN` and/or `X-Service-Secret` when the browser does not send them — required before `DIG_FEDERATION_MODE=live`.
2. Enrichment reindex preserves Collection scope via `resolveIndexScopeFromCapture` (reads `captures.platform_project_id` / `dig_project_id`).
3. Library UI: DesignReferences list, `similar_to`, prompt-pack, generate; nav + Assistant keep `platformProjectId`.
4. MCP: `dig_reference_prompt_pack`, `dig_generate`.

## Coolify flip (after deploy smoke)

| App | Key | Value |
|-----|-----|--------|
| dig-api | `DIG_FEDERATION_MODE` | `live` |
| dig (island) | `DIG_FEDERATION_MODE` | `live` |
| dig (island) | `DIG_API_TOKEN` | same as dig-api |
| dig (island) | `PLEXON_SERVICE_SECRET` | same as dig-api / plexon |

Do **not** flip until island image includes proxy inject.

## DIG-011

Phases A–D core + Flows Interactive UI shipped. PG `009` apply + CHECKION seed worker still parked.

## Verified live (2026-08-15)

- `DIG_FEDERATION_MODE=live` on dig-api + island
- Island proxy injects Bearer → `/api/library/references?platformProjectId=…` 200
- `POST …/references/reindex` → emitted/indexed screen ref for example.com
- `POST …/references/generate` → layout `generation_version` `0.2.0`
