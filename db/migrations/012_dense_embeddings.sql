-- Stage B: semantic dense embeddings (separate from hashing vector(384))
CREATE TABLE IF NOT EXISTS dense_embeddings (
  capture_run_id TEXT NOT NULL REFERENCES captures(capture_run_id) ON DELETE CASCADE,
  subject_kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  model TEXT NOT NULL,
  dims INT NOT NULL,
  content_text TEXT NOT NULL,
  canonical_sha256 TEXT NOT NULL,
  embedding vector(1024) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (capture_run_id, subject_kind, subject_id, model)
);

CREATE INDEX IF NOT EXISTS idx_dense_embeddings_hnsw
  ON dense_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_dense_embeddings_capture
  ON dense_embeddings (capture_run_id);

CREATE INDEX IF NOT EXISTS idx_dense_embeddings_kind
  ON dense_embeddings (subject_kind);
