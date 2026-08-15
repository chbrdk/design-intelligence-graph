# ADR-011 — Design Flow Graph Owned by DIG

**Status:** Accepted (spec only; implementation deferred)  
**Date:** 2026-08-15  
**Related:** DIG-011, [`knowledge/dig-checkion-boundary.md`](../knowledge/dig-checkion-boundary.md), [`knowledge/mobbin-user-flows.md`](../knowledge/mobbin-user-flows.md)

## Context

Mobbin-class libraries treat multi-screen **flows** as first-class, facet-searchable objects (ordered screens + transition hotspots + closed `flowActions`). DIG already captures single pages deeply and labels within-page `page_flow` sections. CHECKION owns domain crawl and WCAG scans; AUDION owns live journey exploration. Without an explicit ownership decision, DIG risks either (a) inventing a second spider/agent or (b) never indexing cross-screen design transitions.

## Decision

1. **DIG owns the design-flow graph** (Flow, FlowScreen, FlowTransition, closed `dig:flow.*` actions, hotspot geometry for Interactive Mode).
2. **CHECKION supplies URL discovery and optional per-step quality** — DIG MUST NOT implement a domain spider or WCAG magazine.
3. **AUDION / shared Journey Agent supplies live walks** — DIG MAY import step lists; DIG MUST NOT embed a Journey Agent UI or soft-fork the agent runtime.
4. **`page_flow` stays within-page section order** — never overloaded as a multi-screen Flow.
5. **Truth layers:** recognize/measure edges as L1/L2; `flow_actions` titles as L3 with method + confidence.
6. **Ship spec + schemas before runtime** — Phase A–D contracts and JSON Schemas land before capture/index code.

## Consequences

- Implementation follows DIG-011 waves; consumers can validate artifacts against schemas early.
- Cross-product correlation uses existing AUDION→CHECKION single-scan handoff patterns for quality-on-step.
- Library/MCP gain flow-shaped retrieval later without redesigning DIG-001 packages.
