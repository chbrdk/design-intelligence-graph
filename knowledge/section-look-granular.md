# Granular section_look (2026-08-15)

## Goal

Section analyses should read like editorial design notes (Mobbin-depth), not one-line style echoes.

## Changes (`SECTION_LOOK_VERSION` 0.2.0)

| Lever | Before | After |
| --- | --- | --- |
| Max sections | 8 | 14 (`paths.json` / `DIG_LLM_SECTION_LOOK_MAX`) |
| Max tokens / section | stage default 700 | 1200 (`sectionLookMaxTokens` / `DIG_LLM_SECTION_LOOK_MAX_TOKENS`) |
| CSS evidence | ~16 props | layout/spacing/type extras (gap, padding, letter-spacing, flex, border, …) |
| Geometry | none | box + band (`above_fold`/`mid`/…) |
| Output | short look_summary | 3–5 sentences + `role_notes`, `spacing`, `layout`, `color_notes` |
| Index text | 800 chars | 1600 chars |

## Selection

Still diversifies categories, but allows a few same-signature bands and prefers multi-role stacks over bare `body`/`unknown`.

## Re-run

New captures pick this up automatically after dig-api deploy. Re-capture Porsche (or any site) to refresh Analyses.
