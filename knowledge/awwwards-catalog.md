# Awwwards featured websites catalog

**Catalog id:** `awwwards-500`  
**File:** `knowledge/catalogs/awwwards-500.json` (`paths.json` → `captureJobs.awwwards500`)  
**Fetch:** `python3 scripts/fetch-awwwards-websites.py`  
**Rebuild:** `python3 scripts/build-awwwards-500.py`  
**Research snapshot:** `knowledge/catalogs/sources/awwwards-websites-2026.json`  
**Queue:** `POST /api/jobs/batch` `{ "catalog": "awwwards-500", "skip_existing": true }`

## Scope

500 unique Visit-site homepage hosts from public [Awwwards websites](https://www.awwwards.com/websites/) listings (Sites of the Day, nominees, honorable mentions, general websites).

- Listing pages → `/sites/{slug}` → detail **Visit site** `href`
- Not an official Awwwards API (HTML scrape; may break)
- No overlap with prior DIG capture catalogs
- Industry facet: `tech`

## Groups

Site of the Day · Site of the Month · Developer Award · Honorable Mention · Nominee · Awwwards
