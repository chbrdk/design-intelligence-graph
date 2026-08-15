-- DIG Collection dig_projects + capture scope (DIG-013 P2 durable)
CREATE TABLE IF NOT EXISTS dig_projects (
  id TEXT PRIMARY KEY,
  platform_project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  domain TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  capability_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (capability_status IN ('in_sync', 'pending', 'error')),
  owner_plexon_user_id TEXT,
  platform_company_id TEXT,
  capture_count INTEGER NOT NULL DEFAULT 0,
  reference_count INTEGER NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS dig_projects_platform_project_id_unique
  ON dig_projects (platform_project_id);

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS dig_project_id TEXT REFERENCES dig_projects(id) ON DELETE SET NULL;

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS platform_project_id TEXT;

CREATE INDEX IF NOT EXISTS captures_platform_project_id_idx
  ON captures (platform_project_id);

CREATE INDEX IF NOT EXISTS captures_dig_project_id_idx
  ON captures (dig_project_id);
