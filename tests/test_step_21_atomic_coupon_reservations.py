from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]


def migrated_db():
    db = sqlite3.connect(":memory:")
    db.executescript((ROOT / "db" / "schema.sql").read_text())
    for migration in sorted((ROOT / "db" / "migration").glob("*.sql")):
        db.executescript(migration.read_text())
    return db


def test_migration_adds_reservation_capacity_and_idempotent_records():
    db = migrated_db()
    columns = {row[1] for row in db.execute("PRAGMA table_info(coupons)")}
    assert "reserved_count" in columns
    tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "coupon_reservations" in tables
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='018_atomic_coupon_reservations'").fetchone()[0] == 1


def test_last_coupon_use_can_only_be_reserved_once():
    db = migrated_db()
    db.execute("INSERT INTO coupons(code,discount_type,discount_value,max_uses) VALUES('LAST','PERCENT',10,1)")
    sql = "UPDATE coupons SET reserved_count=reserved_count+1 WHERE code=? AND active=1 AND (max_uses IS NULL OR used_count+reserved_count<max_uses)"
    first = db.execute(sql, ("LAST",))
    assert first.rowcount == 1
    db.execute("INSERT INTO coupon_reservations(order_id,coupon_code,status) VALUES('o1','LAST','RESERVED')")
    second = db.execute(sql, ("LAST",))
    assert second.rowcount == 0
    assert db.execute("SELECT used_count,reserved_count FROM coupons WHERE code='LAST'").fetchone() == (0, 1)


def test_redemption_is_idempotent_and_moves_reserved_to_used():
    db = migrated_db()
    db.execute("INSERT INTO coupons(code,discount_type,discount_value,max_uses,reserved_count) VALUES('LAST','PERCENT',10,1,1)")
    db.execute("INSERT INTO coupon_reservations(order_id,coupon_code,status) VALUES('o1','LAST','RESERVED')")
    db.commit()
    for _ in range(2):
        db.execute("BEGIN")
        db.execute("UPDATE coupons SET used_count=used_count+1,reserved_count=MAX(0,reserved_count-1) WHERE code=? AND EXISTS (SELECT 1 FROM coupon_reservations WHERE order_id=? AND status='RESERVED')", ("LAST", "o1"))
        db.execute("UPDATE coupon_reservations SET status='REDEEMED',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND status='RESERVED'", ("o1",))
        db.commit()
    assert db.execute("SELECT used_count,reserved_count FROM coupons WHERE code='LAST'").fetchone() == (1, 0)
    assert db.execute("SELECT status FROM coupon_reservations WHERE order_id='o1'").fetchone()[0] == "REDEEMED"


def test_source_reserves_free_and_paid_coupon_orders_and_keeps_empty_gateway_result_pending():
    src = (ROOT / "src" / "index.js").read_text()
    assert "async function reserveCouponForOrder" in src
    assert "async function releaseCouponReservation" in src
    assert "async function consumeCouponReservation" in src
    assert "const freeCouponReservation = await reserveCouponForOrder" in src
    assert "const couponReservation = await reserveCouponForOrder" in src
    assert "await releaseCouponReservation(env, orderId)" in src
    assert "if (payments.length === 0) return \"PENDING\"" in src
    assert "status = 'REDEEMED'" in src


def test_backup_inventory_includes_coupon_reservations_and_manager_preserves_capacity():
    maintenance = (ROOT / "src" / "admin-maintenance.js").read_text()
    manager = (ROOT / "src" / "coupon-manager.js").read_text()
    assert '"coupon_reservations"' in maintenance
    assert "reserved_count" in manager
    assert "body.max_uses < Number(current.used_count || 0) + Number(current.reserved_count || 0)" in manager
    assert "max_uses cannot be lower than already redeemed plus reserved coupon uses" in manager
