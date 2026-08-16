# DIG-011 — User Flow Graph

**Project:** Design Intelligence Graph  
**Document:** DIG-011  
**Status:** Draft v0.1 — **Phases A–C runtime shipped**; phase D specified, runtime deferred  
**Purpose:** Recognize, measure, detect, and index multi-screen design flows without duplicating CHECKION crawl or AUDION journey agents  
**ADR:** [ADR-011](../architecture/ADR-011-user-flow-graph.md)  
**Dependencies:** DIG-001 Capture, DIG-002 Ontology, DIG-005 Analysis, DIG-006 Storage, DIG-009 Enrichment  
**Companions:**  
- Phases: [A Recognize](DIG-011-phase-a-recognize.md) · [B Measure](DIG-011-phase-b-measure.md) · [C Detect](DIG-011-phase-c-detect.md) · [D Process](DIG-011-phase-d-process.md)  
- Knowledge: [`mobbin-user-flows.md`](../knowledge/mobbin-user-flows.md), [`dig-checkion-boundary.md`](../knowledge/dig-checkion-boundary.md), [`flow-seed-bridges.md`](../knowledge/flow-seed-bridges.md), [`flow-actions-catalog.json`](../knowledge/flow-actions-catalog.json)  
- Schemas: `flow-candidates` · `flow-edges` · `flow-graph` · `mcp-flow-tools`  
**Downstream (planned):** DIG-007 flow MCP tools, Library Interactive Mode, CHECKION/AUDION correlation

---

## 1. Purpose

DIG-011 defines the **design-flow graph**: ordered screens connected by measured transitions, searchable via a closed `flow_actions` taxonomy (Mobbin-style), with optional hotspot geometry for Interactive Mode.

It answers:

1. **Recognize** — which controls or URLs are plausible flow steps? → Phase A  
2. **Measure** — what L0/L1 evidence proves a transition? → Phase B  
3. **Detect** — which closed `flow_action` labels apply? → Phase C  
4. **Describe / process** — store, index, retrieve → Phase D  

`page_flow` (DIG-009/010) remains **within-page section order**. DIG-011 flows are **cross-screen**.

---

## 2. Truth-layer contract

| Layer | DIG-011 artifact | Rule |
|-------|------------------|------|
| **L0** | Per-step capture packages (DIG-001) | Immutable; one CaptureRun per screen observation |
| **L1** | Transition candidates & measured edges | Href, destination type, geometry hotspot, navigation outcome when safely activated |
| **L2** | Flow graph topology + path-hint actions | Deterministic assembly; catalog path rules |
| **L3** | LLM `flow_actions`, titles | Probabilistic; method + confidence &lt; 1 |

L3 MUST NOT invent edges that lack L1/L2 support.

---

## 3. Ownership boundary (normative)

MUST follow [`knowledge/dig-checkion-boundary.md`](../knowledge/dig-checkion-boundary.md) and [ADR-011](../architecture/ADR-011-user-flow-graph.md).

| Concern | Owner |
|---------|--------|
| URL discovery / domain spider | **CHECKION** |
| Live journey agent / Explore | **AUDION** / shared island agent |
| WCAG / scores on a step URL | **CHECKION** `mode: single` |
| Design capture per URL | **DIG** |
| Flow graph + hotspots + `flow_actions` | **DIG** |
| Within-page section narrative | **DIG** `page_flow` |

Non-goals: Customer Journey map UI; Journey Agent soft-fork; DIG-owned spider; unsafe activation (DIG-001 §42).

---

## 4. Entity model

```text
AppScope
└── FlowSession (optional seed walk)
    └── Flow
          ├── flow_actions[]     dig:flow.* (L2/L3)
          ├── screens[]          → capture_run_id (+ optional checkion_scan_id)
          └── edges[]            trigger + hotspot + activation
```

Schemas lock field shapes; see §9 and `schemas/flow-*.schema.json`.

