# Design facets (screen profile + search contract)

**Date:** 2026-08-17  
**Code:** [`src/design-facets.ts`](../src/design-facets.ts) · API `package.design_facets` on `GET /api/library/analyses/:capture_run_id`

## Shape (`0.1.0`)

| Field | Use |
|-------|-----|
| `page_type` | Page archetype (marketing agency, automotive, finance…) |
| `industry_tags` | `category_tags` + screen_pattern names |
| `style` | Atmosphere / design style |
| `layout` | `layout_system` or `vertical_rhythm` |
| `color_mood` | Palette feel |
| `typography` | Type feel |
| `above_fold_job` | One-line ATF job |
| `section_categories` | Unique vision band categories |
| `modules` | Notable modules + band labels |
| `confidence` | Vision page confidence |

Derived live from `derived/vision-page.json` + `vision-layout.json` (+ indexed labels). No DB columns yet — Library filters should reuse this shape later.
