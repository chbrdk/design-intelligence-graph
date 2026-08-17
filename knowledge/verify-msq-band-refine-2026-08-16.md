# Live verify: vision band refine on MSQ

**Date:** 2026-08-16  
**Commit:** `e1e0b4e`  
**Job:** `job_20260816204225_a4cce541`  
**Capture:** `cap_fa473a7373d845d580511aadd070dbc0`  
**Deploy:** dig-api `g3ik4haeqz45a1fgqscp10es` → finished

## Checks

| Check | Result |
|-------|--------|
| `vision_layout_version` | `0.2.0` |
| First band `y=0` (nav in hero) | pass — `Hero with Navigation` |
| Gaps between bands | none |
| Micro legal band | gone (7 bands, footer to `y=1`) |
| Bad tile notes (`The tile…`) | absent |
| `vision_layout` / `vision_section` | complete |
| Cost | ~$0.0011 |

Note: `vision_page_ux` failed this run; page summary still usable from `vision_page`. Investigate separately if it recurs.
