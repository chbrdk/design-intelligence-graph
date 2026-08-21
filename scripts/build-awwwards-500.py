#!/usr/bin/env python3
"""Build knowledge/catalogs/awwwards-500.json from Awwwards Visit-site URLs."""
from __future__ import annotations

import html as html_lib
import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "knowledge" / "catalogs" / "awwwards-500.json"
SOURCE = ROOT / "knowledge" / "catalogs" / "sources" / "awwwards-websites-2026.json"
EXISTING = [
    ROOT / "knowledge" / "catalogs" / "automotive-oem-50.json",
    ROOT / "knowledge" / "catalogs" / "cross-industry-100.json",
    ROOT / "knowledge" / "catalogs" / "engineering-manufacturing-1000.json",
    ROOT / "knowledge" / "catalogs" / "insurance-1000.json",
    ROOT / "knowledge" / "catalogs" / "insurance-plus-500.json",
    ROOT / "knowledge" / "catalogs" / "design-diversity-1000.json",
    ROOT / "knowledge" / "catalogs" / "public-sector-1000.json",
    ROOT / "knowledge" / "catalogs" / "public-sector-plus-500.json",
]

BLOCK_HOSTS = {
    "awwwards.com",
    "facebook.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "linkedin.com",
    "youtube.com",
    "tiktok.com",
    "pinterest.com",
    "behance.net",
    "dribbble.com",
}

SOURCE_GROUP = {
    "sites_of_the_day": "Site of the Day",
    "nominees": "Nominee",
    "honorable_mentions": "Honorable Mention",
    "websites": "Featured",
}


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


def slug(name: str) -> str:
    out: list[str] = []
    for ch in name.lower():
        if ch.isalnum():
            out.append(ch)
        elif ch in " &._/'":
            if out and out[-1] != "-":
                out.append("-")
    return "".join(out).strip("-")


def load_known_hosts() -> set[str]:
    known: set[str] = set()
    for path in EXISTING:
        if not path.exists():
            continue
        data = json.loads(path.read_text())
        for entry in data.get("entries", []):
            h = host_only(entry["url"])
            if h:
                known.add(h)
    return known


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"missing source {SOURCE}; run scripts/fetch-awwwards-websites.py first")
    known = load_known_hosts()
    raw = json.loads(SOURCE.read_text())
    picked: list[dict] = []
    seen: set[str] = set(known)

    rows = list(raw.get("entries", []))
    rows.sort(key=lambda r: (r.get("source_list") or "zzz", r.get("name") or ""))

    for row in rows:
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
        parsed = urlparse(url)
        if parsed.path not in {"", "/"} and parsed.path.count("/") > 2:
            shallow = f"https://{parsed.netloc}/"
            h2 = host_only(shallow)
            if h2 and h2 not in seen and not blocked(h2):
                url = shallow
                h = h2
        seen.add(h)
        name = html_lib.unescape((row.get("name") or h).strip())
        source_list = row.get("source_list") or "websites"
        picked.append(
            {
                "name": name,
                "group": SOURCE_GROUP.get(source_list, "Featured"),
                "country": (row.get("country") or "XX")[:8],
                "url": url,
            }
        )
        if len(picked) >= 500:
            break

    if len(picked) < 500:
        raise SystemExit(f"Only {len(picked)} unique new hosts; need 500 (source has {raw.get('count')})")

    entries = []
    seen_ids: set[str] = set()
    for rank, row in enumerate(picked, start=1):
        base = slug(row["name"])[:48] or "site"
        host = host_only(row["url"]).replace(".", "-")[:24]
        candidate = f"{base}-{host}"[:64]
        ident = candidate
        n = 2
        while ident in seen_ids:
            ident = f"{candidate}-{n}"[:64]
            n += 1
        seen_ids.add(ident)
        entries.append(
            {
                "rank": rank,
                "id": ident,
                "name": row["name"],
                "group": row["group"],
                "country": row["country"],
                "url": row["url"],
            }
        )

    catalog = {
        "id": "awwwards-500",
        "title": "500 Awwwards-featured website homepages (Visit site targets)",
        "source": "Resolved Visit-site links from awwwards.com/websites listings. Not an official Awwwards API — HTML scrape of public listing/detail pages. Hosts already in prior DIG catalogs are excluded.",
        "sourceUrl": "https://www.awwwards.com/websites/",
        "year": 2026,
        "updated": "2026-08-21",
        "entries": entries,
    }
    OUT.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {OUT} entries={len(entries)} hosts={len({host_only(e['url']) for e in entries})}")
    print(
        "groups",
        {g: sum(1 for e in entries if e["group"] == g) for g in sorted({e["group"] for e in entries})},
    )


if __name__ == "__main__":
    main()
