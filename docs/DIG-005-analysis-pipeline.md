# DIG-005 — Analysis Pipeline

**Status:** Draft v0.1 — implemented  
**Layers:** L2 orchestration/findings; L3 semantic-input lineage  
**Upstream:** DIG-001–004  
**Downstream:** DIG-006 Storage, DIG-007 MCP, DIG-008 Generation

## Purpose

DIG-005 standardizes how derived analysis is run, reported, evaluated, and attributed. The pipeline does not overwrite raw evidence or convert absent model output into inference. It emits a manifest-bound `derived/analysis-report.json` with stage status, source artifacts, deterministic findings, inherited L3 semantic inputs, and a quality gate.

## Stages

The initial pipeline has deterministic derivation and quality evaluation stages, both complete when their inputs are present. Vision and LLM stages are represented even when unavailable: they MUST be `not_attempted` with a reason and MUST have zero output records. A configured future provider can add a versioned stage without changing the contract.

## Deterministic findings

The report provides L2, confidence-1 findings for cross-layer viewport coverage, responsive transformation count, and exact cross-viewport visual-token consistency. Each keeps its calculation inputs. The analysis quality gate passes at an aggregate capture quality of `0.8` or higher; this is an operational readiness threshold, not an aesthetic score.

## Semantic lineage

Existing L3 ontology and visual-language results are listed as `semantic_inputs`; they are not reclassified. Each reference retains its source, viewport, method, and bounded confidence. This lets downstream systems distinguish an analysis-derived metric from a semantic hypothesis.

## Boundaries

No vision or LLM is silently invoked. DIG-005 v0.1 does not store prompts, model outputs, embeddings, or human evaluations. Those need explicit provider, privacy, retention, and evaluation policies in a later version.

## Validation

`analysis-report.schema.json` defines the report. `dig-verify` rejects unknown pipeline versions, duplicate stage/finding identifiers, invalid stage counts, invalid L2/L3 contracts, and semantic inputs that do not resolve to a captured viewport.
