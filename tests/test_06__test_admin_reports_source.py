import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]

def test_reports_module_has_permission_and_read_only_queries():
    s = (ROOT / "src" / "admin-reports.js").read_text()
    assert 'requireAdminPermission(request, env, "reports.read")' in s
    assert "UPDATE orders" not in s and "DELETE FROM orders" not in s

def test_summary_and_sales_endpoints_exist():
    s = (ROOT / "src" / "admin-reports.js").read_text()
    for path in ["/api/v2/admin/reports/summary", "/api/v2/admin/reports/sales", "/api/v2/admin/reports/orders.csv"]:
        assert path in s

def test_worker_routes_reports_module():
    s = (ROOT / "src" / "index.js").read_text()
    assert 'import { handleAdminReports } from "./admin-reports.js";' in s
    assert 'url.pathname.startsWith("/api/v2/admin/reports")' in s

def test_date_validation_and_csv_escaping():
    s = (ROOT / "src" / "admin-reports.js").read_text()
    assert "validDate" in s and "csvCell" in s

def test_reports_support_shared_filters_and_csv_formula_injection_guard():
    s = (ROOT / "src" / "admin-reports.js").read_text()
    for key in ["status", "product_id", "coupon", "min_amount", "max_amount", "q"]:
        assert f'url.searchParams.get("{key}")' in s
    assert "filterInfo" in s
    assert "spreadsheet formula injection" in s
    assert "^[\\s\\u0000-\\u001f]*[=+@-]" in s
    assert "min_amount cannot exceed max_amount" in s
