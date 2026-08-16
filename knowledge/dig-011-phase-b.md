# DIG-011 Phase B — flow edges (runtime)

**Updated:** 2026-08-16  
**Spec:** [`docs/DIG-011-phase-b-measure.md`](../docs/DIG-011-phase-b-measure.md)  
**Artifacts:** `derived/flow-edges.json` + `.jsonl` (`paths.json` → `flowEdges.*`); per-package `derived/flow-edges.local.jsonl` after sibling href-join

## Modes shipped

| Mode | Function | Notes |
| --- | --- | --- |
| B1 href-join | `hrefJoinEdges` | Match candidate destinations → existing CaptureRun join URLs; `inferred_href_only`, confidence &lt; 1 |
| B2 seed | `seedSequenceEdges` | Consecutive seed URLs; confidence ≤ 0.85 unless href proof |
| B3 refuse / build | `assertSafeActivateAllowed` + `buildSafeActivateEdge` | No browser activate in CI; forbid refused; observed edge when caller already captured |
| B4 import | `importExternalEdges` | `trigger.kind=external_import` |

## Capture hook

After `manifest.json` write, discover same-`site_id` sibling packages (capped) and emit **local** edges that touch the new run.

## Code

- `src/flow-edges.ts`
- Tests: `test/flow-edges.test.ts`

## Not yet

Phase C (`flow_actions` LLM) · Phase D assemble / Library / MCP · live B3 click budget worker
