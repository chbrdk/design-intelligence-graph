# Graphic craft metrics (SPIRION artboards)

**Path:** `derived/graphic-craft-metrics.json` (per capture package)  
**Config:** `knowledge/paths.json` → `graphicCraftMetrics`  
**Catalog:** `src/graphic-craft-metrics-catalog.ts` (~113 closed axes)  
**Code:** `src/graphic-craft-metrics.ts` · wired from `src/graphic-llm-enrich.ts`

Fine-grained craft scores for campaign / print / social artboards. Complements coarse Library `design_facets` and the compact `composition_contract`. Web screens do **not** run this stage.

## Pipeline

1. Graphic ingest writes artboard package + baseline `composition_contract`.
2. `applyGraphicLlmEnrichment` runs:
   - artboard `vision_page` (catalog narrative),
   - then **craft metrics** vision pass (JSON map of all catalog ids).
3. Deterministic **sharp** measures (orientation, aspect, luminance, chroma feel, …) merge under LLM values.
4. Facet hints + composition refinements update `composition_contract` and Library filters.
5. Analysis detail exposes `package.graphic_craft_metrics` (full metric map).

## Groups

format · composition · space · type · color · image · brand · tone · risk · production

Scores are `0..1`. Enums / booleans / hex / short text use closed vocabs from the catalog.

## Mapping

| Consumer | Use |
| --- | --- |
| `design_facets` | Coarse style / layout / palette / energy via `designFacetHintsFromGraphicMetrics` |
| `composition_contract` | focal, layoutFamily, negativeSpace, avoid[], colorAxes |
| Library analysis | Full metrics blob for craft UI / SPIRION motifs |

Version bumps live in `GRAPHIC_CRAFT_METRICS_VERSION`; stage cache keys include the version + image evidence hash.
