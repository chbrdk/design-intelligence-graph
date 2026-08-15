# plexon-v3 dig binding (cross-repo)

**Date:** 2026-08-15  
**Repo:** `/Users/m1air/GITHUB/plexon-v3` (`chbrdk/plexon-v3`)  
**Ticket:** `knowledge/plexon-dig-binding-ticket.md`

## Landed

- Product id `dig` in `PLATFORM_PRODUCT_IDS`, placeholders, sync, upsert, registry (`getDigUrl` / `NEXT_PUBLIC_DIG_URL`)
- Origin: `POST /api/platform/provisioning/dig-project-origin`
- Sibling origins (checkion/audion/brandion/creation) best-effort mirror `dig`
- Capability owner `dig` + stubs `dig.capture|enrich|reference_search|reference_pack|generate`
- Specs/cheatsheet §4e · tests: `dig-platform-registry`, `platform-dig-project-origin-route`

## Coolify (plexon-v3:main-app `n6f9gy85xsk3a0txflzavk3j`)

| Key | Value |
|-----|--------|
| `NEXT_PUBLIC_DIG_URL` | `https://dig.projects-a.plygrnd.tech` |

Do **not** set `DIG_API_URL` to dig-api — provisioning upsert target is the DIG Next island. Optional `DIG_API_URL` only if a dedicated service base exists later.

Redeploy queued after env set (build needed for `NEXT_PUBLIC_*`).

## Still open (DIG)

- ~~Persist dig projects to Postgres~~ ✅
- ~~DIG-012 Wave 2 Collection-scoped MCP/Library~~ ✅
- CHECKION `CHECKION_API_TOKEN` on dig-api (operator)
- Dense embedding provider (optional; hashing shipped)
