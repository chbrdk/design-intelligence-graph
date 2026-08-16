# Vision layout + UX + CHECKION (roadmap)

**Updated:** 2026-08-16

## Do we still need explicit layout / spacing / placement?

Yes — but as **vision-grounded page language**, not DOM geometry dumps.

| Layer | What we need | Where |
|-------|----------------|-------|
| Whole page (UX) | Vertical rhythm, density, above-fold job, scroll story, brand hierarchy, friction | Extend `vision_page` |
| Bands | Full-width strips only (already) | `vision_layout` |
| Inside band | Columns, CTA placement, padding feel, type scale, media vs text | `vision_section` (Run C) |
| Measured tokens | Colors/type already from capture | `design-tokens` (keep; don’t mix into overlay SoT) |

Useful structured fields for later LLMs (add to `vision_page` when we extend prompts):

- `layout_system`: e.g. single-column / split / grid / full-bleed stacks
- `spacing_feel`: tight / airy / uneven + 1–2 concrete cues
- `alignment`: left / centered / mixed
- `above_fold_job`: what the first screen must achieve
- `ux_flow`: top→bottom user story in 3–6 beats
- `ux_strengths` / `ux_risks`: short lists (hierarchy, CTA clarity, clutter, contrast)

Band boxes stay coarse (y/height full-width). Pixel-perfect gaps are optional later via CHECKION / measured CSS — not required for band detection.

## Whole-page UX pass

Treat **Run A (`vision_page`)** as the page-level UX read (one shot on the full desktop screenshot). Run C stays local to the crop. Do **not** invent a fourth parallel stage until A is rich enough.

## Later: CHECKION single-page scan

**Not in this sprint.** When ready:

1. After DIG capture (or enrichment), trigger CHECKION `scan_start` for the same URL (single page).
2. Store `checkion_scan_id` on the capture / enrichment package.
3. Pull screenshot (already partially used), scores, issues into Library “Quality” / rebuild brief.
4. Merge **quality + a11y** signals with DIG vision catalog — DIG remains SoT for design sections/overlays.

Refs: `knowledge/dig-checkion-boundary.md`, `knowledge/checkion-v3-capability-map.md`, `knowledge/checkion-v3-scan-api.md`.

## Near-term DIG fixes (before CHECKION)

1. Stop leaking last-tile `notes` into every section look. **done**
2. Rebuild `design_summary` from `vision_page` (+ UX). **done**
3. Model-friendly split for Qwen 3.7 Flash:
   - `vision_page` = compact **image** visual catalog
   - `vision_page_ux` = small **text-only** UX/layout JSON grounded on catalog + bands (no second full-page VL)
4. CHECKION single-page scan still later.
