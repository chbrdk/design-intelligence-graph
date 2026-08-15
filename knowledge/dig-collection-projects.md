# DIG Collection-scoped projects (P2)

**Date:** 2026-08-15  
**Spec:** `docs/DIG-013-plexon-app.md` §5  
**Island:** `apps/web`

## Contract

| Method | Path | Auth |
|--------|------|------|
| PUT | `/api/platform/provisioning/projects/{platformProjectId}` | `X-Service-Secret` + `X-Plexon-Contract-Version` |
| GET | same | + `X-Plexon-User-Id` |

PUT body (federation v3): `contractVersion`, `name`, `platformCompanyId`, `ownerUserId`, optional `domain` / `status` / `source` / `requestedAt`.

PUT response must include `externalProjectId` (local dig project id) so plexon-v3 can bind.

## Storage (current)

In-memory store on the Next island (`lib/dig-project-store.ts`) — enough for Coolify sync smoke and CI. Persist to Postgres in a later slice (shared dig-api DB or island `DATABASE_URL`).

## Deep link

`/projects?platformProjectId={id}` — Collection context for Capture/Library handoff.

## Paths

`knowledge/paths.json` → `plexon.provisioningProjectsPath` · `apps/web/lib/paths.ts` → `apiPlatformProvisioningProjects`.
