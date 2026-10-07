-- SPIRION Welle 2 — craft review allowlist audit fields (D3)
-- Spec: plexon specs/domain/spirion-campaign-motif-corpus.md

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS craft_reviewed_at TIMESTAMPTZ;

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS craft_review_note TEXT;
