from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "src/index.js").read_text(encoding="utf-8")
PRODUCTS = (ROOT / "src/product-manager.js").read_text(encoding="utf-8")
COUPONS = (ROOT / "src/coupon-manager.js").read_text(encoding="utf-8")


def test_invalid_schedule_never_activates_offer_or_coupon():
    assert "if (!Number.isFinite(timestamp)) return false" in INDEX
    assert "timestamp <= now" in INDEX
    assert "Date.parse(row.starts_at) >= Date.parse(row[endKey])" in INDEX


def test_legacy_offer_endpoint_validates_price_and_schedule_consistency():
    assert "sale_price cannot exceed mrp" in INDEX
    assert "ends_at must be later than starts_at." in INDEX
    assert "An active offer requires an existing active product." in INDEX


def test_managed_product_offer_dates_are_valid_and_ordered():
    assert "use a valid ISO date/time." in PRODUCTS
    assert "offer_ends_at must be later than offer_starts_at." in PRODUCTS


def test_coupon_values_cannot_exceed_money_precision_or_percent_cap():
    assert "at most 2 decimal places" in COUPONS
    assert "Percent discount cannot exceed 100." in COUPONS
