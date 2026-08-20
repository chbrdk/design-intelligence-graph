# Capture batch jobs

**Date:** 2026-08-17  
**Config:** `knowledge/paths.json` → `captureJobs`  
**Catalogs:**
- `knowledge/catalogs/automotive-oem-50.json` (`automotive-oem-50`)
- `knowledge/catalogs/cross-industry-100.json` (`cross-industry-100`)
- `knowledge/catalogs/engineering-manufacturing-1000.json` (`engineering-manufacturing-1000`)
- `knowledge/catalogs/insurance-1000.json` (`insurance-1000`)
- `knowledge/catalogs/insurance-plus-500.json` (`insurance-plus-500`)
- `knowledge/catalogs/design-diversity-1000.json` (`design-diversity-1000`)  
**API:** `POST /api/jobs/batch`

Staging cannot run dozens of Chromium sessions at once. `JobRunner` caps Playwright at **`captureJobs.maxConcurrent: 6`**. Still-image ingest (bulk upload + Pinterest) uses a **separate** pool (`imageIngest.maxConcurrent: 4`) so moodboard jobs are not stuck behind URL captures. `maxBatch` is **1000**. See `knowledge/image-ingest.md`.

Each URL job still walks the three viewports **sequentially** in one browser. Coolify `limits_memory` / `limits_cpus` are unset on dig-api; raising Playwright further is possible but Chromium RAM is the real ceiling. Changing either cap requires an API restart and drops the in-memory queue.

Batch requests **skip URLs already in the library or already queued** (`skip_existing` defaults true). Same host with/without `www` counts as a duplicate.

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

```
{ "catalog": "engineering-manufacturing-1000" }
```

```
{ "catalog": "insurance-1000" }
```

```
{ "catalog": "insurance-plus-500" }
```

```
{ "catalog": "design-diversity-1000" }
```

Optional: `{ "urls": ["https://www.toyota.com/"] }` (capped by `captureJobs.maxBatch`). Force recapture with `{ "skip_existing": false }`.

Auth uses `assertDestructiveAuth` (token required even in dummy mode).

## Catalogs

**automotive-oem-50** — 50 manufacturer / volume-brand homepages (Wikipedia-style OEM ranking + brand extensions).

**cross-industry-100** — 100 public brand/product sites across retail, tech, finance, travel, healthcare, media, food, fashion, telecom, logistics, energy, industrial, SaaS/AI. Curated for Library design diversity (no overlap with the auto OEM list).

**engineering-manufacturing-1000** — 1000 worldwide engineering and manufacturing homepages (automation, machinery, EPC, aerospace, chemicals, metals, semiconductors, auto suppliers, medical devices, building materials, energy equipment). No overlap with the two smaller catalogs. Rebuild with `python3 scripts/build-engineering-manufacturing-catalog.py`.

**insurance-1000** — 1000 worldwide insurance homepages (life, P&C, health, reinsurance, brokers, mutuals, takaful, insurtech). Majors first, then Wikidata/Wikipedia official websites. No overlap with the three earlier catalogs. Rebuild with `python3 scripts/build-insurance-catalog.py`. Source snapshot: `knowledge/catalogs/sources/insurance-wikidata-2026.json`.

**insurance-plus-500** — 500 additional insurance homepages not in `insurance-1000` or the three earlier catalogs. Curated regional/specialty gaps first, then leftover Wikidata official websites round-robin by country. Rebuild with `python3 scripts/build-insurance-plus-500.py`. Staging API only learns the catalog id after an API deploy — queue with `{ "urls": [...] }` until then.

**design-diversity-1000** — 1000 cross-industry brand/product/agency homepages (banking, airlines, hotels, fashion, retail, SaaS, telecom, media, auto brands, curated QSR/fintech/creative). No overlap with the five earlier catalogs. Rebuild with `python3 scripts/build-design-diversity-1000.py`. Source snapshot: `knowledge/catalogs/sources/design-diversity-wikidata-2026.json`. See `knowledge/design-diversity-catalog.md`.

~2–3 minutes per URL at concurrency 6 → roughly **20–30 minutes** for 50 URLs, **~40–60 minutes** for 100, **~8–10 hours** for 1000 remaining.

## Queue persistence (2026-08-19)

Capture jobs are persisted to Postgres (`capture_jobs`, migration `014_capture_jobs.sql`) on every stage change. After an API restart:

- `queued` jobs resume in FIFO order (`queue_position`)
- in-flight jobs (`capturing` … `indexing`) are reset to `queued`
- upload jobs with missing temp files are marked `failed`
- `skip_existing` also checks active rows in `capture_jobs`, not only in-memory jobs

Enrichment jobs were already persisted (`enrichment_jobs`); capture queue was the gap.

## API crashes without manual deploy (2026-08-19)

Coolify `dig-v3:api` (`fjlcya8d9jnlecj4s44yru4q`) showed `last_restart_type: crash`, `restart_count: 3` (staging check). Container logs contained:

```
ProtocolError: Protocol error (Page.handleJavaScriptDialog): Not attached to an active page
```

That uncaught Playwright error terminates the Node process and wipes the in-memory queue. Mitigations shipped in the same change set:

1. `page.on("dialog")` auto-dismiss in `src/capture.ts`
2. Postgres-backed capture queue hydration on API boot (`src/capture-job-store.ts`)

If crashes continue, check Coolify logs for OOM (`limits_memory` is unset on dig-api).

## Hung Playwright slots (2026-08-20)

A stuck `page.screenshot` / CDP / `browser.close` can hold a capture slot forever. Coolify then marks dig-api `running:unhealthy` (healthcheck timeout) while Traefik returns `503 no available server`.

Mitigations:

1. `captureJobs.hardTimeoutMs` (default 480s) — JobRunner aborts the capture AbortSignal and force-kills Chromium/Firefox
2. `forceCloseBrowser` — SIGKILL if `browser.close()` hangs (>8s)
3. `captureJobs.checkionTimeoutMs` (default 120s) — CHECKION attach cannot block the pipeline
4. `captureJobs.maxConcurrent` at **4** (child-process captures; was briefly 2 after event-loop wedges)
5. Boot defers `runner.kick()` until craft graph warm finishes so kNN + Playwright do not wedge the event loop together
6. Override anytime with `DIG_CAPTURE_MAX_CONCURRENT`
7. Playwright runs in a **forked child** (`src/capture-child.ts`) via `captureViaChildOrInProcess` — abort/hard-timeout SIGKILLs the child (and Chromium). Set `DIG_CAPTURE_IN_PROCESS=1` to force in-process capture for debugging.
