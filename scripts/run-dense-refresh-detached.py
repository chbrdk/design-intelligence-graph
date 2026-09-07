#!/usr/bin/env python3
"""Detach dense-refresh backfill from Cursor agent process trees.

Cursor aborts agent-managed background shells; this launcher uses
start_new_session + a lock file so the loop survives chat turn ends.

  python3 scripts/run-dense-refresh-detached.py
  python3 scripts/run-dense-refresh-detached.py --status
  python3 scripts/run-dense-refresh-detached.py --stop
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "dense-refresh-backfill.sh"
LOG = Path("/tmp/dig_dense_refresh_backfill.log")
PID_FILE = Path("/tmp/dig_dense_refresh_backfill.pid")
LOCK_FILE = Path("/tmp/dig_dense_refresh_backfill.lock")
STATE_FILE = Path("/tmp/dig_dense_refresh_state.json")


def read_state() -> dict:
    if not STATE_FILE.exists():
        return {}
    try:
        return json.loads(STATE_FILE.read_text())
    except Exception:
        return {}


def pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def current_pid() -> int | None:
    if not PID_FILE.exists():
        return None
    try:
        return int(PID_FILE.read_text().strip())
    except Exception:
        return None


def status() -> int:
    pid = current_pid()
    state = read_state()
    alive = bool(pid and pid_alive(pid))
    print(
        json.dumps(
            {
                "running": alive,
                "pid": pid,
                "cumulative_written": state.get("cumulative_written"),
                "batch": state.get("batch"),
                "updated_at": state.get("updated_at"),
                "log": str(LOG),
            },
            indent=2,
        )
    )
    return 0 if alive else 1


def stop() -> int:
    pid = current_pid()
    if not pid or not pid_alive(pid):
        print("not_running")
        PID_FILE.unlink(missing_ok=True)
        return 0
    os.kill(pid, signal.SIGTERM)
    for _ in range(20):
        if not pid_alive(pid):
            break
        time.sleep(0.25)
    if pid_alive(pid):
        os.kill(pid, signal.SIGKILL)
    PID_FILE.unlink(missing_ok=True)
    print(f"stopped pid={pid}")
    return 0


def start() -> int:
    existing = current_pid()
    if existing and pid_alive(existing):
        print(f"already_running pid={existing}")
        return 0

    LOCK_FILE.touch(exist_ok=True)
    lock_fd = os.open(LOCK_FILE, os.O_RDWR)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("lock_held")
        return 1

    env = os.environ.copy()
    env["PATH"] = "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:" + env.get("PATH", "")
    LOG.parent.mkdir(parents=True, exist_ok=True)
    log_fh = LOG.open("a", buffering=1)
    log_fh.write(f"\n=== DETACHED LAUNCHER {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} ===\n")
    log_fh.flush()

    proc = subprocess.Popen(
        ["bash", str(SCRIPT)],
        cwd=str(ROOT),
        stdout=log_fh,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        start_new_session=True,
        env=env,
    )
    PID_FILE.write_text(str(proc.pid))
    # Keep lock in parent briefly then release — child owns the work.
    # Hold lock via a small side process tied to child lifetime? Simpler: release
    # after start; PID file is the source of truth.
    fcntl.flock(lock_fd, fcntl.LOCK_UN)
    os.close(lock_fd)
    time.sleep(1.5)
    alive = pid_alive(proc.pid)
    print(json.dumps({"launched": proc.pid, "alive": alive, "log": str(LOG)}, indent=2))
    return 0 if alive else 2


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--stop", action="store_true")
    args = parser.parse_args()
    if args.status:
        return status()
    if args.stop:
        return stop()
    return start()


if __name__ == "__main__":
    sys.exit(main())
