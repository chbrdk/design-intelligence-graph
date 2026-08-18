# SPIRION MCP (CHECKION-parity)

**Date:** 2026-08-17  
**Prefix:** `knowledge/paths.json` → `mcpSpirion.prefix` (`spirion.`)  
**Transport:** same as library loop — `POST {coolify.digApiFqdn}/mcp`  
**CHECKION analog:** `checkionV3.localClone` `mcp-server/` (`checkion_v3.*` over Bearer HTTP)

Product tools live **in-process** on dig-api (not a separate Coolify MCP app). Cursor already talks to `/mcp`. `dig_*` names stay as aliases so existing sessions keep working.

## Tools

| Area | Tools |
|------|--------|
| Health | `spirion.health` |
| Capture jobs | `jobs_list`, `job_start`, `job_get` |
| Enrichment | `enrichment_list`, `enrichment_get` |
| Library | `captures_list`, `analyses_list`, `analysis_get`, `screens_search`, `capture_prompt_pack` |
| References | `references_search`, `reference_get`, `reference_pack`, `compose_brief`, `generate` |
| Flows | `flows_search`, `flow_get`, `flow_neighbors` |

`screens_search` / `capture_prompt_pack` / references / flows are aliases of the matching `dig_*` tools.

Jobs and enrichment require the HTTP process (`setDigApiRuntime`). Stdio `npm run mcp` with only a graph file returns a clear error for those tools.

MCP responses omit `package_path` / `package_root` / `index_root`.

## Auth vs CHECKION

CHECKION MCP is a **separate** process that stores `CHECKION_API_TOKEN` and Bearer-calls the BFF. SPIRION MCP **is** the BFF, so there is no second hop. Live library/generate still use `DIG_API_TOKEN` on HTTP `/api/*`; `/mcp` stays reachable for Cursor without a client Bearer (same as before this slice).

A split `mcp-server/` proxy (CHECKION Dockerfile + server-side Bearer) stays parked.

## Agent loop

```text
spirion.job_start url=… platformProjectId=…
  → poll spirion.job_get
spirion.captures_list / spirion.screens_search
  → spirion.capture_prompt_pack
spirion.references_search / spirion.compose_brief
spirion.generate | spirion.reference_pack
```
