from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_health_checks_bindings_without_exposing_secret_values():
    src = (ROOT / "src" / "admin-operations.js").read_text()
    for key in ["cashfree_client_id_configured", "cashfree_client_secret_configured", "brevo_api_key_configured", "private_pdf_bucket_binding_available"]:
        assert key in src
    assert "client_secret_length" not in src
    assert "client_secret:" not in src
    assert "configuration_presence: bindings" in src
    assert "No secret values are returned" in src or "no secret values are returned" in src.lower()
    assert "external provider connectivity is not tested" in src


def test_health_checks_include_new_version_dependencies():
    src = (ROOT / "src" / "admin-operations.js").read_text()
    for table in ["nv_products", "nv_email_events", "nv_purchase_requests", "downloads", "orders"]:
        assert table in src
    assert "active_catalog_counts" in src
    assert "warnings" in src
