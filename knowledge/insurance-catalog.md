# Insurance catalog (1000)

**Date:** 2026-08-18  
**Catalog id:** `insurance-1000`  
**File:** `knowledge/catalogs/insurance-1000.json` (`paths.json` → `captureJobs.insurance1000`)  
**Rebuild:** `python3 scripts/build-insurance-catalog.py`  
**Research snapshot:** `knowledge/catalogs/sources/insurance-wikidata-2026.json`  
**Queue:** `POST /api/jobs/batch` `{ "catalog": "insurance-1000", "skip_existing": true }` — see `knowledge/capture-batch.md`

Worldwide public homepages for design-library diversity in insurance:

- Life, P&C, health, reinsurance
- Brokers, mutuals/cooperatives, takaful
- Insurtech, pet, travel, title, credit/surety

Majors (Allianz, AXA, State Farm, Progressive, Munich Re, Swiss Re, Marsh, Lemonade, …) are listed first. Remaining rows come from Wikidata `P31` insurance company + `P452` insurance industry + English Wikipedia insurance-company pages (`P856` official website), snapshot 2026-08-18.

Hosts already in `automotive-oem-50`, `cross-industry-100`, or `engineering-manufacturing-1000` are excluded (e.g. UnitedHealth Group, CVS Health). Same host with/without `www` is one site.

Staging API only learns a new catalog id after an API deploy. To queue without restarting the API (which drops the in-memory capture/enrichment queues), POST the catalog `urls` array instead of `{ "catalog": "insurance-1000" }`.

## Plus 500 (2026-08-18)

**Catalog id:** `insurance-plus-500`  
**File:** `knowledge/catalogs/insurance-plus-500.json` (`paths.json` → `captureJobs.insurancePlus500`)  
**Rebuild:** `python3 scripts/build-insurance-plus-500.py`  
**Research snapshot:** `knowledge/catalogs/sources/insurance-wikidata-plus-2026.json` (plus leftover rows from the first Wikidata dump)

Second wave of public insurance homepages that were **not** in automotive-oem-50, cross-industry-100, engineering-manufacturing-1000, or insurance-1000. Same-host `/en` variants are treated as duplicates. Country sites (`agria.se` vs `agria.fi`) stay, because they are different designs.

Queue with `{ "urls": catalog.entries.map(url), "skip_existing": true }` until the next API deploy.
