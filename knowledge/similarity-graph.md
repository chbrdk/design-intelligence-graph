# Similarity graph (island)

**Date:** 2026-08-19  
**Config:** `knowledge/paths.json` → `similarityGraph`  
**Island route:** `islandSurfaces.graphRoute` (`/graph`)  
**API:** `GET /api/library/graph?kind=craft|visual`

Not Facebook Open Graph. This is a **neighbor network of Library screens**.

| Kind | Vectors | `subject_kind` |
|------|---------|----------------|
| `craft` | `dense_embeddings` 1024 | `screen` |
| `visual` | `screenshot_embeddings` 768 | `screenshot` |

Pairwise cosine ≥ `similarityGraph.threshold` (0.72). Caps: `nodeCap` 80, `edgeCap` 240. Island layout is a deterministic spring (`apps/web/lib/similarity-graph-layout.ts`) — no extra npm graph library.

Until dig-api is deployed, `GET /api/library/graph` returns `not_found`. The island builds a **craft facet** graph from `GET /screens` (contrast, imagery, type, style — not URLs) with force-directed motion. Dense embeddings already index the same craft atoms in `dense_embeddings` canonical text; cosine neighbors replace the facet graph after API deploy.
