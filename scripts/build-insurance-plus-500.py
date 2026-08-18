#!/usr/bin/env python3
"""Build knowledge/catalogs/insurance-plus-500.json from leftover Wikidata + curated gaps."""
from __future__ import annotations

import importlib.util
import json
from collections import defaultdict, deque
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "knowledge" / "catalogs" / "insurance-plus-500.json"
SOURCES = [
    ROOT / "knowledge" / "catalogs" / "sources" / "insurance-wikidata-2026.json",
    ROOT / "knowledge" / "catalogs" / "sources" / "insurance-wikidata-plus-2026.json",
]
EXISTING = [
    ROOT / "knowledge" / "catalogs" / "automotive-oem-50.json",
    ROOT / "knowledge" / "catalogs" / "cross-industry-100.json",
    ROOT / "knowledge" / "catalogs" / "engineering-manufacturing-1000.json",
    ROOT / "knowledge" / "catalogs" / "insurance-1000.json",
]

spec = importlib.util.spec_from_file_location(
    "ins_cat", Path(__file__).with_name("build-insurance-catalog.py")
)
ins = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(ins)

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
    "edwardjones.com",
    "powercorporation.com",
    "redion.com",
    "hangseng.com",
    "adityabirlacapital.com",
}


def host_only(url: str) -> str:
    parsed = urlparse(url.strip() if "://" in url.strip() else f"https://{url.strip()}")
    return (parsed.hostname or "").lower().removeprefix("www.")


def is_home(url: str) -> bool:
    parsed = urlparse(url)
    path = parsed.path or "/"
    return path in ("", "/") and not parsed.query


def blocked(host: str) -> bool:
    if not host or host.endswith(".gov") or host.endswith(".edu"):
        return True
    return any(host == b or host.endswith("." + b) for b in BLOCK_HOSTS)


