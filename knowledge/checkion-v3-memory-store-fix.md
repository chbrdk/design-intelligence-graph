# CHECKION v3 — memory store + screenshot for DIG (dev)

**Date:** 2026-08-15  
**Clone:** `/Volumes/DevStorage/Development/checkion-v3`

## Problem

Live `POST /api/scans` completed and wrote JPEG under `data/screenshots/`, but `GET /api/scans/:id` returned `404` in Next.js webpack/dev — fixture `scan-store` / `project-store` were not shared across route bundles.

## Fix (local clone)

1. `apps/web/lib/fixtures/scan-store.ts` — mutable memory on `globalThis.__checkionV3ScanMemory`
2. `apps/web/lib/fixtures/project-store.ts` — projects on `globalThis.__checkionV3ProjectMemory`
3. `apps/web/app/api/scans/[id]/screenshot/route.ts` — serve JPEG from disk by id before requiring scan row

Commit these upstream in checkion-v3 when ready; DIG depends on them for local SoT without Postgres.
