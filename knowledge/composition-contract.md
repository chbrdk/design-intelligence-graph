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

Upload / Dribbble sync → deterministic image analysis (`enrichGraphicFromImage`) writes the contract and sets `enrichment_status=ready` when the asset is not craft-thin.
