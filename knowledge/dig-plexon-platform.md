# DIG ↔ Plexon platform (ops + identity)

**Updated:** 2026-08-15  
**Specs:** [`docs/DIG-013-plexon-app.md`](../docs/DIG-013-plexon-app.md) · [ADR-013](../architecture/ADR-013-plexon-capability.md)

## Live staging peers

| System | URL |
|--------|-----|
| **Plexon** | https://plexon-v3.projects-a.plygrnd.tech |
| **CHECKION v3** | https://checkion-v3.projects-a.plygrnd.tech ([Sign in via Plexon](https://checkion-v3.projects-a.plygrnd.tech/)) |
| **CHECKION MCP** | https://checkion-v3-mcp.projects-a.plygrnd.tech |
| **DIG (proposed)** | https://dig.projects-a.plygrnd.tech |

Paths SoT: [`paths.json`](paths.json) → `plexon`, `checkionV3`.

## Mental model

```text
Plexon Collection (one project)
  ├── binding checkion  → WCAG / domain / GEO / full-page JPEG
  ├── binding audion    → journey / explore
  ├── binding brandion  → brand
  ├── binding creation  → compositions
  └── binding dig       → capture, DesignReference, generate   ← us
```

User never “creates a DIG project type” — they open the Design Intelligence capability on a Collection.

## Auth copy

- Humans: Plexon account (same as CHECKION staging Sign-in).  
- Machines: DIG API token + CHECKION API token for peer calls.  

## DIG local today

- **Product UI:** Next island `apps/web` on `@msqdx/ui` (`npm run island:dev`, port `plexon.islandDevPort`).  
- **API:** Node `web-server` on :8787 (`DIG_API_URL`); island proxies `/api/dig/*`.  
- **Legacy:** Vite SPA under `web/` — demos only.  
- `DIG_FEDERATION_MODE=dummy` (default): open middleware when Plexon auth env unset.

## Cross-repo checklist

- [x] plexon-v3: add `dig` to `ensureBindingPlaceholders` + sync + origin route — ticket [`plexon-dig-binding-ticket.md`](plexon-dig-binding-ticket.md) · landed [`plexon-dig-binding-landed.md`](plexon-dig-binding-landed.md)
- [x] plexon-v3: capability catalog owner `dig` + `dig.*` ids  
- [x] plexon-v3 Coolify: `NEXT_PUBLIC_DIG_URL` when DIG staging exists  
- [ ] DIG Coolify: Plexon auth env + `CHECKION_API_URL` staging + msqdx-ui Docker strip  
- [x] DIG: Collection-scoped projects before public MCP — [`dig-collection-projects.md`](dig-collection-projects.md) (memory mirror; Postgres later)  

## Related

- [`dig-checkion-boundary.md`](dig-checkion-boundary.md)  
- [`runtime-open-topics-challenge.md`](runtime-open-topics-challenge.md)  
- CHECKION federation: `checkion-v3/specs/domain/plexon-federation.md`  
