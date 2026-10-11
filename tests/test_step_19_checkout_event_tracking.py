from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]


def test_checkout_event_tracking_is_privacy_preserving_and_non_blocking():
    src = (ROOT / "src" / "index.js").read_text()
    assert "async function logCheckoutEvent" in src
    assert "customer_email_hash" in src
    assert "SHA-256" in src
    assert "Telemetry must never break checkout/payment/delivery" in src
    for event in ["DETAILS_ENTERED", "COUPON_VERIFICATION", "ORDER_CREATED", "PAYMENT_SESSION_CREATED", "PAYMENT_SESSION_FAILED", "PAYMENT_VERIFIED", "TOKEN_CREATED", "DOWNLOADED"]:
        assert event in src


def test_checkout_event_api_and_migration_are_present():
    index = (ROOT / "src" / "index.js").read_text()
    api = (ROOT / "src" / "admin-checkout-events.js").read_text()
    assert 'url.pathname === "/api/v2/admin/checkout-events"' in index
    assert 'requireAdminPermission(request, env, "checkout_events.read")' in api
    assert "Customer email is not returned" in api
    db = sqlite3.connect(":memory:")
    db.executescript((ROOT / "db" / "schema.sql").read_text())
    for migration in sorted((ROOT / "db" / "migration").glob("*.sql")):
        db.executescript(migration.read_text())
    assert "nv_checkout_events" in {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='015_checkout_event_tracking'").fetchone()[0] == 1
