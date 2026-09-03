#!/usr/bin/env python3
"""
Fetch CSS Design Awards (WOTD winners) -> external Visit-site URLs.

Listing:
  https://www.cssdesignawards.com/wotd-award-winners?page={page}
Detail:
  https://www.cssdesignawards.com/sites/<slug>/<id>/

Writes:
  knowledge/catalogs/sources/cssda-wotd-websites-2026.json
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
OUT = ROOT / "knowledge" / "catalogs" / "sources" / "cssda-wotd-websites-2026.json"

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

# CSSDA ist sensibel gegen User-Agents. Für Scrapes nehmen wir einen "Browser-like" UA.
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
BASE = "https://www.cssdesignawards.com"
LIST_PATH = "/wotd-award-winners?page={page}"
# Achtung: Raw-String -> \d muss einfach geschrieben werden (kein doppeltes Escaping).
DETAIL_RE = re.compile(r'href="(/sites/[^"]+?/\d+/?)"', re.I)

SLEEP_S = 0.35
RETRY_429_SLEEP_S = 2.5

BLOCK_HOSTS = {
    "cssdesignawards.com",
    "www.cssdesignawards.com",
    # socials
    "twitter.com",
    "x.com",
    "facebook.com",
    "linkedin.com",
    "instagram.com",
    "youtube.com",
    "pinterest.com",
    # siteInspire / known referral hosts seen in some pages
    "mobbin.com",
    "redcollar.co",
    "videinfra.com",
    "pulsenova.io",
}

SOCIAL_URL_FRAGMENTS = {
    "cssdesignawards.com",
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "twitter.com",
    "x.com",
    "youtube.com",
    "pinterest.com",
}


def host_only(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower().removeprefix("www.")
    return host


def blocked(host: str) -> bool:
    if not host:
        return True
    host = host.lower().removeprefix("www.")
    for bad in BLOCK_HOSTS:
        bad = bad.lower().removeprefix("www.")
        if host == bad or host.endswith("." + bad):
            return True
    return False


def fetch(url: str, *, max_attempts: int = 10) -> str:
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
            with urllib.request.urlopen(req, timeout=35) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            last_exc = exc
            if exc.code == 429:
                time.sleep(RETRY_429_SLEEP_S * (attempt + 1))
                continue
            # Some pages transiently return 403/5xx - backoff and retry.
            if exc.code in {403, 502, 503, 504} and attempt < max_attempts - 1:
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


def extract_detail_urls(html: str) -> list[str]:
    found = DETAIL_RE.findall(html)
    out: list[str] = []
    seen: set[str] = set()
    for path in found:
        path = path.rstrip("/")
        full = f"{BASE}{path}"
        if full in seen:
            continue
        seen.add(full)
        out.append(full)
    return out


def extract_name(html: str) -> str | None:
    # Try OG title first.
    m = re.search(r'property="og:title"[^>]+content="([^"]+)"', html, flags=re.I)
    if m:
        return html_lib.unescape(m.group(1)).strip()
    m2 = re.search(r"<h1[^>]*>([^<]+)</h1>", html, flags=re.I)
    if m2:
        return html_lib.unescape(m2.group(1)).strip()
    # Fallback: <title>...
    m3 = re.search(r"<title>([^<]+)</title>", html, flags=re.I)
    if m3:
        return html_lib.unescape(m3.group(1)).strip()
    return None


def choose_best_outbound(urls: list[str]) -> str | None:
    """
    CSSDA detail pages typically contain one outbound target site URL plus many
    social/profile links. We heuristically pick the "real site" host.
    """
    candidates: list[tuple[int, str]] = []
    for u in urls:
        if not u.startswith("http"):
            continue
        if "cssdesignawards.com" in u:
            continue
        host = host_only(u)
        if blocked(host):
            continue

        score = 0
        parsed = urllib.parse.urlparse(u)
        if not parsed.query:
            score += 4
        if parsed.path and parsed.path != "/":
            score += 2
        # punish tracking-ish query params
        if parsed.query and any(k in parsed.query.lower() for k in ["via=", "ref=", "utm_", "source="]):
            score -= 3
        # avoid obviously non-site hosts
        if host in {"mobbin.com", "redcollar.co", "videinfra.com", "pulsenova.io"}:
            score -= 6

        # slightly prefer www-less? (doesn't matter much, but improves stability)
        if parsed.hostname and not parsed.hostname.startswith("www."):
            score += 1

        candidates.append((score, u))

    if not candidates:
        return None
    # Highest score, tie-break on shortest URL.
    candidates.sort(key=lambda t: (t[0], -len(t[1])), reverse=True)
    return candidates[0][1]


def extract_external_urls(html: str) -> list[str]:
    hrefs = re.findall(r'href="(https?://[^\"]+)"', html, flags=re.I)
    # Also accept single quotes.
    hrefs += re.findall(r"href='(https?://[^']+)'", html, flags=re.I)
    # Dedup preserving order.
    out: list[str] = []
    seen: set[str] = set()
    for h in hrefs:
        if h in seen:
            continue
        seen.add(h)
        out.append(h)
    return out


def write_checkpoint(by_host: dict[str, dict], start_page: int, last_page: int) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    entries = list(by_host.values())
    OUT.write_text(
        json.dumps(
            {
                "id": "cssda-wotd-websites-2026",
                "updated": time.strftime("%Y-%m-%d"),
                "count": len(entries),
                "start_page": start_page,
                "last_page": last_page,
                "sourceUrl": "https://www.cssdesignawards.com/wotd-award-winners",
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
    parser.add_argument("--max-page", type=int, default=500)
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
    print(
        f"resume from page {args.start_page}, already_resolved={len(by_host)}, need={max(0,args.target-len(by_host))}"
    )

    # detail url queue to avoid huge memory
    detail_queue: list[str] = []
    seen_detail: set[str] = set()

    list_block_failures = 0
    for page in range(args.start_page, args.max_page + 1):
        if len(by_host) >= args.target:
            break
        list_url = f"{BASE}{LIST_PATH.format(page=page)}"
        try:
            html = fetch(list_url)
        except urllib.error.HTTPError as exc:
            if exc.code in {403, 429} and list_block_failures < 6:
                list_block_failures += 1
                sleep_s = 12 * list_block_failures
                print(
                    f"list block {list_url}: HTTP {exc.code} (retry {list_block_failures}/6) - backoff {sleep_s}s"
                )
                time.sleep(sleep_s)
                continue
            print(f"list stop {list_url}: HTTP {exc.code}")
            break
        except Exception as exc:
            print(f"list stop {list_url}: {exc}")
            break

        detail_urls = extract_detail_urls(html)
        for d in detail_urls:
            if d in seen_detail:
                continue
            seen_detail.add(d)
            detail_queue.append(d)

        last_page = page
        print(
            f"page {page}: {len(detail_urls)} detail links, hosts={len(by_host)}/{args.target}, queue={len(detail_queue)}"
        )
        time.sleep(args.sleep)

        while detail_queue and len(by_host) < args.target:
            detail_url = detail_queue.pop(0)
            try:
                detail_html = fetch(detail_url)
            except Exception as exc:
                print(f"  detail fail {detail_url}: {exc}")
                time.sleep(args.sleep)
                continue

            name = extract_name(detail_html) or "CSSDA Site"
            external_urls = extract_external_urls(detail_html)
            outbound = choose_best_outbound(external_urls)
            if not outbound:
                time.sleep(args.sleep)
                continue

            host = host_only(outbound)
            if blocked(host) or host in known:
                time.sleep(args.sleep)
                continue

            known.add(host)
            by_host[host] = {
                "name": name[:160],
                "group": "CSSDA WOTD",
                "country": "XX",
                "url": outbound,
                "cssda_path": detail_url.replace(BASE, ""),
                "cssda_url": detail_url,
                "host": host,
                "source_list": "wotd",
            }

            if len(by_host) % 25 == 0:
                print(f"  resolved {len(by_host)} new visit hosts (page {last_page})")
                write_checkpoint(by_host, args.start_page, last_page)

            time.sleep(args.sleep)

    write_checkpoint(by_host, args.start_page, last_page)
    print(f"wrote {OUT} count={len(by_host)} last_page={last_page}")
    if len(by_host) < args.target:
        raise SystemExit(
            f"need at least {args.target} new hosts for cssda-wotd-1000, got {len(by_host)}"
        )


if __name__ == "__main__":
    main()

