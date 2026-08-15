# ADR-009 — Async Enrichment with Stage Cache and Tiered Models

**Status:** Accepted  
**Date:** 2026-08-15  
**Related:** DIG-009, [`knowledge/llm-scaling-mobbin.md`](../knowledge/llm-scaling-mobbin.md)

## Context

Blocking 5+ LLM calls inside the capture job prevents Mobbin-class throughput and couples ingest latency to provider rate limits. Free/dev models are unsuitable for volume; paid bulk models need caching and selective escalation.

## Decision

1. Detach LLM enrichment from the capture hot path into an enrichment queue.
2. Cache stage responses by `(stage_id, model, evidence_sha256)` on disk (and optionally Postgres).
3. Run bulk model first (`qwen/qwen3.7-flash` by default roles); escalate once to quality model (`openai/gpt-5.6-luna`) on parse failure or low mean confidence.
4. Keep DIG-001 packages valid without enrichment; LLM artifacts remain additive L3.

## Consequences

Capture jobs complete faster and survive provider outages. Repeat captures with identical stage evidence are free. Operators must monitor enrichment backlog separately from capture success.