# Dedicated insurer homepages missing from insurance-1000 (2026-08-18).
CURATED: list[tuple[str, str, str, str]] = [
    ("Nationale-Nederlanden", "Life insurance", "NL", "https://www.nn.nl/"),
    ("The Auto Club Group", "Auto insurance", "US", "https://www.autoclubgroup.com/"),
    ("AAA", "Auto insurance", "US", "https://www.aaa.com/"),
    ("State Auto", "Property & casualty", "US", "https://www.stateauto.com/"),
    ("Donegal Insurance", "Property & casualty", "US", "https://www.donegalgroup.com/"),
    ("American National", "Composite / multiline", "US", "https://www.americannational.com/"),
    ("National Life Group", "Life insurance", "US", "https://www.nationallife.com/"),
    ("Penn Mutual", "Life insurance", "US", "https://www.pennmutual.com/"),
    ("Ohio National", "Life insurance", "US", "https://www.ohionational.com/"),
    ("F&G", "Life insurance", "US", "https://www.fglife.com/"),
    ("Sagicor", "Life insurance", "BB", "https://www.sagicor.com/"),
    ("Bajaj Allianz General", "Property & casualty", "IN", "https://www.bajajallianz.com/"),
    ("Max Life", "Life insurance", "IN", "https://www.maxlifeinsurance.com/"),
    ("Tata AIA", "Life insurance", "IN", "https://www.tataaia.com/"),
    ("Kotak Life", "Life insurance", "IN", "https://www.kotaklife.com/"),
    ("Care Health Insurance", "Health insurance", "IN", "https://www.careinsurance.com/"),
    ("Niva Bupa", "Health insurance", "IN", "https://www.nivabupa.com/"),
    ("Reliance General", "Property & casualty", "IN", "https://www.reliancegeneral.co.in/"),
    ("MSIG Malaysia", "Property & casualty", "MY", "https://www.msig.com.my/"),
    ("Allianz Malaysia", "Composite / multiline", "MY", "https://www.allianz.com.my/"),
    ("Etiqa", "Takaful", "MY", "https://www.etiqa.com.my/"),
    ("AIA Malaysia", "Life insurance", "MY", "https://www.aia.com.my/"),
    ("Tokio Marine Malaysia", "Property & casualty", "MY", "https://www.tokiomarine.com.my/"),
    ("Dhipaya Insurance", "Property & casualty", "TH", "https://www.dhipaya.co.th/"),
    ("Muang Thai Life", "Life insurance", "TH", "https://www.muangthai.co.th/"),
    ("FWD", "Life insurance", "HK", "https://www.fwd.com/"),
    ("FTLife", "Life insurance", "HK", "https://www.ftlife.com.hk/"),
    ("BOC Life", "Life insurance", "HK", "https://www.boclife.com.hk/"),
    ("China Taiping", "Composite / multiline", "HK", "https://www.cntaiping.com/"),
    ("New China Life", "Life insurance", "CN", "https://www.newchinalife.com/"),
    ("Taikang", "Life insurance", "CN", "https://www.taikang.com/"),
    ("Sompo Japan", "Property & casualty", "JP", "https://www.sompo-japan.co.jp/"),
    ("Aioi Nissay Dowa", "Property & casualty", "JP", "https://www.aioinissaydowa.co.jp/"),
    ("Mitsui Direct", "Auto insurance", "JP", "https://www.mitsui-direct.co.jp/"),
    ("Sony Assurance", "Insurtech", "JP", "https://www.sonysonpo.co.jp/"),
    ("Anicom", "Pet insurance", "JP", "https://www.anicom-sompo.co.jp/"),
    ("Zurich Japan", "Property & casualty", "JP", "https://www.zurich.co.jp/"),
    ("AXA Japan", "Composite / multiline", "JP", "https://www.axa.co.jp/"),
    ("DB Insurance", "Property & casualty", "KR", "https://www.idbins.com/"),
    ("Hyundai Marine & Fire", "Property & casualty", "KR", "https://www.hi.co.kr/"),
    ("KB Insurance", "Property & casualty", "KR", "https://www.kbinsure.co.kr/"),
    ("Meritz Fire", "Property & casualty", "KR", "https://www.meritzfire.com/"),
    ("Admiral UK", "Auto insurance", "GB", "https://www.admiral.com/"),
    ("Churchill", "Auto insurance", "GB", "https://www.churchill.com/"),
    ("Hastings Direct", "Auto insurance", "GB", "https://www.hastingsdirect.com/"),
    ("Elephant", "Auto insurance", "GB", "https://www.elephant.co.uk/"),
    ("GoCompare", "Insurtech", "GB", "https://www.gocompare.com/"),
    ("Ageas UK", "Property & casualty", "GB", "https://www.ageas.co.uk/"),
    ("Aviva UK", "Composite / multiline", "GB", "https://www.aviva.co.uk/"),
    ("Zurich UK", "Property & casualty", "GB", "https://www.zurich.co.uk/"),
    ("AXA UK", "Composite / multiline", "GB", "https://www.axa.co.uk/"),
    ("Direct Line", "Auto insurance", "GB", "https://www.directline.com/"),
    ("Privilege", "Auto insurance", "GB", "https://www.privilege.com/"),
    ("Ecclesiastical", "Marine / specialty", "GB", "https://www.ecclesiastical.com/"),
    ("Allied World", "Reinsurance", "BM", "https://alliedworldinsurance.com/"),
    ("Aspen Insurance", "Reinsurance", "BM", "https://www.aspen.co/"),
    ("SiriusPoint", "Reinsurance", "BM", "https://www.siriuspt.com/"),
    ("Enstar", "Reinsurance", "BM", "https://www.enstargroup.com/"),
    ("Hamilton Insurance", "Reinsurance", "BM", "https://www.hamiltongroup.com/"),
    ("James River", "Marine / specialty", "US", "https://www.jamesriverins.com/"),
    ("Skyward Specialty", "Marine / specialty", "US", "https://www.skywardinsurance.com/"),
    ("Stewart Title", "Title insurance", "US", "https://www.stewart.com/"),
    ("Old Republic Insurance", "Property & casualty", "US", "https://www.oldrepublic.com/"),
    ("TruStage", "Life insurance", "US", "https://www.trustage.com/"),
    ("CUNA Mutual", "Mutual / cooperative", "US", "https://www.cunamutual.com/"),
    ("Hylant", "Insurance broker", "US", "https://www.hylant.com/"),
    ("IMA Financial", "Insurance broker", "US", "https://imacorp.com/"),
    ("Baldwin Group", "Insurance broker", "US", "https://www.baldwin.com/"),
    ("World Insurance Associates", "Insurance broker", "US", "https://www.worldinsurance.com/"),
    ("OneDigital", "Insurance broker", "US", "https://www.onedigital.com/"),
    ("Newfront", "Insurance broker", "US", "https://www.newfront.com/"),
    ("Coverdash", "Insurtech", "US", "https://www.coverdash.com/"),
    ("Boost Insurance", "Insurtech", "US", "https://www.boostinsurance.com/"),
    ("Accelerant", "Insurtech", "US", "https://www.accelerant.ai/"),
    ("Resilience Cyber", "Insurtech", "US", "https://resilienceinsurance.com/"),
    ("Hiscox US", "Marine / specialty", "US", "https://www.hiscox.com/"),
    ("Santam", "Property & casualty", "ZA", "https://www.santam.co.za/"),
    ("Hollard", "Composite / multiline", "ZA", "https://www.hollard.co.za/"),
    ("Clientèle", "Life insurance", "ZA", "https://www.clientele.co.za/"),
    ("QBE Europe", "Property & casualty", "GB", "https://www.qbeeurope.com/"),
    ("Bangkok Insurance", "Property & casualty", "TH", "https://www.bangkokinsurance.com/"),
    ("Great Eastern Malaysia", "Life insurance", "MY", "https://www.greateasternlife.com/my/en/index.html"),
]


