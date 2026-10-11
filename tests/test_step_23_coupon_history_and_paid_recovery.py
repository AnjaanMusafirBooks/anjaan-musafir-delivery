from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_legacy_coupon_delete_preserves_used_history_and_blocks_reserved_coupon_delete():
    src = (ROOT / "src" / "index.js").read_text()
    block = src[src.index('path ===\n    "/api/admin/coupon-delete"'):src.index('return json(\n    {\n      error:\n        "Not found."', src.index('path ===\n    "/api/admin/coupon-delete"'))]
    assert 'SELECT code, used_count, reserved_count FROM coupons' in block
    assert 'Number(coupon.reserved_count || 0) > 0' in block
    assert '}, 409)' in block
    assert 'Number(coupon.used_count || 0) > 0' in block
    assert 'UPDATE coupons SET active = 0' in block
    assert 'reserved_count = 0 AND used_count = 0' in block


def test_reconciliation_recovers_paid_orders_with_stuck_reservations():
    src = (ROOT / "src" / "index.js").read_text()
    block = src[src.index("async function handleCouponReservationReconciliation"):src.index("SECTION 17 — MAIN ROUTER")]
    assert "if (String(reservation.payment_status || \"\").toUpperCase() === \"PAID\")" in block
    assert "consumeCouponReservation(env, reservation.order_id)" in block
    assert '"PAID_ORDER_RESERVATION_REDEEMED"' in block
    assert "AND o.payment_status != 'PAID'" not in block
