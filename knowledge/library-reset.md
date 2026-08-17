# Library reset (fresh start)

**Date:** 2026-08-17  
**Config:** `knowledge/paths.json` → `libraryReset`  
**Code:** `src/library-reset.ts` · `POST /api/library/reset`

Wipes **indexed captures** so staging can start clean after WAF/Audi wall experiments.

## Request

```
POST /api/library/reset
Authorization: Bearer $DIG_API_TOKEN
Content-Type: application/json

{ "confirm": "reset-library" }
```

`confirm` must match `libraryReset.confirm`. Auth is required **even when** `DIG_FEDERATION_MODE=dummy` (`assertDestructiveAuth`). `x-service-secret` also works.

## What it deletes

| Store | Action |
|-------|--------|
| Postgres | `TRUNCATE captures, collections, llm_stage_cache, dig_flows CASCADE` (viewports, sections, LLM, artifacts, embeddings, design_references, enrichment_jobs) |
| Disk | Contents of `captures/` and `indexes/` (directory itself stays) |

## What it keeps

- `schema_migrations`
- `dig_projects` (Collection bindings); counters reset to 0
- In-memory `/api/jobs` until the API process restarts

## Safety

Only empties directories whose basename is `captures` or `indexes`.
