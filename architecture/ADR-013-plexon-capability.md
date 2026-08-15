# ADR-013 — DIG as a Plexon Collection capability

**Status:** Accepted (spec only; platform wiring not implemented)  
**Date:** 2026-08-15  
**Related:** [`knowledge/dig-plexon-platform.md`](../knowledge/dig-plexon-platform.md), [`docs/DIG-013-plexon-app.md`](../docs/DIG-013-plexon-app.md), CHECKION [`plexon-federation.md`](https://github.com/chbrdk/checkion-v3/blob/main/specs/domain/plexon-federation.md), Plexon [`collection-projects.md`](https://github.com/chbrdk/plexon-v3/blob/main/specs/domain/collection-projects.md)

## Context

DIG today is a standalone capture/enrichment/graph CLI + slim web UI. CHECKION v3 already runs as a Plexon capability island with NextAuth → Plexon credentials, Collection bindings, and staging at [checkion-v3.projects-a.plygrnd.tech](https://checkion-v3.projects-a.plygrnd.tech/). The platform rule is: users see **one Collection project**; products (CHECKION, AUDION, BRANDION, CREATION, …) are **capabilities** with bindings — not separate project types.

DIG’s agent-value path (DIG-012 DesignReference → generation) only becomes production-real when references, captures, and MCP tools are **Collection-scoped** and identity comes from Plexon.

## Decision

1. DIG SHALL become a **Plexon product capability** (proposed product id: `dig`), parallel to `checkion` / `audion` / `brandion` / `creation`.  
2. Auth SHALL follow the CHECKION pattern: Plexon `validate-credentials` + session; machine callers use DIG API tokens (Bearer), not a second IdP.  
3. Federation contract remains **`2026-05-plexon-federation-v3`** against **plexon-v3 only**.  
4. CHECKION staging URL ([checkion-v3…](https://checkion-v3.projects-a.plygrnd.tech/)) is the **live** quality/screenshot peer; DIG consumes it via Collection binding + API token / service paths — DIG does not embed CHECKION login UI.  
5. Open DIG-012/011 runtime work is **re-ordered under platform prerequisites** (see open-topics challenge).  
6. DIG MUST NOT invent a second project model or a second Journey Agent.

## Consequences

- Plexon must grow a `dig` binding mirror (placeholder → sync) — tracked as cross-repo work.  
- Current DIG “open local web on :8787” remains **dev/dummy mode** until federation live.  
- DesignReference emit/search MUST key on `platform_project_id` / DIG project binding before multi-tenant MCP.
