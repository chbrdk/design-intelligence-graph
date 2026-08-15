-- DIG-012 Wave 2 — indexed DesignReferences (Collection-scoped)
CREATE TABLE IF NOT EXISTS design_references (
  reference_id TEXT PRIMARY KEY,
  capture_run_id TEXT NOT NULL REFERENCES captures(capture_run_id) ON DELETE CASCADE,
  dig_project_id TEXT REFERENCES dig_projects(id) ON DELETE SET NULL,
  platform_project_id TEXT,
  category TEXT,
  signature TEXT,
  look_summary TEXT,
  style_labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS design_references_capture_run_id_idx
  ON design_references (capture_run_id);

CREATE INDEX IF NOT EXISTS design_references_platform_project_id_idx
  ON design_references (platform_project_id);

CREATE INDEX IF NOT EXISTS design_references_category_idx
  ON design_references (category);

CREATE INDEX IF NOT EXISTS design_references_signature_idx
  ON design_references (signature);
