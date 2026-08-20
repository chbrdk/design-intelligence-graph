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

API loads up to `nodeCap` (5000) newest embedding rows and builds **kNN edges** (`neighborK` = 8, cosine ≥ `threshold` 0.72). Response includes `total`, `page_size`, `neighbor_k`, `cached`.

**Cache:** dig-api keeps an in-process TTL cache (`cacheTtlSec` = 600). Cold full builds can take tens of seconds; warm hits are sub-second. dig-api warms the craft graph a few seconds after boot. Island first requests `limit=pageSize` for a fast preview, then loads the full corpus (usually from cache).

Island shows the first `pageSize` (120) nodes, then **Load more** reveals further chunks. Search runs over the loaded corpus.
