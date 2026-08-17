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
```

## Tools

| Tool | Role |
|------|------|
| `dig_screen_search` | Same Style/Layout/Industry filters as `GET /api/library/screens`. Omits `package_path`. Live mode requires `platformProjectId`. Default limit 20 (lists up to 200 then slices). |
| `dig_capture_prompt_pack` | Same assembly as `POST /api/library/analyses/:capture_run_id/prompt-pack`. |

`dig_reference_search` also accepts `style` / `layout` / `industry`. When any facet is set, results are limited to `capture_run_id`s from the screen list (empty list → no hits).

## Not in this slice

Dense embeddings, screenshot embeddings, and Cursor skill wrappers stay parked.
