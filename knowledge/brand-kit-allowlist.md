# Brand-kit allowlist ingest (SPIRION)

**Date:** 2026-10-07  
**Catalog:** `knowledge/catalogs/brand-kit-allowlist.json`  
**Config:** `knowledge/paths.json` → `brandKitAllowlist`  
**API:** `/api/brand-kits`  
**Code:** `src/brand-kit-allowlist.ts` · `src/brand-kit-api.ts`  
**Spec:** plexon `specs/domain/spirion-campaign-motif-corpus.md` (`assetKind=brand_system`)

## Purpose

Ingest **explicitly listed** public brand-kit images (logos / lockups) as SPIRION `brand_system` assets — **no HTML scrape**, no directory crawling.

Brand kits complement campaign/print motifs: Marks + guideline imagery for research / Brandion-adjacent bind, **not** craft-eligible campaign clones by default.

## Rules

1. Only URLs present in the allowlist catalog may be fetched.
2. Host must match that kit’s `hostAllowlist` (exact host or subdomain).
3. Copy media into SPIRION staging → existing upload/graphic pipeline (`assetKind=brand_system`).
4. Provenance: `source=connector:brand_kit`, `source_id=brandkit_{kitId}_{…}`, `licenseClass=connector_tos`, `craftEligible=false` until `PATCH /api/library/captures/:id`.
5. Do not treat Brandfetch hotlinks or scraped brand pages as SSOT.

## Endpoints

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/brand-kits` | Catalog summary (ids, asset counts, policy) |
| GET | `/api/brand-kits/:kitId` | One kit + asset list |
| POST | `/api/brand-kits/sync` | Bearer `DIG_API_TOKEN` · body `{ "kitId"?: "pulumi", "limit"?: 10 }` |

## Operator

```bash
# list allowlisted kits
curl -sS "$SPIRION_API/api/brand-kits"

# sync one kit (default all assets up to limit)
curl -sS -X POST -H "Authorization: Bearer $DIG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"kitId":"pulumi"}' \
  "$SPIRION_API/api/brand-kits/sync"
```

Review with craft PATCH before Creation craft selection.

## Adding a kit

1. Confirm the brand publishes **direct asset URLs** (ZIP/README or CDN file links).
2. Append a kit object to `brand-kit-allowlist.json` with concrete `assets[].url` entries.
3. Prefer PNG/JPEG/WebP (ingest MIME allowlist). Skip SVG unless rasterized upstream.
4. Bump `policy_version` when rules change.
5. Unit test host allow + sync dry-run stays green.

## Non-goals

- Scraping `brand.*` HTML for links  
- Bulk Brandfetch mirror as craft corpus  
- Trademark-unrestricted remix of company logos in customer scenes without review  

## Staging smoke (2026-10-07)

Deploy dig-api `4be0267` healthy (`coolify` app `fjlcya8d9jnlecj4s44yru4q`).

| Check | Result |
|-------|--------|
| `GET /api/brand-kits` with Bearer | lists `pulumi` + `creativecommons` |
| `GET /api/brand-kits` without auth | **401** on `4be0267` (auth still required until public-GET fix lands) |
| `POST /api/brand-kits/sync` `{ "kitId":"pulumi","limit":2 }` + Bearer | queues `brand_system` / `connector:brand_kit` jobs |

**Pending deploy:** local commit making catalog GETs public (Bearer only on sync). Blocked 2026-10-07 by GitHub object-write `Internal Server Error` on push/Contents/blobs (reads + same-SHA refs OK). Paths: `knowledge/paths.json` → `brandKitAllowlist`.
