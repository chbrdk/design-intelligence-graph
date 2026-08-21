# Public sector / cities / governance catalog

**Catalog id:** `public-sector-1000`  
**File:** `knowledge/catalogs/public-sector-1000.json` (`paths.json` → `captureJobs.publicSector1000`)  
**Rebuild:** `python3 scripts/fetch-public-sector-wikidata.py` then `python3 scripts/build-public-sector-1000.py`  
**Research snapshot:** `knowledge/catalogs/sources/public-sector-wikidata-2026.json`  
**Queue:** `POST /api/jobs/batch` `{ "catalog": "public-sector-1000", "skip_existing": true }`

## Scope

1000 unique homepage hosts for civic / government design diversity:

- Curated national portals, major cities, ministries, agencies, EU/UN bodies
- Wikidata official websites (P856) for cities, municipalities, capitals, ministries, agencies
- No overlap with prior DIG capture catalogs
- Industry facet: `government`

## Groups (approx.)

City · Municipality · Ministry · Government agency · National portal · Capital · Region/state · Supranational
