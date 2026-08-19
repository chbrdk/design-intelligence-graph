-- Persist capture job queue across API restarts (Playwright OOM/crash recovery).
CREATE TABLE IF NOT EXISTS capture_jobs (
  job_id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (
    stage IN ('queued', 'capturing', 'analyzing', 'verifying', 'indexing', 'complete', 'failed', 'skipped')
  ),
  message TEXT NOT NULL DEFAULT '',
  error TEXT,
  queue_position INTEGER,
  platform_project_id TEXT,
  dig_project_id TEXT,
  ingest_source TEXT CHECK (ingest_source IN ('web', 'pinterest', 'upload') OR ingest_source IS NULL),
  pinterest_pin JSONB,
  upload_image JSONB,
  result JSONB,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capture_jobs_stage_queue
  ON capture_jobs (stage, queue_position NULLS LAST, created_at);

CREATE INDEX IF NOT EXISTS idx_capture_jobs_updated
  ON capture_jobs (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_capture_jobs_url
  ON capture_jobs (url);
