-- Candidate-only, additive email activity ledger.
-- Apply after migrations 001-006 to an isolated staging D1 database only.
-- Do not store email bodies, API keys, or raw provider responses.
CREATE TABLE IF NOT EXISTS nv_email_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT,
  recipient_email TEXT,
  event_type TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'BREVO',
  status TEXT NOT NULL CHECK (status IN ('ACCEPTED', 'FAILED', 'SKIPPED_CONFIGURATION')),
  http_status INTEGER,
  provider_message_id TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_nv_email_events_created
  ON nv_email_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nv_email_events_order
  ON nv_email_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nv_email_events_status_created
  ON nv_email_events(status, created_at DESC);
