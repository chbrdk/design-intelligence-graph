#!/usr/bin/env python3
"""Build knowledge/catalogs/design-diversity-1000.json from Wikidata + curated gaps."""
from __future__ import annotations

import json
import re
from collections import defaultdict, deque
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "knowledge" / "catalogs" / "design-diversity-1000.json"
SOURCE = ROOT / "knowledge" / "catalogs" / "sources" / "design-diversity-wikidata-2026.json"
EXISTING = [
    ROOT / "knowledge" / "catalogs" / "automotive-oem-50.json",
    ROOT / "knowledge" / "catalogs" / "cross-industry-100.json",
    ROOT / "knowledge" / "catalogs" / "engineering-manufacturing-1000.json",
    ROOT / "knowledge" / "catalogs" / "insurance-1000.json",
    ROOT / "knowledge" / "catalogs" / "insurance-plus-500.json",
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
}

GROUP_LABEL = {
    "banking": "Banking",
    "airline": "Airlines",
    "hotel": "Hotels",
    "fashion": "Fashion",
    "retail": "Retail",
    "software": "Software / SaaS",
    "telecom": "Telecom",
    "restaurant": "QSR / food",
    "media": "Media",
    "automobile_brand": "Auto brand",
    "curated": "Curated brand",
}

# Fill restaurant=0 Wikidata gap + high-signal design brands missing from prior catalogs.
CURATED: list[tuple[str, str, str, str]] = [
    ("Chipotle", "QSR / food", "US", "https://www.chipotle.com/"),
    ("Sweetgreen", "QSR / food", "US", "https://www.sweetgreen.com/"),
    ("Shake Shack", "QSR / food", "US", "https://www.shakeshack.com/"),
    ("Pret A Manger", "QSR / food", "GB", "https://www.pret.com/"),
    ("Nando's", "QSR / food", "GB", "https://www.nandos.com/"),
    ("Five Guys", "QSR / food", "US", "https://www.fiveguys.com/"),
    ("Cava", "QSR / food", "US", "https://cava.com/"),
    ("Wingstop", "QSR / food", "US", "https://www.wingstop.com/"),
    ("Domino's", "QSR / food", "US", "https://www.dominos.com/"),
    ("Pizza Hut", "QSR / food", "US", "https://www.pizzahut.com/"),
    ("KFC", "QSR / food", "US", "https://www.kfc.com/"),
    ("Burger King", "QSR / food", "US", "https://www.bk.com/"),
    ("Subway", "QSR / food", "US", "https://www.subway.com/"),
    ("Tim Hortons", "QSR / food", "CA", "https://www.timhortons.com/"),
    ("Dunkin'", "QSR / food", "US", "https://www.dunkindonuts.com/"),
    ("Panera Bread", "QSR / food", "US", "https://www.panerabread.com/"),
    ("Canva", "Software / SaaS", "AU", "https://www.canva.com/"),
    ("Figma", "Software / SaaS", "US", "https://www.figma.com/"),
    ("Notion", "Software / SaaS", "US", "https://www.notion.com/"),
    ("Linear", "Software / SaaS", "US", "https://linear.app/"),
    ("Vercel", "Software / SaaS", "US", "https://vercel.com/"),
    ("Webflow", "Software / SaaS", "US", "https://webflow.com/"),
    ("Framer", "Software / SaaS", "NL", "https://www.framer.com/"),
    ("Miro", "Software / SaaS", "US", "https://miro.com/"),
    ("Asana", "Software / SaaS", "US", "https://asana.com/"),
    ("Monday.com", "Software / SaaS", "IL", "https://monday.com/"),
    ("Atlassian", "Software / SaaS", "AU", "https://www.atlassian.com/"),
    ("Slack", "Software / SaaS", "US", "https://slack.com/"),
    ("Zoom", "Software / SaaS", "US", "https://zoom.us/"),
    ("Dropbox", "Software / SaaS", "US", "https://www.dropbox.com/"),
    ("Box", "Software / SaaS", "US", "https://www.box.com/"),
    ("Twilio", "Software / SaaS", "US", "https://www.twilio.com/"),
    ("Datadog", "Software / SaaS", "US", "https://www.datadoghq.com/"),
    ("Snowflake", "Software / SaaS", "US", "https://www.snowflake.com/"),
    ("Palantir", "Software / SaaS", "US", "https://www.palantir.com/"),
    ("OpenAI", "Software / SaaS", "US", "https://openai.com/"),
    ("Anthropic", "Software / SaaS", "US", "https://www.anthropic.com/"),
    ("Hugging Face", "Software / SaaS", "US", "https://huggingface.co/"),
    ("Midjourney", "Software / SaaS", "US", "https://www.midjourney.com/"),
    ("Runway", "Software / SaaS", "US", "https://runwayml.com/"),
    ("Klarna", "Fintech", "SE", "https://www.klarna.com/"),
    ("Affirm", "Fintech", "US", "https://www.affirm.com/"),
    ("Chime", "Fintech", "US", "https://www.chime.com/"),
    ("SoFi", "Fintech", "US", "https://www.sofi.com/"),
    ("Robinhood", "Fintech", "US", "https://robinhood.com/"),
    ("Coinbase", "Fintech", "US", "https://www.coinbase.com/"),
    ("Binance", "Fintech", "MT", "https://www.binance.com/"),
    ("Patagonia", "Apparel / outdoor", "US", "https://www.patagonia.com/"),
    ("The North Face", "Apparel / outdoor", "US", "https://www.thenorthface.com/"),
    ("Allbirds", "Apparel", "US", "https://www.allbirds.com/"),
    ("Everlane", "Apparel", "US", "https://www.everlane.com/"),
    ("Reformation", "Fashion", "US", "https://www.thereformation.com/"),
    ("Aritzia", "Fashion", "CA", "https://www.aritzia.com/"),
    ("COS", "Fashion", "SE", "https://www.cos.com/"),
    ("& Other Stories", "Fashion", "SE", "https://www.stories.com/"),
    ("Mango", "Fashion", "ES", "https://shop.mango.com/"),
    ("Massimo Dutti", "Fashion", "ES", "https://www.massimodutti.com/"),
    ("Pull&Bear", "Fashion", "ES", "https://www.pullandbear.com/"),
    ("Bershka", "Fashion", "ES", "https://www.bershka.com/"),
    ("Shein", "Fashion retail", "CN", "https://www.shein.com/"),
    ("ASOS", "Fashion retail", "GB", "https://www.asos.com/"),
    ("Farfetch", "Fashion retail", "GB", "https://www.farfetch.com/"),
    ("SSENSE", "Fashion retail", "CA", "https://www.ssense.com/"),
    ("Net-a-Porter", "Fashion retail", "GB", "https://www.net-a-porter.com/"),
    ("Mr Porter", "Fashion retail", "GB", "https://www.mrporter.com/"),
    ("Glossier", "Beauty", "US", "https://www.glossier.com/"),
    ("Rare Beauty", "Beauty", "US", "https://www.rarebeauty.com/"),
    ("The Ordinary", "Beauty", "CA", "https://theordinary.com/"),
    ("Aesop", "Beauty", "AU", "https://www.aesop.com/"),
    ("Rituals", "Beauty", "NL", "https://www.rituals.com/"),
    ("Away", "Travel goods", "US", "https://www.awaytravel.com/"),
    ("Monocle", "Media", "GB", "https://monocle.com/"),
    ("The Atlantic", "Media", "US", "https://www.theatlantic.com/"),
    ("Wired", "Media", "US", "https://www.wired.com/"),
    ("Vogue", "Media", "US", "https://www.vogue.com/"),
    ("Dezeen", "Media", "GB", "https://www.dezeen.com/"),
    ("ArchDaily", "Media", "CL", "https://www.archdaily.com/"),
    ("Pitchfork", "Media", "US", "https://pitchfork.com/"),
    ("Resident Advisor", "Media", "GB", "https://ra.co/"),
    ("Bandcamp", "Media", "US", "https://bandcamp.com/"),
    ("SoundCloud", "Media", "DE", "https://soundcloud.com/"),
    ("Twitch", "Media", "US", "https://www.twitch.tv/"),
    ("Discord", "Software / SaaS", "US", "https://discord.com/"),
    ("Reddit", "Media", "US", "https://www.reddit.com/"),
    ("Pinterest", "Media", "US", "https://www.pinterest.com/"),
    ("Etsy", "Marketplace", "US", "https://www.etsy.com/"),
    ("eBay", "Marketplace", "US", "https://www.ebay.com/"),
    ("AliExpress", "Marketplace", "CN", "https://www.aliexpress.com/"),
    ("Mercado Libre", "Marketplace", "AR", "https://www.mercadolibre.com/"),
    ("Rakuten", "Marketplace", "JP", "https://www.rakuten.com/"),
    ("Zalando", "Fashion retail", "DE", "https://www.zalando.com/"),
    ("About You", "Fashion retail", "DE", "https://www.aboutyou.com/"),
    ("Otto", "Retail", "DE", "https://www.otto.de/"),
    ("Zalora", "Fashion retail", "SG", "https://www.zalora.com/"),
    ("Shopee", "Marketplace", "SG", "https://shopee.com/"),
    ("Grab", "Mobility", "SG", "https://www.grab.com/"),
    ("Gojek", "Mobility", "ID", "https://www.gojek.com/"),
    ("Bolt", "Mobility", "EE", "https://bolt.eu/"),
    ("Free Now", "Mobility", "DE", "https://free-now.com/"),
    ("Lime", "Mobility", "US", "https://www.li.me/"),
    ("Bird", "Mobility", "US", "https://www.bird.co/"),
    ("Peloton", "Fitness", "US", "https://www.onepeloton.com/"),
    ("Strava", "Fitness", "US", "https://www.strava.com/"),
    ("Calm", "Wellness", "US", "https://www.calm.com/"),
    ("Headspace", "Wellness", "US", "https://www.headspace.com/"),
    ("Duolingo", "Education", "US", "https://www.duolingo.com/"),
    ("Coursera", "Education", "US", "https://www.coursera.org/"),
    ("MasterClass", "Education", "US", "https://www.masterclass.com/"),
    ("Skillshare", "Education", "US", "https://www.skillshare.com/"),
    ("Udemy", "Education", "US", "https://www.udemy.com/"),
    ("Khan Academy", "Education", "US", "https://www.khanacademy.org/"),
    ("Wikipedia", "Reference", "US", "https://www.wikipedia.org/"),
    ("Britannica", "Reference", "GB", "https://www.britannica.com/"),
    ("BBC", "Media", "GB", "https://www.bbc.com/"),
    ("The Guardian", "Media", "GB", "https://www.theguardian.com/"),
    ("NYTimes", "Media", "US", "https://www.nytimes.com/"),
    ("Washington Post", "Media", "US", "https://www.washingtonpost.com/"),
    ("Financial Times", "Media", "GB", "https://www.ft.com/"),
    ("Bloomberg", "Media", "US", "https://www.bloomberg.com/"),
    ("Reuters", "Media", "GB", "https://www.reuters.com/"),
    ("CNBC", "Media", "US", "https://www.cnbc.com/"),
    ("TechCrunch", "Media", "US", "https://techcrunch.com/"),
    ("The Verge", "Media", "US", "https://www.theverge.com/"),
    ("Ars Technica", "Media", "US", "https://arstechnica.com/"),
    ("Product Hunt", "Media", "US", "https://www.producthunt.com/"),
    ("Behance", "Creative", "US", "https://www.behance.net/"),
    ("Dribbble", "Creative", "US", "https://dribbble.com/"),
    ("Awwwards", "Creative", "ES", "https://www.awwwards.com/"),
    ("SiteInspire", "Creative", "US", "https://www.siteinspire.com/"),
    ("Land-book", "Creative", "UA", "https://land-book.com/"),
    ("Lusion", "Creative", "VN", "https://lusion.co/"),
    ("Active Theory", "Creative", "US", "https://activetheory.net/"),
    ("Resn", "Creative", "NZ", "https://resn.co.nz/"),
    ("Instrument", "Creative", "US", "https://www.instrument.com/"),
    ("Huge", "Creative", "US", "https://www.hugeinc.com/"),
    ("IDEO", "Creative", "US", "https://www.ideo.com/"),
    ("Pentagram", "Creative", "US", "https://www.pentagram.com/"),
    ("Collins", "Creative", "US", "https://www.wearecollins.com/"),
    ("Sagmeister & Walsh", "Creative", "US", "https://sagmeister.com/"),
    ("R/GA", "Creative", "US", "https://rga.com/"),
    ("AKQA", "Creative", "GB", "https://www.akqa.com/"),
    ("Wieden+Kennedy", "Creative", "US", "https://www.wk.com/"),
    ("Droga5", "Creative", "US", "https://droga5.com/"),
    ("FCB", "Creative", "US", "https://www.fcb.com/"),
    ("Ogilvy", "Creative", "US", "https://www.ogilvy.com/"),
    ("TBWA", "Creative", "US", "https://tbwa.com/"),
    ("Publicis", "Creative", "FR", "https://www.publicis.com/"),
    ("WPP", "Creative", "GB", "https://www.wpp.com/"),
    ("Havas", "Creative", "FR", "https://www.havas.com/"),
    ("Dentsu", "Creative", "JP", "https://www.dentsu.com/"),
]


