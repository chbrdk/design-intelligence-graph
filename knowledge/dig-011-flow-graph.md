# DIG-011 — concept index (spec only)

**Updated:** 2026-08-15  
**Do not implement Phases A–D until scheduled.** Vocabulary helper `src/flow-actions.ts` is catalog validation only.

## Read order

1. [ADR-011](../architecture/ADR-011-user-flow-graph.md) — ownership decision  
2. [DIG-011 parent](../docs/DIG-011-user-flow-graph.md) — entity model + pipeline map  
3. Phases: [A](../docs/DIG-011-phase-a-recognize.md) → [B](../docs/DIG-011-phase-b-measure.md) → [C](../docs/DIG-011-phase-c-detect.md) → [D](../docs/DIG-011-phase-d-process.md)  
4. [Mobbin flows](mobbin-user-flows.md) — product parity  
5. [DIG ↔ CHECKION boundary](dig-checkion-boundary.md)  
6. [Seed bridges](flow-seed-bridges.md)  
7. [flow-actions catalog](flow-actions-catalog.json)  
8. Schemas under `schemas/flow-*.schema.json` + `mcp-flow-tools.schema.json`  
9. **Fixtures + validation:** [`dig-011-test-scenarios.md`](dig-011-test-scenarios.md) · `fixtures/flows/` · `src/flow-schema-validate.ts`  
10. **Library/MCP contracts:** [`docs/DIG-011-library-api.md`](../docs/DIG-011-library-api.md) · `fixtures/flows/api/` · `src/flow-api-project.ts`  
11. **Flows UI IA:** [`docs/DIG-011-flows-ui.md`](../docs/DIG-011-flows-ui.md) · [`dig-011-flows-ui.md`](dig-011-flows-ui.md)  
12. **Goal challenge:** [`dig-011-challenge.md`](dig-011-challenge.md) — LLM design value vs Mobbin-library spine

## Mental model

```text
CHECKION domain URLs ─┐
AUDION step URLs    ─┼─→ FlowSession seeds → DIG-001 captures (screens)
Manual/fixture URLs ─┘         │
                               ├─ Phase A: candidates (per package)
                               ├─ Phase B: edges (href-join / seed / safe activate)
                               ├─ Phase C: dig:flow.* facets
                               └─ Phase D: flow-graph.json → Library / dig_flow_* MCP

page_flow (sections on one page) ── separate, already shipped
```

## paths.json keys

- `taxonomy.flowActionsCatalog` / `flowActionsVersion` / `flowSpec`  
- `taxonomy.ownershipBoundary`  
- `checkionV3.*` for consume-only integrations  
