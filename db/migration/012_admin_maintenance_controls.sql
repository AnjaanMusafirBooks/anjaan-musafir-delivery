-- Candidate-only Owner Control Lock, safe mode and technical-log retention settings.
CREATE TABLE IF NOT EXISTS nv_system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO nv_system_settings(setting_key,setting_value) VALUES
 ('owner_control_locked','0'),
 ('maintenance_mode','0'),
 ('technical_log_retention_days','90');
INSERT OR IGNORE INTO admin_role_permissions(role,permission_key,allowed) VALUES
 ('ADMINISTRATOR','maintenance.read',1),
 ('OPERATIONS_MANAGER','maintenance.read',1),
 ('ADMINISTRATOR','maintenance.control',0),
 ('OPERATIONS_MANAGER','maintenance.control',0),
 ('CUSTOMER_SUPPORT','maintenance.read',0),
 ('PRODUCT_MANAGER','maintenance.read',0),
 ('MARKETING_MANAGER','maintenance.read',0),
 ('CONTENT_EDITOR','maintenance.read',0),
 ('ANALYST','maintenance.read',1),
 ('TECHNICAL_SUPPORT','maintenance.read',1);
INSERT OR IGNORE INTO schema_migrations(version,description)
VALUES ('012_admin_maintenance_controls','Add Owner Control Lock, maintenance safe mode and configurable technical-log retention');
