# OrbStack runtime (DIG)

Verified on 2026-08-15 against OrbStack 2.2.3 / Docker Engine 29.4.0 (`docker context: orbstack`).

## Why Docker on OrbStack

Local macOS Playwright installs can drift from `package-lock.json`. The image pins Chromium to the Playwright version in the lockfile via `mcr.microsoft.com/playwright:v1.62.1-noble` (see `knowledge/paths.json`).

## Prerequisites

- OrbStack running, Docker context `orbstack`
- Repository root as compose project directory

## Commands

```bash
docker compose build
docker compose run --rm dig npm run typecheck
docker compose run --rm dig npm test
docker compose run --rm dig npm run test:e2e

# Slim web UI + job API (port 8787)
docker compose up --build web

# Capture → host ./captures (volume mount)
docker compose run --rm dig npm run capture -- -o /data/captures https://example.com
docker compose run --rm dig npm run verify -- /data/captures/<capture-package>
```

Convenience: `npm run test:docker` runs typecheck + unit + e2e inside the container.

## Gemma design analysis

Host-only MLX server (not inside OrbStack):

```bash
npm run llm:serve   # :11434 OpenAI-compatible mlx_vlm.server
```

Compose `web` reaches it via `host.docker.internal:11434` with `DIG_LLM_ENABLED=true`.
See [`gemma-llm.md`](gemma-llm.md).

## Host services from the container

Targets on the Mac: use `http://host.docker.internal:<port>` (OrbStack provides this). Example fixture server:

```bash
python3 -m http.server 4173 --directory examples/fixture
docker compose run --rm dig npm run capture -- -o /data/captures http://host.docker.internal:4173
```

From the web UI inside OrbStack, capture a Mac-hosted fixture with `http://host.docker.internal:4173`.

## Compose notes

- `init: true` — reap Chromium child processes
- `shm_size: 1gb` — Chromium needs more than Docker’s default 64 MB `/dev/shm`; on OrbStack use this instead of `ipc: host`
- Volumes `./captures:/data/captures` and `./indexes:/data/indexes`
- Image build: **`Dockerfile.api`** (Playwright). Coolify Next island uses root **`Dockerfile`**.
- Service `web` exposes `8787` and runs `node dist/src/web-server.js`
- LLM stays on the host (`mlx_vlm.server`); container uses `host.docker.internal:11434`

## Verified smoke (2026-08-15)

| Check | Result |
| --- | --- |
| `docker compose build` | pass |
| typecheck / unit tests | pass |
| web UI job + Gemma | `complete` with `llm_status=complete`, 6 hypotheses |
| capture → analyze → verify → index | pass |
