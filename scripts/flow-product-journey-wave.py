#!/usr/bin/env python3
"""Wait for capture queue idle → discover → product-journey seeds → wait → re-seed assemble."""
from __future__ import annotations

import json
import subprocess
import time
import urllib.request
from collections import Counter
from pathlib import Path

BASE = "https://spirion.projects-a.plygrnd.tech/api/dig/api"
LOG = Path("/tmp/dig_product_journey_wave.log")
ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "scripts" / "flow-product-journeys-run.py"


def log(msg: str) -> None:
    line = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()) + " " + msg
    print(line, flush=True)
    with LOG.open("a") as f:
        f.write(line + "\n")


def get_json(path: str) -> dict:
    with urllib.request.urlopen(f"{BASE}{path}", timeout=90) as resp:
        return json.loads(resp.read().decode())


def post(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=json.dumps(body).encode(),
        method="POST",
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.loads(resp.read().decode())


def active_count() -> tuple[int, dict]:
    jobs = get_json("/jobs").get("jobs") or []
    c = Counter(j.get("stage") for j in jobs)
    active = sum(c.get(s, 0) for s in ("queued", "capturing", "analyzing", "verifying", "indexing"))
    return active, dict(c)


def wait_idle(label: str, rounds: int = 240, sleep_s: int = 45) -> None:
    for i in range(rounds):
        active, stages = active_count()
        log(f"{label} poll={i} active={active} {stages}")
        if active == 0 and i > 0:
            return
        time.sleep(sleep_s)
    raise SystemExit(f"timeout waiting for idle ({label})")


def main() -> None:
    LOG.write_text("")
    log("START product-journey wave: idle → discover → seed enqueue → idle → seed assemble")
    wait_idle("pre_follow_drain")

    d = post("/library/flows/discover", {"max_sites": 50, "min_screens": 2, "min_href_edges": 1})
    Path("/tmp/dig_discover_before_product.json").write_text(json.dumps(d, indent=2))
    log(
        f"discover indexed={d.get('indexed_count')} skipped={d.get('skipped_count')} sites={d.get('sites_considered')}"
    )
    for item in (d.get("indexed") or [])[:20]:
        log(
            f"  {item.get('host')} screens={item.get('screen_count')} actions={item.get('flow_action_ids')} id={item.get('flow_id')}"
        )

    log("seed product journeys (enqueue missing)")
    subprocess.check_call(["python3", str(RUNNER), "--base", BASE])

    wait_idle("post_product_seed")

    log("re-seed assemble (no enqueue)")
    subprocess.check_call(["python3", str(RUNNER), "--base", BASE, "--no-enqueue"])

    items = get_json("/library/flows?limit=50").get("items") or []
    log(f"DONE list_items={len(items)}")
    for item in items[:25]:
        log(
            f"  {item.get('title')} screens={item.get('screen_count')} edges={item.get('edge_count')} actions={item.get('flow_action_ids')}"
        )


if __name__ == "__main__":
    main()
