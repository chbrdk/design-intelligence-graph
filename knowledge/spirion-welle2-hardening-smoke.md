# SPIRION Welle 2 hardening — staging smoke

**Date:** 2026-10-07  
**API:** `https://spirion-api.projects-a.plygrnd.tech` · MCP `POST /mcp`  
**Related:** `knowledge/image-ingest.md` · `knowledge/dribbble-connector.md` · plexon `knowledge/spirion-campaign-motif-corpus.md`

## Preflight

- [ ] dig-api healthy; migration `016_craft_review.sql` applied
- [ ] `DIG_API_TOKEN` available for destructive routes
- [ ] plexon `SPIRION_MCP_URL=https://spirion-api.projects-a.plygrnd.tech/mcp`

## Checklist

1. **Upload graphics** — `POST /api/jobs/images` multipart (≥1, ideally ≥20) with `assetKind=campaign_keyvisual`
2. **Idempotency** — re-upload same bytes → `queued: 0`, `skipped_existing_hash ≥ 1`, no second enrich job
3. **Enrich** — poll until `enrichment_status=ready` and `composition_contract` present
4. **MCP list** — `spirion.assets_list` / `captures_list` with `assetKind=campaign_keyvisual`
5. **MCP pack** — `spirion.capture_prompt_pack` with `output_contract=graphic` (or `auto`) → composition + avoid
6. **Craft review** — for a connector/`craftEligible=false` row:
   `PATCH /api/library/captures/:id` `{ "craftEligible": true, "reviewNote": "smoke" }`
   then list `?craftEligible=true` includes it
7. **HTTP compose-brief** — `POST /api/library/references/compose-brief` with `output_contract: auto` on graphic anchor → resolved `graphic`
8. **Plexon** — prompt „Key Visual Kampagne“ attaches `campaign_motif_ref_v1`; landing without campaign wording stays `spirion_section_ref_v1`

## Local gate (this PR)

```bash
node --import tsx --test \
  test/craft-review.test.ts \
  test/image-ingest-dedupe.test.ts \
  test/compose-brief.test.ts \
  test/composition-contract.test.ts
```

**Result 2026-10-07:** local unit gate green.

## Staging probe

**Deploy:** Coolify `dig-v3:api` (`fjlcya8d9jnlecj4s44yru4q`) · commit `720a907` · status finished/healthy · logs `Applied migrations: 016_craft_review.sql`

| Check | Result |
|-------|--------|
| `GET /api/health` | ok · `dig-api` |
| MCP `assets_list` graphic + `craftEligible` | ≥1 |
| `spirion.capture_prompt_pack` `output_contract=graphic` | `composition_contract` + `graphic_craft_brief` |
| plexon `campaign_motif_ref_v1` unit | 23/23 green |
| `PATCH /api/library/captures/cap_1e70fd5a…` | **200** · `craftEligible=true` · note set · listed in `craftEligible=true` |
| Re-upload same PNG bytes | **queued=0** · `skipped_existing_hash=1` · existing `capture_run_id` returned |
| Unauthorized PATCH | **401** (gate intact) |

Operator date: 2026-10-07.
