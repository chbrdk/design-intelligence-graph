#!/usr/bin/env python3
"""
Build a Capture catalog from CSSDA WOTD Source-JSON.

Input:
  knowledge/catalogs/sources/cssda-wotd-websites-2026.json

Output:
  knowledge/catalogs/cssda-wotd-1000.json
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "knowledge" / "catalogs" / "sources" / "cssda-wotd-websites-2026.json"
OUT = ROOT / "knowledge" / "catalogs" / "cssda-wotd-1000.json"

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
    ROOT / "knowledge" / "catalogs" / "thefwa-1000.json",
]

BLOCK_HOSTS = {
    "cssdesignawards.com",
    "www.cssdesignawards.com",
    "twitter.com",
    "x.com",
    "facebook.com",
    "linkedin.com",
    "instagram.com",
    "youtube.com",
    "pinterest.com",
    "mobbin.com",
    "redcollar.co",
    "videinfra.com",
    "pulsenova.io",
}


def host_only(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    return (parsed.hostname or "").lower().removeprefix("www.")


def canonicalize_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url.strip())
    if parsed.scheme not in {"http", "https"}:
        return url.strip()
    host = (parsed.hostname or "").lower().strip().removeprefix("www.")
    if not host:
        return url.strip()
    path = parsed.path or "/"
    query = f"?{parsed.query}" if parsed.query else ""
    return f"https://{host}{path}{query}"


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
            h = (entry.get("host") or host_only(url) or "").strip().lower().removeprefix("www.")
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
        url = canonicalize_url(url)
        host = host_only(url)
        if not host or blocked(host):
            continue
        host = host.lower().strip()
        if host in prior_hosts or host in seen:
            continue
        seen.add(host)

        out_entries.append(
            {
                "rank": len(out_entries),
                "id": f"cssda-wotd-{len(out_entries)+1}-{host}",
                "name": row.get("name") or host,
                "group": row.get("group") or "CSSDA WOTD",
                "country": row.get("country") or "XX",
                "url": url,
            }
        )
        if len(out_entries) >= args.target:
            break

    out = {
        "id": "cssda-wotd-1000",
        "title": f"CSS Design Awards WOTD curated sites (quality slice; up to {args.target})",
        "source": "CSS Design Awards WOTD winners pages (external outbound target URLs).",
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

