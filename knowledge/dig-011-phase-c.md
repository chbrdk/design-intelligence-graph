# DIG-011 Phase C — flow_actions detect (runtime)

**Updated:** 2026-08-16  
**Spec:** [`docs/DIG-011-phase-c-detect.md`](../docs/DIG-011-phase-c-detect.md)  
**Artifact:** `derived/flow-actions.json` (`paths.json` → `flowActionsDetect.relativePath`)

## Dual path

| Path | Layer | Code |
| --- | --- | --- |
| C1 path/ontology rules | L2 | `detectFlowActionsL2` |
| C2 LLM stage | L3 | `parseFlowActionsStage` + `runFlowActionsLlmStage` (optional; soft-fail) |

Merge: `detectFlowActions` / `mergeFlowActionDetections` — keep L2 if L3 fails; drop unknown catalog ids.

## Acceptance

Login two-step (`/home` → `/login` + form) → `dig:flow.logging_in` via `path_ontology_rule`.

## Notes

- Not part of single-page DIG-009 default stage order (multi-screen FlowSession only).
- Stage id `flow_actions` registered in `llm-stages` for prompts/cache vocabulary.

## Code

- `src/flow-detect.ts`
- Tests: `test/flow-detect.test.ts`
