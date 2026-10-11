from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def test_coupon_manager_writes_checkout_discount_type_values():
    s = (ROOT / 'src/coupon-manager.js').read_text()
    assert '.bind(code, type, body.discount_value, productIds' in s
    assert 'add("discount_type", body.discount_type)' in s
    assert 'type === "PERCENT" ? "percentage"' not in s

def test_coupon_manager_writes_comma_separated_product_ids():
    s = (ROOT / 'src/coupon-manager.js').read_text()
    assert 'body.product_ids.join(",")' in s
    assert 'String(value).split(",")' in s

def test_checkout_uses_matching_contract():
    s = (ROOT / 'src/index.js').read_text()
    assert 'normalizedType === "PERCENT"' in s
    assert 'normalizedType === "PERCENTAGE"' in s
    assert 'JSON.parse(c.product_ids)' in s
    assert 'String(c.product_ids).split(",")' in s
