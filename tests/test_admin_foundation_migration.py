"""Local smoke test for 002_new_version_admin_foundation.sql.

Uses an in-memory SQLite database to prove the migration is additive and can be
re-applied. This does not connect to or modify any Cloudflare D1 database.
"""
from pathlib import Path
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parents[1]
BASELINE_SCHEMA = ROOT / "db" / "schema.sql"
CONTENT_MIGRATION = ROOT / "db" / "migration" / "001_site_content.sql"
MIGRATION = ROOT / "db" / "migration" / "002_new_version_admin_foundation.sql"


class AdminFoundationMigrationTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript(BASELINE_SCHEMA.read_text(encoding="utf-8"))
        self.db.executescript(CONTENT_MIGRATION.read_text(encoding="utf-8"))
        self.db.execute(
            "INSERT INTO products (product_id, name, price, currency, file_key, file_name, active) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("KEEP001", "Existing test product", 49, "INR", "ebooks/test.pdf", "test.pdf", 1),
        )
        self.db.execute(
            "INSERT INTO orders (order_id, product_id, customer_phone, customer_email, regular_price, current_price, discount_price, final_price, payment_status) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("KEEP-ORDER-001", "KEEP001", "9000000000", "test@example.com", 99, 49, 50, 49, "PAID"),
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_migration_is_additive_and_idempotent(self):
        before = {
            "products": self.db.execute("SELECT COUNT(*) FROM products").fetchone()[0],
            "orders": self.db.execute("SELECT COUNT(*) FROM orders").fetchone()[0],
            "order": self.db.execute("SELECT order_id, product_id, final_price, payment_status FROM orders").fetchone(),
        }
        sql = MIGRATION.read_text(encoding="utf-8")
        self.db.executescript(sql)
        self.db.executescript(sql)  # idempotency check

        after = {
            "products": self.db.execute("SELECT COUNT(*) FROM products").fetchone()[0],
            "orders": self.db.execute("SELECT COUNT(*) FROM orders").fetchone()[0],
            "order": self.db.execute("SELECT order_id, product_id, final_price, payment_status FROM orders").fetchone(),
        }
        self.assertEqual(before, after)
        expected_tables = {
            "schema_migrations", "admin_users", "admin_sessions",
            "admin_role_permissions", "admin_audit_log", "admin_security_events",
        }
        actual_tables = {row[0] for row in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertTrue(expected_tables.issubset(actual_tables))
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='002_new_version_admin_foundation'").fetchone()[0],
            1,
        )
        self.assertGreater(
            self.db.execute("SELECT COUNT(*) FROM admin_role_permissions").fetchone()[0], 0
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
