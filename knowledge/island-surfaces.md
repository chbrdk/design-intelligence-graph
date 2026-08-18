# Island surfaces (2026-08-18)

Challenge the remaining SPIRION pages the same way as the Modules gallery: if a page is an ID dump, it is not a product surface.

| Page | Was | Now |
| --- | --- | --- |
| Library Screens | Search / similar_to / DesignReferences / Generate above the grid | Facet chips + desktop cards. Compose stays on MCP. |
| Devices | Extra back + teaser on Screens | Contents nav + card grid |
| Flows | `flow_id` rows + edge ID detail | Preview cards → Interactive |
| Home | Two buttons | Queue meters (`StatusMeterPanel`, `KpiStrip`, `PipelinePanel`) + latest desktop screens |
| Queue | — | Editable waiting list (`LayersPanel` head + `DataTable`). Skip / run-next need dig-api DELETE/PATCH — do not API-deploy while the live queue is draining. |
| Enrichment | Unbounded job log | Status chips + capped active-first list |
| Analyses | Ontology / section_look dump | Screen cards that open Library |
| Projects | Fake project list | Collection door only |
| Capture / Settings | Intake and prefs | Unchanged — they already do a job |

Config: `knowledge/paths.json` → `islandSurfaces`. Helpers: `apps/web/lib/island-surfaces.ts`, `apps/web/lib/queue-metrics.ts`. Route: `paths.routes.queue` (`/queue`).
