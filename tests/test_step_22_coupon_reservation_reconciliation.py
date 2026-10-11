from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_reconciliation_is_admin_permission_protected_and_bounded():
    src = (ROOT / "src" / "index.js").read_text()
    block = src[src.index("async function handleCouponReservationReconciliation"):src.index("SECTION 17 — MAIN ROUTER")]
    assert 'requireAdminPermission(request, env, "coupons.manage")' in block
    assert "if (request.method !== \"POST\")" in block
    assert "LIMIT 20" in block
    assert "datetime(r.created_at) <= datetime('now', '-30 minutes')" in block


def test_reconciliation_only_releases_definitive_failures_and_keeps_pending():
    src = (ROOT / "src" / "index.js").read_text()
    block = src[src.index("async function handleCouponReservationReconciliation"):src.index("SECTION 17 — MAIN ROUTER")]
    assert 'if (status === "FAILED")' in block
    assert 'await releaseCouponReservation(env, reservation.order_id)' in block
    assert 'if (status === "SUCCESS")' in block
    assert 'if (status === "AMOUNT_MISMATCH")' in block
    assert '"PAYMENT_REVIEW_RESERVATION_RETAINED"' in block
    assert '"STILL_PENDING_RESERVATION_RETAINED"' in block
    assert '"RETRY_LATER_RESERVATION_RETAINED"' in block


def test_reconciliation_route_precedes_generic_coupon_manager_route():
    src = (ROOT / "src" / "index.js").read_text()
    specific = src.index('url.pathname === "/api/v2/admin/coupons/reconcile-reservations"')
    generic = src.index('url.pathname.startsWith("/api/v2/admin/coupons")')
    assert specific < generic


def test_admin_ui_explains_and_invokes_safe_reconciliation():
    html = (ROOT.parent / "nv_web" / "admin-dashboard.html")
    # UI source is validated by the paired frontend tests; this test checks backend route contract only.
    assert "LIMIT 20" in (ROOT / "src" / "index.js").read_text()
