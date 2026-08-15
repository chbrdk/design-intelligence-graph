# ADR-006 — Portable Graph Projection Before Database Adapters

**Status:** Accepted  
**Date:** 2026-08-14

## Decision

Use a verified filesystem graph index as the first DIG-006 backend. Preserve source IDs and artifact hashes, and do not duplicate raw capture payloads.

## Consequences

The graph can be tested and transferred without services. Database and vector adapters can be added later as projections rather than becoming semantic sources of truth.
