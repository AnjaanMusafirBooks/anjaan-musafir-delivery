-- Additive checkout lifecycle telemetry. Customer email is stored only as a SHA-256 hash.
CREATE TABLE IF NOT EXISTS nv_checkout_events (
  event_id TEXT PRIMARY KEY,
  attempt_id TEXT,
  order_id TEXT,
  product_id TEXT,
  customer_email_hash TEXT,
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  error_code TEXT,
  http_status INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_nv_checkout_events_attempt_time ON nv_checkout_events(attempt_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nv_checkout_events_order_time ON nv_checkout_events(order_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nv_checkout_events_type_time ON nv_checkout_events(event_type,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nv_checkout_events_product_time ON nv_checkout_events(product_id,created_at DESC);
INSERT OR IGNORE INTO admin_role_permissions(role,permission_key,allowed) VALUES
 ('ADMINISTRATOR','checkout_events.read',1),
 ('OPERATIONS_MANAGER','checkout_events.read',1),
 ('ANALYST','checkout_events.read',1),
 ('TECHNICAL_SUPPORT','checkout_events.read',1),
 ('CUSTOMER_SUPPORT','checkout_events.read',0),
 ('PRODUCT_MANAGER','checkout_events.read',0),
 ('MARKETING_MANAGER','checkout_events.read',0),
 ('CONTENT_EDITOR','checkout_events.read',0);
INSERT OR IGNORE INTO schema_migrations(version,description)
VALUES ('015_checkout_event_tracking','Add privacy-preserving checkout, payment, token and download lifecycle event log');
