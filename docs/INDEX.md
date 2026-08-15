# DIG Specification Index

| ID | Title | Scope | Status |
|---|---|---|---|
| DIG-001 | Web Design Capture Specification | Reproducible acquisition of raw and measured web-interface evidence | Draft v0.1 |
| DIG-002 | Design Ontology | Page, section, component, element, content, and UX-pattern taxonomy | Draft v0.1 — implemented |
| DIG-003 | Geometry & Layout Model | Coordinates, grids, alignment, spatial relationships, and responsive transformation graphs | Draft v0.1 — implemented |
| DIG-004 | Visual Language Model | Typography, color, shape, imagery, composition, motion personality, and brand expression | Draft v0.1 — implemented |
| DIG-005 | Analysis Pipeline | Deterministic derivation, vision/LLM analysis, confidence, provenance, and quality evaluation | Draft v0.1 — implemented |
| DIG-006 | Storage & Knowledge Graph | Relational, object, vector, and graph storage; identity, lineage, and versioning | Draft v0.1 — implemented |
| DIG-007 | MCP API | Search, inspection, comparison, retrieval, and recommendation tools for design agents | Draft v0.1 — implemented |
| DIG-008 | Layout Generation Specification | Evidence-based synthesis into a new deterministic layout specification | Draft v0.1 — implemented |
| DIG-009 | Async LLM Enrichment Queue | Detached enrichment jobs, stage cache, parallel stages, vision, cost, PG drain | Draft v0.2 — implemented |
| DIG-010 | Section Look & Feel | Budgeted per-section compositional look descriptions | Implemented 2026-08-15 |
| DIG-011 | User Flow Graph | Multi-screen design flows: candidates, edges, flow_actions, hotspots | Draft v0.1 — **spec only**; runtime deferred (see challenge) |
| DIG-012 | Design Reference Bundle | Compact look+composition packages for LLM/DIG-008 retrieval | Draft v0.1 — **spec only** (agent-value priority) |

## DIG-011 phase docs

| Doc | Scope |
|-----|--------|
| [DIG-011](DIG-011-user-flow-graph.md) | Parent contract |
| [Phase A](DIG-011-phase-a-recognize.md) | Recognize candidates |
| [Phase B](DIG-011-phase-b-measure.md) | Measure edges |
| [Phase C](DIG-011-phase-c-detect.md) | Detect flow_actions |
| [Phase D](DIG-011-phase-d-process.md) | Assemble / store / retrieve |
| [Library API](DIG-011-library-api.md) | HTTP + Interactive + MCP envelopes |
| [Flows UI](DIG-011-flows-ui.md) | Library Flows tab + Interactive Mode IA |
| [DIG-012](DIG-012-design-reference.md) | DesignReference / Pack for agent generation |
| [Prompt pack](DIG-012-prompt-pack.md) | LLM envelope + layout_hints contract |
| [Look-conditioned gen](DIG-012-look-conditioned-generation.md) | DIG-008 Wave 4 mapping |
| [Embeddings](DIG-012-embeddings.md) | Reference similarity |
| [Design eval](DIG-012-design-quality-eval.md) | Retrieval → hints quality |
| [Status](DIG-011-implementation-status.md) | DIG-011 tracking |
| [DIG-012 Status](DIG-012-implementation-status.md) | DIG-012 tracking |

## Dependency direction

```text
DIG-001 Capture
   ├── DIG-002 Ontology
   ├── DIG-003 Geometry
   └── DIG-004 Visual Language
            ↓
      DIG-005 Analysis
            ↓
      DIG-006 Storage
            ↓
      DIG-009 Async Enrichment  ←── Mobbin-scale LLM labels
            ├── DIG-010 Section look
            └── DIG-011 User Flow Graph  ←── optional flow_context only
            └── DIG-012 Design Reference ←── primary agent retrieval unit
            ↓
        DIG-007 MCP
            ↓
      DIG-008 Generation (look_conditioned planned)
```

The layers of truth remain separate throughout all specifications:

- **L0 Raw:** unchanged capture evidence
- **L1 Measured:** directly observed values
- **L2 Derived:** deterministic calculations
- **L3 Semantic:** probabilistic interpretation

Implementation coverage for the first runnable crawler is tracked in [DIG-001 Implementation Status](DIG-001-implementation-status.md).
