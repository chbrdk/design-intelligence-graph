# Graphic craft metrics (SPIRION artboards)

**Path:** `derived/graphic-craft-metrics.json` (per capture package)  
**Config:** `knowledge/paths.json` → `graphicCraftMetrics`  
**Catalog:** `src/graphic-craft-metrics-catalog.ts` (~300 closed axes, v0.3.0)  
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
6. MCP rebuild path exposes a compact `graphic_craft_brief` (not the full map) on `capture_prompt_pack` / `compose_brief`.

## Groups

format · composition · space · type · color · image · illustration · brand · tone · material · narrative · risk · production

Scores are `0..1`. Enums / booleans / hex / short text use closed vocabs from the catalog.

## Mapping

| Consumer | Use |
| --- | --- |
| `design_facets` | Coarse style / layout / palette / energy via `designFacetHintsFromGraphicMetrics` |
| `composition_contract` | focal, layoutFamily, negativeSpace, avoid[], colorAxes |
| `graphic_craft_brief` | Compact MCP rebuild brief: literals, group_scores, tone_top, risks, rebuild_directives |
| Library analysis | Full metrics blob for craft UI / SPIRION motifs |
| Library screen detail | `GraphicCraftMetricsPanel` — accordion per group with score RadarChart + bars; tone/risk highlights |
| `spirion.capture_prompt_pack` / `compose_brief` | Includes `graphic_craft_brief` when enrichment is complete |

### `graphic_craft_brief` (MCP)

Assembled by `compactGraphicCraftBrief` — stays inside the DesignPromptPack ≤16 KB budget:

- `literals` — closed high-signal ids (layoutFamily, focal, hexes, claim guess, …)
- `group_scores` — mean of filled score metrics per group
- `tone_top` / `risks` — scores ≥ 0.55
- `rebuild_directives` — imperative lines injected into pack `rules` + `ask`

Agents should treat literals + directives as soft craft truth; `composition_contract.avoid` / hierarchy still win when both exist. Full map remains on `analysis_get` / Library package for deep inspection.

Version bumps live in `GRAPHIC_CRAFT_METRICS_VERSION`; stage cache keys include the version + image evidence hash.
