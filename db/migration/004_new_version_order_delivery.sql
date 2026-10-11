-- Anjaan Musafir Books — New Version Batch 05
-- Additive, candidate-only migration for My Order + download-token tracking.
-- Do NOT apply to production D1. Review current schema and use a separate staging D1.
-- Existing orders, payments, downloads, coupons, and products are not altered.

CREATE TABLE IF NOT EXISTS nv_download_tokens (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  product_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  download_limit INTEGER NOT NULL DEFAULT 3 CHECK (download_limit > 0),
  download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  last_download_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_nv_download_tokens_order_email
  ON nv_download_tokens(order_id, email_normalized);

CREATE INDEX IF NOT EXISTS idx_nv_download_tokens_expiry
  ON nv_download_tokens(expires_at);

CREATE TABLE IF NOT EXISTS nv_order_lookup_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_normalized TEXT NOT NULL,
  order_id_hash TEXT NOT NULL,
  attempted_at INTEGER NOT NULL,
  succeeded INTEGER NOT NULL DEFAULT 0 CHECK (succeeded IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_nv_order_lookup_email_time
  ON nv_order_lookup_attempts(email_normalized, attempted_at);
