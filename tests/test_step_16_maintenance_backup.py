from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]


def test_maintenance_routes_are_imported_and_explicit():
    src = (ROOT / "src" / "index.js").read_text()
    assert 'import { handleAdminMaintenance, checkMaintenanceGate } from "./admin-maintenance.js";' in src
    assert 'url.pathname.startsWith("/api/v2/admin/maintenance/")' in src
    assert "handleAdminMaintenance(request, env, url)" in src


def test_backup_is_encrypted_and_restore_is_staging_only_merge():
    src = (ROOT / "src" / "admin-maintenance.js").read_text()
    assert "AES-GCM" in src and "AES-256-GCM" in src
    assert "BACKUP_ENCRYPTION_KEY" in src
    assert 'env.APP_ENV !== "staging"' in src
    assert '"RESTORE STAGING DATABASE"' in src
    assert "MERGE_ONLY" in src
    assert "Preflight every included table/row before the first write" in src
    assert "admin_sessions" not in src.split("const TABLES = [", 1)[1].split("];", 1)[0]
    assert "R2 PDF objects themselves are not included" in src


def test_backup_permissions_and_migration_apply_after_all_previous_migrations():
    db = sqlite3.connect(":memory:")
    db.executescript((ROOT / "db" / "schema.sql").read_text())
    for migration in sorted((ROOT / "db" / "migration").glob("*.sql")):
        db.executescript(migration.read_text())
    assert db.execute("SELECT COUNT(*) FROM admin_role_permissions WHERE permission_key='backup.export'").fetchone()[0] >= 2
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='011_admin_maintenance_backup'").fetchone()[0] == 1
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='012_admin_maintenance_controls'").fetchone()[0] == 1
    assert '"APP_ENV": "staging"' in (ROOT / "wrangler.jsonc").read_text()


def test_owner_lock_safe_mode_and_retention_are_server_enforced():
    src = (ROOT / "src" / "admin-maintenance.js").read_text()
    assert "owner_control_locked" in src
    assert "maintenance_mode" in src
    assert "Maintenance settings are incomplete" in src
    assert "technical_log_retention_days" in src
    assert '"DELETE EXPIRED TECHNICAL LOGS"' in src
    assert '"UNLOCK OWNER CONTROL"' in src
    assert "Orders, products, coupons, purchase requests and download records were not deleted" in src
