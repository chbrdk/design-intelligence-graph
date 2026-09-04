# Mobbin-parity taxonomy gaps (no Mobbin content)

**Date:** 2026-09-04  
**Goal:** Reach Mobbin-class *retrieval shape* with DIG’s own captures — no subscription, no scraped library.

Public signal: [Mobbin MCP query mix](https://mobbin.com/blog/how-to-use-mobbin-mcp) (login, onboarding, dashboard, settings, pricing, empty state, checkout dominate).

## Gap inventory

| Mobbin-class filter | DIG before | DIG after this slice |
|---------------------|------------|----------------------|
| Closed **screen patterns** (Login, Dashboard, …) | Free-text LLM `screen_patterns` only | Closed catalog + `screen_pattern` facet filter |
| Closed **flow actions** | `flow-actions-catalog.json` (15) | Expanded (+ password recovery, notifications, permissions, KYC, booking, …) |
| UI elements | Ontology `dig:component.*` / `dig:pattern.*` | Keep; map LLM ui_elements onto taxonomy (already) |
| Craft / look facets | `style`, `layout`, `contrast`, `palette`, … | Unchanged (Phases 2–4) |
| Multi-screen **Flows** | Spec DIG-011 only | Still next (runtime recognize/measure) |
| Hotspot transitions | Spec only | Still DIG-011 Phase A/B |
| App-name search (“Linear”) | Host/domain only | Optional later via brand index — not Mobbin clone |

## Query demand → DIG labels

Top research intents → `knowledge/screen-patterns-catalog.json` labels: Login, Onboarding, Sign up, Dashboard, Settings, Pricing, Paywall, Empty state, Checkout, Chat, Search, Profile, …

## What we deliberately do *not* do

- Import Mobbin screens, flows, or annotations  
- Depend on Mobbin MCP / API for corpus  
- Treat `page_flow` as multi-screen user journey (that remains DIG-011)

## Code

- Catalog: [`screen-patterns-catalog.json`](screen-patterns-catalog.json) · loader [`src/screen-patterns.ts`](../src/screen-patterns.ts)  
- Flows: [`flow-actions-catalog.json`](flow-actions-catalog.json)  
- Facets: [`src/design-facets.ts`](../src/design-facets.ts) `screen_patterns` / filter `screen_pattern`  
- Spec: [`mobbin-user-flows.md`](mobbin-user-flows.md), [`docs/DIG-011-user-flow-graph.md`](../docs/DIG-011-user-flow-graph.md)
