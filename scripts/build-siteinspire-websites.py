#!/usr/bin/env python3
"""
Build a Capture catalog from siteInspire websites Source-JSON.

Input:
  knowledge/catalogs/sources/siteinspire-websites-2026.json

Output:
  knowledge/catalogs/siteinspire-1000.json
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "knowledge" / "catalogs" / "sources" / "siteinspire-websites-2026.json"
OUT = ROOT / "knowledge" / "catalogs" / "siteinspire-1000.json"

CATALOG_HOST_FILES = [
    ROOT / "knowledge" / "catalogs" / "automotive-oem-50.json",
    ROOT / "knowledge" / "catalogs" / "cross-industry-100.json",
    ROOT / "knowledge" / "catalogs" / "engineering-manufacturing-1000.json",
    ROOT / "knowledge" / "catalogs" / "insurance-1000.json",
    ROOT / "knowledge" / "catalogs" / "insurance-plus-500.json",
    ROOT / "knowledge" / "catalogs" / "design-diversity-1000.json",
    ROOT / "knowledge" / "catalogs" / "public-sector-1000.json",
    ROOT / "knowledge" / "catalogs" / "public-sector-plus-500.json",
    ROOT / "knowledge" / "catalogs" / "awwwards-500.json",
    ROOT / "knowledge" / "catalogs" / "awwwards-plus-1000.json",
    ROOT / "knowledge" / "catalogs" / "awwwards-plus-2000.json",
    ROOT / "knowledge" / "catalogs" / "awwwards-plus-3000.json",
    ROOT / "knowledge" / "catalogs" / "awwwards-plus-4000.json",
]

BLOCK_HOSTS = {
    "siteinspire.com",
    "www.siteinspire.com",
    "twitter.com",
    "x.com",
    "facebook.com",
    "linkedin.com",
    "instagram.com",
    "youtube.com",
    "pinterest.com",
}


def host_only(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower().removeprefix("www.")
    return host


def blocked(host: str) -> bool:
    host = host.lower()
    for bad in BLOCK_HOSTS:
        bad = bad.lower().removeprefix("www.")
        if host == bad or host.endswith("." + bad):
            return True
    return False


def load_prior_hosts() -> set[str]:
    known: set[str] = set()
    for path in CATALOG_HOST_FILES:
        if not path.exists():
            continue
        data = json.loads(path.read_text())
        for entry in data.get("entries", []):
            url = entry.get("url") or ""
            h = entry.get("host") or host_only(url)
            if h and not blocked(h):
                known.add(h)
    return known


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=int, default=1000)
    args = parser.parse_args()

    if not SOURCE.exists():
        raise SystemExit(f"missing SOURCE: {SOURCE}")

    src = json.loads(SOURCE.read_text())
    entries = src.get("entries") or []
    if not entries:
        raise SystemExit("SOURCE has no entries")

    prior_hosts = load_prior_hosts()
    seen: set[str] = set()
    out_entries: list[dict] = []

    for row in entries:
        url = row.get("url") or ""
        if not url.startswith("http"):
            continue
        host = row.get("host") or host_only(url)
        if not host or blocked(host):
            continue
        host = host.lower()
        if host in prior_hosts or host in seen:
            continue
        seen.add(host)
        out_entries.append(
            {
                "rank": len(out_entries),
                "id": f"siteinspire-{len(out_entries)+1}-{host}",
                "name": row.get("name") or host,
                "group": row.get("group") or "Featured",
                "country": row.get("country") or "XX",
                "url": url,
            }
        )
        if len(out_entries) >= args.target:
            break

    out = {
        "id": "siteinspire-1000",
        "title": f"SiteInspire curated websites (top volume; up to {args.target})",
        "source": "SiteInspire websites pages (external Visit-site URLs).",
        "year": 2026,
        "updated": time.strftime("%Y-%m-%d"),
        "entries": out_entries,
    }

    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {OUT} entries={len(out_entries)}")

    if len(out_entries) < args.target:
        raise SystemExit(f"need {args.target} entries, got {len(out_entries)}")


if __name__ == "__main__":
    main()

