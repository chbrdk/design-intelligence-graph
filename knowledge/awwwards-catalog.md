# Awwwards featured websites catalog

**Catalog ids:** `awwwards-500`, `awwwards-plus-1000`  
**Files:** `knowledge/catalogs/awwwards-500.json`, `knowledge/catalogs/awwwards-plus-1000.json`  
**Fetch:** `python3 scripts/fetch-awwwards-websites.py` (first wave) · `python3 scripts/fetch-awwwards-plus.py` (resume page 22+)  
**Rebuild:** `python3 scripts/build-awwwards-500.py` · `python3 scripts/build-awwwards-plus-1000.py`  
**Snapshots:** `knowledge/catalogs/sources/awwwards-websites-2026.json`, `awwwards-websites-plus-2026.json`  
**Queue:** `{ "catalog": "awwwards-500" }` or `awwwards-plus-1000`

## Scope

500 unique Visit-site homepage hosts from public [Awwwards websites](https://www.awwwards.com/websites/) listings (Sites of the Day, nominees, honorable mentions, general websites).

- Listing pages → `/sites/{slug}` → detail **Visit site** `href`
- Not an official Awwwards API (HTML scrape; may break)
- No overlap with prior DIG capture catalogs
- Industry facet: `tech`

## Groups

Site of the Day · Site of the Month · Developer Award · Honorable Mention · Nominee · Awwwards
