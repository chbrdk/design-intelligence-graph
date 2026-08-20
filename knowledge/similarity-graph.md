# Similarity graph (island)

**Date:** 2026-08-20  
**Config:** `knowledge/paths.json` → `similarityGraph`  
**Island route:** `islandSurfaces.graphRoute` (`/graph`)  
**API:** `GET /api/library/graph?kind=craft|visual` (`limit=`, `refresh=1`)

Not Facebook Open Graph. This is a **neighbor network of Library screens**, presented Graphify-style: colored communities, degree-sized hubs, search, and an inspector for neighbor scores.

| Kind | Vectors | `subject_kind` |
|------|---------|----------------|
| `craft` | `dense_embeddings` 1024 | `screen` |
| `visual` | `screenshot_embeddings` 768 | `screenshot` |

API attaches `design_facets` on every node (package vision/LLM + catalog industry). Island communities use **raw closed vocabs** — Contrast, Style, Layout, Imagery, Type, Energy, Chrome, Industry — not mega-buckets. Missing fields stay `unclassified` until enrichment/catalog covers the host.
