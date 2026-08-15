# DIG-013 Implementation Status

**Spec:** [DIG-013 Plexon App](DIG-013-plexon-app.md)  
**Updated:** 2026-08-15  
**Policy:** Spec-first; platform tenancy before live multi-tenant MCP.

| Requirement | Status | Notes |
| --- | --- | --- |
| ADR-013 | Done | |
| Parent spec (auth, binding, CHECKION peer) | Done | |
| Open-topics challenge | Done | `knowledge/runtime-open-topics-challenge.md` |
| paths.json `plexon` + staging URLs | Done | |
| Unit test paths contract | Done | `test/plexon-paths.test.ts` |
| plexon-v3: product `dig` binding + catalog | Not started | Cross-repo |
| DIG Next island + Plexon auth | Done (staging) | `apps/web`; https://dig.projects-a.plygrnd.tech |
| Collection-scoped dig projects | Not started | |
| Coolify DIG staging | Done | Island + API + Postgres + volumes |
| Live CHECKION peer via staging token | Partial | Attach exists; harden under Collection ids |
| Assistant capabilities `dig.*` | Not started | |
| plexon-v3 binding ticket | Done (spec) | `knowledge/plexon-dig-binding-ticket.md` |
