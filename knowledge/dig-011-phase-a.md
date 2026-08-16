# DIG-011 Phase A — flow candidates (runtime)

**Updated:** 2026-08-16  
**Spec:** [`docs/DIG-011-phase-a-recognize.md`](../docs/DIG-011-phase-a-recognize.md)  
**Artifact:** `derived/flow-candidates.json` (`paths.json` → `flowCandidates.relativePath`)

## What it does

From a single CaptureRun package, list plausible **transition origins** without clicking or navigating:

- Links / buttons / tabs / submits
- Destination class (`internal_path`, `fragment`, `external`, `action_unsafe`, …)
- Safety (`href_join_only` | `allow_activate` | `forbid`)
- Deterministic `candidacy_score` (main/CTA up; footer/cookie down)

## Code

- `src/flow-candidates.ts` — derive + emit
- Wired in `src/capture.ts` after structure spine
- Tests: `test/flow-candidates.test.ts`

## Not yet

Phases B–D (edges, LLM actions, graph assemble, Library/UI).

## Fixture

`examples/fixture/index.html` includes `/models`, `/login`, mailto, and logout so acceptance can see internal + unsafe candidates.
