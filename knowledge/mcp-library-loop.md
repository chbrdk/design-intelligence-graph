# MCP library loop (screens → prompt pack)

**Date:** 2026-08-17  
**Tool names:** `knowledge/paths.json` → `mcpLibraryTools`  
**Schema:** `schemas/mcp-library-tools.schema.json`

Agents should pick a measured screen, then copy its look + page arc — not invent glassmorphic defaults.

```text
dig_screen_search(style, layout, industry, platformProjectId)
  → [{ capture_run_id, title, design_facets }]
dig_capture_prompt_pack(capture_run_id, brief?)
  → DesignPromptPack (look_contract + page_rhythm)
dig_compose_brief(intent, reference_ids[] and/or capture_run_ids[])
  → composition brief (craft constraints + prompt_pack)
```

## Tools

| Tool | Role |
|------|------|
| `dig_screen_search` | Same Style/Layout/Industry filters as `GET /api/library/screens`, plus craft atoms. Facets first; when `q` is set, default `provider=dense` (cosine on `dense_embeddings` subject `screen`). `provider=hashing` keeps substring `q`. `provider=screenshot` ranks Stage C image vectors. Omits `package_path`. Live mode requires `platformProjectId`. Default limit 20 (lists up to 200 then slices). |
| `dig_capture_prompt_pack` | Same assembly as `POST /api/library/analyses/:capture_run_id/prompt-pack`. |
| `dig_compose_brief` | Merge references and/or capture runs into one builder-facing composition brief with `look_contract`, `page_rhythm`, `craft_constraints`, and a ready `prompt_pack`. |

`dig_reference_search` also accepts `style` / `layout` / `industry`. When any facet is set, results are limited to `capture_run_id`s from the screen list (empty list → no hits).

## Cursor

Cursor talks to **Coolify dig-api**, not a local Node process.

Remote URL: `coolify.digApiFqdn` + `cursorMcp.httpPath` (`/mcp`) — committed in `.cursor/mcp.json`.

Product BFF tools (`spirion.job_start`, library, generate, …): [`mcp-spirion.md`](mcp-spirion.md).

After deploy: Cursor Settings → Tools & MCP → refresh **spirion**. Test:

```text
dig_screen_search style=high-energy layout=full-bleed stacks
dig_capture_prompt_pack capture_run_id=<from search>
```

Stdio (`npm run mcp`) remains for local CLI. The old launcher `scripts/dig-mcp-cursor.ts` is a fallback HTTP client (`DIG_MCP_HTTP_CLIENT=1`) and is not what Cursor uses.

## Not in this slice

Cursor skill wrappers and a separate CHECKION-style `mcp-server/` Coolify app stay parked. Dense MCP rank ships in API code on `main`; it is live only after the next **dig-api** deploy (wait until capture `queued` + `capturing` = 0). Screenshot table is migration `013_screenshot_embeddings.sql`. Island Graph: [`similarity-graph.md`](similarity-graph.md).
