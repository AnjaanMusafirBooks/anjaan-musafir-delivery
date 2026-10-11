from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "src" / "index.js").read_text()
MODULE = (ROOT / "src" / "product-manager.js").read_text()
MIGRATION = (ROOT.parent / "db" / "migration" / "003_new_version_product_manager.sql")


def test_worker_routes_product_manager_before_auth_fallback():
    assert 'import { handleProductManager } from "./product-manager.js";' in INDEX
    assert 'url.pathname.startsWith("/api/v2/admin/products")' in INDEX
    assert INDEX.index('url.pathname.startsWith("/api/v2/admin/products")') < INDEX.index('url.pathname.startsWith("/api/v2/admin/")')


def test_cors_allows_authorization_and_product_write_methods():
    assert '"Access-Control-Allow-Headers": "Content-Type, Authorization, X-Bootstrap-Secret, x-admin-key, X-Checkout-Attempt-ID"' in INDEX
    assert '"Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS"' in INDEX


def test_product_manager_uses_admin_permission_checks_and_expected_tables():
    assert 'requireAdminPermission' in MODULE
    for permission in ['products.read', 'products.create', 'products.update', 'products.archive']:
        assert permission in MODULE
    for table in ['nv_products', 'nv_product_price_history', 'nv_product_file_history']:
        assert table in MODULE


def test_product_manager_has_crud_archive_and_history_routes():
    for route in ['/api/v2/admin/products', 'price-history', 'file-history', 'archive']:
        assert route in MODULE
    assert 'request.method === "PUT" || request.method === "PATCH"' in MODULE


def test_prices_are_converted_to_paise_and_validated():
    assert 'Math.round(value * 100)' in MODULE
    assert 'selling_price cannot exceed mrp' in MODULE
    assert 'mrp_rupees' in MODULE and 'selling_price_rupees' in MODULE


def test_product_manager_uses_separate_private_pdf_upload_module():
    UPLOAD = (ROOT / "src" / "product-file-upload.js").read_text()
    assert "private storage key" in MODULE
    assert 'pdf_file_key' in MODULE
    assert "BOOKS_BUCKET" in UPLOAD and "requireAdminPermission" in UPLOAD
