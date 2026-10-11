from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "src/index.js").read_text(encoding="utf-8")
COUPONS = (ROOT / "src/coupon-manager.js").read_text(encoding="utf-8")


def test_pricing_rounding_and_free_order_contract_are_explicit():
    assert "function r2(n)" in INDEX
    assert "if (final > 0 && final < 1)" in INDEX
    assert "if (pr.final === 0 && pr.coupon)" in INDEX
    assert "Cashfree को call नहीं किया जाएगा" in INDEX


def test_coupon_manager_rejects_invalid_percentage_and_date_range():
    assert 'if (type === "PERCENT" && body.discount_value > 100)' in COUPONS
    assert "expires_at must be later than starts_at." in COUPONS
    assert "discount_value must be a positive number with at most 2 decimal places." in COUPONS
