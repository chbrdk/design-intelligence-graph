# Similarity graph (island)

**Date:** 2026-08-20  
**Config:** `knowledge/paths.json` → `similarityGraph`  
**Island route:** `islandSurfaces.graphRoute` (`/graph`)  
**API:** `GET /api/library/graph?kind=craft|visual`

Not Facebook Open Graph. This is a **neighbor network of Library screens**, presented Graphify-style: colored communities, degree-sized hubs, search, and an inspector for neighbor scores.

| Kind | Vectors | `subject_kind` |
|------|---------|----------------|
| `craft` | `dense_embeddings` 1024 | `screen` |
| `visual` | `screenshot_embeddings` 768 | `screenshot` |

API loads up to `nodeCap` (5000) newest embedding rows and builds **kNN edges** (`neighborK` = 8, cosine ≥ `threshold` 0.72), not a truncated full pairwise sample. Response includes `total`, `page_size`, `neighbor_k`.

Island shows the first `pageSize` (120) nodes, then **Load more** reveals the next chunk from the already-fetched corpus (edges filtered to the visible set). Force layout stays responsive.

Communities come from craft facets (`contrast`, `style`, or primary `industry_tags`). Chrome is `@msqdx/ui`. Node/edge colors use theme role tokens.

Until dig-api is deployed with this slice, staging may still return the old 80-node pairwise graph. Capture queue restores from Postgres on API restart (`capture_jobs`).
