# DIG ↔ CHECKION v3 — ownership boundary

**Date:** 2026-08-15  
**CHECKION clone:** [`paths.json`](paths.json) → `checkionV3.localClone`  
**Repo:** [`checkionV3.repo`](paths.json) · Specs SoT in CHECKION: `specs/domain/*`

Principle: **complement, don’t clone.** DIG owns design intelligence; CHECKION owns quality/scan magazine; AUDION owns live UX journey exploration (per CHECKION’s own ownership table).

## Access

| Access | Value |
|--------|--------|
| GitHub | `https://github.com/chbrdk/checkion-v3` (`gh` authenticated) |
| Local clone | `/Users/m1air/GITHUB/checkion-v3` |
| Nearby v2 | `/Users/m1air/GITHUB/CHECKION` |
| Staging web / MCP | `paths.json` → `checkionV3.stagingWeb` / `stagingMcp` ([live](https://checkion-v3.projects-a.plygrnd.tech/)) |
| Plexon (identity / Collections) | `paths.json` → `plexon.stagingWeb` — DIG is a **Collection capability** (`productId: dig`), not a separate project type ([DIG-013](../docs/DIG-013-plexon-app.md)) |

CHECKION staging Sign-in is Plexon auth. DIG machine jobs use `CHECKION_API_TOKEN` against staging API — never browser login scraping.

## Product triangle (existing CHECKION decisions)

From CHECKION `specs/domain/audion-journey-scan-trigger.md` + `journey-agent-island.md`:

| Concern | Owner | DIG implication |
|---------|--------|-----------------|
| Explore / Chat-Inspect / Studies / live journey sessions | **AUDION** | DIG must not build a second “journey agent UI” |
| Shared Journey Agent runtime (deferred Wave 5+) | **One island service**, BFFs only | DIG consumes later via API/MCP — no soft-fork agent |
| WCAG / a11y scan, scores, issue overlays, full-page JPEG | **CHECKION** | DIG attaches scan id + screenshot; does not reimplement axe/Pa11y magazine |
| Domain crawl / SEO coverage / GEO presence | **CHECKION** | DIG may request URL lists or correlate pages — not invent spider |
| Design capture (DOM/CSSOM/geometry/ontology/section look) | **DIG** | CHECKION does not own Mobbin-style design graph |
| Design knowledge graph / MCP design tools / layout gen | **DIG** | — |

## Capability split (do / don’t)

### CHECKION owns — DIG consumes

- Full-page JPEG + scroll-settle + cookie dismiss (`scan` pipeline)
- `scan_issues` / `scan_scores` / overview bands (a11y, seo, perf, ux, …)
- Domain spider + pause/resume/cancel
- GEO competitive presence jobs
- `fetch_page` thin text fallback
- MCP: `checkion_v3.scan_*`, `domain_scan_*`, `geo_job_*`, …

Bridge already started: DIG job → `POST /api/scans` → attach JPEG as library SoT (`knowledge/checkion-screenshots.md`).

### DIG owns — CHECKION must not duplicate

- Multi-viewport L0/L1 artifact tree (nodes, computed styles, CSSOM, a11y tree evidence as *design* evidence)
- Ontology / section recipes / `section_look` / visual-language hypotheses
- Portable design graph index + DIG MCP (`dig-mcp`)
- Layout generation (DIG-008)
- Mobbin-parity **design** facets (patterns, UI elements, style labels)

### Shared / correlated — neither reinvents alone

| Need | How |
|------|-----|
| Same URL quality + design | DIG capture + optional CHECKION `scan_start`; store `checkion_scan_id` on DIG run |
| Multi-page corpus for design flows | CHECKION **domain crawl** supplies URL set; DIG **captures each page** for design evidence |
| Step URL from a journey | AUDION (or future DIG flow runner) hands URL to CHECKION as `mode: single` — same handoff pattern as `audion-journey-scan-trigger.md` |
| Transition hotspots / flow graph | **DIG design concern** (Mobbin-like indexing). Live agent walking apps = AUDION/island agent. CHECKION `/journey` stays stub until shared agent |

## User flows (critical anti-duplication)

Do **not** put a Customer Journey map or live Journey Agent inside DIG *or* re-litigate it inside CHECKION.

Normative layering: [`docs/DIG-011-user-flow-graph.md`](../docs/DIG-011-user-flow-graph.md).

1. **L1 edges (DIG):** measured transitions between DIG capture runs (href / safe activate / SPA route change) + hotspot boxes — design-graph data.
2. **URL discovery (CHECKION):** domain spider / sitemap for *which* pages exist.
3. **Live exploration (AUDION / shared agent):** human- or agent-driven journey sessions; DIG may **index** resulting screens once captured, not drive the agent.
4. **Quality on a step (CHECKION):** single scan on step URL (existing AUDION handoff).

`page_flow` in DIG today = **within-page section order** only — keep that name; don’t overload it as Mobbin multi-screen flow. Catalog: [`flow-actions-catalog.json`](flow-actions-catalog.json).

## When implementing DIG-011 / any DIG feature

Checklist before coding:

1. Does CHECKION already expose this via API/MCP? → consume + correlate.
2. Does AUDION own the UX journey? → handoff URL, don’t embed agent.
3. Is it design structure / look / tokens / graph? → DIG.
4. Specs/schemas first — see [`docs/DIG-011-implementation-status.md`](../docs/DIG-011-implementation-status.md); update this file if the boundary moves.

## Platform

DIG joins the same Collection as CHECKION/AUDION/BRANDION/CREATION via Plexon binding product `dig`. See [`dig-plexon-platform.md`](dig-plexon-platform.md) and open-topic order in [`runtime-open-topics-challenge.md`](runtime-open-topics-challenge.md).

## References

- DIG: [`checkion-v3-capability-map.md`](checkion-v3-capability-map.md), [`checkion-screenshots.md`](checkion-screenshots.md), [`mobbin-user-flows.md`](mobbin-user-flows.md), [`dig-plexon-platform.md`](dig-plexon-platform.md)
- CHECKION: `specs/domain/journey-agent-island.md`, `journey-ui.md`, `audion-journey-scan-trigger.md`, `scan-modes.md`, `plexon-federation.md`, `knowledge/paths.md`
