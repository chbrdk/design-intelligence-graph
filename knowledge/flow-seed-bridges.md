# DIG-011 seed bridges (CHECKION / AUDION)

**Status:** Spec only — 2026-08-15  
**Parent:** [`docs/DIG-011-phase-b-measure.md`](../docs/DIG-011-phase-b-measure.md)  
**Ownership:** [`dig-checkion-boundary.md`](dig-checkion-boundary.md)

## Intent

DIG never spiders and never runs a live journey agent. It **consumes ordered or unordered URL seeds** and turns them into CaptureRuns + Flow edges.

## CHECKION domain → DIG FlowSession

| Field | Source |
|-------|--------|
| `seed_source` | `checkion_domain_scan` |
| `seed_ref` | CHECKION `domain_scan_id` |
| `urls[]` | Pages from domain overview / page index APIs (MCP `domain_scan_*`) |
| DIG action | `dig-capture` each URL under one `app_scope_id`; B2 `seed_sequence` edges |

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

Used for CI and local eval without CHECKION/AUDION.

## Out of scope

- Calling CHECKION Puppeteer/spider modules in-process  
- Embedding AUDION chat/journey UI in DIG web  
- Treating CHECKION `/journey` stub as a DIG dependency  
