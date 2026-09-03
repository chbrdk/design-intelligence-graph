#!/usr/bin/env python3
"""Fifth Awwwards wave: /websites/ page 341+ / category pages → Visit-site URLs.

Writes knowledge/catalogs/sources/awwwards-websites-plus-4-2026.json
Run after awwwards-plus-3000 (last_page ~340 + categories).
"""
from __future__ import annotations

import argparse
import html as html_lib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "knowledge" / "catalogs" / "sources" / "awwwards-websites-plus-4-2026.json"
PRIOR_SOURCES = [
    ROOT / "knowledge" / "catalogs" / "sources" / "awwwards-websites-2026.json",
    ROOT / "knowledge" / "catalogs" / "sources" / "awwwards-websites-plus-2026.json",
    ROOT / "knowledge" / "catalogs" / "sources" / "awwwards-websites-plus-2-2026.json",
    ROOT / "knowledge" / "catalogs" / "sources" / "awwwards-websites-plus-3-2026.json",
]
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
]

USER_AGENT = "SPIRION-catalog-research/0.1 (+https://spirion.projects-a.plygrnd.tech; design inspiration catalog)"
BASE = "https://www.awwwards.com"
LIST_PATH = "/websites/"
EXTRA_LIST_PATHS = [
    "/websites/sites_of_the_day/",
    "/websites/nominees/",
    "/websites/developer/",
    "/websites/sites_of_the_month/",
    "/websites/sites_of_the_year/",
]
EXTRA_MAX_PAGES = 100
EXTRA_START_PAGE = 25
DEFAULT_START_PAGE = 341
DEFAULT_TARGET = 1150
DEFAULT_MAX_PAGE = 700
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
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            last_exc = exc
            if exc.code in {502, 503, 504} and attempt < 2:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise
        except Exception as exc:
            last_exc = exc
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise
    raise last_exc or RuntimeError(f"fetch failed: {url}")


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
    if not m:
        return None
    visit = html_lib.unescape(m.group(1).strip())
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

    return {
        "name": title,
        "group": "Featured",
        "country": "XX",
        "url": visit if visit.startswith("http") else f"https://{visit}",
        "awwwards_path": slug_path,
        "awwwards_url": f"{BASE}{slug_path}",
        "host": host,
        "source_list": "websites",
    }


def load_known_hosts() -> set[str]:
    known: set[str] = set()
    for path in PRIOR_SOURCES + CATALOG_HOST_FILES:
        if not path.exists():
            continue
        data = json.loads(path.read_text())
        for entry in data.get("entries", []):
            url = entry.get("url") or ""
            h = entry.get("host") or host_only(url)
            if h:
                known.add(h)
            elif url:
                known.add(host_only(url))
    return known


