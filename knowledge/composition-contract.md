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
3. JobRunner skips web LLM (`skipped_graphic_pipeline`).
4. Verify requires artboard + composition_contract; skips web relations.
5. Index sets `enrichment_status=ready` when the asset is not craft-thin.

Web screens keep `look_contract` + `page_rhythm` on the Playwright / legacy still path.
