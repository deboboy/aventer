-- Subscribers and outbound delivery queue

CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  event_types TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscribers_project_idx ON subscribers (project_id);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  subscriber_id TEXT NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'retry', 'delivered', 'dlq')),
  attempt_count INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  last_status_code INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  UNIQUE (event_id, subscriber_id)
);

CREATE INDEX IF NOT EXISTS deliveries_due_idx
  ON deliveries (next_attempt_at)
  WHERE status IN ('pending', 'retry');

CREATE INDEX IF NOT EXISTS deliveries_project_status_idx
  ON deliveries (project_id, status, created_at DESC);
