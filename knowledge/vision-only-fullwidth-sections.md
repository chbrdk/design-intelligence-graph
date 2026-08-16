# Vision-only full-width sections (2026-08-16)

## Intent

Section detection is **LLM-only** on the desktop full-page shot. DOM compositions / CTA / heading boxes must not drive overlays or the section accordion.

## Rules

1. Bands are always full-bleed: `box.x = 0`, `box.width = 1` (enforced in `normalizeVisionBox`).
2. Prompt forbids marking CTAs, cards, columns as bands — those belong in Run C (section crop VL).
3. Library screen detail returns vision hotspots only (no DOM fallback).
4. Enrichment clears DOM `section_descriptions` and writes vision band looks only.
5. Vision timeout default floor: `DIG_LLM_VISION_TIMEOUT_MS` or 300s (abort was causing empty vision → wrong DOM UI).

## Docs

See `knowledge/vision-desktop-pipeline.md`.
