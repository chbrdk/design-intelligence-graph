# Pinterest board import

**Date:** 2026-08-17  
**Config:** `knowledge/paths.json` → `pinterest`  
**Code:** `src/pinterest-*.ts` · island Capture panel · `GET /api/pinterest/callback`

**Privacy / app review:** `knowledge/pinterest-app-submission.md` · public policy `https://spirion.projects-a.plygrnd.tech/privacy`

## Flow

1. Create a Pinterest app and set redirect URI to `{island}/api/pinterest/callback` (staging: `https://spirion.projects-a.plygrnd.tech/api/pinterest/callback`).
2. Set `PINTEREST_CLIENT_ID` and `PINTEREST_CLIENT_SECRET` on **dig-api**. Optional: `PINTEREST_REDIRECT_URI` if it should differ from `coolify.digFqdn` + `islandCallbackPath`.
3. Capture → **Connect Pinterest** → OAuth (`boards:read`, `pins:read`, `user_accounts:read`).
4. Island callback POSTs `{ code, state }` to `POST /api/pinterest/oauth/exchange`.
5. Tokens live on the indexes volume (`indexes/pinterest-oauth.json`), never in git.
6. **Import board** queues one job per image pin (`POST /api/pinterest/import`).

Each pin becomes a **desktop** capture package (single viewport named `desktop` so it shows in the Screens gallery), then the normal job pipeline: analyze (LLM/vision when enabled) → verify → graph + Postgres index → async enrichment / DesignReferences.

Video/Idea pins without an allowed image host are skipped.

## API

| Method | Path |
|--------|------|
| GET | `/api/pinterest/status` |
| GET | `/api/pinterest/oauth/start` |
| POST | `/api/pinterest/oauth/exchange` |
| GET | `/api/pinterest/boards` |
| POST | `/api/pinterest/import` `{ board_id, limit?, platformProjectId? }` |

Import uses `assertDestructiveAuth` (Bearer even in dummy), same as catalog batch.

Image downloads only from hosts ending in `pinimg.com` or `pinterest.com`.

Import jobs share the **still-image concurrency pool** (`imageIngest.maxConcurrent`), not the Playwright URL cap. Until Pinterest Trial access is granted, use Capture → bulk image upload (`knowledge/image-ingest.md`).
