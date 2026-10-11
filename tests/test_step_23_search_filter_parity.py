from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]


def test_report_filters_remain_parameterized_and_bounded():
    src = (ROOT / "src" / "admin-reports.js").read_text()
    assert 'const productId = (url.searchParams.get("product_id") || "").trim().slice(0, 100)' in src
    assert 'const coupon = (url.searchParams.get("coupon") || "").trim().slice(0, 80)' in src
    assert '.bind(...bindings)' in src
    assert 'Unsupported status filter.' in src
    assert 'min_amount cannot exceed max_amount.' in src


def test_order_and_customer_queries_use_parameterized_filters_and_pagination():
    src = (ROOT / "src" / "order-customer-manager.js").read_text()
    assert '.bind(...bindings, limit, offset).all()' in src
    assert '.bind(...bindings).first()' in src
    assert 'problem_filter_definition' in src
    assert 'abandoned checkout is not inferred' in src
