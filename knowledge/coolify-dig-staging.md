# DIG Coolify staging

**Updated:** 2026-08-16  
**Coolify UI:** https://coolify.plygrnd.tech/  
**API base:** `https://coolify.plygrnd.tech/api/v1` (Bearer token — never commit)

| Item | Value |
|------|--------|
| Project | `MSQDX-DIG-v3` · uuid `hx1vxpmu1heuou535kht5t9s` |
| Island app | `dig-v3:main-app` · uuid `e114xfi9b4qpvcr3i0eqiqpw` |
| Island FQDN | https://spirion.projects-a.plygrnd.tech |
| API FQDN | https://spirion-api.projects-a.plygrnd.tech |
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
| `NEXT_PUBLIC_DIG_URL` / `NEXT_PUBLIC_SPIRION_URL` | `https://spirion.projects-a.plygrnd.tech` |
| `DIG_API_URL` / `SPIRION_API_URL` | `https://spirion-api.projects-a.plygrnd.tech` (upstream Node API) |
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
| `DIG_IN_CONTAINER` | `1` → captures `/data/captures`, indexes `/data/indexes` |
| `DIG_DATABASE_URL` | Coolify internal URL for `dig-v3-postgres` (secret) |
| `CHECKION_API_URL` | `https://checkion-v3.projects-a.plygrnd.tech` (full-page screenshot SoT) |
| `DIG_CHECKION_SCREENSHOTS` | `1` (enable CHECKION attach; soft-skip on error unless `DIG_CHECKION_STRICT=1`) |
| `DIG_CHECKION_STRICT` | unset/0 = capture continues if CHECKION fails; `1` = fail job |
| `CHECKION_PROJECT_ID` | optional; pin DIG project id (e.g. staging `proj-msuphtrb`) |
| `DIG_API_TOKEN` | Machine Bearer for live `/api/library/references*` (set on dig-api; activate with `DIG_FEDERATION_MODE=live`) |
| `CHECKION_API_TOKEN` | Bearer from CHECKION Settings (secret; required for live scans). **Set on dig-api** (2026-08-15). |


## Storage / DB

| Resource | Value |
|----------|--------|
| Postgres | `dig-v3-postgres` · uuid `f9aiylej9ic9i6pkck8sutz5` · image `pgvector/pgvector:pg16` |
| Volume captures | mount `/data/captures` |
| Volume indexes | mount `/data/indexes` |
| Migrate | `scripts/docker-api-entrypoint.sh` runs `db:migrate` on start |

PG18 Coolify default mount `/var/lib/postgresql/data` breaks PG18 images — staging uses **pg16** after fixing the volume path to `/var/lib/postgresql`.

## Deploy

```bash
# force deploy island or API (uuid from paths.json)
curl -sS -X POST -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"uuid\":\"$APP_UUID\",\"force\":true}" \
  https://coolify.plygrnd.tech/api/v1/deploy
```

## Smoke

1. `GET https://spirion.projects-a.plygrnd.tech/api/health`
2. `GET https://spirion-api.projects-a.plygrnd.tech/api/health`
3. Open `/login` — AppShell; `/capture` proxies via `/api/dig/*` → API
4. Island healthcheck path `/api/health` port 3010

## Build note

Do **not** webpack-alias `react` / `react-dom` in `apps/web/next.config.ts`. That caused Next 16 `/_global-error` prerender (`useContext` null) and a broken SSR runtime (`useState` null) when we tried `--experimental-build-mode=compile` as a workaround. Match CHECKION: DS aliases only + single `node_modules` via Dockerfile symlink.


## dig-api LLM (OpenRouter)

| Key | Value |
|-----|--------|
| `DIG_LLM_ENABLED` | `true` |
| `DIG_LLM_PROVIDER` | `openrouter` |
| `DIG_LLM_ASYNC` | `true` |
| `DIG_LLM_REASONING_EFFORT` | `none` |
| `DIG_LLM_MODEL` | `nvidia/nemotron-3-nano-30b-a3b:free` |
| `DIG_LLM_VISION_MODEL` | `google/gemma-4-31b-it:free` (multimodal; Nemotron VL free often returns empty content) |
| `OPENROUTER_API_KEY` | secret — **required** (not in git) |

After key is set: restart dig-api; next capture should enqueue `/api/enrichment`.
