# DIG web island (`apps/web`)

Next.js App Router island on **`@msqdx/ui`** (sibling [`chbrdk/msqdx-ui`](https://github.com/chbrdk/msqdx-ui)), matching CHECKION / Plexon AppShell + Plexon auth.

## Prerequisites

```bash
# sibling checkout (paths.json → plexon.msqdxUiLocalClone)
gh repo clone chbrdk/msqdx-ui ../msqdx-ui -- --depth 1
cd ../msqdx-ui && pnpm install && pnpm --filter @msqdx/ui-tokens build

# DIG island
cd ../design-intelligence-graph
npm run island:install
```

React types dedupe (required when DS has its own `node_modules`):

```bash
# Prefer: symlink DS node_modules → apps/web/node_modules (CHECKION Coolify pattern)
ln -sfn "$(pwd)/apps/web/node_modules" ../msqdx-ui/node_modules
```

## Dev

```bash
# Terminal A — DIG capture/library API
npm run serve:api

# Terminal B — Next island (:3010)
DIG_API_URL=http://127.0.0.1:8787 npm run island:dev
```

Open `http://127.0.0.1:3010`. Without `PLEXON_AUTH_URL` + `PLEXON_SERVICE_SECRET`, middleware stays open (fixture mode).

## Routes

| Path | Role |
|------|------|
| `/` | Home |
| `/capture` | Capture + pipeline SSE (proxied) |
| `/library` | Screens / sections / search |
| `/enrichment` | Enrichment jobs |
| `/analyses` | Indexed analyses |
| `/settings` | Theme + session |
| `/login` | Plexon credentials (live) |
| `/api/dig/*` | Proxy → `DIG_API_URL` Node API |
| `/api/health` | Island health |

## Auth env (names in `lib/paths.ts` / `knowledge/paths.json`)

| Env | Purpose |
|-----|---------|
| `PLEXON_AUTH_URL` | validate-credentials |
| `PLEXON_SERVICE_SECRET` | service header |
| `AUTH_SECRET` | NextAuth ≥32 chars |
| `DIG_FEDERATION_MODE` | `dummy` \| `live` |
| `NEXT_PUBLIC_DIG_URL` | public origin |
| `DIG_API_URL` | upstream Node API (default `http://127.0.0.1:8787`) |

## Tests

```bash
npm run island:test
npm run island:typecheck
```

## Production build note

Do not add webpack aliases for `react` / `react-dom` (breaks Next 16 `/_global-error` prerender). Coolify follows CHECKION’s Dockerfile: fetch pinned `msqdx-ui`, strip DS `node_modules`, symlink app `node_modules`. Local SoT for UI work is **`island:dev`**.

Legacy Vite SPA under `web/` remains for API static demos; product UI is this island.

## Binding ticket

Plexon Collection product `dig`: [`knowledge/plexon-dig-binding-ticket.md`](../../knowledge/plexon-dig-binding-ticket.md)
