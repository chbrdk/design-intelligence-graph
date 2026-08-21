#!/usr/bin/env python3
"""Build knowledge/catalogs/public-sector-plus-500.json from leftover Wikidata."""
from __future__ import annotations

import json
import re
from collections import defaultdict, deque
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "knowledge" / "catalogs" / "public-sector-plus-500.json"
SOURCE = ROOT / "knowledge" / "catalogs" / "sources" / "public-sector-wikidata-2026.json"
EXISTING = [
    ROOT / "knowledge" / "catalogs" / "automotive-oem-50.json",
    ROOT / "knowledge" / "catalogs" / "cross-industry-100.json",
    ROOT / "knowledge" / "catalogs" / "engineering-manufacturing-1000.json",
    ROOT / "knowledge" / "catalogs" / "insurance-1000.json",
    ROOT / "knowledge" / "catalogs" / "insurance-plus-500.json",
    ROOT / "knowledge" / "catalogs" / "design-diversity-1000.json",
    ROOT / "knowledge" / "catalogs" / "public-sector-1000.json",
]

BLOCK_HOSTS = {
    "facebook.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "linkedin.com",
    "youtube.com",
    "wikipedia.org",
    "en.wikipedia.org",
    "web.archive.org",
    "google.com",
    "play.google.com",
    "apps.apple.com",
    "crunchbase.com",
    "bloomberg.com",
    "github.com",
    "medium.com",
    "wordpress.com",
    "blogspot.com",
    "wixsite.com",
    "squarespace.com",
    "tiktok.com",
    "pinterest.com",
    "tripadvisor.com",
    "booking.com",
}

GROUP_LABEL = {
    "curated": "Curated public",
    "city": "City",
    "municipality": "Municipality",
    "capital": "Capital",
    "ministry": "Ministry",
    "government_agency": "Government agency",
    "region": "Region / state",
}

# Mid-tier civic portals / agencies not prioritized in public-sector-1000.
CURATED: list[tuple[str, str, str, str]] = [
    ("City of Portland", "City", "US", "https://www.portland.gov/"),
    ("City of Philadelphia", "City", "US", "https://www.phila.gov/"),
    ("City of Phoenix", "City", "US", "https://www.phoenix.gov/"),
    ("City of San Diego", "City", "US", "https://www.sandiego.gov/"),
    ("City of Minneapolis", "City", "US", "https://www.minneapolismn.gov/"),
    ("City of Atlanta", "City", "US", "https://www.atlantaga.gov/"),
    ("City of Miami", "City", "US", "https://www.miamigov.com/"),
    ("City of Montreal", "City", "CA", "https://montreal.ca/"),
    ("City of Ottawa", "City", "CA", "https://ottawa.ca/"),
    ("City of Calgary", "City", "CA", "https://www.calgary.ca/"),
    ("City of Manchester", "City", "GB", "https://www.manchester.gov.uk/"),
    ("City of Birmingham UK", "City", "GB", "https://www.birmingham.gov.uk/"),
    ("City of Glasgow", "City", "GB", "https://www.glasgow.gov.uk/"),
    ("Stadt Köln", "City", "DE", "https://www.stadt-koeln.de/"),
    ("Stadt Frankfurt", "City", "DE", "https://frankfurt.de/"),
    ("Stadt Stuttgart", "City", "DE", "https://www.stuttgart.de/"),
    ("Stadt Düsseldorf", "City", "DE", "https://www.duesseldorf.de/"),
    ("Ville de Lyon", "City", "FR", "https://www.lyon.fr/"),
    ("Ville de Marseille", "City", "FR", "https://www.marseille.fr/"),
    ("Ville de Lille", "City", "FR", "https://www.lille.fr/"),
    ("Gemeente Rotterdam", "City", "NL", "https://www.rotterdam.nl/"),
    ("Gemeente Den Haag", "City", "NL", "https://www.denhaag.nl/"),
    ("Stadt Bern", "City", "CH", "https://www.bern.ch/"),
    ("Stadt Basel", "City", "CH", "https://www.bs.ch/"),
    ("Comune di Torino", "City", "IT", "https://www.comune.torino.it/"),
    ("Comune di Napoli", "City", "IT", "https://www.comune.napoli.it/"),
    ("Ayuntamiento de Valencia", "City", "ES", "https://www.valencia.es/"),
    ("Ayuntamiento de Sevilla", "City", "ES", "https://www.sevilla.org/"),
    ("City of Brisbane", "City", "AU", "https://www.brisbane.qld.gov.au/"),
    ("City of Perth", "City", "AU", "https://www.perth.wa.gov.au/"),
    ("Wellington City Council", "City", "NZ", "https://wellington.govt.nz/"),
    ("Florida.gov", "Region / state", "US", "https://www.fl.gov/"),
    ("Illinois.gov", "Region / state", "US", "https://www.illinois.gov/"),
    ("Massachusetts.gov", "Region / state", "US", "https://www.mass.gov/"),
    ("Baden-Württemberg", "Region / state", "DE", "https://www.baden-wuerttemberg.de/"),
    ("Hessen.de", "Region / state", "DE", "https://hessen.de/"),
    ("Provence-Alpes-Côte d'Azur", "Region / state", "FR", "https://www.maregionsud.fr/"),
    ("GSA", "Government agency", "US", "https://www.gsa.gov/"),
    ("NOAA", "Government agency", "US", "https://www.noaa.gov/"),
    ("NIST", "Government agency", "US", "https://www.nist.gov/"),
    ("GOV.UK Design System", "Government agency", "GB", "https://design-system.service.gov.uk/"),
    ("DigitalService Bund", "Government agency", "DE", "https://digitalservice.bund.de/"),
    ("DINUM France", "Government agency", "FR", "https://www.numerique.gouv.fr/"),
    ("Gov.uk Companies House", "Government agency", "GB", "https://www.gov.uk/government/organisations/companies-house"),
    ("U.S. Census Bureau", "Government agency", "US", "https://www.census.gov/"),
    ("Bundesbank", "Government agency", "DE", "https://www.bundesbank.de/"),
    ("Banque de France", "Government agency", "FR", "https://www.banque-france.fr/"),
    ("Swiss National Bank", "Government agency", "CH", "https://www.snb.ch/"),
    ("Rijksmuseum", "Government agency", "NL", "https://www.rijksmuseum.nl/"),  # public cultural portal design signal
    ("Library of Congress", "Government agency", "US", "https://www.loc.gov/"),
]


