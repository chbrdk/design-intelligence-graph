# Section composition + component catalog

Added 2026-08-15.

## Purpose

Derive **section recipes** from measured layout evidence so DIG can answer questions like:

> “large media on top → headline → gap → CTA”

and categorize those blocks with a shared vocabulary (~500 terms).

## Paths

- Catalog: [`section-component-catalog.json`](section-component-catalog.json) (via [`paths.json`](paths.json) → `taxonomy.sectionComponentCatalog`)
- Ontology version: `0.2.0` (`taxonomy.ontologyVersion`)

## Pipeline

1. Detect section roots (`section`/`article`/landmarks + large blocks)
2. Build vertical role stacks (`media`, `heading`, `cta`, …) with gaps
3. Classify against catalog hints + heuristics → `taxonomy_id` + `category`
4. Write `derived/section-compositions.json` and enrich ontology entities
5. Feed compact recipes into Gemma evidence prompt (`section_compositions`, `recurring_section_recipes`)

## Limits (v1)

- Deterministic only (no LLM classifier)
- ~30–50 strong heuristics; remaining catalog IDs are for matching/clustering/retrieval
- Max ~24 sections per viewport
