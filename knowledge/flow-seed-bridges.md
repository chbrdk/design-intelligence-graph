# DIG-011 seed bridges (CHECKION / AUDION)

**Status:** CHECKION domain seed worker shipped (2026-08-16) — AUDION still spec  
**Parent:** [`docs/DIG-011-phase-b-measure.md`](../docs/DIG-011-phase-b-measure.md)  
**Ownership:** [`dig-checkion-boundary.md`](dig-checkion-boundary.md)  
**Code:** `src/flow-seed.ts` · `src/checkion-client.ts` (domain overview) · CLI `npm run flow:seed` · `POST /api/library/flows/seed`

## Intent

DIG never spiders and never runs a live journey agent. It **consumes ordered or unordered URL seeds** and turns them into CaptureRuns + Flow edges.

## CHECKION domain → DIG FlowSession

| Field | Source |
|-------|--------|
| `seed_source` | `checkion_domain_scan` |
| `seed_ref` | CHECKION `domain_scan_id` |
| `urls[]` | `GET /api/domain-scans/:id/overview` → `scan.rootUrl` + `pageSamples[].url` (capped; see `flowSeed.maxUrlsDefault` in `paths.json`) |
| DIG action | Persist `indexes/flow-seeds/{flow_session_id}.json`; optional enqueue `POST /api/jobs` per missing URL; B2 `seed_sequence` edges when CaptureRuns match |

```bash
npm run flow:seed -- --domain-scan-id=ds_xxx --app-scope-id=app_shop
# or HTTP (auth when federation live):
# POST /api/library/flows/seed { "domain_scan_id", "app_scope_id", "enqueue_captures": true }
```

Optional later: per URL `checkion_scan_id` if a WCAG single scan already exists — correlate only.

## AUDION journey → DIG FlowSession

| Field | Source |
|-------|--------|
| `seed_source` | `audion_journey` |
| `seed_ref` | AUDION run / session id |
| `urls[]` | Ordered step URLs (same pattern as AUDION→CHECKION single-scan handoff) |
| DIG action | Capture in order; B2 edges; optional B4 full import if AUDION exports graph JSON |

CHECKION quality on a step remains AUDION/CHECKION’s existing `mode: single` path — DIG may mirror correlation ids on FlowScreens.

## Manual / fixture seeds

| `seed_source` | `manual` or `fixture` |
| `urls[]` | Operator-provided |

Used for CI and local eval without CHECKION/AUDION. `buildFlowSeedSession` supports these sources.

## Out of scope

- Calling CHECKION Puppeteer/spider modules in-process  
- Embedding AUDION chat/journey UI in DIG web  
- Treating CHECKION `/journey` stub as a DIG dependency  
- Full slim-pages table beyond overview `pageSamples` (teaser) — raise `max_urls` only within samples + root  
