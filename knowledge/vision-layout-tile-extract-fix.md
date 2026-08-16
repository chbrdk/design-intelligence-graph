# Vision layout tile extract failure (2026-08-16)

## Symptom

Opel capture: `vision_page` complete, `vision_layout` **failed** with `extract_area: bad extract area`. Library fell back to DOM hotspots labeled `body` / `media`.

## Cause

`buildVisionLayoutTiles` called `sharp.metadata()` on a pipeline that still had a pending `resize()`. Metadata returns **pre-resize** dimensions; `extract({ width: originalWidth })` then ran on the resized image → Sharp error.

## Fix

Materialize resize with `toBuffer({ resolveWithObject: true })`, tile from that buffer using `info.width` / `info.height`.

## Verify

- Unit: `buildVisionLayoutTiles resizes wide images before extract`
- Re-capture Opel after dig-api redeploy → `vision_layout` complete + labeled band overlays
