# GitHub write outage — 2026-10-07

**Symptom:** `git push` and GitHub write APIs return `Internal Server Error` while reads succeed.

| Operation | Result |
|-----------|--------|
| `git fetch` / API GET commits, contents, refs | OK |
| `git push` (any branch, dig + plexon) | remote rejected · Internal Server Error |
| `POST /git/blobs`, `PUT /contents/*`, `POST /issues` | HTTP 500 |
| `POST /git/refs` pointing at an **existing** SHA | OK (201) |

**Impact (temporary):** blocked push of public brand-kit GET fix for ~10 minutes.

**Resolved:** push succeeded ~15:17Z → Coolify deploy `fd176a9` · `GET /api/brand-kits` → 200 without Authorization.
