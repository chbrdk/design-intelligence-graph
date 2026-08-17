# Capture batch jobs

**Date:** 2026-08-17  
**Config:** `knowledge/paths.json` → `captureJobs`  
**Catalog:** `knowledge/catalogs/automotive-oem-50.json`  
**API:** `POST /api/jobs/batch`

Staging Playwright cannot run 50 Chromium sessions at once. `JobRunner` therefore keeps **`maxConcurrent: 1`**: jobs queue, one capture runs, the next starts when it finishes.

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

~2–3 minutes per URL → on the order of **2 hours** for the full 50 with concurrency 1. Jobs are **in-memory**; an API restart drops the queue.
