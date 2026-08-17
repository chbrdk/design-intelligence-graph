# DIG-007 — MCP API

**Status:** Draft v0.1 — implemented  
**Upstream:** DIG-006 Storage  
**Downstream:** DIG-008 Generation

## Purpose

DIG-007 exposes the portable DIG-006 graph to design agents over JSON-RPC stdio using MCP core methods: `initialize`, `tools/list`, and `tools/call`. It is read-only and source-lineage preserving.

## Start

Stdio (local CLI):

```bash
npm run mcp -- indexes/<capture-run-id>/graph.json
```

Streamable HTTP (Coolify dig-api, what Cursor uses): `POST {coolify.digApiFqdn}/mcp` — see [`knowledge/mcp-library-loop.md`](../knowledge/mcp-library-loop.md).

## Tools

- `dig_search` — deterministic substring search, optionally filtered by node type.
- `dig_inspect` — node and incident typed edges.
- `dig_neighbors` — direct bounded graph traversal, optionally by edge type.
- `dig_compare` — type/property differences and shared direct neighbors.
- `dig_recommend` — deterministic candidates with the same taxonomy ID, otherwise node type.

Every result retains graph node IDs and source capture-run identity. Recommendations are not AI-ranked and make their strategy explicit.

## Boundaries and validation

The server makes no external calls, does not modify the index, and does not expose raw capture bytes. It accepts only a DIG-006 `0.1.0` graph. Authentication, multi-index routing, pagination cursors, semantic/vector retrieval, remote transport, and write tools remain later extensions. `mcp-tools.schema.json` fixes the initial tool names and contract.
