-- DIG-009 async enrichment queue + LLM stage cache
CREATE TABLE IF NOT EXISTS enrichment_jobs (
  enrichment_job_id TEXT PRIMARY KEY,
  capture_run_id TEXT NOT NULL REFERENCES captures(capture_run_id) ON DELETE CASCADE,
  package_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'complete', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  bulk_model TEXT,
  quality_model TEXT,
  error TEXT,
  llm_status TEXT,
  hypothesis_count INTEGER,
  design_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_status ON enrichment_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_capture ON enrichment_jobs (capture_run_id);

CREATE TABLE IF NOT EXISTS llm_stage_cache (
  id BIGSERIAL PRIMARY KEY,
  stage_id TEXT NOT NULL,
  model TEXT NOT NULL,
  evidence_sha256 TEXT NOT NULL,
  raw_response TEXT NOT NULL,
  parsed_json JSONB,
  status TEXT NOT NULL DEFAULT 'complete',
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stage_id, model, evidence_sha256)
);

CREATE INDEX IF NOT EXISTS idx_llm_stage_cache_lookup ON llm_stage_cache (stage_id, model, evidence_sha256);
