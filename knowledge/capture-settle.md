# Capture settle / screenshot readiness (2026-08-17)

Config: `knowledge/paths.json` → `captureSettle`. Runtime: `src/capture-settle.ts`.

## Why

Jobs used a **500ms** DOM quiet window and capped post-scroll quiet at **400ms**. Heavy marketing sites (heroes, lazy media, late CMP) often still paint after that, so Library screenshots looked half-loaded.

## Pipeline (per viewport, after successful `goto`)

1. **`initialWaitMs`** (default 2500) — fixed pause so first paint / deferred JS can start.
2. **`stabilizePage(settleMs)`** (default 2500 quiet) — MutationObserver quiet window, capped by capture timeout.
3. **`scrollSettlePage`** — walk the page (`scrollPauseMs` between steps) so lazy media loads, then return to top.
4. **`stabilizePage(postScrollQuietMs)`** (default 1500) — second quiet window after scroll (no longer hard-capped at 400).
5. Cookie dismiss → screenshots.

JobRunner / CLI default `settleMs` comes from `captureSettle.settleMs` (not a hardcoded 500).

## Tuning

Raise `initialWaitMs` / `settleMs` if still incomplete; Playwright `maxConcurrent` is 6 and still-image ingest uses its own pool — longer settle still stretches wall-clock for large URL batches.
