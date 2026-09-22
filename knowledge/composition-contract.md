# Composition contract (SPIRION Welle 2)

**Path:** `derived/composition-contract.json` (per capture package)  
**Schema:** `schemas/composition-contract.schema.json`  
**Config:** `knowledge/paths.json` → `compositionContract`  
**Code:** `src/composition-contract.ts`

Single-artboard craft hints for campaign / graphic assets (`campaign_keyvisual`, `social_post`, `print_ad`, …).  
Web screens keep `look_contract` + `page_rhythm`.

## Fields

focal · hierarchy · negativeSpace · typeRoles · colorAxes · marginBleed · layoutFamily · avoid[] · ctaRole

## Enrichment

Upload / Dribbble sync → dedicated **graphic artboard package** (`src/graphic-package.ts`):

1. User picks `assetKind` on upload (campaign / print / social / …).
2. `enrichGraphicFromImage` + kind defaults write `composition_contract`.
3. JobRunner queues **graphic vision enrichment** (`applyGraphicLlmEnrichment` via EnrichmentQueue) — artboard `vision_page`, fine **graphic_craft_metrics** (~200 axes), and `llm-design.json`. No web section/`page_rhythm` stages.
4. Verify requires artboard + composition_contract; skips web relations.
5. Index sets `enrichment_status=pending` until vision completes, then `ready`.

Craft metric document: `knowledge/graphic-craft-metrics.md` → `derived/graphic-craft-metrics.json`.

Web screens keep `look_contract` + `page_rhythm` on the Playwright / legacy still path.
