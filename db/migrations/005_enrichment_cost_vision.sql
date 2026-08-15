-- DIG-009 v0.2: cost telemetry + vision status on enrichment jobs
ALTER TABLE enrichment_jobs
  ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS completion_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_usd DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS vision_status TEXT,
  ADD COLUMN IF NOT EXISTS cost_json JSONB;

ALTER TABLE llm_stage_cache
  ADD COLUMN IF NOT EXISTS estimated_usd DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS usage_json JSONB;
