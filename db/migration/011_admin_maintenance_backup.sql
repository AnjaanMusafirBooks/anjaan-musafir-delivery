-- Candidate-only maintenance permissions. Encryption key is a Cloudflare secret, never stored in D1.
INSERT OR IGNORE INTO admin_role_permissions(role, permission_key, allowed) VALUES
 ('ADMINISTRATOR','backup.export',0),
 ('OPERATIONS_MANAGER','backup.export',0),
 ('ADMINISTRATOR','backup.restore',0),
 ('OPERATIONS_MANAGER','backup.restore',0),
 ('CUSTOMER_SUPPORT','backup.export',0),
 ('CONTENT_EDITOR','backup.export',0),
 ('ANALYST','backup.export',0),
 ('TECHNICAL_SUPPORT','backup.export',0);
INSERT OR IGNORE INTO schema_migrations(version, description)
VALUES ('011_admin_maintenance_backup', 'Add role keys for encrypted database backup export and Founder-only staging merge restore');
