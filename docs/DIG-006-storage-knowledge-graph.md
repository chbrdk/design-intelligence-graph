# DIG-006 — Storage & Knowledge Graph

**Status:** Draft v0.1 — implemented  
**Upstream:** DIG-001–005  
**Downstream:** DIG-007 MCP, DIG-008 Generation

## Purpose

DIG-006 projects a verified immutable capture package into a portable knowledge graph. The initial storage backend is a filesystem index: it is inspectable, content-lineage preserving, and intentionally independent of a hosted graph, relational, vector, or object database.

## Indexing

`dig-index <capture-package> --output indexes` verifies the source package before writing `graph.json` and an index manifest. The graph has stable nodes for site, page, capture run, viewport, ontology entity, logical element, analysis finding, and semantic hypothesis. Edges preserve capture observation, containment, ontology relations, logical instantiation, analysis and semantic lineage.

All source artifact paths, hashes, byte counts, and media types are copied into the graph lineage. Raw artifact bytes are not duplicated; the capture package remains object storage and source of truth.

## Boundaries

The file index is the canonical portable projection, not a production database prescription. It does not generate embeddings, perform semantic similarity, mutate source packages, or merge identities across different capture runs. Those adapters belong to later storage backends and must preserve this node/edge/lineage contract.

## Validation

The source package MUST pass `dig-verify` before indexing. `knowledge-graph.schema.json` defines the index shape. In-memory search is deterministic substring matching over graph nodes and exists for testing/local inspection only; DIG-007 defines the remote retrieval interface.