---

## 5. Pipeline (spec map)

| Phase | Doc | Artifact |
|-------|-----|----------|
| A Recognize | [phase-a](DIG-011-phase-a-recognize.md) | `derived/flow-candidates.json` |
| B Measure | [phase-b](DIG-011-phase-b-measure.md) | `derived/flow-edges.jsonl` |
| C Detect | [phase-c](DIG-011-phase-c-detect.md) | actions on Flow / enrichment stage |
| D Process | [phase-d](DIG-011-phase-d-process.md) | `derived/flow-graph.json` + APIs |

Seed bridges: [`knowledge/flow-seed-bridges.md`](../knowledge/flow-seed-bridges.md).

---

## 6. Naming disambiguation

| Term | Meaning |
|------|---------|
| `page_flow` | Ordered **sections** on one page |
| `Flow` / `flow_graph` | DIG-011 multi-screen design flow |
| Library `/page-flows` vs `/flows` | Planned rename split (Phase D) |
| CHECKION `/journey` | Deferred stub — not DIG |
| AUDION journey | Live exploration — seed source only |

---

## 7. Safety & privacy

1. B3 activation MUST use DIG-001 safety policy.  
2. Stored URLs MUST use existing redaction.  
3. No credentials/session secrets in flow artifacts.  
4. External edges MAY be href-only without follow.

---

## 8. Enrichment (planned)

Stage `flow_actions` after screen facets; evidence = ordered screen summaries only. Details in [Phase C](DIG-011-phase-c-detect.md).

---

## 9. Schemas

| File | Role |
|------|------|
| [`schemas/flow-candidates.schema.json`](../schemas/flow-candidates.schema.json) | Phase A |
| [`schemas/flow-edges.schema.json`](../schemas/flow-edges.schema.json) | Phase B |
| [`schemas/flow-graph.schema.json`](../schemas/flow-graph.schema.json) | Phase D assemble |
| [`schemas/mcp-flow-tools.schema.json`](../schemas/mcp-flow-tools.schema.json) | Planned MCP |

---

## 10. Implementation policy

Phases **A–C runtime shipped** (see [`DIG-011-implementation-status.md`](DIG-011-implementation-status.md)). Phase **D** (assemble / Library / MCP / Interactive UI) remains deferred until scheduled.

| Wave | Deliverable | Status |
|------|-------------|--------|
| **0** | Spec suite + schemas + ADR + catalog | Done |
| **1** | Phase A candidates | **Done** (`src/flow-candidates.ts`) |
| **2** | Phase B edges (B1/B2/B3-refuse/B4) | **Done** (`src/flow-edges.ts`) |
| **3** | Phase C `flow_actions` detect | **Done** (`src/flow-detect.ts`) |
| **4** | Phase D assemble + Library/MCP + Interactive | Spec only |
| **5** | CHECKION/AUDION seed worker | Spec only |
| **6** | B3 live safe-activate worker | Spec only |

---

## 11. Validation (spec-era)

- Catalog uniqueness / `dig:flow.*` prefix (`test/flow-actions.test.ts`)  
- Golden flow fixtures + Ajv schema + graph invariants (`test/flow-schema-fixtures.test.ts`)  
- Scenario catalog: [`knowledge/dig-011-test-scenarios.md`](../knowledge/dig-011-test-scenarios.md)  
- Human review of phase docs vs ADR-011 boundary  

```bash
node --import tsx --test test/flow-actions.test.ts test/flow-schema-fixtures.test.ts
```

---

## 12. References

- [`knowledge/mobbin-user-flows.md`](../knowledge/mobbin-user-flows.md)  
- [`knowledge/dig-checkion-boundary.md`](../knowledge/dig-checkion-boundary.md)  
- CHECKION: `journey-agent-island.md`, `audion-journey-scan-trigger.md`, `scan-modes.md`  
- DIG-001 §40–42  