def write_checkpoint(by_host: dict[str, dict], start_page: int, last_page: int) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    entries = list(by_host.values())
    OUT.write_text(
        json.dumps(
            {
                "id": "awwwards-websites-plus-4-2026",
                "updated": time.strftime("%Y-%m-%d"),
                "count": len(entries),
                "start_page": start_page,
                "last_page": last_page,
                "sourceUrl": "https://www.awwwards.com/websites/",
                "entries": entries,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-page", type=int, default=DEFAULT_START_PAGE)
    parser.add_argument("--target", type=int, default=DEFAULT_TARGET)
    parser.add_argument("--max-page", type=int, default=DEFAULT_MAX_PAGE)
    parser.add_argument("--sleep", type=float, default=SLEEP_S)
    args = parser.parse_args()

    known = load_known_hosts()
    by_host: dict[str, dict] = {}
    seen_slugs: set[str] = set()
    if OUT.exists():
        prior = json.loads(OUT.read_text())
        resume_page = int(prior.get("last_page") or 0) + 1
        if resume_page > args.start_page:
            args.start_page = resume_page
            print(f"checkpoint resume from page {args.start_page}")
        for row in prior.get("entries", []):
            h = row.get("host") or host_only(row.get("url") or "")
            if h:
                by_host[h] = row
                known.add(h)
            path = row.get("awwwards_path")
            if path:
                seen_slugs.add(path)

    slug_queue: list[str] = []
    empty_streak = 0
    last_page = args.start_page - 1
    needed = max(0, args.target - len(by_host))

    print(
        f"resume from page {args.start_page}, known_hosts={len(known)}, "
        f"already_wave={len(by_host)}, need={needed}"
    )

    queue_goal = needed * 2 if needed else 0

    def resolve_queue() -> None:
        nonlocal by_host, known
        while slug_queue and len(by_host) < args.target:
            slug = slug_queue.pop(0)
            detail_url = f"{BASE}{slug}"
            try:
                row = parse_detail(fetch(detail_url), slug)
            except Exception as exc:
                print(f"  detail fail {slug}: {exc}")
                row = None
            time.sleep(args.sleep)
            if not row:
                continue
            host = row["host"]
            if host in known:
                continue
            known.add(host)
            by_host[host] = row
            if len(by_host) % 25 == 0:
                print(f"  resolved {len(by_host)} new visit hosts")
                write_checkpoint(by_host, args.start_page, last_page)

    for page in range(args.start_page, args.max_page + 1):
        if needed <= 0:
            break
        if len(slug_queue) >= queue_goal:
            break
        url = f"{BASE}{LIST_PATH}?page={page}"
        try:
            html = fetch(url)
        except urllib.error.HTTPError as exc:
            print(f"list stop {url}: HTTP {exc.code}")
            break
        except Exception as exc:
            print(f"list stop {url}: {exc}")
            break

        slugs = list_slugs(html)
        new_slugs = 0
        for slug in slugs:
            if slug in seen_slugs:
                continue
            seen_slugs.add(slug)
            slug_queue.append(slug)
            new_slugs += 1
        last_page = page
        print(
            f"page {page}: {len(slugs)} slugs, +{new_slugs} new, "
            f"hosts={len(by_host)}/{args.target}, queue={len(slug_queue)}"
        )
        time.sleep(args.sleep)

        if new_slugs == 0:
            empty_streak += 1
            if empty_streak >= 3:
                print("three empty listing pages — stopping pagination")
                break
        else:
            empty_streak = 0

    resolve_queue()

    empty_streak = 0
    while len(by_host) < args.target and last_page < args.max_page:
        last_page += 1
        url = f"{BASE}{LIST_PATH}?page={last_page}"
        try:
            html = fetch(url)
        except Exception as exc:
            print(f"list stop {url}: {exc}")
            break
        slugs = list_slugs(html)
        new_slugs = 0
        for slug in slugs:
            if slug in seen_slugs:
                continue
            seen_slugs.add(slug)
            slug_queue.append(slug)
            new_slugs += 1
        print(f"extra page {last_page}: +{new_slugs} slugs, queue={len(slug_queue)}")
        time.sleep(args.sleep)
        if new_slugs == 0:
            empty_streak += 1
            if empty_streak >= 3:
                print("three empty extra listing pages — stopping pagination")
                break
            continue
        empty_streak = 0
        resolve_queue()

    if len(by_host) < args.target:
        print(f"main /websites/ exhausted at {len(by_host)} hosts — trying category listings")
        for list_path in EXTRA_LIST_PATHS:
            if len(by_host) >= args.target:
                break
            empty_streak = 0
            for page in range(EXTRA_START_PAGE, EXTRA_MAX_PAGES + 1):
                if len(by_host) >= args.target:
                    break
                url = f"{BASE}{list_path}?page={page}" if page > 1 else f"{BASE}{list_path}"
                try:
                    html = fetch(url)
                except urllib.error.HTTPError as exc:
                    print(f"category stop {url}: HTTP {exc.code}")
                    break
                except Exception as exc:
                    print(f"category stop {url}: {exc}")
                    break
                slugs = list_slugs(html)
                if not slugs:
                    empty_streak += 1
                    if empty_streak >= 2:
                        break
                    continue
                empty_streak = 0
                new_slugs = 0
                for slug in slugs:
                    if slug in seen_slugs:
                        continue
                    seen_slugs.add(slug)
                    slug_queue.append(slug)
                    new_slugs += 1
                print(
                    f"{list_path} page {page}: +{new_slugs} slugs, "
                    f"hosts={len(by_host)}/{args.target}, queue={len(slug_queue)}"
                )
                time.sleep(args.sleep)
                resolve_queue()

    write_checkpoint(by_host, args.start_page, last_page)
    print(f"wrote {OUT} count={len(by_host)} last_page={last_page}")
    if len(by_host) < 1000:
        raise SystemExit(f"need at least 1000 new hosts for plus-4000 catalog, got {len(by_host)}")


if __name__ == "__main__":
    main()
