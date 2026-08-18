# MCP craft composition

**Date:** 2026-08-18  
**Tool:** `knowledge/paths.json` -> `mcpLibraryTools.composeBrief` (`dig_compose_brief`)  
**HTTP:** `knowledge/paths.json` -> `lookContract.composeBriefPath` (`/api/library/references/compose-brief`)

## Why

Single-screen rebuild prose is useful for faithful recreation, but the product direction is broader: an external builder LLM should be able to ask for a visual intent like "minimal monochrome real-estate, large type, few images" and then retrieve, filter, and compose matching modules.

## Searchable craft atoms

Screen and reference retrieval now expose normalized craft filters in addition to `style`, `layout`, and `industry`:

- `imagery_density`: `none | low | medium | high`
- `type_scale`: `small | medium | large | monumental`
- `type_image_mode`: `separate | adjacent | overlap | through_image`
- `contrast_mode`: `monochrome | low_contrast | mixed | saturated`
- `composition_energy`: `calm | balanced | dynamic`
- `chrome_weight`: `minimal | balanced | interface_heavy`
- `craft_tags[]`: normalized cues like `editorial_type`, `stats_column`, `inverted_card`, `grayscale_reprise`, `low_imagery`, `type_over_image`

These are derived from existing `vision_page`, `visual_craft`, section look summaries, and indexed reference payloads. They are intended for retrieval and ranking, not human prose.

## MCP loop

```text
dig_screen_search(q/style/layout/industry/craft...)
  -> screen candidates
dig_reference_search(category/craft...)
  -> section candidates
dig_compose_brief(intent, reference_ids[] and/or capture_run_ids[])
  -> composition brief + prompt_pack
```

## `dig_compose_brief`

Input:

- `intent` (required)
- `reference_ids[]` and/or `capture_run_ids[]`
- optional `primary_screen_id`
- optional `brief`
- optional `output_contract`

Output:

- cited `references`
- `module_blueprint[]`
- merged `craft_constraints[]`
- `look_contract`
- `page_rhythm`
- builder-ready `prompt_pack`

Use this when the caller wants to **mix** modules and craft from multiple captures. Use `dig_capture_prompt_pack` when the caller wants to stay anchored to a single capture.
