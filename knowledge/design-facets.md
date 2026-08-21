# Design facets (screen profile + search contract)

**Date:** 2026-08-18  
**Code:** [`src/design-facets.ts`](../src/design-facets.ts) · catalog hosts [`src/catalog-industry.ts`](../src/catalog-industry.ts)  
**API** `package.design_facets` on `GET /api/library/analyses/:capture_run_id`  
**List/search:** `GET /api/library/screens?style=&layout=&industry=` (query keys in `knowledge/paths.json` → `libraryScreenFacets`)  
**MCP:** `dig_screen_search` / `dig_capture_prompt_pack` — [`mcp-library-loop.md`](mcp-library-loop.md)  
**Version:** `0.4.1`  
**Look contract:** [`look-contract.md`](look-contract.md)

## Library browse

Screen cards carry a compact `design_facets` summary derived at list time from, in order:

1. `derived/vision-page.json` when present
2. `derived/llm-design.json` `design_summary` + style/pattern labels (when vision_page is missing)
3. Catalog host → industry (`insurance-1000` → `insurance`, OEM → `automotive`, engineering → `manufacturing`, cross-industry group)

Filters AND across dimensions. Screens without craft still match an industry-only filter if the host is in a catalog.

Response also returns `facet_filters` (closed vocabs) and `facets_version`.

## Shape

| Field | Vocab / use |
|-------|-------------|
| `page_type` | Closed: `corporate_homepage`, `corporate_landing`, `marketing_landing`, `article`, `legal`, `portal`, `newsroom`, `product`, `blank`, `other` |
| `industry_tags` | 1–3 of `automotive`, `insurance`, `finance`, `manufacturing`, `marketing_agency`, `luxury`, `ecommerce`, `media`, `tech`, `healthcare`, `travel`, `food`, `fashion`, `real_estate`, `nonprofit`, `government`, `other` |
| `style` | `minimal`, `editorial`, `high-energy`, `luxury-dark`, `corporate`, `playful`, `brutalist`, `photographic` |
| `layout` | `full-bleed stacks`, `split columns`, `card grid`, `single column`, `mixed` |
| `color_mood` | Short free text (truncated) |
| `typography` | Short free text |
| `above_fold_job` | One line |
| `section_categories` | Unique vision band categories |
| `modules` | `notable_modules` only (not campaign names) |
| `look_contract` | Measured colors/type/radius/CTA + `avoid[]` (from `derived/design-tokens.json` when present) |

Campaign / content noise (`cannes lions`, `sustainability`, `hero`, `ticker`) is dropped from industry tags.

## Recipe / page flow

If the LLM `section_recipes` stage returns empty, read path and reindex synthesize ordered `page_flow` + `recipe_insights` from measured section compositions (`src/recipe-fallback.ts`). Existing packages pick this up on `GET /analyses/:id` without a recapture.

## Live apply

These changes are **dig-api** (`src/design-facets.ts`, `src/library-api.ts`, `src/library-screens.ts`, `src/recipe-fallback.ts`, `src/db-index.ts`, `src/llm-design.ts`). Do not deploy the API while the in-memory capture queue is draining — a restart drops queued jobs. After the queue is idle, Coolify-deploy `coolify.digApiAppUuid` only (`knowledge/paths.json`). Island deploy is not required.
