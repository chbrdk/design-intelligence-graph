# Capture batch jobs

**Date:** 2026-08-17  
**Config:** `knowledge/paths.json` → `captureJobs`  
**Catalogs:**
- `knowledge/catalogs/automotive-oem-50.json` (`automotive-oem-50`)
- `knowledge/catalogs/cross-industry-100.json` (`cross-industry-100`)  
**API:** `POST /api/jobs/batch`

Staging cannot run dozens of Chromium sessions at once. `JobRunner` caps parallelism at **`maxConcurrent: 3`**: up to three Playwright captures (and their CHECKION attaches) run together; the rest stay queued. `maxBatch` is **100**.

Each job still walks the three viewports **sequentially** in one browser. Raising concurrency above 3 on this Coolify box risks OOM; changing the value requires an API restart and drops the in-memory queue.

## Start a catalog

```
POST /api/jobs/batch
Authorization: Bearer $DIG_API_TOKEN
Content-Type: application/json

{ "catalog": "automotive-oem-50" }
```

```
{ "catalog": "cross-industry-100" }
```

Optional: `{ "urls": ["https://www.toyota.com/"] }` (capped by `captureJobs.maxBatch`).

Auth uses `assertDestructiveAuth` (token required even in dummy mode).

## Catalogs

**automotive-oem-50** — 50 manufacturer / volume-brand homepages (Wikipedia-style OEM ranking + brand extensions).

**cross-industry-100** — 100 public brand/product sites across retail, tech, finance, travel, healthcare, media, food, fashion, telecom, logistics, energy, industrial, SaaS/AI. Curated for Library design diversity (no overlap with the auto OEM list).

~2–3 minutes per URL at concurrency 3 → roughly **40–50 minutes** for 50 URLs, **~70–100 minutes** for 100. Jobs are **in-memory**; an API restart drops the queue.
