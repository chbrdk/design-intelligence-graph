-- DIG library schema v1 (metadata only; blobs stay on disk)
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS captures (
  capture_run_id TEXT PRIMARY KEY,
  package_path TEXT NOT NULL,
  requested_url TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  status TEXT NOT NULL,
  site_domain TEXT,
  page_route TEXT,
  quality_overall DOUBLE PRECISION,
  quality_rating TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS viewports (
  id BIGSERIAL PRIMARY KEY,
  capture_run_id TEXT NOT NULL REFERENCES captures(capture_run_id) ON DELETE CASCADE,
  viewport_capture_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  node_count INTEGER,
  title TEXT,
  settled_screenshot_path TEXT,
  full_page_screenshot_path TEXT,
  UNIQUE (capture_run_id, viewport_capture_id)
);

CREATE TABLE IF NOT EXISTS sections (
  id BIGSERIAL PRIMARY KEY,
  capture_run_id TEXT NOT NULL REFERENCES captures(capture_run_id) ON DELETE CASCADE,
  viewport_capture_id TEXT NOT NULL,
  viewport_name TEXT NOT NULL,
  section_id TEXT NOT NULL,
  root_node_id TEXT,
  taxonomy_id TEXT NOT NULL,
  category TEXT NOT NULL,
  signature TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  method TEXT,
  recipe JSONB NOT NULL DEFAULT '[]'::jsonb,
  text_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (capture_run_id, section_id)
);

CREATE TABLE IF NOT EXISTS llm_analyses (
  capture_run_id TEXT PRIMARY KEY REFERENCES captures(capture_run_id) ON DELETE CASCADE,
  model TEXT,
  base_url TEXT,
  status TEXT NOT NULL,
  analysis_mode TEXT,
  design_summary TEXT,
  hypothesis_count INTEGER NOT NULL DEFAULT 0,
  raw_response_sha256 TEXT,
  generated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS llm_items (
  id BIGSERIAL PRIMARY KEY,
  capture_run_id TEXT NOT NULL REFERENCES captures(capture_run_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('screen_pattern', 'ui_element', 'recipe_insight', 'page_flow')),
  name TEXT,
  signature TEXT,
  category TEXT,
  interpretation TEXT,
  section_label TEXT,
  step_index INTEGER,
  confidence DOUBLE PRECISION,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  gaps JSONB
);

CREATE INDEX IF NOT EXISTS idx_sections_category ON sections (category);
CREATE INDEX IF NOT EXISTS idx_sections_signature ON sections (signature);
CREATE INDEX IF NOT EXISTS idx_llm_items_kind ON llm_items (kind);
CREATE INDEX IF NOT EXISTS idx_viewports_capture ON viewports (capture_run_id);

CREATE TABLE IF NOT EXISTS artifacts (
  id BIGSERIAL PRIMARY KEY,
  capture_run_id TEXT NOT NULL REFERENCES captures(capture_run_id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes BIGINT NOT NULL,
  media_type TEXT NOT NULL,
  UNIQUE (capture_run_id, path)
);

-- Reserved for later vector phase (no pgvector required yet)
CREATE TABLE IF NOT EXISTS embeddings (
  id BIGSERIAL PRIMARY KEY,
  capture_run_id TEXT NOT NULL REFERENCES captures(capture_run_id) ON DELETE CASCADE,
  subject_kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  model TEXT,
  dims INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (capture_run_id, subject_kind, subject_id)
);
