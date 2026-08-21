#!/usr/bin/env python3
"""Fetch Awwwards website listings and resolve Visit-site URLs.

Writes knowledge/catalogs/sources/awwwards-websites-2026.json
Polite rate limiting; not an official API — HTML may change.
"""
from __future__ import annotations

import html as html_lib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "knowledge" / "catalogs" / "sources" / "awwwards-websites-2026.json"

USER_AGENT = "SPIRION-catalog-research/0.1 (+https://spirion.projects-a.plygrnd.tech; design inspiration catalog)"
BASE = "https://www.awwwards.com"
LIST_PATHS = [
    "/websites/",
    "/websites/sites_of_the_day/",
    "/websites/nominees/",
    "/websites/honorable_mentions/",
]
MAX_PAGES_PER_LIST = 30
TARGET_ENTRIES = 650
SLEEP_S = 0.45

BLOCK_HOSTS = {
    "awwwards.com",
    "www.awwwards.com",
    "assets.awwwards.com",
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "youtube.com",
    "linkedin.com",
    "tiktok.com",
    "pinterest.com",
}


def fetch(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def host_only(url: str) -> str:
    try:
        parsed = urllib.parse.urlparse(url if "://" in url else f"https://{url}")
        return (parsed.hostname or "").lower().removeprefix("www.")
    except Exception:
        return ""


def blocked(host: str) -> bool:
    if not host:
        return True
    for bad in BLOCK_HOSTS:
        bad = bad.removeprefix("www.")
        if host == bad or host.endswith("." + bad):
            return True
    return False


def list_slugs(html: str) -> list[str]:
    found = re.findall(r'href="(/sites/[^"#?]+)"', html)
    out: list[str] = []
    seen: set[str] = set()
    for path in found:
        path = path.rstrip("/")
        if path.count("/") != 2:
            continue
        if path in seen:
            continue
        seen.add(path)
        out.append(path)
    return out


def strip_tags(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", value)).strip()


def parse_detail(html: str, slug_path: str) -> dict | None:
    visit = None
    m = re.search(
        r'href="(https?://[^"]+)"[^>]*data-controller="visit-count"',
        html,
        re.I,
    )
    if not m:
        m = re.search(
            r'data-controller="visit-count"[^>]*href="(https?://[^"]+)"',
            html,
            re.I,
        )
    if m:
        visit = html_lib.unescape(m.group(1).strip())
    if not visit:
        return None
    host = host_only(visit)
    if blocked(host):
        return None

    title = None
    m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.I | re.S)
    if m:
        title = strip_tags(m.group(1))
    if not title:
        m = re.search(r'property="og:title" content="([^"]+)"', html, re.I)
        if m:
            title = html_lib.unescape(m.group(1)).split(" - Awwwards")[0].strip()
    if not title:
        title = slug_path.rsplit("/", 1)[-1].replace("-", " ")

    group = "Awwwards"
    lower = html.lower()
    if "site of the day" in lower or "sotd" in lower:
        group = "Site of the Day"
    elif "site of the month" in lower or "sotm" in lower:
        group = "Site of the Month"
    elif "honorable mention" in lower:
        group = "Honorable Mention"
    elif "developer award" in lower:
        group = "Developer Award"
    elif "nominee" in lower:
        group = "Nominee"

    country = "XX"
    m = re.search(r'class="[^"]*country[^"]*"[^>]*>\s*([^<]+)', html, re.I)
    if m:
        label = strip_tags(m.group(1))
        if label:
            country = label[:2].upper() if len(label) > 3 else label.upper()

    return {
        "name": title,
        "group": group,
        "country": country,
        "url": visit if visit.startswith("http") else f"https://{visit}",
        "awwwards_path": slug_path,
        "awwwards_url": f"{BASE}{slug_path}",
        "host": host,
    }


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    by_host: dict[str, dict] = {}
    slug_queue: list[tuple[str, str]] = []
    seen_slugs: set[str] = set()

    for list_path in LIST_PATHS:
        for page in range(1, MAX_PAGES_PER_LIST + 1):
            if len(by_host) >= TARGET_ENTRIES and not slug_queue:
                break
            if page == 1:
                url = f"{BASE}{list_path}"
            else:
                sep = "&" if "?" in list_path else "?"
                url = f"{BASE}{list_path}{sep}page={page}"
            try:
                html = fetch(url)
            except urllib.error.HTTPError as exc:
                print(f"list fail {url}: {exc.code}")
                break
            except Exception as exc:
                print(f"list fail {url}: {exc}")
                break
            slugs = list_slugs(html)
            print(f"list {url} -> {len(slugs)} slugs (have {len(by_host)} hosts, queue {len(slug_queue)})")
            if not slugs:
                break
            new = 0
            for slug in slugs:
                if slug in seen_slugs:
                    continue
                seen_slugs.add(slug)
                slug_queue.append((list_path.strip("/").split("/")[-1] or "websites", slug))
                new += 1
            time.sleep(SLEEP_S)
            if new == 0 and page > 2:
                break
            # Drain some of the queue as we go so memory stays bounded.
            while slug_queue and len(by_host) < TARGET_ENTRIES:
                source_list, slug = slug_queue.pop(0)
                detail_url = f"{BASE}{slug}"
                try:
                    detail_html = fetch(detail_url)
                    row = parse_detail(detail_html, slug)
                except Exception as exc:
                    print(f"detail fail {detail_url}: {exc}")
                    row = None
                time.sleep(SLEEP_S)
                if not row:
                    continue
                host = row["host"]
                if host in by_host:
                    continue
                row["source_list"] = source_list
                by_host[host] = row
                if len(by_host) % 25 == 0:
                    print(f"  resolved {len(by_host)} unique visit hosts")
                    OUT.write_text(
                        json.dumps(
                            {
                                "id": "awwwards-websites-2026",
                                "updated": time.strftime("%Y-%m-%d"),
                                "count": len(by_host),
                                "entries": list(by_host.values()),
                            },
                            indent=2,
                            ensure_ascii=False,
                        )
                        + "\n"
                    )
                if len(by_host) >= TARGET_ENTRIES:
                    break

    # Finish remaining queue if still short.
    while slug_queue and len(by_host) < TARGET_ENTRIES:
        source_list, slug = slug_queue.pop(0)
        detail_url = f"{BASE}{slug}"
        try:
            detail_html = fetch(detail_url)
            row = parse_detail(detail_html, slug)
        except Exception as exc:
            print(f"detail fail {detail_url}: {exc}")
            row = None
        time.sleep(SLEEP_S)
        if not row:
            continue
        host = row["host"]
        if host in by_host:
            continue
        row["source_list"] = source_list
        by_host[host] = row
        if len(by_host) % 25 == 0:
            print(f"  resolved {len(by_host)} unique visit hosts")

    entries = list(by_host.values())
    payload = {
        "id": "awwwards-websites-2026",
        "updated": time.strftime("%Y-%m-%d"),
        "count": len(entries),
        "sourceUrl": "https://www.awwwards.com/websites/",
        "entries": entries,
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {OUT} count={len(entries)}")
    if len(entries) < 500:
        raise SystemExit(f"need at least 500 visit URLs, got {len(entries)}")


if __name__ == "__main__":
    main()
