-- New Version candidate only: align seeded RBAC keys with actual route checks.
-- Apply only to the isolated staging D1 database after migrations 001-005.
-- This is additive and does not touch orders, products, coupons or payment records.
INSERT OR IGNORE INTO admin_role_permissions (role, permission_key, allowed) VALUES
  ('FOUNDER', '*', 1),
  ('ADMINISTRATOR', 'products.create', 1),
  ('ADMINISTRATOR', 'products.update', 1),
  ('ADMINISTRATOR', 'products.archive', 1),
  ('ADMINISTRATOR', 'products.read', 1),
  ('ADMINISTRATOR', 'files.manage', 1),
  ('ADMINISTRATOR', 'coupons.read', 1),
  ('ADMINISTRATOR', 'coupons.write', 1),
  ('PRODUCT_MANAGER', 'products.create', 1),
  ('PRODUCT_MANAGER', 'products.update', 1),
  ('PRODUCT_MANAGER', 'products.archive', 1),
  ('PRODUCT_MANAGER', 'products.read', 1),
  ('PRODUCT_MANAGER', 'files.manage', 1),
  ('MARKETING_MANAGER', 'coupons.read', 1),
  ('MARKETING_MANAGER', 'coupons.write', 1);
