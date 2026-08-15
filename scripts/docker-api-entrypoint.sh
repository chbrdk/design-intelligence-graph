#!/bin/sh
set -eu
if [ -n "${DIG_DATABASE_URL:-}" ]; then
  node dist/src/db-migrate-cli.js || {
    echo "DIG db migrate failed" >&2
    exit 1
  }
fi
exec node dist/src/web-server.js
