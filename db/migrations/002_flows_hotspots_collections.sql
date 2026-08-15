-- Flows / hotspots / collections (Phase E)
ALTER TABLE sections
  ADD COLUMN IF NOT EXISTS root_box JSONB,
  ADD COLUMN IF NOT EXISTS viewport_width INTEGER,
  ADD COLUMN IF NOT EXISTS viewport_height INTEGER;

CREATE INDEX IF NOT EXISTS idx_llm_items_flow
  ON llm_items (capture_run_id, kind, step_index);

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collection_captures (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  capture_run_id TEXT NOT NULL REFERENCES captures(capture_run_id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collection_id, capture_run_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_captures_capture
  ON collection_captures (capture_run_id);
