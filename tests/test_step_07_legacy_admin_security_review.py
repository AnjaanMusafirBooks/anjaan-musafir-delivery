from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "src" / "index.js").read_text(encoding="utf-8")
AUTH = (ROOT / "src" / "admin-auth.js").read_text(encoding="utf-8")
PRODUCT = (ROOT / "src" / "product-manager.js").read_text(encoding="utf-8")
COUPON = (ROOT / "src" / "coupon-manager.js").read_text(encoding="utf-8")
ORDER_CUSTOMER = (ROOT / "src" / "order-customer-manager.js").read_text(encoding="utf-8")
REPORTS = (ROOT / "src" / "admin-reports.js").read_text(encoding="utf-8")
OPERATIONS = (ROOT / "src" / "admin-operations.js").read_text(encoding="utf-8")
UPLOAD = (ROOT / "src" / "product-file-upload.js").read_text(encoding="utf-8")


def test_legacy_admin_route_still_uses_legacy_handler():
    assert 'url.pathname.startsWith(\n          "/api/admin/"' in INDEX
    assert "return await handleAdmin(" in INDEX


def test_legacy_admin_handler_checks_shared_admin_key():
    assert "isAdmin(" in INDEX
    assert "return Boolean(env.ADMIN_KEY)" in INDEX
    assert 'request.headers.get(\n      "x-admin-key"' in INDEX
    assert "env.ADMIN_KEY" in INDEX


def test_new_version_product_and_coupon_handlers_check_permissions():
    assert "requireAdminPermission" in PRODUCT
    assert "requireAdminPermission" in COUPON


def test_new_version_order_reports_operations_and_upload_check_permissions():
    assert "requireAdminPermission" in ORDER_CUSTOMER
    assert "requireAdminPermission" in REPORTS
    assert "requireAdminPermission" in OPERATIONS
    assert "requireAdminPermission" in UPLOAD


def test_permission_helper_checks_session_and_role_permission():
    assert "export async function requireAdminPermission" in AUTH
    assert "getSession(request, env)" in AUTH
    assert "hasPermission(env.DB, auth.user.role, permission)" in AUTH


def test_cors_allows_authorization_header_for_v2_browser_sessions():
    assert '"Access-Control-Allow-Headers": "Content-Type, Authorization, X-Bootstrap-Secret, x-admin-key, X-Checkout-Attempt-ID"' in INDEX


def test_docs_warn_legacy_key_is_not_rbac():
    doc = (ROOT / "docs" / "STEP_07_LEGACY_ADMIN_SECURITY_REVIEW.md").read_text(encoding="utf-8")
    assert "not a completed migration" in doc
    assert "Production remains untouched" in doc
