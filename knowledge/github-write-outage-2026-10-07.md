# GitHub write outage — 2026-10-07

**Symptom:** `git push` and GitHub write APIs return `Internal Server Error` while reads succeed.

| Operation | Result |
|-----------|--------|
| `git fetch` / API GET commits, contents, refs | OK |
| `git push` (any branch, dig + plexon) | remote rejected · Internal Server Error |
| `POST /git/blobs`, `PUT /contents/*`, `POST /issues` | HTTP 500 |
| `POST /git/refs` pointing at an **existing** SHA | OK (201) |

**Impact:** dig-api public brand-kit GET fix (`expose brand-kit catalog GETs without auth`) sits local-only; staging remains on `4be0267` (catalog GET still Bearer-gated).

**Mitigation:** Retry push when GitHub object writes recover; then Coolify force-deploy dig-api `fjlcya8d9jnlecj4s44yru4q` and confirm `GET /api/brand-kits` → 200 without Authorization.
