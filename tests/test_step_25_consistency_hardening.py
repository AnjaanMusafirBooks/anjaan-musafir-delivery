from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def test_sales_report_groups_by_same_fallback_date_as_date_filter():
    source = (ROOT / "src/admin-reports.js").read_text()
    assert "SELECT date(COALESCE(paid_at, created_at)) AS sale_date" in source
    assert "GROUP BY date(COALESCE(paid_at, created_at)) ORDER BY sale_date DESC LIMIT 366" in source

def test_encrypted_backup_includes_reset_request_audit_but_not_reset_tokens():
    source = (ROOT / "src/admin-maintenance.js").read_text()
    table_block = source.split("const TABLES = [", 1)[1].split("];", 1)[0]
    assert '"nv_password_reset_requests"' in table_block
    assert '"nv_password_reset_tokens"' not in table_block

def test_checkout_event_pagination_and_event_type_are_bounded():
    source = (ROOT / "src/admin-checkout-events.js").read_text()
    assert "requestedOffset > 100000" in source
    assert "Number.isSafeInteger(requestedOffset)" in source
    assert "Invalid event_type filter." in source
