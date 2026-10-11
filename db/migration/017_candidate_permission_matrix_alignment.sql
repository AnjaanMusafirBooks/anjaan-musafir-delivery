-- Candidate-only least-privilege alignment for exact permission keys used by New Version APIs.
-- INSERT OR IGNORE preserves owner/admin custom decisions already stored in D1.
INSERT OR IGNORE INTO admin_role_permissions(role, permission_key, allowed) VALUES
  -- Administrator: day-to-day operations, but no backup/restore or maintenance control.
  ('ADMINISTRATOR','products.create',1),
  ('ADMINISTRATOR','products.update',1),
  ('ADMINISTRATOR','products.archive',1),
  ('ADMINISTRATOR','coupons.read',1),
  ('ADMINISTRATOR','checkout_events.read',1),
  ('ADMINISTRATOR','purchase_requests.read',1),
  ('ADMINISTRATOR','purchase_requests.review',1),
  ('ADMINISTRATOR','email.retry',1),
  -- Product Manager: catalog/file lifecycle only.
  ('PRODUCT_MANAGER','products.create',1),
  ('PRODUCT_MANAGER','products.update',1),
  ('PRODUCT_MANAGER','products.archive',1),
  ('PRODUCT_MANAGER','coupons.read',1),
  -- Marketing Manager: offers/coupons, read-only catalog/reports.
  ('MARKETING_MANAGER','coupons.read',1),
  ('MARKETING_MANAGER','products.read',1),
  -- Operations: order/customer support and checkout visibility, but not product/payment mutations.
  ('OPERATIONS_MANAGER','checkout_events.read',1),
  ('OPERATIONS_MANAGER','purchase_requests.read',1),
  ('OPERATIONS_MANAGER','email.retry',1),
  -- Customer Support: order recovery and request visibility; no approval attestation.
  ('CUSTOMER_SUPPORT','purchase_requests.read',1),
  -- Analyst: reporting and checkout event visibility only.
  ('ANALYST','checkout_events.read',1),
  -- Technical Support: safe health/log diagnostics and checkout events.
  ('TECHNICAL_SUPPORT','checkout_events.read',1),
  ('TECHNICAL_SUPPORT','email.read',1);
INSERT OR IGNORE INTO schema_migrations(version, description)
VALUES ('017_candidate_permission_matrix_alignment', 'Align least-privilege role permissions with exact New Version API permission keys');
