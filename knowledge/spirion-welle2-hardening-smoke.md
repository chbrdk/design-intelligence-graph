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

## Staging probe (live dig-api, pre-deploy of this hardening)

| Check | Result |
|-------|--------|
| `GET /api/health` | ok · `dig-api` |
| MCP `initialize` | `serverInfo.name=spirion` |
| `spirion.captures_list` / `assets_list` `assetKind=other_graphic` + `craftEligible=true` | ≥1 ready graphic upload |
| `spirion.capture_prompt_pack` `output_contract=graphic` on `cap_1e70fd5a…` | `composition_contract` + `graphic_craft_brief` present |
| plexon `campaign_motif_ref_v1` unit | `__tests__/creation-craft-modules.test.ts` 23/23 green |
| PATCH craft review + content-hash skip | **needs deploy** of this branch + migration `016` |

After Coolify deploy: re-run checklist steps 2, 6, 7 with `DIG_API_TOKEN`.
