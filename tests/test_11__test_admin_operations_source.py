from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_worker_imports_operations_handler():
    source = (ROOT / "src" / "index.js").read_text()
    assert 'import { handleAdminOperations } from "./admin-operations.js";' in source
    assert "handleAdminOperations(request, env, url)" in source


def test_operations_routes_are_explicitly_routed():
    source = (ROOT / "src" / "index.js").read_text()
    for path in ["/api/v2/admin/health", "/api/v2/admin/audit-logs", "/api/v2/admin/email-activity"]:
        assert path in source


def test_each_endpoint_checks_permission():
    source = (ROOT / "src" / "admin-operations.js").read_text()
    for key in ['"health.read"', '"logs.read"', '"email.read"']:
        assert key in source
    assert "requireAdminPermission" in source


def test_email_activity_reads_canonical_event_ledger():
    source = (ROOT / "src" / "admin-operations.js").read_text()
    assert '"nv_email_events"' in source
    assert "FROM nv_email_events" in source
    assert "canonical column mapping is required" not in source


def test_dashboard_routes_are_explicitly_routed_in_worker():
    source = (ROOT / "src" / "index.js").read_text()
    for path in ["/api/v2/admin/email-activity", "/api/v2/admin/health", "/api/v2/admin/audit-logs"]:
        assert path in source
