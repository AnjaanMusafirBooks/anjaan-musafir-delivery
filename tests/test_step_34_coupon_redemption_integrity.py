from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_redemption_fails_closed_when_coupon_row_is_missing():
    source = (ROOT / "src/index.js").read_text()
    block = source.split("async function consumeCouponReservation", 1)[1].split("async function markOrderPaidAndToken", 1)[0]
    assert "Coupon reservation references missing coupon" in block
    assert "if (!coupon) throw new Error" in block


def test_reservation_redemption_requires_both_state_changes():
    source = (ROOT / "src/index.js").read_text()
    block = source.split("async function consumeCouponReservation", 1)[1].split("async function markOrderPaidAndToken", 1)[0]
    assert "const couponChanges = Number(results?.[0]?.meta?.changes || 0)" in block
    assert "const reservationChanges = Number(results?.[1]?.meta?.changes || 0)" in block
    assert "couponChanges === 1 && reservationChanges === 1" in block
    assert "Coupon reservation redemption was not applied consistently" in block


def test_legacy_coupon_count_fallback_only_runs_without_reservation_record():
    source = (ROOT / "src/index.js").read_text()
    block = source.split("async function markOrderPaidAndToken", 1)[1].split("async function recordEmailEvent", 1)[0]
    assert "SELECT status FROM coupon_reservations WHERE order_id = ?1 LIMIT 1" in block
    assert "if (!reservationRecord)" in block
    assert "Coupon reservation is not redeemable for paid order" in block
