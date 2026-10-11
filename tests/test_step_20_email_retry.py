from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]


def test_email_retry_requires_permission_paid_order_valid_token_and_rate_limit():
    src = (ROOT / "src" / "admin-operations.js").read_text()
    assert 'requireAdminPermission(request, env, "email.retry")' in src
    assert 'String(order.payment_status).toUpperCase() !== "PAID"' in src
    assert "Date.parse(order.expires_at) <= Date.now()" in src
    assert "ORDER_DELIVERY_RETRY" in src
    assert "SKIPPED_CONFIGURATION" in src
    assert "retry outcome was recorded and no email was sent" in src
    assert ">= 3" in src
    assert "Brevo accepted the retry request; inbox delivery is not guaranteed" in src


def test_email_retry_permission_migration_is_applied():
    db = sqlite3.connect(":memory:")
    db.executescript((ROOT / "db" / "schema.sql").read_text())
    for migration in sorted((ROOT / "db" / "migration").glob("*.sql")):
        db.executescript(migration.read_text())
    assert db.execute("SELECT allowed FROM admin_role_permissions WHERE role='ADMINISTRATOR' AND permission_key='email.retry'").fetchone()[0] == 1
    assert db.execute("SELECT allowed FROM admin_role_permissions WHERE role='CUSTOMER_SUPPORT' AND permission_key='email.retry'").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='016_email_retry_permission'").fetchone()[0] == 1
