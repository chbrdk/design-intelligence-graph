# Desktop vision pipeline (2026-08-16)

## Goal

Simple desktop visual understanding for later LLMs — **vision only**, no DOM overlays:

1. One full-page **desktop** screenshot
2. **Run A** — compact visual catalog (`vision_page`, image)
3. **Run B** — **full-width** section bands (`vision_layout`) — parallel with A
4. **Run A2** — whole-page UX/layout (`vision_page_ux`, **text-only** on catalog + bands)
5. Crop bands from the shot
6. **Run C** — detailed VL per crop (`vision_section`, max 8)

DOM/text stages still run; they do **not** gate crops or overlays. Vision bands are SoT for Library overlays.

## Artifacts

| Stage | Path | Config key |
|-------|------|------------|
| `vision_page` | `derived/vision-page.json` | `paths.visionPage.relativePath` |
| `vision_layout` | `derived/vision-layout.json` | `paths.visionLayout.relativePath` |
| crops | `viewports/desktop/sections/vision_*.webp` + `derived/section-crops.json` | `paths.sectionCrops` |

## Orchestration

[`src/llm-enrich.ts`](../src/llm-enrich.ts): `Promise.all([runVisionPageAnalysis, runVisionLayoutAnalysis])` → `emitVisionBandCrops` → `runVisionBandSectionVisions`.

Compat: `llm.vision` is filled from the page catalog (heading/cta/layout_order) so quality-eval / rebuild-brief keep working; stage `vision_screen` is recorded as a projection of `vision_page`.

## Verify

- Enrichment stages include `vision_page` + `vision_layout` complete, then `vision_section`
- Library screen detail overlay uses vision bands
- Accordion section looks include vision band ids with Vision: detail text
