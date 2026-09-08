# Capture settle / screenshot readiness (2026-08-17, updated 2026-09-08)

Config: `knowledge/paths.json` → `captureSettle`. Runtime: `src/capture-settle.ts`.

## Why

Jobs used a **500ms** DOM quiet window and capped post-scroll quiet at **400ms**. Heavy marketing sites (heroes, lazy media, late CMP) often still paint after that, so Library screenshots looked half-loaded.

Award / animated sites never go fully quiet: waiting on `stabilizePage` with the full `jobTimeoutMs` (60s) twice per viewport × 3 viewports burned the **480s hard timeout** (`capture_hard_timeout_480000ms`). Settle must fail-open on a short budget so the rest of the capture can finish.

## Pipeline (per viewport, after successful `goto`)

1. **`initialWaitMs`** (default 2500) — fixed pause so first paint / deferred JS can start.
2. **`pauseAnimations`** — CSS animation/transition freeze *before* quiet waits (reduces endless MutationObserver noise).
3. **`stabilizePage(settleMs)`** (default 2500 quiet) — MutationObserver quiet window, capped by **`stabilizeTimeoutMs`** (default 12s), not full job timeout. `document.fonts.ready` is raced with **`fontsReadyTimeoutMs`** (default 5s).
4. **`scrollSettlePage`** — walk the page (`scrollPauseMs` between steps) so lazy media loads, then return to top. Wall clock capped by **`scrollMaxDurationMs`** (default 18s).
5. **`stabilizePage(postScrollQuietMs)`** (default 1500) — second quiet window after scroll, same stabilize budget.
6. Cookie dismiss → screenshots (animations paused again before final shot if needed).

JobRunner / CLI default `settleMs` comes from `captureSettle.settleMs` (not a hardcoded 500).

## Tuning

- Raise `initialWaitMs` / `settleMs` if screenshots still look incomplete.
- Raise `stabilizeTimeoutMs` only carefully — it multiplies across viewports and competes with the hard timeout.
- Prefer earlier animation pause + modest quiet windows over long hard waits on endlessly mutating pages.
- Playwright `maxConcurrent` is 6 and still-image ingest uses its own pool — longer settle still stretches wall-clock for large URL batches.
