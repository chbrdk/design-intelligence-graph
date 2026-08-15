# DIG Coolify staging

**Updated:** 2026-08-15  
**Coolify UI:** https://coolify.plygrnd.tech/  
**API base:** `https://coolify.plygrnd.tech/api/v1` (Bearer token — never commit)

| Item | Value |
|------|--------|
| Project | `MSQDX-DIG-v3` · uuid `hx1vxpmu1heuou535kht5t9s` |
| App | `dig-v3:main-app` · uuid `e114xfi9b4qpvcr3i0eqiqpw` |
| FQDN | https://dig.projects-a.plygrnd.tech |
| Server | `projects-01` (`gcko84c8wogss4wskocssc00`) |
| Destination | `l04kc8csogk8gk0cwwk884c4` |
| Repo | `https://github.com/chbrdk/design-intelligence-graph` (`main`) |
| Build | Dockerfile `/Dockerfile` · port **3010** |
| Peer CHECKION | https://checkion-v3.projects-a.plygrnd.tech |
| Peer Plexon | https://plexon-v3.projects-a.plygrnd.tech |

UUIDs also in `knowledge/paths.json` → `coolify.*`.

## Env (Coolify)

| Key | Notes |
|-----|--------|
| `NEXT_PUBLIC_DIG_URL` | `https://dig.projects-a.plygrnd.tech` |
| `NEXT_PLEXON_BASE_URL` / `NEXT_PUBLIC_PLEXON_URL` / `PLEXON_AUTH_URL` | plexon-v3 staging |
| `NEXT_PUBLIC_PLEXON_REGISTER_URL` | `{plexon}/register` |
| `PLEXON_SERVICE_SECRET` | shared with CHECKION/Plexon (secret) |
| `AUTH_SECRET` | ≥32 chars (secret) |
| `DIG_FEDERATION_MODE` | `dummy` until binding live; then `live` |
| `CHECKION_API_URL` | CHECKION staging |
| `HOSTNAME` | `0.0.0.0` |
| `PORT` | `3010` |

## Deploy

```bash
# force deploy (uuid from paths.json → coolify.digAppUuid)
curl -sS -X POST -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"uuid\":\"$DIG_APP_UUID\",\"force\":true}" \
  https://coolify.plygrnd.tech/api/v1/deploy
```

## Smoke

1. `GET https://dig.projects-a.plygrnd.tech/api/health`
2. Open `/` — AppShell loads
3. `/login` — fixture continue when federation dummy / auth unset

## Build note

`next build --experimental-build-mode=compile` avoids Next 16 `/_global-error` prerender crash (useContext null) on Coolify.
