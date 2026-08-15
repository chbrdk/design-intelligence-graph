# DIG-012 Wave 2 — DesignReference Library + MCP

**Date:** 2026-08-15

## APIs

| Method | Path |
|--------|------|
| GET | `/api/library/references?q=&category=&signature=&style_label=&platformProjectId=&limit=` |
| GET | `/api/library/references/:reference_id?platformProjectId=` |
| POST | `/api/library/references/pack` body `{ intent, reference_ids, synthesis_mode?, platformProjectId? }` |

## MCP tools

`dig_reference_search` · `dig_reference_get` · `dig_reference_pack` (via `callDigReferenceTool`)

## Storage

`design_references` table (migration `010`) — filled on index after `derived/design-references.jsonl` emit.

## Tenancy

When `DIG_FEDERATION_MODE=live`, `platformProjectId` is **required** on search/get/pack.
