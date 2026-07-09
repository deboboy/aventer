-- Beta user authentication

CREATE TABLE IF NOT EXISTS beta_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS beta_users_username_idx ON beta_users (username);

-- Insert default admin user (password: changeme123)
-- Hash generated with bcrypt rounds=10
INSERT INTO beta_users (id, username, password_hash, is_admin)
VALUES (
  'usr_admin_default',
  'admin',
  '$2b$10$kRXssyCnX4TMOcKPpJX2oO/iNO1rk2yWk.0hlIgHecp.xMcsQEit.',
  true
)
ON CONFLICT (username) DO NOTHING;
