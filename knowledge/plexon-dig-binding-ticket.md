# Ticket — plexon-v3: add Collection binding product `dig`

**Repo:** [chbrdk/plexon-v3](https://github.com/chbrdk/plexon-v3)  
**Type:** Platform / federation  
**Priority:** P1 (blocks DIG staging as Collection capability)  
**Companion (DIG):** [`docs/DIG-013-plexon-app.md`](../docs/DIG-013-plexon-app.md) · [`knowledge/dig-plexon-platform.md`](dig-plexon-platform.md)  
**Contract:** `2026-05-plexon-federation-v3`  
**Date:** 2026-08-15

## Summary

Add **Design Intelligence (`dig`)** as a fifth Collection capability mirror alongside `checkion`, `audion`, `brandion`, and `creation`. Users must not create a “DIG project type”; DIG opens from a Collection via binding + `NEXT_PUBLIC_DIG_URL`.

Clone the **CREATION Wave 3** pattern end-to-end.

## Product identity

| Field | Value |
|-------|--------|
| `productId` | `dig` |
| Display | Design Intelligence |
| Staging DIG (proposed) | `https://dig.projects-a.plygrnd.tech` |
| Staging Plexon | `https://plexon-v3.projects-a.plygrnd.tech` |
| Peer CHECKION | `https://checkion-v3.projects-a.plygrnd.tech` |

## Acceptance criteria

### A. Product registry

- [x] `'dig'` in `PLATFORM_PRODUCT_IDS` (`lib/platform-entitlements.ts`)
- [x] Registry entry in `lib/platform-products.ts` gated by `getDigUrl()` / `NEXT_PUBLIC_DIG_URL` (lifecycle `active` when URL set, else `planned`)
- [x] `specs/domain/collection-projects.md` lists `dig` as a capability binding

### B. Env (Coolify plexon-v3)

- [x] `NEXT_PUBLIC_DIG_URL` — public DIG origin
- [x] `DIG_API_URL` — optional service upsert base (fallback = public URL)
- [x] Helpers: `getDigUrl()`, `getDigServiceApiUrl()` in `lib/constants.ts`
- [x] Cheatsheet section (mirror CREATION §4d → § DIG)

### C. Bindings + sync

- [x] `ensureBindingPlaceholders` includes `'dig'`
- [x] Sync `PRODUCTS` loop includes `'dig'`
- [x] `isProductUpsertConfigured('dig')` → `Boolean(getDigServiceApiUrl())`
- [x] Upsert URL: `{DIG}/api/platform/provisioning/projects/{platformProjectId}` (PUT/GET), same contract headers as CREATION
- [x] Unconfigured URL leaves binding `pending` (do **not** fail Collection create)

### D. Origin route

- [x] `POST /api/platform/provisioning/dig-project-origin`
- [x] Body: `{ digProjectId, name, domain?, ownerPlexonUserId?, platformCompanyId? }`
- [x] Auth: service secret + contract version
- [x] Idempotent bind; best-effort sibling mirrors (`checkion`, `audion`, `brandion`, `creation`)
- [x] Constant `API_PLATFORM_PROVISIONING_DIG_PROJECT_ORIGIN`

### E. Capability catalog stubs

- [x] Owner `'dig'` on `CapabilityOwner`
- [x] Catalog stubs (execute later in DIG):

| id | surfaces |
|----|----------|
| `dig.capture` | agent + flow |
| `dig.enrich` | agent + flow |
| `dig.reference_search` | agent |
| `dig.reference_pack` | agent |
| `dig.generate` | agent + flow |

### F. Tests

- [x] Origin route tests (mirror `creation-project-origin`)
- [x] Placeholders include `dig`
- [x] Upsert URL resolution when `DIG_API_URL` / `NEXT_PUBLIC_DIG_URL` set

## Out of scope (DIG repo)

- DIG Next island / `@msqdx/ui` AppShell (DIG-013 P2 — in DIG)
- DIG `PUT/GET` provisioning handlers (DIG implements when live)
- CHECKION scan magazine changes

## File checklist (plexon-v3)

1. `lib/platform-entitlements.ts`  
2. `lib/constants.ts`  
3. `lib/db/platform-project-bindings.ts`  
4. `lib/platform-project-sync-service.ts`  
5. `lib/platform-project-upsert.ts`  
6. `lib/platform-products.ts`  
7. `app/api/platform/provisioning/dig-project-origin/route.ts`  
8. `lib/capabilities/types.ts` + `catalog.ts`  
9. `specs/domain/collection-projects.md`  
10. Coolify env cheatsheet + tests  

## Suggested GH issue title

`feat(platform): Collection binding + catalog for product dig (Design Intelligence)`

## Suggested issue body (paste)

```markdown
## Why
DIG (design-intelligence-graph) becomes a Plexon Collection capability parallel to CHECKION/AUDION/BRANDION/CREATION. Staging CHECKION already federates; DIG needs product id `dig` so Collections can open Design Intelligence with shared identity.

## Spec
- DIG: docs/DIG-013-plexon-app.md
- Ticket: knowledge/plexon-dig-binding-ticket.md (in DIG repo)

## Do
Mirror CREATION Wave 3: PLATFORM_PRODUCT_IDS, placeholders, sync, upsert, dig-project-origin, NEXT_PUBLIC_DIG_URL / DIG_API_URL, capability owner dig + dig.* stubs.

## Don't
Implement DIG UI or DIG provisioning handlers in plexon-v3.

## Test plan
- [ ] ensureBindingPlaceholders creates dig row
- [ ] sync with DIG URL upserts; without URL stays pending
- [ ] dig-project-origin idempotent + siblings best-effort
- [ ] catalog lists dig.capture etc.
```
