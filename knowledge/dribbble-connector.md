# Dribbble connector (SPIRION)

**Status:** P1 scaffold (OAuth + sync job)  
**Config:** `knowledge/paths.json` → `dribbble`  
**API prefix:** `/api/dribbble`  
**Env (dig-api / Coolify):** `DRIBBBLE_CLIENT_ID` · `DRIBBBLE_CLIENT_SECRET` · optional `DRIBBBLE_REDIRECT_URI`

## Rules

- Official Dribbble API v2 only — **no HTML scrape**
- Sync copies media into SPIRION storage; CDN is never craft SSOT
- `source=connector:dribbble`, `licenseClass=connector_tos`, `craftEligible=false` until review
- Rate limits: ~60/min, ~1440/day (see paths.json)

## Endpoints

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/dribbble/status` | configured / connected |
| GET | `/api/dribbble/oauth/start` | authorize URL |
| GET | `/api/dribbble/oauth/callback` | code exchange |
| POST | `/api/dribbble/sync` | pull authorized user shots → upload ingest |

## Operator

1. Register Dribbble app; set Coolify env on dig-api uuid `fjlcya8d9jnlecj4s44yru4q`
2. Open `/api/dribbble/oauth/start` → authorize
3. `POST /api/dribbble/sync` with optional `{ "limit": 10 }`
4. Review assets; set `craft_eligible=true` only after allowlist
