# Design facets (screen profile + search contract)

**Date:** 2026-08-17  
**Code:** [`src/design-facets.ts`](../src/design-facets.ts) · API `package.design_facets` on `GET /api/library/analyses/:capture_run_id`  
**Version:** `0.2.0`

## Shape

| Field | Vocab / use |
|-------|-------------|
| `page_type` | Slug, e.g. `marketing_agency_landing_page` |
| `industry_tags` | 1–3 of `automotive`, `finance`, `marketing_agency`, `luxury`, `ecommerce`, `media`, `tech`, `healthcare`, `travel`, `food`, `fashion`, `real_estate`, `nonprofit`, `other` |
| `style` | `minimal`, `editorial`, `high-energy`, `luxury-dark`, `corporate`, `playful`, `brutalist`, `photographic` |
| `layout` | `full-bleed stacks`, `split columns`, `card grid`, `single column`, `mixed` |
| `color_mood` | Short free text (truncated) |
| `typography` | Short free text |
| `above_fold_job` | One line |
| `section_categories` | Unique vision band categories |
| `modules` | `notable_modules` only (not campaign names) |

Campaign / content noise (`cannes lions`, `sustainability`, `hero`, `ticker`) is dropped. Screen-pattern labels like `Marketing Home` map to `marketing_agency`.
