# P2d live API Bearer gate + dig.generate (2026-08-15)

## CHECKION peer smoke (verified)

```text
npm run smoke:checkion-peer
# against staging with dig-api Coolify CHECKION_API_TOKEN
→ JPEG 1920×1080 for https://example.com/ (scan completed)
```

## Live machine auth

- Code: `src/api-auth.ts`
- When `DIG_FEDERATION_MODE=live`, `/api/library/references*` requires:
  - `Authorization: Bearer $DIG_API_TOKEN`, or
  - `x-service-secret: $PLEXON_SERVICE_SECRET` (island/BFF)
- Dummy mode stays open (current staging default)
- Coolify dig-api: `DIG_API_TOKEN` provisioned (secret; not in git). Do **not** flip federation to `live` until island sends one of the above.

## dig.generate HTTP

- `POST /api/library/references/generate` → assemble look_conditioned pack + layout-spec
- Capability id already listed in plexon stubs: `dig.generate`

## Paths

- `knowledge/paths.json` → `plexon.digApiTokenEnv` = `DIG_API_TOKEN`
