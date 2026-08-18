# Still-image ingest (bulk upload)

**Date:** 2026-08-18  
**Config:** `knowledge/paths.json` → `imageIngest`  
**Code:** `src/image-upload.ts` · `src/image-ingest.ts` · `JobRunner` image pool  
**API:** `POST /api/jobs/images`  
**UI:** Capture → **Bulk image upload**

Pinterest Trial access is still pending. Until OAuth works, moodboard stills go through the same desktop ingest as board pins: Sharp resize → verify → graph/Postgres index → async enrichment. URL captures keep using Playwright + CHECKION.

## Parallelism

`JobRunner` has two caps:

| Pool | Config | Default | Work |
|------|--------|---------|------|
| Playwright | `captureJobs.maxConcurrent` | **6** | Public URL captures + CHECKION attach |
| Still image | `imageIngest.maxConcurrent` | **4** | Uploads and Pinterest pins |

Image jobs do not wait behind a long URL queue. Changing either cap requires an API restart and drops the in-memory job list. Re-queue catalogs with `{ "skip_existing": true }` (the default).

## Upload API

```
POST /api/jobs/images
Authorization: Bearer $DIG_API_TOKEN
Content-Type: multipart/form-data

files: (repeated image parts)
platformProjectId: optional collection id
```

Limits come from `imageIngest` (do not hardcode in callers): `maxFiles` 40, `maxBytes` 12 MiB, MIME jpeg/png/webp/gif. Files land in `imageIngest.stagingDir` and are deleted after each job.

Canonical URLs use `imageIngest.urlTemplate` with `{website}` from `pinterest.website` / `coolify.digFqdn`.

Island Capture posts through `/api/dig/api/jobs/images`. `apps/web/next.config.ts` reads `imageIngest.islandProxyMaxBody` for the proxy body cap.

Auth uses `assertDestructiveAuth` (Bearer even in dummy mode), same as catalog batch.
