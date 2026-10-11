from pathlib import Path
import sqlite3
ROOT = Path(__file__).resolve().parents[1]

def test_permission_alignment_migration_is_additive_and_keeps_founder_wildcard():
    db = sqlite3.connect(':memory:')
    db.executescript((ROOT / 'db/schema.sql').read_text())
    for name in ['001_site_content.sql','002_new_version_admin_foundation.sql','010_legacy_admin_permission_alignment.sql','017_candidate_permission_matrix_alignment.sql']:
        db.executescript((ROOT / 'db/migration' / name).read_text())
    expected = {
      ('ADMINISTRATOR','products.create',1), ('ADMINISTRATOR','products.update',1), ('ADMINISTRATOR','products.archive',1),
      ('PRODUCT_MANAGER','files.manage',1), ('PRODUCT_MANAGER','products.update',1),
      ('MARKETING_MANAGER','coupons.read',1), ('OPERATIONS_MANAGER','checkout_events.read',1),
      ('CUSTOMER_SUPPORT','purchase_requests.read',1), ('ANALYST','checkout_events.read',1),
      ('TECHNICAL_SUPPORT','checkout_events.read',1), ('FOUNDER','*',1),
    }
    rows = set(db.execute('SELECT role, permission_key, allowed FROM admin_role_permissions'))
    assert expected <= rows
    db.executescript((ROOT / 'db/migration/017_candidate_permission_matrix_alignment.sql').read_text())
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='017_candidate_permission_matrix_alignment'").fetchone()[0] == 1
    db.close()

def test_permission_migration_does_not_grant_backup_or_maintenance_to_non_founders():
    sql = (ROOT / 'db/migration/017_candidate_permission_matrix_alignment.sql').read_text()
    for role in ['ADMINISTRATOR','PRODUCT_MANAGER','MARKETING_MANAGER','OPERATIONS_MANAGER','CUSTOMER_SUPPORT','ANALYST','TECHNICAL_SUPPORT']:
        assert f"('{role}','backup.export',1)" not in sql
        assert f"('{role}','backup.restore',1)" not in sql
        assert f"('{role}','maintenance.control',1)" not in sql
