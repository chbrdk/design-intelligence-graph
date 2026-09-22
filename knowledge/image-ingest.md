# Still-image ingest (bulk upload)

**Date:** 2026-09-22  
**Config:** `knowledge/paths.json` → `imageIngest`  
**Code:** `src/image-upload.ts` · `src/image-ingest.ts` · `src/graphic-package.ts` · `JobRunner` image pool  
**API:** `POST /api/jobs/images`  
**UI:** Capture → **Graphic & campaign upload**

Upload is kind-first. The multipart field `assetKind` (default `campaign_keyvisual`) selects the pipeline:

| Kind | Pipeline | Package shape |
|------|----------|---------------|
| `campaign_keyvisual`, `print_ad`, `social_post`, `brand_system`, `moodboard`, `other_graphic` | **Graphic** (`graphic_asset_ingest:<kind>`) | Native artboard viewport, `composition_contract`, vision enrichment (no web LLM / `page_rhythm`) |
| `web_screen` | Legacy still → desktop viewport (`bulk_image_upload`) | Same path as Pinterest pins |

URL captures keep Playwright + CHECKION. Pinterest stays moodboard/web-screen style.

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
assetKind: campaign_keyvisual | print_ad | social_post | … | web_screen
platformProjectId: optional collection id
```

Limits come from `imageIngest` (do not hardcode in callers): `maxFiles` 40, `maxBytes` 12 MiB, MIME jpeg/png/webp/gif. Files land in `imageIngest.stagingDir` and are deleted after each job.

Canonical URLs use `imageIngest.urlTemplate` with `{website}` from `pinterest.website` / `coolify.digFqdn`.

Island Capture posts through `/api/dig` + `/api/jobs` + `/images`. `apps/web/next.config.ts` reads `imageIngest.islandProxyMaxBody` from `knowledge/paths.json` (copied into the island image so `next start` can load the config).

Auth uses `assertDestructiveAuth` (Bearer even in dummy mode), same as catalog batch.

## Graphic verify / index

Graphic packages skip web relation checks. Ingest writes `derived/composition-contract.json` + `derived/spirion-asset.json`. JobRunner then queues **graphic vision enrichment** (`src/graphic-llm-enrich.ts`) so Library gets `vision_page`, **~113 craft metrics** (`derived/graphic-craft-metrics.json`), and design facets — not the web section/`page_rhythm` LLM path. See `knowledge/graphic-craft-metrics.md`.
