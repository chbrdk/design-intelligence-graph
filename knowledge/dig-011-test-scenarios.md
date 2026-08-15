# DIG-011 test scenarios (spec fixtures)

**Status:** Spec validation only — no Phase A–D producers.  
**Dir:** `fixtures/flows/` · **Runner:** `test/flow-schema-fixtures.test.ts`  
**Paths:** [`paths.json`](paths.json) → `taxonomy.flowFixturesDir`

## Library / Interactive / MCP (Phase D contracts)

- Spec: [`docs/DIG-011-library-api.md`](../docs/DIG-011-library-api.md)
- Fixtures: `fixtures/flows/api/`
- Pure projectors: `src/flow-api-project.ts` (not HTTP)
- Draft SQL: `db/migrations/draft/009_dig011_flows.sql` (not applied)

```bash
node --import tsx --test test/flow-api-contracts.test.ts
```

## How scenarios work

Each scenario folder contains:

| File | Role |
|------|------|
| `scenario.json` | Intent, phase coverage, **expect** assertions |
| `flow-graph.json` | Assembled DIG-011 Flow (Phase D shape) |
| `candidates-*.json` | Optional Phase A artifacts per screen |
| `edges.json` | Optional Phase B edge document |
| `README.md` | Human narrative (optional) |

Negative cases live under `fixtures/flows/_invalid/` and MUST fail schema or invariant checks.

## Scenario catalog

| Id | Story | Phases | Key expects |
|----|--------|--------|-------------|
| `login-href-join` | Home CTA → `/login` via href match | A, B1, C1, D | `dig:flow.logging_in`, 2 screens, 1 `href_join` edge, hotspot present |
| `checkout-seed-walk` | Cart → checkout → confirm from CHECKION-like URL seed | B2, C1, D | `dig:flow.checkout`, 3 screens, 2 `seed_sequence` edges |
| `onboarding-branch` | Welcome → tips **or** skip → done (tree) | B2, C1, D | `dig:flow.onboarding`, 4 screens, 3 edges (branch) |
| `settings-mixed-actions` | Settings hub with profile + billing facets | C1, D | two flow_actions, linear 2 screens |

## Expect contract (`scenario.json`)

```json
{
  "id": "login-href-join",
  "title": "Login via href-join",
  "phase_coverage": ["A", "B1", "C1", "D"],
  "seed_source": "fixture",
  "ownership_notes": "Pure DIG join; no CHECKION spider",
  "artifacts": {
    "flow_graph": "flow-graph.json",
    "edges": "edges.json",
    "candidates": ["candidates-home.json", "candidates-login.json"]
  },
  "expect": {
    "schema_valid": true,
    "flow_action_ids": ["dig:flow.logging_in"],
    "min_screens": 2,
    "min_edges": 1,
    "required_edge_methods": ["href_join"],
    "require_hotspot_on_edges": true,
    "max_inferred_confidence": 0.99
  }
}
```

## Validation layers

1. **JSON Schema** — Ajv 2020-12 against `schemas/flow-*.schema.json`
2. **Catalog** — every `taxonomy_id` / expect id is `dig:flow.*` in catalog
3. **Graph invariants** — edge endpoints ⊆ screens; unique `order`; `inferred_href_only` ⇒ confidence &lt; 1
4. **Scenario expects** — counts, methods, actions from `scenario.json`

## Commands

```bash
npm test -- --test-name-pattern=flow-schema
# or
node --import tsx --test test/flow-schema-fixtures.test.ts
```

## When implementing producers later

Replace hand-authored `flow-graph.json` with generator output; keep `scenario.json` expects as golden acceptance. Add live packages under `fixtures/flows/<id>/captures/` only when CaptureRuns exist — not required for schema-era tests.
