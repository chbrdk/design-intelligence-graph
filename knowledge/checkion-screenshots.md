# CHECKION full-page screenshots (DIG screen SoT)

**Date:** 2026-08-15

DIG uses **CHECKION v3** for complete-page screenshots. Playwright `settled` / `full-page` webp remain as DOM-capture side artifacts; library + vision prefer the CHECKION JPEG once attached.

## Flow

1. DIG Playwright capture (DOM/CSS/ontology) runs as today.
2. Job runner calls CHECKION `POST /api/scans` (`waitForCompletion: false`) → poll until complete or `attachPollTimeoutMs` (45s) → `GET …/screenshot`. Each HTTP call uses `AbortSignal.timeout(attachFetchTimeoutMs)` (20s).
3. JPEG written to `viewports/desktop/screenshots/checkion-full-page.jpg` and set as `artifacts.full_page_screenshot`.
4. Manifest `document.width/height` updated from JPEG SOF dims when present.
5. Library `primary_url` / vision follow `full_page_screenshot`.

## Env (names in `knowledge/paths.json` → `checkionV3`)

| Var | Purpose |
|-----|---------|
| `CHECKION_API_URL` | Base (default `http://127.0.0.1:3007`) |
| `CHECKION_API_TOKEN` | Bearer for staging / Plexon; optional for local without Plexon |
| `CHECKION_PROJECT_ID` | Optional; else auto-create/find project `DIG` |
| `DIG_CHECKION_SCREENSHOTS` | `1` (default) try CHECKION attach; `0` skip |
| `DIG_CHECKION_STRICT` | `1` fail DIG job if CHECKION attach errors; default soft-skip and keep Playwright full-page |
| `CHECKION_POLL_TIMEOUT_MS` | Override poll budget (default `checkionV3.attachPollTimeoutMs` = 45000) |
| `CHECKION_FETCH_TIMEOUT_MS` | Override per-request abort (default `checkionV3.attachFetchTimeoutMs` = 20000) |

## Local CHECKION

```bash
cd /Volumes/DevStorage/Development/checkion-v3
CHECKION_LIVE_SCANS=1 npm run dev   # :3007
```

Sibling UI kit: `/Volumes/DevStorage/Development/msqdx-ui` (file: dep of checkion-v3).

**Dev note (2026-08-15):** Next.js webpack can isolate fixture module state per route. checkion-v3 pins scan/project memory on `globalThis`, and `GET …/screenshot` serves on-disk JPEG even if scan lookup misses. Without that, DIG poll got `404 not_found` after a successful live POST.

## Verified smoke

`https://www.apple.com/de/` → JPEG **1920×3808** (~348KB) via local CHECKION live scan.

## Code

- `src/checkion-client.ts` — API client + JPEG dims
- `src/checkion-attach.ts` — write into capture package
- `src/job-runner.ts` — attach after DIG capture

Further detections (a11y scores, overlays, etc.) stay in CHECKION; DIG consumes them later via the same API.
