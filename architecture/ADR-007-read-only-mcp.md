# ADR-007 — Read-only MCP Over a Portable Graph

**Status:** Accepted  
**Date:** 2026-08-14

## Decision

Expose DIG-006 through a dependency-free JSON-RPC stdio MCP server before adding remote transport or mutation tools.

## Consequences

Agents can retrieve inspectable design evidence locally with stable IDs. Operational concerns such as authorization and multi-tenant routing remain outside the initial contract.