def host_only(url: str) -> str:
    parsed = urlparse(url if "://" in url else f"https://{url}")
    return (parsed.hostname or "").lower().removeprefix("www.")


def blocked(host: str) -> bool:
    if not host:
        return True
    for bad in BLOCK_HOSTS:
        if host == bad or host.endswith("." + bad):
            return True
    return False


def is_home(url: str) -> bool:
    parsed = urlparse(url)
    path = parsed.path or "/"
    return path in {"", "/"} or path.count("/") <= 2


def slug(name: str) -> str:
    out: list[str] = []
    for ch in name.lower():
        if ch.isalnum():
            out.append(ch)
        elif ch in " &._/'":
            if out and out[-1] != "-":
                out.append("-")
    return "".join(out).strip("-")


def country_code(label: str) -> str:
    label = (label or "").strip()
    if not label:
        return "XX"
    parts = re.split(r"[\s,]+", label)
    if len(parts) == 1 and len(parts[0]) <= 3:
        return parts[0].upper()
    return label[:2].upper()


def load_known_hosts() -> set[str]:
    known: set[str] = set()
    for path in EXISTING:
        data = json.loads(path.read_text())
        for entry in data.get("entries", []):
            h = host_only(entry["url"])
            if h:
                known.add(h)
    return known


def main() -> None:
    known = load_known_hosts()
    seen: set[str] = set(known)
    by_country: dict[str, deque[dict]] = defaultdict(deque)
    curated_rows: list[dict] = []

    for name, group, country, url in CURATED:
        h = host_only(url)
        if not h or h in seen or blocked(h):
            continue
        seen.add(h)
        curated_rows.append(
            {
                "name": name,
                "group": group,
                "country": country,
                "url": url if "://" in url else f"https://{url}",
            }
        )

    raw = json.loads(SOURCE.read_text())
    for row in raw.get("entries", []):
        url = (row.get("url") or "").strip()
        if not url:
            continue
        if url.startswith("http://"):
            url = "https://" + url[len("http://") :]
        elif not url.startswith("https://"):
            url = f"https://{url}"
        h = host_only(url)
        if not h or h in seen or blocked(h):
            continue
        if not is_home(url):
            parsed = urlparse(url)
            shallow = f"https://{parsed.netloc}/"
            h2 = host_only(shallow)
            if h2 and h2 not in seen and not blocked(h2):
                url = shallow
                h = h2
            else:
                continue
        seen.add(h)
        group = row.get("group") or "city"
        cc = country_code(row.get("country") or "")
        by_country[cc].append(
            {
                "name": row.get("name") or h,
                "group": GROUP_LABEL.get(group, group),
                "country": cc,
                "url": url,
            }
        )

    picked: list[dict] = list(curated_rows)
    countries = deque(sorted(by_country, key=lambda c: (-len(by_country[c]), c)))
    while len(picked) < 500 and countries:
        cc = countries.popleft()
        queue = by_country.get(cc)
        if not queue:
            continue
        picked.append(queue.popleft())
        if queue:
            countries.append(cc)

    if len(picked) < 500:
        raise SystemExit(f"Only {len(picked)} unique new hosts available; need 500")

    picked = picked[:500]
    entries = []
    for rank, row in enumerate(picked, start=1):
        base = slug(row["name"])[:48]
        host = host_only(row["url"]).replace(".", "-")[:24]
        entries.append(
            {
                "rank": rank,
                "id": f"{base}-{host}"[:64],
                "name": row["name"],
                "group": row["group"],
                "country": row["country"],
                "url": row["url"],
            }
        )

    seen_ids: set[str] = set()
    for entry in entries:
        candidate = entry["id"]
        if candidate not in seen_ids:
            seen_ids.add(candidate)
            continue
        n = 2
        while f"{candidate}-{n}" in seen_ids:
            n += 1
        entry["id"] = f"{candidate}-{n}"
        seen_ids.add(entry["id"])

    for entry in entries:
        if entry["url"].startswith("http://"):
            entry["url"] = "https://" + entry["url"][len("http://") :]
    assert all(e["url"].startswith("https://") for e in entries)
    assert len({host_only(e["url"]) for e in entries}) == 500

    catalog = {
        "id": "public-sector-plus-500",
        "title": "500 additional public-sector / city / governance homepages not in public-sector-1000",
        "source": "Second public-sector capture wave (2026-08-21). Curated mid-tier cities and agencies first, then leftover Wikidata official websites round-robin by country. Hosts already in prior DIG catalogs including public-sector-1000 are excluded.",
        "sourceUrl": "https://query.wikidata.org/",
        "year": 2026,
        "updated": "2026-08-21",
        "entries": entries,
    }
    OUT.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")
    hosts = {host_only(e["url"]) for e in entries}
    print(f"wrote {OUT} entries={len(entries)} unique_hosts={len(hosts)}")
    print(
        "groups",
        {g: sum(1 for e in entries if e["group"] == g) for g in sorted({e["group"] for e in entries})},
    )
    print("countries", len({e["country"] for e in entries}))


if __name__ == "__main__":
    main()
