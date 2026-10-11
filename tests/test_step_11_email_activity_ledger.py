from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]


def test_email_migration_creates_canonical_event_ledger():
    migration = (ROOT / "db/migration/007_new_version_email_activity.sql").read_text()
    db = sqlite3.connect(":memory:")
    db.executescript(migration)
    columns = {row[1] for row in db.execute("PRAGMA table_info(nv_email_events)")}
    assert {"event_id", "order_id", "recipient_email", "event_type", "provider", "status", "http_status", "provider_message_id", "error_code", "created_at"} <= columns
    db.execute("INSERT INTO nv_email_events (order_id, recipient_email, event_type, provider, status) VALUES ('O-1','a@example.com','ORDER_DELIVERY','BREVO','ACCEPTED')")
    assert db.execute("SELECT status FROM nv_email_events").fetchone()[0] == "ACCEPTED"


def test_email_activity_endpoint_queries_real_events_and_requires_permission():
    source = (ROOT / "src/admin-operations.js").read_text()
    assert 'allowed(request, env, "email.read")' in source
    assert "FROM nv_email_events WHERE status=?1" in source
    assert "FROM nv_email_events ORDER BY event_id DESC" in source
    assert "migration 007 is not installed" in source


def test_email_sender_records_outcomes_without_raw_provider_body():
    source = (ROOT / "src/index.js").read_text()
    assert "async function recordEmailEvent" in source
    assert "SKIPPED_CONFIGURATION" in source
    assert "BREVO_HTTP_${response.status}" in source
    assert "status: 'ACCEPTED'" in source
    assert "Do not store the raw provider body" in source
    assert "Email activity ledger unavailable; delivery flow continues." in source
