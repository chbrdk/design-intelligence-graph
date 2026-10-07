-- SPIRION campaign motif allowlist — public_domain license class
-- Spec: plexon specs/domain/spirion-campaign-motif-allowlist.md

ALTER TABLE captures
  DROP CONSTRAINT IF EXISTS captures_license_class_check;

ALTER TABLE captures
  ADD CONSTRAINT captures_license_class_check
  CHECK (license_class IN (
    'customer_owned',
    'studio_curated',
    'connector_tos',
    'public_domain',
    'unknown'
  ));
