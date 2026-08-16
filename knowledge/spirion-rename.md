# SPIRION rename (from DIG)

**Updated:** 2026-08-16  
**UI brand / Plexon capability:** **SPIRION** (`productId: spirion`)  
**Staging web:** https://spirion.projects-a.plygrnd.tech  
**Staging API:** https://spirion-api.projects-a.plygrnd.tech  
**Legacy hosts:** `dig.projects-a…`, `dig-api.projects-a…`

## Why

Align with sibling Plexon products (**CHECKION**, **AUDION**, **BRANDION**, **CREATION**).

## Shipped

| Layer | Status |
|-------|--------|
| Island UI brand | SPIRION |
| Plexon catalog / capabilities | `spirion` · `spirion.*` (plexon-v3) |
| Coolify FQDN island | `spirion.projects-a.plygrnd.tech` |
| Coolify FQDN API | `spirion-api.projects-a.plygrnd.tech` |
| Env public URL | `NEXT_PUBLIC_SPIRION_URL` (+ `NEXT_PUBLIC_DIG_URL` alias → same host) |

## Env aliases (ops)

| Preferred | Fallback |
|-----------|----------|
| `NEXT_PUBLIC_SPIRION_URL` | `NEXT_PUBLIC_DIG_URL` |
| `SPIRION_API_URL` | `DIG_API_URL` |
| — | `DIG_API_TOKEN`, `DIG_FEDERATION_MODE` |

Proxy path `/api/dig/*` and Coolify app names `dig-v3:*` stay until a later infra rename.

## Plexon DB

Run `plexon-v3/lib/db/migrations/0008_rename_dig_to_spirion.sql` after plexon deploy.

## Origin

Canonical: `POST /api/platform/provisioning/spirion-project-origin`  
Legacy alias: `…/dig-project-origin` (forwards).
