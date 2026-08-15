# DIG-011 Phase D — Library, Interactive Mode & MCP contracts

**Parent:** [DIG-011 Phase D](DIG-011-phase-d-process.md)  
**Status:** Draft v0.1 — **specified, not implemented**  
**Fixtures:** `fixtures/flows/api/`  
**Schemas:** `schemas/flow-library-*.schema.json`, `flow-interactive.schema.json`, `mcp-flow-*.schema.json`

## Namespace decision (normative)

| Path | Meaning |
|------|---------|
| `GET /api/library/page-flows` | Existing **within-page** `page_flow` LLM items (today’s `/flows` MUST move here) |
| `GET /api/library/flows` | DIG-011 multi-screen Flows |
| `GET /api/library/flows/:flow_id` | Flow detail = assembled graph + media hints |
| `GET /api/library/flows/:flow_id/interactive` | Playback steps for hotspot UI |

Until implementation, today’s `GET …/flows` remains page_flow-only; clients MUST NOT assume DIG-011 semantics.

Query params for list:

- `flow_action` — `dig:flow.*` id or label substring  
- `app_scope_id` — exact  
- `q` — title/notes substring  
- `limit` — default 20, max 50  

## Response shapes

### List — `flow-library-list.schema.json`

```json
{
  "schema_version": "0.1.0",
  "items": [
    {
      "flow_id": "flow_…",
      "app_scope_id": "app_…",
      "title": "…",
      "flow_action_ids": ["dig:flow.logging_in"],
      "screen_count": 2,
      "edge_count": 1,
      "preview_screen_id": "fs_home",
      "preview_url": null
    }
  ]
}
```

### Detail — `flow-library-detail.schema.json`

Wraps a full `flow-graph` object plus optional `media` map keyed by `flow_screen_id` (`primary_image_path` relative to captures/indexes — opaque string for now).

### Interactive — `flow-interactive.schema.json`

Mobbin-like step walk:

```json
{
  "schema_version": "0.1.0",
  "flow_id": "flow_…",
  "start_screen_id": "fs_home",
  "steps": [
    {
      "flow_screen_id": "fs_home",
      "order": 0,
      "primary_url": "https://…",
      "image_ref": null,
      "hotspots": [
        {
          "edge_id": "fe_…",
          "to_screen_id": "fs_login",
          "box": { "x": 0, "y": 0, "width": 1, "height": 1, "space": "normalized" }
        }
      ]
    }
  ]
}
```

Rules:

1. Every outgoing edge with a hotspot SHOULD appear on the from-step.  
2. Edges without hotspot MAY expose `advance_anywhere: true` on the step (Mobbin fallback).  
3. Boxes SHOULD be normalized 0–1 against document (or viewport if document unknown); `space: "normalized"`.  
4. Interactive Mode MUST NOT trigger live navigation — media is pre-captured only.

## MCP tools

| Tool | Input | Output |
|------|-------|--------|
| `dig_flow_search` | action / app / query / limit | list envelope |
| `dig_flow_get` | `flow_id` | detail envelope |
| `dig_flow_neighbors` | `flow_id`, `flow_screen_id`, direction | `{ inbound[], outbound[] }` |

Tool descriptors: [`schemas/mcp-flow-tools.schema.json`](../schemas/mcp-flow-tools.schema.json)  
Neighbor payload: [`schemas/mcp-flow-neighbors.schema.json`](../schemas/mcp-flow-neighbors.schema.json)

No write/activate tools.

## Postgres draft

See [`db/migrations/draft/009_dig011_flows.sql`](../db/migrations/draft/009_dig011_flows.sql) — **not** applied by `npm run db:migrate` until implementation wave.

## CHECKION correlation (read model only)

Detail/interactive MAY include `checkion_scan_id` per screen. UI opens CHECKION result URLs using `paths.json` → `checkionV3.stagingWeb` / env — DIG does not proxy issue bodies in v0.1 contract.

## Acceptance (fixtures now)

- `fixtures/flows/api/*` validate against schemas.  
- Interactive steps for `login-href-join` expose exactly one hotspot to `fs_login`.  
- List item for login scenario includes `dig:flow.logging_in`.
