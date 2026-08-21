#!/usr/bin/env python3
"""Build knowledge/catalogs/public-sector-1000.json from curated + Wikidata sources."""
from __future__ import annotations

import json
import re
from collections import defaultdict, deque
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "knowledge" / "catalogs" / "public-sector-1000.json"
SOURCE = ROOT / "knowledge" / "catalogs" / "sources" / "public-sector-wikidata-2026.json"
EXISTING = [
    ROOT / "knowledge" / "catalogs" / "automotive-oem-50.json",
    ROOT / "knowledge" / "catalogs" / "cross-industry-100.json",
    ROOT / "knowledge" / "catalogs" / "engineering-manufacturing-1000.json",
    ROOT / "knowledge" / "catalogs" / "insurance-1000.json",
    ROOT / "knowledge" / "catalogs" / "insurance-plus-500.json",
    ROOT / "knowledge" / "catalogs" / "design-diversity-1000.json",
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

# High-signal civic / gov portals for design diversity (official websites).
CURATED: list[tuple[str, str, str, str]] = [
    ("USA.gov", "National portal", "US", "https://www.usa.gov/"),
    ("GOV.UK", "National portal", "GB", "https://www.gov.uk/"),
    ("Canada.ca", "National portal", "CA", "https://www.canada.ca/"),
    ("Service Public France", "National portal", "FR", "https://www.service-public.fr/"),
    ("Bundesregierung", "National portal", "DE", "https://www.bundesregierung.de/"),
    ("Australia.gov.au", "National portal", "AU", "https://www.australia.gov.au/"),
    ("Digital India", "National portal", "IN", "https://www.india.gov.in/"),
    ("Gov.sg", "National portal", "SG", "https://www.gov.sg/"),
    ("Europa.eu", "Supranational", "EU", "https://european-union.europa.eu/"),
    ("UN.org", "Supranational", "UN", "https://www.un.org/"),
    ("OECD", "Supranational", "INT", "https://www.oecd.org/"),
    ("World Bank", "Supranational", "INT", "https://www.worldbank.org/"),
    ("IMF", "Supranational", "INT", "https://www.imf.org/"),
    ("WHO", "Supranational", "INT", "https://www.who.int/"),
    ("NATO", "Supranational", "INT", "https://www.nato.int/"),
    ("City of New York", "City", "US", "https://www.nyc.gov/"),
    ("City of Los Angeles", "City", "US", "https://www.lacity.gov/"),
    ("City of Chicago", "City", "US", "https://www.chicago.gov/"),
    ("City of San Francisco", "City", "US", "https://sf.gov/"),
    ("City of Seattle", "City", "US", "https://www.seattle.gov/"),
    ("City of Boston", "City", "US", "https://www.boston.gov/"),
    ("City of Austin", "City", "US", "https://www.austintexas.gov/"),
    ("City of Denver", "City", "US", "https://www.denvergov.org/"),
    ("City of Toronto", "City", "CA", "https://www.toronto.ca/"),
    ("City of Vancouver", "City", "CA", "https://vancouver.ca/"),
    ("City of London", "City", "GB", "https://www.cityoflondon.gov.uk/"),
    ("Greater London Authority", "City", "GB", "https://www.london.gov.uk/"),
    ("Berlin.de", "City", "DE", "https://www.berlin.de/"),
    ("München.de", "City", "DE", "https://www.muenchen.de/"),
    ("Hamburg.de", "City", "DE", "https://www.hamburg.de/"),
    ("Stadt Wien", "City", "AT", "https://www.wien.gv.at/"),
    ("Stadt Zürich", "City", "CH", "https://www.stadt-zuerich.ch/"),
    ("Ville de Paris", "City", "FR", "https://www.paris.fr/"),
    ("Amsterdam.nl", "City", "NL", "https://www.amsterdam.nl/"),
    ("City of Copenhagen", "City", "DK", "https://www.kk.dk/"),
    ("City of Stockholm", "City", "SE", "https://start.stockholm/"),
    ("Oslo kommune", "City", "NO", "https://www.oslo.kommune.no/"),
    ("Helsinki", "City", "FI", "https://www.hel.fi/"),
    ("Ajuntament de Barcelona", "City", "ES", "https://www.barcelona.cat/"),
    ("Ayuntamiento de Madrid", "City", "ES", "https://www.madrid.es/"),
    ("Comune di Milano", "City", "IT", "https://www.comune.milano.it/"),
    ("Roma Capitale", "City", "IT", "https://www.comune.roma.it/"),
    ("City of Tokyo", "City", "JP", "https://www.metro.tokyo.lg.jp/"),
    ("Seoul Metropolitan Government", "City", "KR", "https://www.seoul.go.kr/"),
    ("Hong Kong Gov", "City", "HK", "https://www.gov.hk/"),
    ("City of Sydney", "City", "AU", "https://www.cityofsydney.nsw.gov.au/"),
    ("City of Melbourne", "City", "AU", "https://www.melbourne.vic.gov.au/"),
    ("Auckland Council", "City", "NZ", "https://www.aucklandcouncil.govt.nz/"),
    ("Cape Town", "City", "ZA", "https://www.capetown.gov.za/"),
    ("City of São Paulo", "City", "BR", "https://www.prefeitura.sp.gov.br/"),
    ("Ciudad de México", "City", "MX", "https://www.cdmx.gob.mx/"),
    ("Buenos Aires Ciudad", "City", "AR", "https://buenosaires.gob.ar/"),
    ("Dubai Government", "City", "AE", "https://www.dubai.ae/"),
    ("Tel Aviv-Yafo", "City", "IL", "https://www.tel-aviv.gov.il/"),
    ("White House", "Government agency", "US", "https://www.whitehouse.gov/"),
    ("U.S. Congress", "Government agency", "US", "https://www.congress.gov/"),
    ("NASA", "Government agency", "US", "https://www.nasa.gov/"),
    ("CDC", "Government agency", "US", "https://www.cdc.gov/"),
    ("NIH", "Government agency", "US", "https://www.nih.gov/"),
    ("FDA", "Government agency", "US", "https://www.fda.gov/"),
    ("EPA", "Government agency", "US", "https://www.epa.gov/"),
    ("IRS", "Government agency", "US", "https://www.irs.gov/"),
    ("USPS", "Government agency", "US", "https://www.usps.com/"),
    ("NHS", "Government agency", "GB", "https://www.nhs.uk/"),
    ("BBC", "Government agency", "GB", "https://www.bbc.com/"),  # public broadcaster design signal
    ("Bundestag", "Government agency", "DE", "https://www.bundestag.de/"),
    ("Bundesrat", "Government agency", "DE", "https://www.bundesrat.de/"),
    ("BSI", "Government agency", "DE", "https://www.bsi.bund.de/"),
    ("Destatis", "Government agency", "DE", "https://www.destatis.de/"),
    ("Assemblée Nationale", "Government agency", "FR", "https://www.assemblee-nationale.fr/"),
    ("Sénat France", "Government agency", "FR", "https://www.senat.fr/"),
    ("CNIL", "Government agency", "FR", "https://www.cnil.fr/"),
    ("Parlamento Europeo", "Supranational", "EU", "https://www.europarl.europa.eu/"),
    ("European Commission", "Supranational", "EU", "https://commission.europa.eu/"),
    ("Council of the EU", "Supranational", "EU", "https://www.consilium.europa.eu/"),
    ("ECB", "Supranational", "EU", "https://www.ecb.europa.eu/"),
    ("California State", "Region / state", "US", "https://www.ca.gov/"),
    ("New York State", "Region / state", "US", "https://www.ny.gov/"),
    ("Texas.gov", "Region / state", "US", "https://www.texas.gov/"),
    ("Bayern.de", "Region / state", "DE", "https://www.bayern.de/"),
    ("NRW.de", "Region / state", "DE", "https://www.land.nrw/"),
    ("Île-de-France", "Region / state", "FR", "https://www.iledefrance.fr/"),
    ("Catalunya", "Region / state", "ES", "https://web.gencat.cat/"),
    ("Scotland.gov", "Region / state", "GB", "https://www.gov.scot/"),
    ("Wales.gov", "Region / state", "GB", "https://www.gov.wales/"),
    ("Bundeskanzleramt AT", "Ministry", "AT", "https://www.bundeskanzleramt.gv.at/"),
    ("U.S. Department of State", "Ministry", "US", "https://www.state.gov/"),
    ("U.S. Department of Defense", "Ministry", "US", "https://www.defense.gov/"),
    ("UK Home Office", "Ministry", "GB", "https://www.gov.uk/government/organisations/home-office"),
    ("Auswärtiges Amt", "Ministry", "DE", "https://www.auswaertiges-amt.de/"),
    ("BMWK", "Ministry", "DE", "https://www.bmwk.de/"),
    ("Ministère de l'Intérieur", "Ministry", "FR", "https://www.interieur.gouv.fr/"),
    ("Ministry of Foreign Affairs Japan", "Ministry", "JP", "https://www.mofa.go.jp/"),
    ("GOV.BR", "National portal", "BR", "https://www.gov.br/"),
    ("Gobierno de México", "National portal", "MX", "https://www.gob.mx/"),
    ("Gov.za", "National portal", "ZA", "https://www.gov.za/"),
    ("Gov.ie", "National portal", "IE", "https://www.gov.ie/"),
    ("Government.nl", "National portal", "NL", "https://www.government.nl/"),
    ("Regeringen.se", "National portal", "SE", "https://www.government.se/"),
    ("Regjeringen.no", "National portal", "NO", "https://www.regjeringen.no/"),
    ("Valtioneuvosto", "National portal", "FI", "https://valtioneuvosto.fi/"),
    ("Admin.ch", "National portal", "CH", "https://www.admin.ch/"),
    ("E-Estonia", "National portal", "EE", "https://e-estonia.com/"),
    ("Gov.pl", "National portal", "PL", "https://www.gov.pl/"),
    ("Gov.cz", "National portal", "CZ", "https://www.vlada.cz/"),
    ("Portugal.gov", "National portal", "PT", "https://www.portugal.gov.pt/"),
    ("Government of India MyGov", "National portal", "IN", "https://www.mygov.in/"),
    ("Gov.cn", "National portal", "CN", "https://www.gov.cn/"),
    ("Kantei Japan", "National portal", "JP", "https://www.kantei.go.jp/"),
    ("Blue House Korea", "National portal", "KR", "https://www.president.go.kr/"),
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
    by_group: dict[str, deque[dict]] = defaultdict(deque)
    seen: set[str] = set(known)

    for name, group, country, url in CURATED:
        h = host_only(url)
        if not h or h in seen or blocked(h):
            continue
        seen.add(h)
        by_group["curated"].append(
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
        by_group[group].append(
            {
                "name": row.get("name") or h,
                "group": GROUP_LABEL.get(group, group),
                "country": country_code(row.get("country") or ""),
                "url": url,
            }
        )

    order = [
        "curated",
        "city",
        "capital",
        "municipality",
        "ministry",
        "government_agency",
        "region",
    ]
    picked: list[dict] = []
    while len(picked) < 1000:
        progressed = False
        for key in order:
            queue = by_group.get(key)
            if not queue:
                continue
            picked.append(queue.popleft())
            progressed = True
            if len(picked) >= 1000:
                break
        if not progressed:
            break

    if len(picked) < 1000:
        raise SystemExit(f"Only {len(picked)} unique new hosts available; need 1000")

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

    catalog = {
        "id": "public-sector-1000",
        "title": "1000 public-sector / city / governance homepages",
        "source": "Curated national portals, major cities, ministries and agencies; plus Wikidata official websites (P856) for cities, municipalities, capitals, ministries and government agencies. Excludes hosts already in prior DIG capture catalogs.",
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


if __name__ == "__main__":
    main()
