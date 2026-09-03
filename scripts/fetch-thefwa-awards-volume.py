#!/usr/bin/env python3
"""
Fetch The FWA "Awards" timeline -> external Visit-site URLs (Volume).

Data source:
  https://thefwa.com/api/timeline/?limit=20&offset=0

The returned items include a nested structure where item.item.url is the
outbound target site URL.

Writes:
  knowledge/catalogs/sources/thefwa-awards-volume-2026.json
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "knowledge" / "catalogs" / "sources" / "thefwa-awards-volume-2026.json"

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

# URL endpoints are public; we still throttle a bit.
SLEEP_S = 0.15

# Exclude obvious non-target hosts.
BLOCK_HOSTS = {
    "thefwa.com",
    "www.thefwa.com",
    "twitter.com",
    "x.com",
    "facebook.com",
    "linkedin.com",
    "instagram.com",
    "youtube.com",
    "vimeo.com",
    "pinterest.com",
}

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
    # cssda smoke build might exist; include it if present so we don't add duplicates
    ROOT / "knowledge" / "catalogs" / "cssda-wotd-1000.json",
    ROOT / "knowledge" / "catalogs" / "siteinspire-1000.json",
]


def host_only(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    return (parsed.hostname or "").lower().removeprefix("www.")


def blocked(host: str) -> bool:
    if not host:
        return True
    host = host.lower().removeprefix("www.")
    for bad in BLOCK_HOSTS:
        bad = bad.lower().removeprefix("www.")
        if host == bad or host.endswith("." + bad):
            return True
    return False


def load_known_hosts() -> set[str]:
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


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=40) as resp:
        data = resp.read().decode("utf-8", errors="replace")
    return json.loads(data)


def write_checkpoint(by_host: dict[str, dict], last_offset: int) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "id": "thefwa-awards-volume-2026",
                "updated": time.strftime("%Y-%m-%d"),
                "count": len(by_host),
                "last_offset": last_offset,
                "sourceUrl": "https://thefwa.com/api/timeline/",
                "entries": list(by_host.values()),
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n"
    )


def extract_case_info(timeline_item: dict) -> tuple[str, str | None]:
    """
    timeline_item keys: type, awardId, title, uid, item (nested)
    In practice, item.item.url is the outbound URL.
    """
    item = timeline_item.get("item") or {}
    url = item.get("url") or ""
    meta = item.get("meta") or {}
    name = meta.get("title") if isinstance(meta, dict) else None
    return url, name


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=int, default=1000)
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--max-offset", type=int, default=20000)
    parser.add_argument("--sleep", type=float, default=SLEEP_S)
    args = parser.parse_args()

    known = load_known_hosts()
    by_host: dict[str, dict] = {}
    last_offset = -args.limit

    if OUT.exists():
        prior = json.loads(OUT.read_text())
        last_offset = int(prior.get("last_offset") or -args.limit)
        for row in prior.get("entries", []):
            h = row.get("host") or host_only(row.get("url") or "")
            if h:
                by_host[h] = row
                known.add(h)

    offset = last_offset + args.limit
    print(f"resume offset={offset} resolved={len(by_host)}/{args.target}")

    list_block_failures = 0
    for off in range(offset, args.max_offset + 1, args.limit):
        if len(by_host) >= args.target:
            break

        url = f"https://thefwa.com/api/timeline/?limit={args.limit}&offset={off}"
        try:
            payload = fetch_json(url)
            list_block_failures = 0
        except urllib.error.HTTPError as exc:
            if exc.code in {429, 403} and list_block_failures < 6:
                list_block_failures += 1
                sleep_s = args.sleep * (list_block_failures + 1) * 10
                print(f"timeline block HTTP {exc.code} (retry {list_block_failures}/6) sleep={sleep_s:.1f}s")
                time.sleep(sleep_s)
                continue
            raise

        items = payload.get("items") or []
        if not items:
            print("timeline empty; stop")
            break

        for t in items:
            if len(by_host) >= args.target:
                break
            outbound_url, name = extract_case_info(t)
            if not outbound_url or not outbound_url.startswith("http"):
                continue
            host = host_only(outbound_url)
            if blocked(host) or host in known:
                continue
            known.add(host)
            by_host[host] = {
                "name": name or host,
                "group": "The FWA",
                "country": "XX",
                "url": outbound_url,
                "host": host,
                "timeline": {
                    "type": t.get("type"),
                    "awardId": t.get("awardId"),
                    "uid": t.get("uid"),
                    "title": t.get("title"),
                    "sortDate": t.get("sortDate"),
                },
            }

            if len(by_host) % 25 == 0:
                print(f"  resolved {len(by_host)} new hosts (offset {off})")
                write_checkpoint(by_host, off)

        time.sleep(args.sleep)

        # periodic checkpoint even without reaching 25 boundary
        if off % (args.limit * 10) == 0 and len(by_host):
            write_checkpoint(by_host, off)

        last_offset = off

    write_checkpoint(by_host, last_offset)
    print(f"wrote {OUT} count={len(by_host)} last_offset={last_offset}")
    if len(by_host) < args.target:
        raise SystemExit(f"need {args.target} new hosts for thefwa-1000, got {len(by_host)}")


if __name__ == "__main__":
    main()

