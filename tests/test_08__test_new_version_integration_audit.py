from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'src'


def test_worker_imports_all_candidate_modules():
    text = (SRC / 'index.js').read_text(encoding='utf-8')
    for module in [
        './admin-auth.js',
        './product-manager.js',
        './coupon-manager.js',
        './order-customer-manager.js',
        './admin-reports.js',
    ]:
        assert f'from "{module}"' in text or f"from '{module}'" in text, module


def test_worker_cors_allows_bearer_and_bootstrap_headers():
    text = (SRC / 'index.js').read_text(encoding='utf-8')
    headers_line = next((line for line in text.splitlines() if 'Access-Control-Allow-Headers' in line), '')
    assert 'Authorization' in headers_line
    assert 'X-Bootstrap-Secret' in headers_line


def test_worker_routes_admin_module_families():
    text = (SRC / 'index.js').read_text(encoding='utf-8')
    for route in [
        '/api/v2/admin/coupons',
        '/api/v2/admin/products',
        '/api/v2/admin/reports',
        '/api/v2/admin/orders',
        '/api/v2/admin/customers',
    ]:
        assert route in text, route


def test_candidate_modules_export_expected_handlers():
    expected = {
        'admin-auth.js': 'handleAdminAuth',
        'product-manager.js': 'handleProductManager',
        'coupon-manager.js': 'handleCouponManager',
        'order-customer-manager.js': 'handleAdminOrderCustomer',
        'admin-reports.js': 'handleAdminReports',
    }
    for filename, export_name in expected.items():
        text = (SRC / filename).read_text(encoding='utf-8')
        assert f'function {export_name}' in text or f'const {export_name}' in text or f'async {export_name}' in text or f'export {{ {export_name}' in text, filename
