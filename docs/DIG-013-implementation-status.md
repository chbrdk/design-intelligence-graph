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
| DIG Next island + Plexon auth | Done (staging) | `apps/web`; https://spirion.projects-a.plygrnd.tech (legacy dig.* still routed) |
| plexon-v3: product `spirion` binding + catalog | Done (code) | Renamed from `dig`; migrate DB `0008_rename_dig_to_spirion.sql` |
| Collection-scoped dig projects | Done (P2 durable) | Postgres dig_projects + capture scope; island proxies to dig-api |
| Coolify DIG staging | Done | Island + API + Postgres + volumes |
| Live CHECKION peer via staging token | Partial | Attach exists; harden under Collection ids |
| Assistant capabilities `spirion.*` | Partial | Catalog stubs in plexon-v3; Wave 2 executors later |
| plexon-v3 binding ticket | Done (spec) | `knowledge/plexon-dig-binding-ticket.md` |
