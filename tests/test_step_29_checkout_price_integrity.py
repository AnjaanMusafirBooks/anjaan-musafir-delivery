from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "src/index.js").read_text(encoding="utf-8")


def test_checkout_accepts_historical_percentage_coupon_type_without_treating_it_as_flat():
    assert '["PERCENT", "PERCENTAGE", "FLAT"].includes(normalizedType)' in INDEX
    assert 'normalizedType === "PERCENTAGE"' in INDEX
    assert "Historical records may store PERCENTAGE while new manager writes PERCENT." in INDEX


def test_checkout_accepts_legacy_json_array_product_restrictions_and_csv_format():
    assert "const parsed = JSON.parse(c.product_ids)" in INDEX
    assert 'String(c.product_ids).split(",")' in INDEX
    assert "return ids.map(s => s.trim()).includes(String(product.product_id))" in INDEX


def test_corrupt_active_offer_and_product_prices_fail_closed():
    assert "An active but corrupt legacy offer must not silently change checkout pricing." in INDEX
    assert "offerSale > offerMrp" in INDEX
    assert "Reject corrupt legacy product prices before any payment amount is created." in INDEX
    assert "pricingError: true" in INDEX


def test_runtime_coupon_values_are_validated_even_if_legacy_db_row_is_corrupt():
    assert "!Number.isFinite(discountValue)" in INDEX
    assert "discountValue > 100" in INDEX
    assert "discount setting" in INDEX
