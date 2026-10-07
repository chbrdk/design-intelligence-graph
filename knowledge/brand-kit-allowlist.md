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
6. ZIP rows require explicit `zipMember` (exact path inside the ZIP). No zip directory crawl; `source_id` includes the member.

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

# sync wave (no Dribbble OAuth) — one kit per call, limit caps queue size
for kit in pulumi venice vercel nextjs github tailwind astro python nodejs bun creativecommons; do
  curl -sS -X POST -H "Authorization: Bearer $DIG_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"kitId\":\"$kit\",\"limit\":6}" \
    "$SPIRION_API/api/brand-kits/sync"
  echo
done
```

`DIG_API_TOKEN` from Coolify REST (MCP never returns env **values**):

```bash
# token = same Bearer as ~/.cursor/mcp.json coolify (never commit)
COOLIFY_API=https://coolify.plygrnd.tech/api/v1
DIG_APP=fjlcya8d9jnlecj4s44yru4q   # paths.json → brandKitAllowlist.coolifyAppUuid
DIG_API_TOKEN=$(curl -sS -H "Authorization: Bearer $COOLIFY_TOKEN" \
  "$COOLIFY_API/applications/$DIG_APP/envs" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); items=d if isinstance(d,list) else d.get("data",[]); print(next(e["value"] for e in items if e.get("key")=="DIG_API_TOKEN"))')
```

Review with craft PATCH before Creation craft selection.

## Adding a kit

1. Confirm the brand publishes **direct asset URLs** (ZIP/README or CDN file links).
2. Append a kit object to `brand-kit-allowlist.json` with concrete `assets[].url` entries.
3. Prefer PNG/JPEG/WebP (ingest MIME allowlist). Skip SVG unless rasterized upstream.
4. For ZIP kits: set `zipMember` to the exact in-archive path (e.g. Venice wordmark PNG zip).
5. Bump `policy_version` when rules change.
6. Unit test host allow + zip member extract stays green.

## Non-goals

- Scraping `brand.*` HTML for links  
- Bulk Brandfetch mirror as craft corpus  
- Trademark-unrestricted remix of company logos in customer scenes without review  

## Staging smoke (2026-10-07)

| Deploy | dig-api `a7fd431` · Coolify `fjlcya8d9jnlecj4s44yru4q` · healthy |
|--------|------------------------------------------------------------------|
| `GET /api/brand-kits` (no auth) | 200 · 11 kits / 30 assets (`tailwind`…`bun` added) |
| `GET /api/brand-kits/venice` | ZIP rows include `zipMember`; token PNGs direct |
| `POST /api/brand-kits/sync` without Bearer | 401 |
| Full-kit sync wave (Coolify REST → `DIG_API_TOKEN`) | **30 queued** · `GET /api/library/captures?assetKind=brand_system` → 32 rows · `source=connector:brand_kit` |
| Follow-up | Enrichment no longer flips brand-kit → `craftEligible=true`; SVG wordmarks densify to 1200×630; thin brand marks not failed |

Paths: `knowledge/paths.json` → `brandKitAllowlist`. Coolify env REST: plexon `knowledge/coolify-deploy-api.md` § Set app env.
