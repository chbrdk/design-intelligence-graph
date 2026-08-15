# ADR-012 — DesignReference as the agent retrieval unit

**Status:** Accepted (spec only; implementation deferred)  
**Date:** 2026-08-15  
**Related:** DIG-012, [`knowledge/dig-011-challenge.md`](../knowledge/dig-011-challenge.md)

## Context

DIG captures rich L2/L3 design knowledge (recipes, section look, visual language) but agents primarily retrieve taxonomy neighbors (`dig_recommend`) and generate structural layout specs (DIG-008) without look conditioning. DIG-011 flows optimize library journeys, not individualized generation.

## Decision

1. Introduce **DesignReference** as the primary portable retrieval unit for design agents.  
2. Prefer implementing `dig_reference_*` MCP/Library APIs **before** DIG-011 runtime and Flows UI.  
3. Keep DIG-011 `flow_context` optional on references.  
4. Extend DIG-008 later with `look_conditioned` synthesis that cites reference_ids and never copies source copy/assets.

## Consequences

Agent prompts and future generation can be grounded in compositional individuality. Indexing must emit compact bundles (≤4 KB target) from existing enrichment, not new capture passes.
