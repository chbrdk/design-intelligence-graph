-- SPIRION Welle 2 — assetKind + composition_contract on library captures
-- Spec: plexon specs/domain/spirion-campaign-motif-corpus.md

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS asset_kind TEXT NOT NULL DEFAULT 'web_screen';

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'web_capture';

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS source_id TEXT;

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS source_uri TEXT;

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS license_class TEXT NOT NULL DEFAULT 'studio_curated';

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS craft_eligible BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS enrichment_status TEXT NOT NULL DEFAULT 'ready';

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS format JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS composition_contract JSONB;

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS connector_policy_version TEXT;

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ;

-- Existing rows stay web_screen + craft-eligible (Welle 1 landing path).
UPDATE captures
SET asset_kind = COALESCE(NULLIF(TRIM(asset_kind), ''), 'web_screen'),
    source = COALESCE(NULLIF(TRIM(source), ''), 'web_capture'),
    license_class = COALESCE(NULLIF(TRIM(license_class), ''), 'studio_curated'),
    craft_eligible = COALESCE(craft_eligible, TRUE),
    enrichment_status = COALESCE(NULLIF(TRIM(enrichment_status), ''), 'ready')
WHERE TRUE;

ALTER TABLE captures
  DROP CONSTRAINT IF EXISTS captures_asset_kind_check;

ALTER TABLE captures
  ADD CONSTRAINT captures_asset_kind_check
  CHECK (asset_kind IN (
    'web_screen',
    'campaign_keyvisual',
    'social_post',
    'print_ad',
    'brand_system',
    'moodboard',
    'other_graphic'
  ));

ALTER TABLE captures
  DROP CONSTRAINT IF EXISTS captures_license_class_check;

ALTER TABLE captures
  ADD CONSTRAINT captures_license_class_check
  CHECK (license_class IN (
    'customer_owned',
    'studio_curated',
    'connector_tos',
    'unknown'
  ));

ALTER TABLE captures
  DROP CONSTRAINT IF EXISTS captures_enrichment_status_check;

ALTER TABLE captures
  ADD CONSTRAINT captures_enrichment_status_check
  CHECK (enrichment_status IN ('pending', 'ready', 'failed'));

CREATE INDEX IF NOT EXISTS captures_asset_kind_idx ON captures (asset_kind);
CREATE INDEX IF NOT EXISTS captures_craft_eligible_idx ON captures (craft_eligible) WHERE craft_eligible = TRUE;
CREATE INDEX IF NOT EXISTS captures_source_source_id_idx ON captures (source, source_id);
CREATE INDEX IF NOT EXISTS captures_content_hash_idx
  ON captures (content_hash)
  WHERE content_hash IS NOT NULL;
