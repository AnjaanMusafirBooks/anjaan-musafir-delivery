from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]


def test_legacy_admin_routes_have_explicit_permission_map():
    src = (ROOT / "src" / "index.js").read_text()
    assert '"GET /api/admin/site-content", "content.read"' in src
    assert '"POST /api/admin/site-content", "content.write"' in src
    assert '"POST /api/admin/price", "products.update"' in src
    assert '"POST /api/admin/offer", "offers.write"' in src
    assert '"POST /api/admin/coupon-delete", "coupons.delete"' in src
    assert "requireAdminPermission(request, env, key)" in src


def test_legacy_admin_key_is_explicitly_break_glass_and_not_staff_credential():
    src = (ROOT / "src" / "index.js").read_text()
    assert "break-glass credential" in src
    assert "Do not distribute ADMIN_KEY to staff accounts" in src


def test_legacy_permission_migration_applies_after_all_prior_migrations():
    db = sqlite3.connect(":memory:")
    db.executescript((ROOT / "db" / "schema.sql").read_text())
    for migration in sorted((ROOT / "db" / "migration").glob("*.sql")):
        db.executescript(migration.read_text())
    rows = db.execute("SELECT role, permission_key FROM admin_role_permissions").fetchall()
    permissions = set(rows)
    assert ("CONTENT_EDITOR", "content.write") in permissions
    assert ("MARKETING_MANAGER", "offers.write") in permissions
    assert ("ADMINISTRATOR", "coupons.delete") in permissions
