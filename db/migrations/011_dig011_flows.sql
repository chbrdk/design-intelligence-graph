-- DIG-011 multi-screen flow storage
-- Spec: docs/DIG-011-phase-d-process.md · knowledge/dig-011-phase-d.md

CREATE TABLE IF NOT EXISTS dig_flows (
  flow_id TEXT PRIMARY KEY,
  app_scope_id TEXT NOT NULL,
  flow_session_id TEXT,
  title TEXT,
  notes TEXT,
  flow_schema_version TEXT NOT NULL DEFAULT '0.1.0',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dig_flows_app_scope_id_idx
  ON dig_flows (app_scope_id);

CREATE TABLE IF NOT EXISTS dig_flow_screens (
  flow_id TEXT NOT NULL REFERENCES dig_flows(flow_id) ON DELETE CASCADE,
  flow_screen_id TEXT NOT NULL,
  capture_run_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  checkion_scan_id TEXT,
  primary_url TEXT,
  PRIMARY KEY (flow_id, flow_screen_id)
);

CREATE INDEX IF NOT EXISTS dig_flow_screens_capture_run_id_idx
  ON dig_flow_screens (capture_run_id);

CREATE TABLE IF NOT EXISTS dig_flow_edges (
  flow_id TEXT NOT NULL REFERENCES dig_flows(flow_id) ON DELETE CASCADE,
  edge_id TEXT NOT NULL,
  from_screen_id TEXT NOT NULL,
  to_screen_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  PRIMARY KEY (flow_id, edge_id)
);

CREATE TABLE IF NOT EXISTS dig_flow_actions (
  flow_id TEXT NOT NULL REFERENCES dig_flows(flow_id) ON DELETE CASCADE,
  taxonomy_id TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  method TEXT NOT NULL,
  layer TEXT NOT NULL DEFAULT 'L2',
  PRIMARY KEY (flow_id, taxonomy_id)
);

CREATE INDEX IF NOT EXISTS dig_flow_actions_taxonomy_id_idx
  ON dig_flow_actions (taxonomy_id);