def existing_hosts() -> set[str]:
    hosts: set[str] = set()
    for path in EXISTING:
        data = json.loads(path.read_text())
        for entry in data.get("entries", []):
            hosts.add(host_only(entry["url"]))
    return hosts


def source_rows() -> list[tuple[str, str, str, str]]:
    rows: list[tuple[str, str, str, str]] = []
    for path in SOURCES:
        data = json.loads(path.read_text())
        for entry in data.get("entries", []):
            name = str(entry.get("name") or "").strip()
            url = str(entry.get("url") or "").strip()
            if not name or name.startswith("Q") and name[1:].isdigit():
                continue
            if not url.startswith("https://"):
                continue
            country = ins.country_iso(str(entry.get("country") or ""), url)
            rows.append((name, ins.infer_group(name, url), country, url))
    return rows


def add_entry(
    entries: list[dict],
    seen_ids: set[str],
    seen_hosts: set[str],
    skip: set[str],
    name: str,
    group: str,
    country: str,
    url: str,
) -> bool:
    host = host_only(url)
    ident = ins.slug(name)
    if not ident or not host or blocked(host):
        return False
    if host in seen_hosts or host in skip:
        return False
    if ident in seen_ids:
        ident = f"{ident}-{country.lower()}"
        if ident in seen_ids:
            ident = f"{ident}-{host.split('.')[0]}"
        if ident in seen_ids:
            return False
    seen_ids.add(ident)
    seen_hosts.add(host)
    entries.append(
        {
            "rank": len(entries) + 1,
            "id": ident,
            "name": name,
            "group": group,
            "country": country,
            "url": url,
        }
    )
    return True


def main() -> None:
    skip = existing_hosts()
    entries: list[dict] = []
    seen_ids: set[str] = set()
    seen_hosts: set[str] = set()

    for name, group, country, url in CURATED:
        add_entry(entries, seen_ids, seen_hosts, skip, name, group, country, url)

    leftover_home: list[tuple[str, str, str, str]] = []
    leftover_deep: list[tuple[str, str, str, str]] = []
    leftover_seen: set[str] = set()
    for name, group, country, url in source_rows():
        host = host_only(url)
        if host in leftover_seen:
            continue
        leftover_seen.add(host)
        if is_home(url):
            leftover_home.append((name, group, country, url))
        else:
            leftover_deep.append((name, group, country, url))

    buckets: dict[str, deque[tuple[str, str, str, str]]] = defaultdict(deque)
    for row in leftover_home:
        buckets[row[2] or "XX"].append(row)
    countries = deque(sorted(buckets, key=lambda c: (-len(buckets[c]), c)))
    while len(entries) < 500 and countries:
        country = countries.popleft()
        if not buckets[country]:
            continue
        name, group, cc, url = buckets[country].popleft()
        add_entry(entries, seen_ids, seen_hosts, skip, name, group, cc, url)
        if buckets[country]:
            countries.append(country)

    for name, group, country, url in leftover_deep:
        if len(entries) == 500:
            break
        add_entry(entries, seen_ids, seen_hosts, skip, name, group, country, url)

    if len(entries) != 500:
        raise SystemExit(f"expected 500 unique entries, got {len(entries)}")

    catalog = {
        "id": "insurance-plus-500",
        "title": "500 additional worldwide insurance homepages not in insurance-1000 or earlier catalogs",
        "source": "Second insurance capture wave (2026-08-18). Curated regional/specialty gaps first, then leftover Wikidata official websites round-robin by country. Hosts already in automotive-oem-50, cross-industry-100, engineering-manufacturing-1000, or insurance-1000 are excluded.",
        "sourceUrl": "https://query.wikidata.org/",
        "year": 2026,
        "updated": "2026-08-18",
        "entries": entries,
    }
    OUT.write_text(json.dumps(catalog, indent=2) + "\n")
    groups = sorted({e["group"] for e in entries})
    countries_n = sorted({e["country"] for e in entries})
    print(f"wrote {OUT} ({len(entries)} entries, {len(groups)} groups, {len(countries_n)} countries)")
    print("groups:", ", ".join(groups))


if __name__ == "__main__":
    main()
