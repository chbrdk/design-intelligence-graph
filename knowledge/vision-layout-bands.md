# Vision layout bands (2026-08-16)

## Goal

Detect vertical design sections from the **screenshot** (not only DOM) and return **normalized coordinates** for Library overlays + section looks.

## Pipeline

1. Enrichment stage `vision_layout` ([`src/llm-vision.ts`](../src/llm-vision.ts) `runVisionLayoutAnalysis`)
2. Tall pages → vertical JPEG **tiles** ([`src/vision-layout.ts`](../src/vision-layout.ts) `buildVisionLayoutTiles`), bands remapped to full-image space
3. Artifact: `derived/vision-layout.json` (`paths.visionLayout.relativePath`)
4. Crops: `viewports/desktop/sections/vision_{id}.webp` when DOM looks are thin
5. Screen detail API prefers vision bands as `hotspots[].normalized`

## Schema

```json
{
  "bands": [
    {
      "id": "band_1",
      "label": "Hero",
      "category": "hero",
      "box": { "x": 0, "y": 0, "width": 1, "height": 0.18 },
      "confidence": 0.86
    }
  ],
  "notes": "…"
}
```

`box` is always 0–1 relative to the analyzed image (full page after tile merge).

## Verify

- Enrichment stages include `vision_layout` complete
- Library screen detail Full page overlay aligns with hero / grids / lifestyle
- Opel-style thin `commerce·body` DOM recipes no longer dominate overlay when vision bands exist
