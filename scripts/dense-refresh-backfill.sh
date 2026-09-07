#!/usr/bin/env bash
# Dense embedding refresh loop (called by scripts/run-dense-refresh-detached.py).
# Prefer: python3 scripts/run-dense-refresh-detached.py
set -u
PATH="/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$PATH"

API_URL="${DIG_BACKFILL_URL:-https://spirion.projects-a.plygrnd.tech/api/dig/api/embeddings/backfill}"
LIMIT="${DIG_BACKFILL_LIMIT:-25}"
MAX_BATCHES="${DIG_BACKFILL_MAX:-500}"
SLEEP_SEC="${DIG_BACKFILL_SLEEP:-2}"
STATE_FILE="${DIG_BACKFILL_STATE:-/tmp/dig_dense_refresh_state.json}"
ROUND_FILE="${DIG_BACKFILL_ROUND:-/tmp/dig_backfill_round.json}"

# After cursor-touch on every check, a single written=0 batch only means that
# slice was already fresh — keep walking until a long zero streak (≈ one pass).
ZERO_STREAK_STOP="${DIG_BACKFILL_ZERO_STREAK:-80}"

TOTAL_WRITTEN=0
ZERO_STREAK=0
if [[ -f "$STATE_FILE" ]]; then
  TOTAL_WRITTEN="$(python3 -c "import json;print(int(json.load(open('$STATE_FILE')).get('cumulative_written',0)))" 2>/dev/null || echo 0)"
fi

echo "=== DURABLE START $(date -u +%Y-%m-%dT%H:%M:%SZ) pid=$$ limit=$LIMIT max=$MAX_BATCHES zero_streak_stop=$ZERO_STREAK_STOP cumulative=$TOTAL_WRITTEN ==="

COUNT=0
while [[ "$COUNT" -lt "$MAX_BATCHES" ]]; do
  COUNT=$((COUNT + 1))
  echo "=== batch $COUNT $(date -u +%H:%M:%SZ) ==="

  HTTP="000"
  for attempt in 1 2 3; do
    HTTP="$(curl -sS -m 600 -o "$ROUND_FILE" -w "%{http_code}" -X POST "$API_URL" \
      -H "Content-Type: application/json" \
      -d "{\"limit\":$LIMIT,\"mode\":\"refresh\"}" || echo "000")"
    if [[ "$HTTP" == "202" ]]; then
      break
    fi
    echo "retry attempt=$attempt http=$HTTP"
    sleep $((attempt * 5))
  done

  if [[ "$HTTP" != "202" ]]; then
    echo "stop http=$HTTP after_retries"
    break
  fi

  SUM="$(python3 -c "import json;d=json.load(open('$ROUND_FILE'));r=d.get('results') or [];print(d.get('queued',0),sum(x.get('written',0) for x in r))")"
  QUEUED="$(echo "$SUM" | awk '{print $1}')"
  WRITTEN="$(echo "$SUM" | awk '{print $2}')"
  TOTAL_WRITTEN=$((TOTAL_WRITTEN + WRITTEN))
  if [[ "$WRITTEN" == "0" ]]; then
    ZERO_STREAK=$((ZERO_STREAK + 1))
  else
    ZERO_STREAK=0
  fi
  echo "queued=$QUEUED written=$WRITTEN zero_streak=$ZERO_STREAK cumulative_written=$TOTAL_WRITTEN"
  python3 -c "import json;from datetime import datetime,timezone;json.dump({'updated_at':datetime.now(timezone.utc).isoformat(),'batch':$COUNT,'queued':$QUEUED,'written':$WRITTEN,'zero_streak':$ZERO_STREAK,'cumulative_written':$TOTAL_WRITTEN,'limit':$LIMIT,'pid':$$},open('$STATE_FILE','w'),indent=2)"

  if [[ "$QUEUED" == "0" ]]; then
    echo "stop done queued=0"
    break
  fi
  if [[ "$WRITTEN" == "0" && "$ZERO_STREAK" -ge "$ZERO_STREAK_STOP" ]]; then
    echo "stop done zero_streak=$ZERO_STREAK (>=$ZERO_STREAK_STOP)"
    break
  fi
  sleep "$SLEEP_SEC"
done

echo "DONE batches=$COUNT cumulative_written=$TOTAL_WRITTEN $(date -u +%Y-%m-%dT%H:%M:%SZ)"
