-- Manual email retry is available only to privileged operational roles.
INSERT OR IGNORE INTO admin_role_permissions(role,permission_key,allowed) VALUES
 ('ADMINISTRATOR','email.retry',1),
 ('OPERATIONS_MANAGER','email.retry',1),
 ('CUSTOMER_SUPPORT','email.retry',0),
 ('PRODUCT_MANAGER','email.retry',0),
 ('MARKETING_MANAGER','email.retry',0),
 ('CONTENT_EDITOR','email.retry',0),
 ('ANALYST','email.retry',0),
 ('TECHNICAL_SUPPORT','email.retry',0);
INSERT OR IGNORE INTO schema_migrations(version,description)
VALUES ('016_email_retry_permission','Add audited, rate-limited manual delivery email retry permission');
