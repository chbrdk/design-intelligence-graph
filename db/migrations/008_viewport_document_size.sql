-- Document dimensions for full-page screenshot + hotspot normalization
ALTER TABLE viewports
  ADD COLUMN IF NOT EXISTS document_width INTEGER,
  ADD COLUMN IF NOT EXISTS document_height INTEGER;
