#!/usr/bin/env python3
"""Fetch Wikidata official websites for cities, municipalities, agencies, ministries."""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "knowledge" / "catalogs" / "sources" / "public-sector-wikidata-2026.json"
ENDPOINT = "https://query.wikidata.org/sparql"

QUERIES: list[tuple[str, str]] = [
    (
        "city",
        """
SELECT DISTINCT ?itemLabel ?countryLabel ?website WHERE {
  ?item wdt:P31/wdt:P279* wd:Q515 .
  ?item wdt:P856 ?website .
  OPTIONAL { ?item wdt:P17 ?country . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de,fr,es,it,nl,pt,pl,sv,ja,zh". }
}
LIMIT 2500
""",
    ),
    (
        "municipality",
        """
SELECT DISTINCT ?itemLabel ?countryLabel ?website WHERE {
  ?item wdt:P31/wdt:P279* wd:Q15284 .
  ?item wdt:P856 ?website .
  OPTIONAL { ?item wdt:P17 ?country . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de,fr,es,it,nl,pt,pl,sv". }
}
LIMIT 2000
""",
    ),
    (
        "capital",
        """
SELECT DISTINCT ?itemLabel ?countryLabel ?website WHERE {
  ?item wdt:P31 wd:Q5119 .
  ?item wdt:P856 ?website .
  OPTIONAL { ?item wdt:P17 ?country . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de,fr,es". }
}
LIMIT 500
""",
    ),
    (
        "ministry",
        """
SELECT DISTINCT ?itemLabel ?countryLabel ?website WHERE {
  ?item wdt:P31/wdt:P279* wd:Q192350 .
  ?item wdt:P856 ?website .
  OPTIONAL { ?item wdt:P17 ?country . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de,fr,es". }
}
LIMIT 1500
""",
    ),
    (
        "government_agency",
        """
SELECT DISTINCT ?itemLabel ?countryLabel ?website WHERE {
  ?item wdt:P31/wdt:P279* wd:Q327333 .
  ?item wdt:P856 ?website .
  OPTIONAL { ?item wdt:P17 ?country . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de,fr,es". }
}
LIMIT 2000
""",
    ),
    (
        "region",
        """
SELECT DISTINCT ?itemLabel ?countryLabel ?website WHERE {
  VALUES ?class { wd:Q10864048 wd:Q35657 wd:Q17166750 }
  ?item wdt:P31/wdt:P279* ?class .
  ?item wdt:P856 ?website .
  OPTIONAL { ?item wdt:P17 ?country . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de,fr,es". }
}
LIMIT 1500
""",
    ),
]


def run_sparql(query: str) -> list[dict]:
    params = urllib.parse.urlencode({"query": query, "format": "json"})
    req = urllib.request.Request(
        f"{ENDPOINT}?{params}",
        headers={
            "Accept": "application/sparql-results+json",
            "User-Agent": "design-intelligence-graph/public-sector-catalog (local research)",
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=120) as response:
        payload = json.loads(response.read().decode("utf-8"))
    rows = []
    for binding in payload.get("results", {}).get("bindings", []):
        website = binding.get("website", {}).get("value", "").strip()
        name = binding.get("itemLabel", {}).get("value", "").strip()
        country = binding.get("countryLabel", {}).get("value", "").strip()
        if not website or not name or name.startswith("Q"):
            continue
        rows.append({"name": name, "country": country, "url": website})
    return rows


def main() -> None:
    entries: list[dict] = []
    seen_urls: set[str] = set()
    for group, query in QUERIES:
        print(f"query {group}…", flush=True)
        try:
            rows = run_sparql(query)
        except Exception as error:  # noqa: BLE001
            print(f"  failed: {error}")
            continue
        added = 0
        for row in rows:
            key = row["url"].lower().rstrip("/")
            if key in seen_urls:
                continue
            seen_urls.add(key)
            entries.append({**row, "group": group})
            added += 1
        print(f"  +{added} (total {len(entries)})")
        time.sleep(2)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "id": "public-sector-wikidata-2026",
                "updated": "2026-08-21",
                "count": len(entries),
                "entries": entries,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n"
    )
    print(f"wrote {OUT} count={len(entries)}")


if __name__ == "__main__":
    main()
