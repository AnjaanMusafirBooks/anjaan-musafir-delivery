from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]


def test_date_filters_include_unpaid_orders_using_creation_date_fallback():
    src = (ROOT / "src" / "admin-reports.js").read_text()
    assert 'date(COALESCE(paid_at, created_at)) >= date(?)' in src
    assert 'date(COALESCE(paid_at, created_at)) <= date(?)' in src
    assert 'GROUP BY date(COALESCE(paid_at, created_at))' in src
    assert 'ORDER BY sale_date DESC LIMIT 366' in src


def test_report_search_escapes_user_supplied_like_wildcards():
    src = (ROOT / "src" / "admin-reports.js").read_text()
    assert "ESCAPE '\\\\'" in src
    assert 'q.replace(/[\\\\%_]/g, "\\\\$&")' in src


def test_order_and_customer_search_escapes_like_wildcards_consistently():
    src = (ROOT / "src" / "order-customer-manager.js").read_text()
    assert src.count("ESCAPE '\\\\'") >= 8
    assert src.count('q.replace(/[\\\\%_]/g, "\\\\$&")') == 2
