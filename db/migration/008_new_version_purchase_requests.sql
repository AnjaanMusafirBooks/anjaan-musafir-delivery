-- Additive candidate-only schema for manual payment fallback.
-- Apply only to isolated staging D1 after migrations 001-007.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS nv_purchase_requests (
  request_id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  expected_amount REAL NOT NULL CHECK (expected_amount >= 0),
  amount_claimed REAL CHECK (amount_claimed IS NULL OR amount_claimed >= 0),
  payment_reference TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVING','APPROVED','REJECTED')),
  admin_note TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  verified_payment_reference TEXT,
  verified_amount REAL,
  order_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_nv_purchase_requests_status_created
  ON nv_purchase_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nv_purchase_requests_email_created
  ON nv_purchase_requests(customer_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nv_purchase_requests_order
  ON nv_purchase_requests(order_id);

INSERT OR IGNORE INTO admin_role_permissions(role, permission_key, allowed) VALUES
  ('ADMINISTRATOR','purchase_requests.read',1),
  ('ADMINISTRATOR','purchase_requests.review',1),
  ('OPERATIONS_MANAGER','purchase_requests.read',1),
  ('OPERATIONS_MANAGER','purchase_requests.review',1),
  ('CUSTOMER_SUPPORT','purchase_requests.read',1),
  ('CUSTOMER_SUPPORT','purchase_requests.review',0),
  ('PRODUCT_MANAGER','purchase_requests.read',0),
  ('MARKETING_MANAGER','purchase_requests.read',0);

INSERT OR IGNORE INTO schema_migrations(version, description)
VALUES ('008_new_version_purchase_requests', 'Add manual purchase request workflow with explicit review and entitlement issuance');
