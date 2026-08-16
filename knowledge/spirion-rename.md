# SPIRION rename (from DIG)

**Updated:** 2026-08-16  
**UI brand / Plexon capability display:** **SPIRION**  
**Legacy names:** DIG, Design Intelligence, product id `dig`

## Why

Align the design-graph capability with sibling Plexon products (**CHECKION**, **AUDION**, **BRANDION**, **CREATION**) using the shared `*ION` naming.

## Shipped in island UI

- Brand corner, login hero, document title, home/projects/capture/enrichment/rebuild copy
- `paths.brandLabel` / `defaultDisplayName` / `productId` → `SPIRION` / `spirion`
- Prefs storage keys → `spirion.v1.*`

## Still DIG_* for ops (intentionally)

Coolify env and proxy paths stay until a coordinated cutover:

| Keep | Notes |
|------|--------|
| `DIG_API_URL`, `DIG_API_TOKEN`, `NEXT_PUBLIC_DIG_URL`, `DIG_FEDERATION_MODE` | Staging Coolify |
| `/api/dig/*` Next proxy | Browser → Node API |
| Repo / FQDN `dig.projects-a…`, `dig-api…` | Infra rename later |
| Spec ids DIG-001…DIG-013 | Docs/tickets |

## Plexon follow-up

Update Collection catalog binding from `productId: dig` → `spirion` (see `knowledge/plexon-dig-binding-ticket.md`). Assistant embed uses `paths.productId`.
