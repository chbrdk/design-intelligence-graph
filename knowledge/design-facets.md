# Design facets (screen profile + search contract)

**Date:** 2026-09-04  
**Code:** [`src/design-facets.ts`](../src/design-facets.ts) · intent [`src/screen-search-intent.ts`](../src/screen-search-intent.ts) · catalog hosts [`src/catalog-industry.ts`](../src/catalog-industry.ts)  
**API** `package.design_facets` on `GET /api/library/analyses/:capture_run_id`  
**List/search:** `GET /api/library/screens?style=&layout=&industry=&value_key=&palette=` (query keys in `knowledge/paths.json` → `libraryScreenFacets`)  
**MCP:** `dig_screen_search` / `dig_capture_prompt_pack` — [`mcp-library-loop.md`](mcp-library-loop.md)  
**Version:** `0.5.0`  
**Look contract:** [`look-contract.md`](look-contract.md)

## Library browse

Screen cards carry a compact `design_facets` summary derived at list time from, in order:

1. `derived/vision-page.json` when present
2. `derived/design-tokens.json` for measured `value_key` / `palette` when present
3. `derived/llm-design.json` `design_summary` + style/pattern labels (when vision_page is missing)
4. Catalog host → industry (`insurance-1000` → `insurance`, OEM → `automotive`, engineering → `manufacturing`, cross-industry group)

Filters AND across dimensions. Screens without craft still match an industry-only filter if the host is in a **vertical** catalog (insurance, automotive, …). Award/inspiration catalogs (Awwwards, FWA, CSSDA, SiteInspire) do **not** pin `tech` — industry comes from vision/LLM first, then optional name/group aliases.

Response also returns `facet_filters` (closed vocabs) and `facets_version`. Screen search with `q` may also return `inferred_facets` (soft craft intent from NL).

## Shape

| Field | Vocab / use |
|-------|-------------|
| `page_type` | Closed: `corporate_homepage`, `corporate_landing`, `marketing_landing`, `article`, `legal`, `portal`, `newsroom`, `product`, `blank`, `other` |
| `industry_tags` | 1–3 of `automotive`, `insurance`, `finance`, `manufacturing`, `marketing_agency`, `luxury`, `ecommerce`, `media`, `tech`, `healthcare`, `travel`, `food`, `fashion`, `real_estate`, `nonprofit`, `government`, `other` |
| `style` | `minimal`, `editorial`, `high-energy`, `luxury-dark`, `corporate`, `playful`, `brutalist`, `photographic` |
| `layout` | `full-bleed stacks`, `split columns`, `card grid`, `single column`, `mixed` |
| `contrast_mode` | `monochrome`, `low_contrast`, `saturated`, `mixed`, … |
| `value_key` | `light`, `dark`, `mixed` (measured bg luminance + prose) |
| `palette` | `mono`, `duo`, `multi` (token chroma / contrast) |
| `color_mood` | Short free text (truncated) |
| `typography` | Short free text |
| `above_fold_job` | One line |
| `section_categories` | Unique vision band categories |
| `modules` | `notable_modules` only (not campaign names) |
| `look_contract` | Measured colors/type/radius/CTA + `avoid[]` (from `derived/design-tokens.json` when present) |

Campaign / content noise (`cannes lions`, `sustainability`, `hero`, `ticker`) is dropped from industry tags.

## Query → facet inference (Phase 2)

Natural-language `q` (e.g. “minimal monochrome”) maps onto closed facets via `inferScreenSearchFacetsFromQuery`. Explicit query params stay **hard** AND filters. Inferred facets are **soft**: score boost + prefer matching candidates when enough remain; they do not empty the result set.

Dense canonical text also carries `value:` / `palette:` so re-embedded screens retrieve finer craft slices.

## Award catalogs vs industry (Phase 3)

`src/catalog-industry.ts` pins industry only for vertical catalogs. Award volume/quality catalogs (`AWARD_CATALOG_IDS`) contribute **no** default industry — vision/LLM `category_tags` win; `tech` is never injected from Awwwards/FWA/CSSDA/SiteInspire.

## Source weights (Phase 4)

`src/catalog-source.ts` tags hosts by catalog tier:

| Tier | Catalogs | Role |
|------|----------|------|
| `quality` | `cssda-wotd-1000` | Highest additive boost for craft inspiration / compose |
| `volume` | Awwwards waves, FWA, SiteInspire | Breadth; smaller boost |
| `vertical` | Insurance, automotive, manufacturing, public-sector | Extra boost when `industry` filter matches |

Config: `catalogSourceWeights` in `knowledge/paths.json`. Applied on `/screens` dense search (before MMR), DesignReference search, and compose-brief domain diversification.

## Recipe / page flow

If the LLM `section_recipes` stage returns empty, read path and reindex synthesize ordered `page_flow` + `recipe_insights` from measured section compositions (`src/recipe-fallback.ts`). Existing packages pick this up on `GET /analyses/:id` without a recapture.

## Live apply

These changes are **dig-api** (`src/design-facets.ts`, `src/screen-search-intent.ts`, `src/library-screen-rank.ts`, `src/library-api.ts`, `src/library-screens.ts`, …). Do not deploy the API while the in-memory capture queue is draining — a restart drops queued jobs. After the queue is idle, Coolify-deploy `coolify.digApiAppUuid` only (`knowledge/paths.json`). Island deploy is not required. Existing packages pick up `value_key` / `palette` on read without a recapture; dense search quality for the new tokens improves after re-embed.
