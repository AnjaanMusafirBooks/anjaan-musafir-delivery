-- Anjaan Musafir Books — New Version admin foundation
-- Additive migration only. Does not modify or delete existing products, orders,
-- downloads, offers, coupons, order_discounts, or site_content rows.
-- Apply only to an isolated candidate/staging D1 after reviewing the current schema.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN (
    'FOUNDER', 'ADMINISTRATOR', 'OPERATIONS_MANAGER', 'PRODUCT_MANAGER',
    'MARKETING_MANAGER', 'CUSTOMER_SUPPORT', 'CONTENT_EDITOR', 'ANALYST',
    'TECHNICAL_SUPPORT'
  )),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED', 'LOCKED')),
  must_reset_password INTEGER NOT NULL DEFAULT 0 CHECK (must_reset_password IN (0, 1)),
  failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT,
  password_changed_at TEXT
);

-- A single active Founder is enforced by the database as an extra guard.
-- Founder bootstrap logic must still be one-time and authenticated server-side.
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_single_active_founder
  ON admin_users(role)
  WHERE role = 'FOUNDER' AND status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_admin_users_role_status
  ON admin_users(role, status);
CREATE INDEX IF NOT EXISTS idx_admin_users_created_at
  ON admin_users(created_at);

CREATE TABLE IF NOT EXISTS admin_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_seen_at TEXT,
  user_agent_hash TEXT,
  FOREIGN KEY (user_id) REFERENCES admin_users(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_active
  ON admin_sessions(user_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry
  ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS admin_role_permissions (
  role TEXT NOT NULL CHECK (role IN (
    'FOUNDER', 'ADMINISTRATOR', 'OPERATIONS_MANAGER', 'PRODUCT_MANAGER',
    'MARKETING_MANAGER', 'CUSTOMER_SUPPORT', 'CONTENT_EDITOR', 'ANALYST',
    'TECHNICAL_SUPPORT'
  )),
  permission_key TEXT NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 1 CHECK (allowed IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role, permission_key)
);
CREATE INDEX IF NOT EXISTS idx_admin_role_permissions_role_allowed
  ON admin_role_permissions(role, allowed);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('SUCCESS', 'DENIED', 'FAILURE')),
  request_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_user_id) REFERENCES admin_users(user_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at
  ON admin_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor_created
  ON admin_audit_log(actor_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action_created
  ON admin_audit_log(action, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target
  ON admin_audit_log(target_type, target_id, created_at);

CREATE TABLE IF NOT EXISTS admin_security_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('SUCCESS', 'DENIED', 'FAILURE')),
  detail_code TEXT NOT NULL,
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES admin_users(user_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_security_events_created
  ON admin_security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_security_events_type_created
  ON admin_security_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_security_events_user_created
  ON admin_security_events(user_id, created_at);

-- Least-privilege starter policy. Enforcement is not active until backend RBAC
-- code is implemented. Founder wildcard is interpreted only by that backend.
INSERT OR IGNORE INTO admin_role_permissions (role, permission_key, allowed) VALUES
  ('FOUNDER', '*', 1),
  ('ADMINISTRATOR', 'dashboard.read', 1),
  ('ADMINISTRATOR', 'products.read', 1),
  ('ADMINISTRATOR', 'products.write', 1),
  ('ADMINISTRATOR', 'offers.write', 1),
  ('ADMINISTRATOR', 'coupons.write', 1),
  ('ADMINISTRATOR', 'orders.read', 1),
  ('ADMINISTRATOR', 'orders.manage', 1),
  ('ADMINISTRATOR', 'customers.read', 1),
  ('ADMINISTRATOR', 'downloads.read', 1),
  ('ADMINISTRATOR', 'email.read', 1),
  ('ADMINISTRATOR', 'reports.read', 1),
  ('ADMINISTRATOR', 'reports.export', 1),
  ('ADMINISTRATOR', 'content.write', 1),
  ('ADMINISTRATOR', 'health.read', 1),
  ('ADMINISTRATOR', 'logs.read', 1),
  ('OPERATIONS_MANAGER', 'dashboard.read', 1),
  ('OPERATIONS_MANAGER', 'orders.read', 1),
  ('OPERATIONS_MANAGER', 'orders.manage', 1),
  ('OPERATIONS_MANAGER', 'customers.read', 1),
  ('OPERATIONS_MANAGER', 'downloads.read', 1),
  ('OPERATIONS_MANAGER', 'email.read', 1),
  ('OPERATIONS_MANAGER', 'reports.read', 1),
  ('PRODUCT_MANAGER', 'dashboard.read', 1),
  ('PRODUCT_MANAGER', 'products.read', 1),
  ('PRODUCT_MANAGER', 'products.write', 1),
  ('PRODUCT_MANAGER', 'files.manage', 1),
  ('MARKETING_MANAGER', 'dashboard.read', 1),
  ('MARKETING_MANAGER', 'offers.read', 1),
  ('MARKETING_MANAGER', 'offers.write', 1),
  ('MARKETING_MANAGER', 'coupons.read', 1),
  ('MARKETING_MANAGER', 'coupons.write', 1),
  ('MARKETING_MANAGER', 'reports.read', 1),
  ('CUSTOMER_SUPPORT', 'dashboard.read', 1),
  ('CUSTOMER_SUPPORT', 'orders.read', 1),
  ('CUSTOMER_SUPPORT', 'customers.read', 1),
  ('CUSTOMER_SUPPORT', 'downloads.read', 1),
  ('CUSTOMER_SUPPORT', 'email.read', 1),
  ('CONTENT_EDITOR', 'dashboard.read', 1),
  ('CONTENT_EDITOR', 'content.read', 1),
  ('CONTENT_EDITOR', 'content.write', 1),
  ('ANALYST', 'dashboard.read', 1),
  ('ANALYST', 'reports.read', 1),
  ('ANALYST', 'reports.export', 1),
  ('TECHNICAL_SUPPORT', 'dashboard.read', 1),
  ('TECHNICAL_SUPPORT', 'health.read', 1),
  ('TECHNICAL_SUPPORT', 'logs.read', 1);

INSERT OR IGNORE INTO schema_migrations (version, description)
VALUES ('002_new_version_admin_foundation', 'Add admin identity, hashed sessions, role permissions and audit/security event tables');
