# Public sector / cities / governance catalog

**Catalog ids:** `public-sector-1000`, `public-sector-plus-500`  
**Files:** `knowledge/catalogs/public-sector-1000.json`, `knowledge/catalogs/public-sector-plus-500.json`  
**Rebuild:** `python3 scripts/fetch-public-sector-wikidata.py` then `python3 scripts/build-public-sector-1000.py` / `python3 scripts/build-public-sector-plus-500.py`  
**Research snapshot:** `knowledge/catalogs/sources/public-sector-wikidata-2026.json`  
**Queue:** `POST /api/jobs/batch` `{ "catalog": "public-sector-1000", "skip_existing": true }` or `public-sector-plus-500`

## Scope

1500 unique homepage hosts for civic / government design diversity (1000 + 500):

- Curated national portals, major and mid-tier cities, ministries, agencies, EU/UN bodies
- Wikidata official websites (P856) for cities, municipalities, capitals, ministries, agencies
- No overlap with prior DIG capture catalogs
- Industry facet: `government`

## Groups (approx.)

City · Municipality · Ministry · Government agency · National portal · Capital · Region/state · Supranational
