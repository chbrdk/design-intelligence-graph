# ADR-002 — Layered Ontology Classification

**Status:** Accepted  
**Date:** 2026-08-14

## Decision

DIG-002 stores ontology entities separately from DIG-001 capture evidence. Explicit HTML/ARIA mappings and deterministic relationships are L2. Composition-dependent page and UX-pattern interpretations are L3 and require a named method plus confidence below 1.

One source node may produce multiple entities because landmark, component and pattern roles are complementary. Viewport-specific entities remain distinct and inherit a Logical Element link only when DIG-001 produced a reliable cross-viewport match.

## Consequences

- semantic output remains explainable and reversible;
- ontology growth does not mutate raw capture truth;
- false cross-viewport semantic identity is avoided;
- downstream storage can represent the hierarchy as a graph without changing artifact semantics.
