# Design diversity catalog (1000)

**Date:** 2026-08-20  
**Catalog id:** `design-diversity-1000`  
**File:** `knowledge/catalogs/design-diversity-1000.json` (`paths.json` → `captureJobs.designDiversity1000`)  
**Rebuild:** `python3 scripts/build-design-diversity-1000.py`  
**Research snapshot:** `knowledge/catalogs/sources/design-diversity-wikidata-2026.json`  
**Queue:** `POST /api/jobs/batch` `{ "catalog": "design-diversity-1000", "skip_existing": true }` — see `knowledge/capture-batch.md`

Cross-industry public brand / product / creative agency homepages for Library design diversity:

- Banking, airlines, hotels, fashion, retail
- Software / SaaS, telecom, media, auto brands
- Curated QSR, fintech, beauty, mobility, and agency gaps

Hosts already in `automotive-oem-50`, `cross-industry-100`, `engineering-manufacturing-1000`, `insurance-1000`, or `insurance-plus-500` are excluded. Same host with/without `www` is one site.

Until the next dig-api deploy learns the catalog id, queue with `{ "urls": catalog.entries.map(url), "skip_existing": true }`.
