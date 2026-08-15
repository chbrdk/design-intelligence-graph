# DIG-006 Implementation Status

DIG-006 Draft v0.1 is implemented as a portable graph index.

| Requirement | Implementation |
|---|---|
| Immutable source validation | indexer runs `dig-verify` first |
| Graph projection | nodes and typed edges from capture/derived artifacts |
| Lineage | source artifact hash, size, path and media type |
| Identity | existing site/page/run/viewport/ontology/logical IDs retained |
| Storage | standalone filesystem index and manifest |
| Local retrieval | deterministic node substring search |

Hosted relational/graph/object/vector adapters and cross-run entity resolution remain explicit future adapters.
