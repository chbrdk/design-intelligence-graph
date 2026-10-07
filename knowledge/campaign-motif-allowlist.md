# Campaign / print motif allowlist ingest (SPIRION)

**Date:** 2026-10-07  
**Catalog:** `knowledge/catalogs/campaign-motif-allowlist.json`  
**Config:** `knowledge/paths.json` → `campaignMotifAllowlist`  
**API:** `/api/campaign-motifs`  
**Code:** `src/campaign-motif-allowlist.ts` · `src/campaign-motif-api.ts`  
**Spec:** plexon `specs/domain/spirion-campaign-motif-allowlist.md`

## Purpose

Ingest **explicitly listed** public-domain / free **campaign and print motifs** (posters, key visuals) as SPIRION `print_ad` / `campaign_keyvisual` assets — **no HTML scrape**, no Commons category crawl.

This is the composition corpus. **Brand kits** (`/api/brand-kits`, `brand_system`) remain **logos / marks** only — they are not campaign craft references.

## Rules

1. Only URLs present in the allowlist catalog may be fetched.
2. Host must match that pack’s `hostAllowlist` (exact host or subdomain).
3. Copy media into SPIRION staging → graphic pipeline (`print_ad` or `campaign_keyvisual`).
4. Provenance: `source=connector:campaign_motif`, `source_id=motif_{packId}_{…}`, `licenseClass=public_domain`, `craftEligible=false` until `PATCH /api/library/captures/:id`.
5. Oversized originals: list an explicit Commons thumb URL under `maxBytes` (12 MiB) — never invent a crawl.
6. Wikimedia fetches MUST send a descriptive `User-Agent` (`campaignMotifAllowlist.fetchUserAgent`).

## Endpoints

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/campaign-motifs` | Catalog summary (ids, asset counts, policy) |
| GET | `/api/campaign-motifs/:packId` | One pack + asset list |
| POST | `/api/campaign-motifs/sync` | Bearer `DIG_API_TOKEN` · body `{ "packId"?: "wwi_wwii_posters", "limit"?: 10 }` |
| POST | `/api/campaign-motifs/repair-provenance` | Bearer · fix `motif_*` rows to connector + `public_domain` / `craftEligible=false` |

## Operator

```bash
curl -sS "$SPIRION_API/api/campaign-motifs"

# DIG_API_TOKEN via Coolify REST (see knowledge/brand-kit-allowlist.md)
for pack in wwi_wwii_posters midcentury_political_print; do
  curl -sS -X POST -H "Authorization: Bearer $DIG_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"packId\":\"$pack\",\"limit\":6}" \
    "$SPIRION_API/api/campaign-motifs/sync"
  echo
done
```

Review with craft PATCH before Creation craft selection.

## Adding a pack

1. Confirm the file is PD / clearly free to copy; note Commons title.
2. Resolve a **direct** `upload.wikimedia.org` or `thumb.wikimedia.org` URL (API `imageinfo`, not HTML).
3. Append pack/assets to `campaign-motif-allowlist.json` with `assetKind` when not the pack default.
4. Keep each file under `maxBytes`; use Commons `iiurlwidth` thumbs when originals are huge.
5. Bump `policy_version` when rules change.
6. Unit tests for host allow stay green.

## Non-goals

- Scraping Commons category HTML  
- Treating brand-kit logos as campaign motifs  
- Auto craft-eligible foreign campaigns without review  

## Staging smoke

| Check | Expect |
|-------|--------|
| `GET /api/campaign-motifs` | 200 · packs ≥1 · default kinds print/campaign |
| `POST …/sync` without Bearer | 401 |
| Sync wave | queued jobs · library `print_ad` / `campaign_keyvisual` · `source=connector:campaign_motif` · `license_class=public_domain` |
| DB | migration `017_public_domain_license.sql` (CHECK includes `public_domain`) |

Paths: `knowledge/paths.json` → `campaignMotifAllowlist`.
