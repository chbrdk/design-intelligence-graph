# ADR-003 — Derived Geometry and Layout as a Separate L2 Model

**Status:** Accepted  
**Date:** 2026-08-14

## Decision

Keep raw measured geometry in DIG-001 and emit DIG-003 as separate, immutable run artifacts. Use only deterministic parentage, measured boxes, computed styles, and logical-element matches. Scope spatial relations to siblings to avoid an unbounded and ambiguous all-page relation graph.

## Consequences

Consumers get a compact model for layout comparison and generation without losing source evidence. New relationship kinds or layout solvers can be added versionedly without changing capture records. Semantic conclusions remain explicitly outside this layer.
