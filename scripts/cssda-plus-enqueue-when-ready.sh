#!/usr/bin/env bash
# Wait for CSSDA plus fetch, build catalog, enqueue batch (urls fallback until API knows id).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${DIG_API_BASE:-https://spirion.projects-a.plygrnd.tech/api/dig/api}"
LOG=/tmp/cssda-plus-wave.log
SRC="$ROOT/knowledge/catalogs/sources/cssda-wotd-websites-plus-2026.json"
OUT="$ROOT/knowledge/catalogs/cssda-wotd-plus-1000.json"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" | tee -a "$LOG"; }

: > "$LOG"
log "wait for fetch to reach 1000 hosts"
for i in $(seq 1 240); do
  if [[ -f "$SRC" ]]; then
    count="$(python3 -c 'import json; print(json.load(open("'"$SRC"'")).get("count",0))')"
    log "poll=$i count=$count"
    if [[ "$count" -ge 1000 ]]; then
      break
    fi
  else
    log "poll=$i missing source"
  fi
  sleep 30
done

count="$(python3 -c 'import json; print(json.load(open("'"$SRC"'")).get("count",0))')"
if [[ "$count" -lt 1000 ]]; then
  log "STOP source only has $count hosts"
  exit 1
fi

log "build catalog"
python3 "$ROOT/scripts/build-cssda-wotd-plus-1000.py"
entries="$(python3 -c 'import json; print(len(json.load(open("'"$OUT"'"))["entries"]))')"
log "catalog entries=$entries"

log "enqueue via catalog id (fallback urls if unknown)"
resp="$(curl -sS -X POST "$BASE/jobs/batch" -H 'content-type: application/json' \
  -d '{"catalog":"cssda-wotd-plus-1000","skip_existing":true}')"
echo "$resp" | python3 -c 'import json,sys; d=json.load(sys.stdin); print({k:d.get(k) for k in ("ok","catalog","queued","skipped_existing","error","message")})' | tee -a "$LOG"
if echo "$resp" | python3 -c 'import json,sys; d=json.load(sys.stdin); raise SystemExit(0 if d.get("ok") else 1)'; then
  log "DONE catalog batch"
  exit 0
fi

log "catalog id not live yet — enqueue urls"
python3 <<PY | tee -a "$LOG"
import json, urllib.request
urls=[e["url"] for e in json.load(open("$OUT"))["entries"]]
# maxBatch 1000
body=json.dumps({"urls": urls, "skip_existing": True}).encode()
req=urllib.request.Request("$BASE/jobs/batch", data=body, method="POST", headers={"content-type":"application/json"})
d=json.loads(urllib.request.urlopen(req, timeout=120).read())
print({k:d.get(k) for k in ("ok","queued","skipped_existing","skipped_duplicate","error")})
PY
log "DONE urls batch"
