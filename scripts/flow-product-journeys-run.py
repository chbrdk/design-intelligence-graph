#!/usr/bin/env python3
"""Seed curated product journeys into DIG (POST /api/library/flows/seed).

Usage:
  python3 scripts/flow-product-journeys-run.py                 # enqueue missing + assemble when ready
  python3 scripts/flow-product-journeys-run.py --no-enqueue    # assemble only from existing captures
  python3 scripts/flow-product-journeys-run.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "knowledge" / "flow-product-journeys.json"
DEFAULT_BASE = "https://spirion.projects-a.plygrnd.tech/api/dig/api"


def post(base: str, path: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"{base.rstrip('/')}{path}",
        data=json.dumps(body).encode(),
        method="POST",
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=DEFAULT_BASE)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-enqueue", action="store_true")
    args = parser.parse_args()
    catalog = json.loads(CATALOG.read_text())
    journeys = catalog.get("journeys") or []
    enqueue = not args.no_enqueue
    print(f"journeys={len(journeys)} enqueue={enqueue} dry_run={args.dry_run}")
    for journey in journeys:
        body = {
            "seed_source": "manual",
            "app_scope_id": journey["app_scope_id"],
            "enqueue_captures": enqueue,
            "urls": journey["urls"],
        }
        print(f"\n== {journey['app_scope_id']} · {journey.get('title')}")
        if args.dry_run:
            print(json.dumps(body, indent=2))
            continue
        result = post(args.base, "/library/flows/seed", body)
        print(
            "flow_id={flow_id} matched={matched} missing={missing} enqueued={enqueued} actions={actions}".format(
                flow_id=result.get("flow_id"),
                matched=len(result.get("matched") or []),
                missing=len(result.get("missing_urls") or result.get("missing") or []),
                enqueued=len(result.get("enqueued_jobs") or []),
                actions=result.get("flow_action_ids"),
            )
        )
        for url in (result.get("missing_urls") or [])[:8]:
            print(f"  missing {url}")


if __name__ == "__main__":
    main()
