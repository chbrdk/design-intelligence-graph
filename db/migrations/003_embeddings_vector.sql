-- Phase F: pgvector embeddings + ontology design_nodes
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE embeddings
  ADD COLUMN IF NOT EXISTS content_text TEXT,
  ADD COLUMN IF NOT EXISTS embedding vector(384);

CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw
  ON embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS design_nodes (
  id BIGSERIAL PRIMARY KEY,
  capture_run_id TEXT NOT NULL REFERENCES captures(capture_run_id) ON DELETE CASCADE,
  viewport_capture_id TEXT,
  ontology_entity_id TEXT NOT NULL,
  node_id TEXT,
  taxonomy_id TEXT NOT NULL,
  label TEXT NOT NULL,
  entity_type TEXT,
  text_preview TEXT,
  confidence DOUBLE PRECISION,
  box JSONB,
  UNIQUE (capture_run_id, ontology_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_design_nodes_taxonomy ON design_nodes (taxonomy_id);
CREATE INDEX IF NOT EXISTS idx_design_nodes_capture ON design_nodes (capture_run_id);
CREATE INDEX IF NOT EXISTS idx_design_nodes_label ON design_nodes (LOWER(label));
