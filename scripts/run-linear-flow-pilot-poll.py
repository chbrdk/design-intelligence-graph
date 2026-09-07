#!/usr/bin/env python3
"""Poll Linear flow pilot: re-POST seed until flow_id appears or max attempts."""
from __future__ import annotations

import json
import os
import time
import urllib.request

API = os.environ.get(
    "DIG_SEED_API",
    "https://spirion.projects-a.plygrnd.tech/api/dig/api/library/flows/seed",
)
FLOWS = os.environ.get(
    "DIG_FLOWS_API",
    "https://spirion.projects-a.plygrnd.tech/api/dig/api/library/flows?app_scope_id=app_linear",
)
LOG = os.environ.get("DIG_LINEAR_PILOT_LOG", "/tmp/dig_linear_pilot.log")
STATE = os.environ.get("DIG_LINEAR_PILOT_STATE", "/tmp/dig_linear_pilot_state.json")
SLEEP = int(os.environ.get("DIG_LINEAR_PILOT_SLEEP", "120"))
MAX = int(os.environ.get("DIG_LINEAR_PILOT_MAX", "240"))

BODY = {
    "seed_source": "manual",
    "app_scope_id": "app_linear",
    "enqueue_captures": False,
    "urls": [
        "https://linear.app",
        "https://linear.app/login",
        "https://linear.app/signup",
        "https://linear.app/pricing",
    ],
}


def post_json(url: str, payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"content-type": "application/json"} if payload is not None else {},
        method="POST" if payload is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def log(msg: str) -> None:
    line = f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} {msg}"
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def main() -> None:
    log(f"START max={MAX} sleep={SLEEP}s")
    for attempt in range(1, MAX + 1):
        try:
            result = post_json(API, BODY)
        except Exception as exc:  # noqa: BLE001
            log(f"attempt={attempt} error={exc}")
            time.sleep(SLEEP)
            continue
        matched = result.get("matched_capture_run_ids") or []
        missing = result.get("missing_urls") or []
        flow_id = result.get("flow_id")
        actions = result.get("flow_action_ids") or []
        state = {
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "attempt": attempt,
            "matched": len(matched),
            "missing": missing,
            "edge_count": result.get("edge_count"),
            "flow_id": flow_id,
            "flow_action_ids": actions,
        }
        open(STATE, "w", encoding="utf-8").write(json.dumps(state, indent=2))
        log(
            f"attempt={attempt} matched={len(matched)} missing={len(missing)} "
            f"edges={result.get('edge_count')} flow_id={flow_id} actions={actions}"
        )
        if flow_id:
            try:
                flows = post_json(FLOWS) if False else json.loads(
                    urllib.request.urlopen(FLOWS, timeout=60).read().decode()
                )
            except Exception as exc:  # noqa: BLE001
                flows = {"error": str(exc)}
            log(f"DONE flow_id={flow_id} library={json.dumps(flows)[:500]}")
            return
        time.sleep(SLEEP)
    log("STOP max attempts")


if __name__ == "__main__":
    main()
