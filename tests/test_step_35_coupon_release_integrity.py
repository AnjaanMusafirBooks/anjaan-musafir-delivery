from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_release_fails_closed_when_coupon_row_is_missing():
    source = (ROOT / "src/index.js").read_text()
    block = source.split("async function releaseCouponReservation", 1)[1].split("async function consumeCouponReservation", 1)[0]
    assert "Coupon reservation references missing coupon during release" in block
    assert "if (!coupon) throw new Error" in block


def test_release_requires_both_counter_and_reservation_state_updates():
    source = (ROOT / "src/index.js").read_text()
    block = source.split("async function releaseCouponReservation", 1)[1].split("async function consumeCouponReservation", 1)[0]
    assert "const couponChanges = Number(results?.[0]?.meta?.changes || 0)" in block
    assert "const reservationChanges = Number(results?.[1]?.meta?.changes || 0)" in block
    assert "couponChanges === 1 && reservationChanges === 1" in block
    assert "Coupon reservation release was not applied consistently" in block
