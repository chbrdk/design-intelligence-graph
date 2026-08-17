# Design facets (screen profile + search contract)

**Date:** 2026-08-17  
**Code:** [`src/design-facets.ts`](../src/design-facets.ts) · API `package.design_facets` on `GET /api/library/analyses/:capture_run_id`  
**List/search:** `GET /api/library/screens?style=&layout=&industry=` (query keys in `knowledge/paths.json` → `libraryScreenFacets`)  
**MCP:** `dig_screen_search` / `dig_capture_prompt_pack` — [`mcp-library-loop.md`](mcp-library-loop.md)  
**Version:** `0.3.0`  
**Look contract:** [`look-contract.md`](look-contract.md)

## Library browse

Screen cards carry a compact `design_facets` summary (`page_type`, `style`, `layout`, `industry_tags`) derived from `derived/vision-page.json` at list time. Filters AND across dimensions. Screens without a vision page drop out once any filter is set.

Response also returns `facet_filters` (closed vocabs) and `facets_version` so the Island chip row does not hardcode labels.

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
| `look_contract` | Measured colors/type/radius/CTA + `avoid[]` (from `derived/design-tokens.json` when present) |

Campaign / content noise (`cannes lions`, `sustainability`, `hero`, `ticker`) is dropped. Screen-pattern labels like `Marketing Home` map to `marketing_agency`.
