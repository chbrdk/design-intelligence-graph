# DIG Coolify staging

**Updated:** 2026-08-15  
**Coolify UI:** https://coolify.plygrnd.tech/  
**API base:** `https://coolify.plygrnd.tech/api/v1` (Bearer token — never commit)

| Item | Value |
|------|--------|
| Project | `MSQDX-DIG-v3` · uuid `hx1vxpmu1heuou535kht5t9s` |
| Island app | `dig-v3:main-app` · uuid `e114xfi9b4qpvcr3i0eqiqpw` |
| Island FQDN | https://dig.projects-a.plygrnd.tech |
| API app | `dig-v3:api` · uuid `fjlcya8d9jnlecj4s44yru4q` |
| API FQDN | https://dig-api.projects-a.plygrnd.tech |
| Server | `projects-01` (`gcko84c8wogss4wskocssc00`) |
| Destination | `l04kc8csogk8gk0cwwk884c4` |
| Repo | `https://github.com/chbrdk/design-intelligence-graph` (`main`) |
| Island build | Dockerfile `/Dockerfile` · port **3010** |
| API build | Dockerfile `/Dockerfile.api` · port **8787** (Playwright) |
| Peer CHECKION | https://checkion-v3.projects-a.plygrnd.tech |
| Peer Plexon | https://plexon-v3.projects-a.plygrnd.tech |

UUIDs also in `knowledge/paths.json` → `coolify.*`.

## Env (island)

| Key | Notes |
|-----|--------|
| `NEXT_PUBLIC_DIG_URL` | `https://dig.projects-a.plygrnd.tech` |
| `DIG_API_URL` | `https://dig-api.projects-a.plygrnd.tech` (upstream Node API) |
| `NEXT_PLEXON_BASE_URL` / `NEXT_PUBLIC_PLEXON_URL` / `PLEXON_AUTH_URL` | plexon-v3 staging |
| `NEXT_PUBLIC_PLEXON_REGISTER_URL` | `{plexon}/register` |
| `PLEXON_SERVICE_SECRET` | shared with CHECKION/Plexon (secret) |
| `AUTH_SECRET` | ≥32 chars (secret) |
| `DIG_FEDERATION_MODE` | `dummy` until binding live; then `live` |
| `CHECKION_API_URL` | CHECKION staging |
| `HOSTNAME` | `0.0.0.0` |
| `PORT` | `3010` |

## Env (API)

| Key | Notes |
|-----|--------|
| `DIG_WEB_STATIC` | `0` |
| `DIG_WEB_HOST` | `0.0.0.0` |
| `DIG_WEB_PORT` | `8787` |
| `DIG_IN_CONTAINER` | `1` |
| `DIG_DATABASE_URL` | optional until Postgres service is wired |

## Deploy

```bash
# force deploy island or API (uuid from paths.json)
curl -sS -X POST -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"uuid\":\"$APP_UUID\",\"force\":true}" \
  https://coolify.plygrnd.tech/api/v1/deploy
```

## Smoke

1. `GET https://dig.projects-a.plygrnd.tech/api/health`
2. `GET https://dig-api.projects-a.plygrnd.tech/api/health`
3. Open `/login` — AppShell; `/capture` proxies via `/api/dig/*` → API
4. Island healthcheck path `/api/health` port 3010

## Build note

Do **not** webpack-alias `react` / `react-dom` in `apps/web/next.config.ts`. That caused Next 16 `/_global-error` prerender (`useContext` null) and a broken SSR runtime (`useState` null) when we tried `--experimental-build-mode=compile` as a workaround. Match CHECKION: DS aliases only + single `node_modules` via Dockerfile symlink.
