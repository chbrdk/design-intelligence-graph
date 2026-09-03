#!/usr/bin/env python3
"""
Fetch SiteInspire curated websites -> external Visit-site URLs.

Listing: https://www.siteinspire.com/websites/page/{page}
Detail:  https://www.siteinspire.com/website/{id}-{slug}

Writes:
  knowledge/catalogs/sources/siteinspire-websites-2026.json

Notes:
- SiteInspire rate-limits (HTTP 429) frequently; this script backs off on 429.
- We store one row per resolved external host.
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
OUT = ROOT / "knowledge" / "catalogs" / "sources" / "siteinspire-websites-2026.json"

# Exclude anything already captured by known catalogs.
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

USER_AGENT = "SPIRION-catalog-research/0.1 (+https://spirion.projects-a.plygrnd.tech)"
BASE = "https://www.siteinspire.com"
LIST_PATH = "/websites/page/"
DETAIL_RE = re.compile(r'href="(/website/\d+-[^"#?]+)"', re.I)

SLEEP_S = 0.55
# SiteInspire rate-limits aggressively; list pages can return 429 for many seconds.
RETRY_429_SLEEP_S = 6.0

# Hosts we never want to capture as "visit targets".
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
    try:
        parsed = urllib.parse.urlparse(url)
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


def fetch(url: str, *, max_attempts: int = 8) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.8",
        },
    )
    last_exc: Exception | None = None
    for attempt in range(max_attempts):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            last_exc = exc
            if exc.code == 429:
                time.sleep(RETRY_429_SLEEP_S * (attempt + 1))
                continue
            # Some pages return transient 5xx; retry a bit.
            if exc.code in {502, 503, 504} and attempt < max_attempts - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise
        except Exception as exc:
            last_exc = exc
            if attempt < max_attempts - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise
    raise last_exc or RuntimeError(f"fetch failed: {url}")


def extract_detail_links(html: str) -> list[str]:
    found = DETAIL_RE.findall(html)
    out: list[str] = []
    seen: set[str] = set()
    for path in found:
        path = path.rstrip("/")
        if not path or path in seen:
            continue
        seen.add(path)
        out.append(path)
    return out


def extract_visit_target(detail_html: str) -> tuple[str, str | None]:
    """
    Returns (external_url, best_name_guess).
    We look for anchors containing 'Visit' with external href.
    """
    # 1) Prefer anchors where text contains "Visit".
    for m in re.finditer(r'(<a[^>]+href="(https?://[^"]+)"[^>]*>.*?</a>)', detail_html, flags=re.I | re.S):
        block = m.group(1)
        href = m.group(2)
        if "siteinspire.com" in href:
            continue
        if "visit" in block.lower():
            host = host_only(href)
            if blocked(host):
                continue
            # name hint: sometimes within the same block.
            name = None
            # Best-effort: decode tag text.
            text = re.sub(r"<[^>]+>", " ", block)
            text = html_lib.unescape(re.sub(r"\s+", " ", text)).strip()
            if len(text) > 2:
                name = text[:120]
            return href, name

    # 2) Fallback: any external https href with non-blocked host.
    hrefs = re.findall(r'href="(https?://[^\"]+)"', detail_html, flags=re.I)
    for href in hrefs:
        if "siteinspire.com" in href:
            continue
        host = host_only(href)
        if blocked(host):
            continue
        return href, None

    return "", None


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


def write_checkpoint(by_host: dict[str, dict], start_page: int, last_page: int) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    entries = list(by_host.values())
    OUT.write_text(
        json.dumps(
            {
                "id": "siteinspire-websites-2026",
                "updated": time.strftime("%Y-%m-%d"),
                "count": len(entries),
                "start_page": start_page,
                "last_page": last_page,
                "sourceUrl": "https://www.siteinspire.com/websites/",
                "entries": entries,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-page", type=int, default=1)
    parser.add_argument("--target", type=int, default=1000)
    parser.add_argument("--max-page", type=int, default=300)
    parser.add_argument("--sleep", type=float, default=SLEEP_S)
    args = parser.parse_args()

    known = load_known_hosts()
    by_host: dict[str, dict] = {}
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

    last_page = args.start_page - 1
    needed = max(0, args.target - len(by_host))
    print(
        f"resume from page {args.start_page}, already_resolved={len(by_host)}, need={needed}"
    )

    # page -> detail paths
    detail_queue: list[str] = []
    seen_detail: set[str] = set()

    list_429_failures = 0
    for page in range(args.start_page, args.max_page + 1):
        if len(by_host) >= args.target:
            break
        if len(detail_queue) > 200:
            # keep memory bounded
            while detail_queue and len(by_host) < args.target and len(detail_queue) > 80:
                detail_queue.pop(0)

        list_url = f"{BASE}{LIST_PATH}{page}"
        try:
            html = fetch(list_url)
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and list_429_failures < 6:
                list_429_failures += 1
                print(
                    f"list 429 {list_url} (retry {list_429_failures}/6) - backoff {RETRY_429_SLEEP_S * 2}s"
                )
                time.sleep(RETRY_429_SLEEP_S * 2)
                # Retry same page
                continue
            print(f"list stop {list_url}: HTTP {exc.code}")
            break
        except Exception as exc:
            print(f"list stop {list_url}: {exc}")
            break

        detail_paths = extract_detail_links(html)
        new_paths = 0
        for path in detail_paths:
            if path in seen_detail:
                continue
            seen_detail.add(path)
            detail_queue.append(path)
            new_paths += 1

        last_page = page
        print(
            f"page {page}: {len(detail_paths)} detail links, +{new_paths} new, "
            f"hosts={len(by_host)}/{args.target}, queue={len(detail_queue)}"
        )
        time.sleep(args.sleep)

        # Resolve some queue for this page to keep progress steady.
        while detail_queue and len(by_host) < args.target:
            detail_path = detail_queue.pop(0)
            detail_url = f"{BASE}{detail_path}"
            try:
                detail_html = fetch(detail_url)
            except Exception as exc:
                print(f"  detail fail {detail_path}: {exc}")
                time.sleep(args.sleep)
                continue

            visit_url, name_hint = extract_visit_target(detail_html)
            if not visit_url:
                time.sleep(args.sleep)
                continue

            host = host_only(visit_url)
            if blocked(host) or host in known:
                time.sleep(args.sleep)
                continue

            known.add(host)
            by_host[host] = {
                "name": name_hint or host,
                "group": "Featured",
                "country": "XX",
                "url": visit_url,
                "siteinspire_path": detail_path,
                "siteinspire_url": detail_url,
                "host": host,
                "source_list": "websites"
            }

            if len(by_host) % 25 == 0:
                print(f"  resolved {len(by_host)} new visit hosts (page {last_page})")
                write_checkpoint(by_host, args.start_page, last_page)

            time.sleep(args.sleep)

    write_checkpoint(by_host, args.start_page, last_page)
    print(f"wrote {OUT} count={len(by_host)} last_page={last_page}")
    if len(by_host) < args.target:
        raise SystemExit(
            f"need at least {args.target} new hosts for siteinspire-1000, got {len(by_host)}"
        )


if __name__ == "__main__":
    main()

