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
            ↓
        DIG-007 MCP
            ↓
      DIG-008 Generation
```

The layers of truth remain separate throughout all specifications:

- **L0 Raw:** unchanged capture evidence
- **L1 Measured:** directly observed values
- **L2 Derived:** deterministic calculations
- **L3 Semantic:** probabilistic interpretation

Implementation coverage for the first runnable crawler is tracked in [DIG-001 Implementation Status](DIG-001-implementation-status.md).
