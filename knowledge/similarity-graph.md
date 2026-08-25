# Similarity graph (island)

**Date:** 2026-08-25  
**Config:** `knowledge/paths.json` → `similarityGraph`  
**Island route:** `islandSurfaces.graphRoute` (`/graph`)  
**API:** `GET /api/library/graph?kind=craft|visual` (`limit=`, `refresh=1`)

Not Facebook Open Graph. This is a **neighbor network of Library screens**, presented Graphify-style: colored communities, degree-sized hubs, search, and an inspector for neighbor scores.

| Kind | Vectors | `subject_kind` |
|------|---------|----------------|
| `craft` | `dense_embeddings` 1024 | `screen` |
| `visual` | `screenshot_embeddings` 768 | `screenshot` |

API attaches `design_facets` on every node (package vision/LLM + catalog industry). Island communities use **raw closed vocabs** — Contrast, Style, Layout, Imagery, Type, Energy, Chrome, Industry — not mega-buckets. Missing fields stay `unclassified` until enrichment/catalog covers the host.

## Hub mitigations (2026-08-25)

Dense kNN alone collapses Awwwards-like screens toward a few prototypes (and blank `chromewebdata` captures). Mitigations:

1. **`excludeDomains`** — drop junk hosts (`chromewebdata`, island FQDN, GoDaddy parking) from nodes + edges
2. **`candidatePool`** — over-fetch cosine neighbors (default 32), then re-rank
3. **Facet-first** — prefer same `style` or overlapping `industry_tags`; demote mismatches unless cosine ≥ 0.95 (`facetWeight` default 0.35)
4. **MMR** — diversify final `neighborK` by domain (and lightly by style); island inspector applies the same domain MMR on top-6

Force rebuild: `GET /api/library/graph?kind=craft&refresh=1`.
