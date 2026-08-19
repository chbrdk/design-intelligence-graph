-- Stage C: multimodal screenshot embeddings (separate from hashing 384 and dense text 1024)
CREATE TABLE IF NOT EXISTS screenshot_embeddings (
  capture_run_id TEXT NOT NULL REFERENCES captures(capture_run_id) ON DELETE CASCADE,
  subject_kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  model TEXT NOT NULL,
  dims INT NOT NULL,
  media_path TEXT,
  canonical_sha256 TEXT NOT NULL,
  embedding vector(768) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (capture_run_id, subject_kind, subject_id, model)
);

CREATE INDEX IF NOT EXISTS idx_screenshot_embeddings_hnsw
  ON screenshot_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_screenshot_embeddings_capture
  ON screenshot_embeddings (capture_run_id);
