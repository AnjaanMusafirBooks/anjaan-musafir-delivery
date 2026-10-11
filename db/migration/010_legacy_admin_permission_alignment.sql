-- Candidate-only RBAC alignment for legacy admin endpoints.
-- The existing ADMIN_KEY remains a compatibility/break-glass owner credential;
-- do not distribute it to staff. New Version session callers are permission-checked.
INSERT OR IGNORE INTO admin_role_permissions(role, permission_key, allowed) VALUES
 ('ADMINISTRATOR','content.read',1),
 ('ADMINISTRATOR','content.write',1),
 ('ADMINISTRATOR','offers.read',1),
 ('ADMINISTRATOR','offers.write',1),
 ('ADMINISTRATOR','coupons.delete',1),
 ('PRODUCT_MANAGER','offers.read',1),
 ('PRODUCT_MANAGER','offers.write',1),
 ('MARKETING_MANAGER','offers.read',1),
 ('MARKETING_MANAGER','offers.write',1),
 ('MARKETING_MANAGER','coupons.delete',0),
 ('CONTENT_EDITOR','content.read',1),
 ('CONTENT_EDITOR','content.write',1),
 ('OPERATIONS_MANAGER','offers.read',1),
 ('OPERATIONS_MANAGER','coupons.read',1),
 ('OPERATIONS_MANAGER','content.read',1);
INSERT OR IGNORE INTO schema_migrations(version, description)
VALUES ('010_legacy_admin_permission_alignment', 'Add role permission keys required by compatibility-preserving legacy admin route RBAC');
