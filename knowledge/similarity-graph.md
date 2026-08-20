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

Pairwise cosine ≥ `similarityGraph.threshold` (0.72). Caps: `nodeCap` 250, `edgeCap` 750 (newest dense/screenshot rows). Island layout is a custom force simulation with community attraction + convex hulls (`apps/web/lib/similarity-graph-force.ts`, `apps/web/lib/graphify-communities.ts`) — no extra npm graph library. Raising caps needs a **dig-api** deploy (reads `paths.json` server-side); do that only when the capture queue is idle.

Communities come from craft facets (`contrast`, `style`, or primary `industry_tags`). Chrome is `@msqdx/ui` (FilterRow, KpiStrip, Field, Panel, SectionChrome, RankedList, Button). Node/edge colors use theme role tokens. Labels prefer `site_domain` over long craft strings. Click a node → inspector → optional Library open. **Path from here** + second click traces the shortest hop path. Scroll zooms, drag pans, Reset view restores 1:1.

Until dig-api is deployed, `GET /api/library/graph` returns `not_found`. The island builds a **craft facet** graph from `GET /screens`. Dense embeddings replace the facet graph after API deploy.
