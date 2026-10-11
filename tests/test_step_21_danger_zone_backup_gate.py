from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_destructive_log_cleanup_requires_recent_encrypted_backup():
    src = (ROOT / "src" / "admin-maintenance.js").read_text()
    assert 'setSetting(env.DB, "last_encrypted_backup_at"' in src
    assert 'setSetting(env.DB, "last_encrypted_backup_by"' in src
    assert '"DELETE EXPIRED TECHNICAL LOGS"' in src
    assert '"last_encrypted_backup_at"' in src
    assert 'backupAgeMs > 30 * 60 * 1000' in src
    assert "Destructive cleanup is blocked: create a fresh encrypted database backup first" in src


def test_cleanup_scope_does_not_delete_commerce_records():
    src = (ROOT / "src" / "admin-maintenance.js").read_text()
    assert 'for (const table of ["admin_audit_log", "admin_security_events", "nv_email_events", "nv_password_reset_requests"])' in src
    assert 'DELETE FROM orders' not in src
    assert 'DELETE FROM nv_products' not in src
    assert 'DELETE FROM nv_coupons' not in src


def test_backup_includes_real_product_price_and_file_history_tables():
    src = (ROOT / "src" / "admin-maintenance.js").read_text()
    table_block = src.split("const TABLES = [", 1)[1].split("];", 1)[0]
    assert '"nv_product_file_history"' in table_block
    assert '"nv_product_price_history"' in table_block
    assert '"nv_product_history"' not in table_block  # no such table is defined by the migrations
    assert '"admin_sessions"' not in table_block
    assert '"nv_password_reset_tokens"' not in table_block
