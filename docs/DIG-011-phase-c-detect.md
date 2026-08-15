# DIG-011 Phase C — Detect flow_actions

**Parent:** [DIG-011 User Flow Graph](DIG-011-user-flow-graph.md)  
**Status:** Draft v0.1 — specified, **not implemented**  
**Catalog:** [`knowledge/flow-actions-catalog.json`](../knowledge/flow-actions-catalog.json)  
**Paths key:** `taxonomy.flowActionsCatalog`

## Goal

Assign zero or more closed-vocabulary **`dig:flow.*`** labels to a Flow (or FlowSession draft) for facet search — Mobbin `flowActions` parity.

## Dual path

### C1 — Deterministic (L2)

Inputs: ordered screen URL paths, ontology page types, form/nav presence.

Rules (illustrative, normative when coded):

- Path hint match from catalog `path_hints` → candidate action id (see `suggestFlowActionsFromPath` intent).
- `/login` + form control ontology → `dig:flow.logging_in` confidence 0.9 method `path_ontology_rule`.
- Multiple matching actions allowed; `dig:flow.unknown` only when none match.

### C2 — LLM stage (L3)

Planned DIG-009 stage id: `flow_actions`.

**Evidence budget:** ordered list of `{ order, path, screen_patterns[], ui_element_labels[] }` — no full HTML.

**Output contract:**

```json
{
  "flow_action_ids": ["dig:flow.onboarding"],
  "title": "optional short title",
  "rationale": "≤160 chars"
}
```

Rules:

1. Every `flow_action_ids[]` entry MUST exist in the catalog (validate; drop unknowns).
2. Soft-fail: keep C1 labels if L3 fails.
3. Cache key: stage + model + hash(screen capture ids + edge fingerprint).
4. Token budget via `llm.stageMaxTokens`; bulk→quality escalate per DIG-009.

## Naming

- Facet ids: only `dig:flow.*`  
- Free text: `title` / `notes` only — never promoted to facet without catalog entry  

## Non-goals

- Generating multi-paragraph journey stories as the primary index key  
- Open-ended action taxonomies per customer  

## Acceptance (when implemented)

- Catalog validator rejects unknown ids.
- Eval fixture: login two-step seed → expects `dig:flow.logging_in` in L2 or L3.
