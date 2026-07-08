-- Aventer initial schema

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  spec_version TEXT NOT NULL,
  type TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  context JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_project_received_idx
  ON events (project_id, received_at DESC);

INSERT INTO projects (id, name)
VALUES ('proj_beta_default', 'Beta')
ON CONFLICT (id) DO NOTHING;
