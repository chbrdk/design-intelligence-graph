# Capture batch jobs

**Date:** 2026-08-17  
**Config:** `knowledge/paths.json` → `captureJobs`  
**Catalog:** `knowledge/catalogs/automotive-oem-50.json`  
**API:** `POST /api/jobs/batch`

Staging cannot run 50 Chromium sessions at once. `JobRunner` caps parallelism at **`maxConcurrent: 3`**: up to three Playwright captures (and their CHECKION attaches) run together; the rest stay queued.

Each job still walks the three viewports **sequentially** in one browser. Raising concurrency above 3 on this Coolify box risks OOM; changing the value requires an API restart and drops the in-memory queue.

## Start the automotive OEM catalog

```
POST /api/jobs/batch
Authorization: Bearer $DIG_API_TOKEN
Content-Type: application/json

{ "catalog": "automotive-oem-50" }
```

Optional: `{ "urls": ["https://www.toyota.com/"] }` (capped by `captureJobs.maxBatch`).

Auth uses `assertDestructiveAuth` (token required even in dummy mode).

## Catalog

50 public manufacturer / volume-brand homepages. Group ranks 1–15 follow Wikipedia 2025 sales; remaining rows are next-tier OEMs and major brands from those groups (Audi, Porsche, Kia, Lexus, Volvo, Tesla, …).

~2–3 minutes per URL, three at a time → on the order of **40–50 minutes** for the full 50. Jobs are **in-memory**; an API restart drops the queue.
