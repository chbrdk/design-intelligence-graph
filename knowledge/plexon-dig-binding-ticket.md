# Ticket — plexon-v3: Collection binding product `spirion` (was `dig`)

**Repo:** [chbrdk/plexon-v3](https://github.com/chbrdk/plexon-v3)  
**Type:** Platform / federation  
**Priority:** P1 (blocks SPIRION staging as Collection capability)  
**Companion:** [`docs/DIG-013-plexon-app.md`](../docs/DIG-013-plexon-app.md) · [`knowledge/dig-plexon-platform.md`](dig-plexon-platform.md) · [`knowledge/spirion-rename.md`](spirion-rename.md)  
**Contract:** `2026-05-plexon-federation-v3`  
**Date:** 2026-08-16 (renamed from DIG / `dig`)

## Summary

Add **SPIRION (`spirion`)** as a Collection capability mirror alongside `checkion`, `audion`, `brandion`, and `creation`. Users must not create a “SPIRION project type”; SPIRION opens from a Collection via binding + `NEXT_PUBLIC_DIG_URL` (env name legacy until cutover).

Clone the **CREATION Wave 3** pattern end-to-end. Migrate any existing `dig` catalog entries to `spirion`.

## Product identity

| Field | Value |
|-------|--------|
| `productId` | `spirion` |
| Legacy id | `dig` |
| Display | SPIRION |
| Origin | design-intelligence-graph / SPIRION island |

## Suggested commit

`feat(platform): Collection binding + catalog for product spirion (SPIRION)`

## Context

SPIRION (formerly DIG / Design Intelligence) is the design-graph Collection capability parallel to CHECKION/AUDION/BRANDION/CREATION. Staging needs product id `spirion` so Collections open SPIRION with shared identity.
