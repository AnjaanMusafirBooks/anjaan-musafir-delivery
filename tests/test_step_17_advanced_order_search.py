from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]


def test_order_api_supports_safe_advanced_filters():
    src = (ROOT / "src" / "order-customer-manager.js").read_text()
    for key in ["product_id", "coupon", "from", "to", "min_amount", "max_amount", "problem_only"]:
        assert f'url.searchParams.get("{key}")' in src
    assert "abandoned checkout is not inferred" in src
    assert "created_at DESC" in src


def test_order_creation_timestamp_migration_preserves_unknown_historical_pending_dates():
    db = sqlite3.connect(":memory:")
    db.executescript((ROOT / "db" / "schema.sql").read_text())
    for migration in sorted((ROOT / "db" / "migration").glob("*.sql")):
        db.executescript(migration.read_text())
    cols = {row[1] for row in db.execute("PRAGMA table_info(orders)")}
    assert "created_at" in cols
    db.execute("INSERT INTO products(product_id,name,price,file_key,file_name) VALUES('P1','Book',10,'k','f')")
    db.execute("INSERT INTO orders(order_id,product_id,customer_phone,customer_email,payment_status) VALUES('ORD-0001','P1','12345678','x@example.com','PENDING')")
    created = db.execute("SELECT created_at FROM orders WHERE order_id='ORD-0001'").fetchone()[0]
    assert created is not None
