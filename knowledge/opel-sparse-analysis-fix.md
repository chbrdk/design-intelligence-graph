# Opel sparse analysis / bare-body commerce (2026-08-16)

## Symptom

Library detail for `https://www.opel.de/` showed empty analysis / section_look, then a rescan stuck on “Waiting for enrichment…” while the job stayed `running` with a frozen `updated_at`.

## Causes

1. Library UI did not poll enrichment long enough and mishandled empty page narrative while pending.
2. Catalog `inventory_status` matched bare `body` recipes as commerce.
3. Enrichment had no heartbeat and did not reclaim stale `running` rows after hang/redeploy.

## Fixes

- Library polls enrichment (~8 min) and shows job status.
- Bare-body catalog commerce/feedback/social_proof require text cues.
- Enrichment heartbeat (30s) + reclaim running jobs older than 4 minutes.

## Verify

Re-open Opel in Library after dig-api redeploy; enrichment should reclaim and complete, then summary + section_look appear.
