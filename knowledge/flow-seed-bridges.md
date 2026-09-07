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
| DIG action | Capture in order; B2 edges + B1 href-join when packages have candidates; optional B4 full import if AUDION exports graph JSON |

**Role split:** AUDION finds *purposeful* journeys (agent walks a goal). DIG indexes design evidence on those URLs and grounds transitions via href/hotspots. Live AUDION HTTP pull is still deferred — today pass the step URL list into `POST /flows/seed` with `seed_source: "audion_journey"`.

CHECKION quality on a step remains AUDION/CHECKION’s existing `mode: single` path — DIG may mirror correlation ids on FlowScreens.

## Manual / fixture seeds

| `seed_source` | `manual` or `fixture` |
| `urls[]` | Operator-provided |

Used for CI, local eval, and the Linear pilot without CHECKION/AUDION. `buildFlowSeedSession` / `runManualFlowSeed` support these sources.

```bash
# HTTP (island proxy or dig-api):
curl -sS -X POST "$DIG/api/library/flows/seed" \
  -H "Content-Type: application/json" \
  -d '{
    "seed_source": "manual",
    "app_scope_id": "app_linear",
    "enqueue_captures": true,
    "urls": [
      "https://linear.app",
      "https://linear.app/login",
      "https://linear.app/signup",
      "https://linear.app/pricing"
    ]
  }'
# Re-POST after captures complete to emit B2 edges + B1 href-join (when candidates exist) + Library graph (C1 actions).
```

CLI:

```bash
npm run flow:seed -- --manual --app-scope-id=app_linear \
  --urls=https://linear.app,https://linear.app/login,https://linear.app/pricing \
  --enqueue
```

When ≥2 seed URLs match existing CaptureRuns, the seed pass also **assembles + indexes** a DIG-011 flow (`indexes/flows/{flow_id}.json`) with L2 `flow_actions`. Package `derived/flow-candidates.json` upgrades consecutive seed edges to **href_join** with hotspots when destinations resolve inside the seed set.

## Corpus discover (no fixed journeys)

Cluster existing captures by host and index flows where Phase A candidates resolve to sibling captures:

```bash
curl -sS -X POST "$DIG/api/library/flows/discover" \
  -H "Content-Type: application/json" \
  -d '{ "max_sites": 25, "min_screens": 2, "min_href_edges": 1 }'
# Optional: { "hosts": ["linear.app"], "dry_run": true }
```

Grow coverage without catalog dumps — follow high-score same-origin candidate links not yet captured:

```bash
curl -sS -X POST "$DIG/api/library/flows/follow" \
  -H "Content-Type: application/json" \
  -d '{ "max_enqueue": 40, "max_per_host": 4 }'
# dry_run: { "dry_run": true }
# After captures complete, re-run /flows/discover
```

## Product journeys (manual catalog)

Href-discover fills **portfolio browse**. For intentional SaaS journeys (marketing → login → signup → pricing), use the curated list:

- Catalog: `knowledge/flow-product-journeys.json`
- Runner: `python3 scripts/flow-product-journeys-run.py` (optional `--no-enqueue`, `--dry-run`)

```bash
# After the open follow wave drains + discover:
python3 scripts/flow-product-journeys-run.py
# When captures complete, assemble edges without re-queue:
python3 scripts/flow-product-journeys-run.py --no-enqueue
```

Do **not** keep stacking `/flows/follow` after this — product seeds are the preferred coverage path for auth/pricing flows.

## Out of scope

- Calling CHECKION Puppeteer/spider modules in-process  
- Embedding AUDION chat/journey UI in DIG web  
- Treating CHECKION `/journey` stub as a DIG dependency  
- Full slim-pages table beyond overview `pageSamples` (teaser) — raise `max_urls` only within samples + root  
