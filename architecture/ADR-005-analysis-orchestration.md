# ADR-005 — Explicit Analysis Stage Ledger

**Status:** Accepted  
**Date:** 2026-08-14

## Decision

Represent every DIG-005 stage, including unavailable AI stages, in a versioned report. Aggregate only deterministic results locally and carry prior L3 hypotheses as references rather than recomputing or inflating their confidence.

## Consequences

Consumers can tell which analysis actually ran and which inputs produced each conclusion. Future model providers can be introduced with explicit prompts, policy, and evaluation metadata instead of opaque side effects.
