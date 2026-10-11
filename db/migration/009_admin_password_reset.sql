-- Additive candidate-only password recovery tables. Apply only to isolated staging D1.
CREATE TABLE IF NOT EXISTS nv_password_reset_tokens (
  token_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES admin_users(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_nv_password_reset_user_created
  ON nv_password_reset_tokens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nv_password_reset_expiry
  ON nv_password_reset_tokens(expires_at, used_at);

CREATE TABLE IF NOT EXISTS nv_password_reset_requests (
  request_id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_hash TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('REQUESTED','SENT','SKIPPED','FAILED','COMPLETED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_nv_password_reset_requests_email_time
  ON nv_password_reset_requests(email_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nv_password_reset_requests_time
  ON nv_password_reset_requests(created_at DESC);

INSERT OR IGNORE INTO schema_migrations(version, description)
VALUES ('009_admin_password_reset', 'Add expiring one-time admin password reset tokens and privacy-preserving rate tracking');