def host_only(url: str) -> str:
    parsed = urlparse(url.strip() if "://" in url.strip() else f"https://{url.strip()}")
    return (parsed.hostname or "").lower().removeprefix("www.")


def is_home(url: str) -> bool:
    parsed = urlparse(url)
    path = (parsed.path or "/").rstrip("/") or "/"
    # allow shallow brand paths like /en or /us only if we have no better option later
    return path == "/" and not parsed.query


def blocked(host: str) -> bool:
    if not host or host.endswith(".gov") or host.endswith(".edu") or host.endswith(".mil"):
        return True
    if host.endswith(".wikipedia.org"):
        return True
    return any(host == b or host.endswith("." + b) for b in BLOCK_HOSTS)


def slug(name: str) -> str:
    out = []
    for ch in name.lower():
        if ch.isalnum():
            out.append(ch)
        elif ch in " &._/'":
            if out and out[-1] != "-":
                out.append("-")
    return "".join(out).strip("-") or "brand"


def country_code(label: str) -> str:
    label = (label or "").strip()
    if not label:
        return "XX"
    # Wikidata returns full country names; keep short token
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
            {"name": name, "group": group, "country": country, "url": url if "://" in url else f"https://{url}"}
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
        # Prefer homepage-looking URLs
        if not is_home(url):
            # normalize to origin homepage when path is deep
            parsed = urlparse(url)
            shallow = f"https://{parsed.netloc}/"
            h2 = host_only(shallow)
            if h2 and h2 not in seen and not blocked(h2):
                url = shallow
                h = h2
            else:
                continue
        seen.add(h)
        group = row.get("group") or "curated"
        by_group[group].append(
            {
                "name": row.get("name") or h,
                "group": GROUP_LABEL.get(group, group),
                "country": country_code(row.get("country") or ""),
                "url": url,
            }
        )

    # Round-robin across groups for design diversity
    order = [
        "curated",
        "software",
        "fashion",
        "retail",
        "banking",
        "airline",
        "hotel",
        "telecom",
        "media",
        "automobile_brand",
        "restaurant",
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

    # Guarantee unique ids even if slug+host collide
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

    catalog = {
        "id": "design-diversity-1000",
        "title": "1000 cross-industry brand / product homepages for design diversity",
        "source": "Wikidata official websites (P856) across banking, airlines, hotels, fashion, retail, software, telecom, media, and auto brands; plus curated QSR / SaaS / creative gaps. Excludes hosts already in automotive-oem-50, cross-industry-100, engineering-manufacturing-1000, insurance-1000, and insurance-plus-500.",
        "sourceUrl": "https://query.wikidata.org/",
        "year": 2026,
        "updated": "2026-08-20",
        "entries": entries,
    }
    for entry in entries:
        if entry["url"].startswith("http://"):
            entry["url"] = "https://" + entry["url"][len("http://") :]
    assert all(e["url"].startswith("https://") for e in entries)
    OUT.write_text(json.dumps(catalog, indent=2) + "\n")
    hosts = {host_only(e["url"]) for e in entries}
    print(f"wrote {OUT} entries={len(entries)} unique_hosts={len(hosts)}")
    print("groups", {g: sum(1 for e in entries if e["group"] == g) for g in sorted({e["group"] for e in entries})})


if __name__ == "__main__":
    main()
