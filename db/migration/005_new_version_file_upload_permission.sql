-- New Version only: seed explicit permission needed by private PDF uploads.
-- Apply only to the isolated candidate/staging D1 database.
INSERT OR IGNORE INTO admin_role_permissions (role, permission_key, allowed) VALUES
  ('FOUNDER', '*', 1),
  ('ADMINISTRATOR', 'files.manage', 1),
  ('PRODUCT_MANAGER', 'files.manage', 1);
