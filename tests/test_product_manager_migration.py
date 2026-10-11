import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL = (ROOT / "db/migration/003_new_version_product_manager.sql").read_text(encoding="utf-8")

class ProductManagerMigrationTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript(SQL)

    def test_expected_tables_exist(self):
        names = {r[0] for r in self.db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )}
        self.assertTrue({"nv_products", "nv_product_file_history", "nv_product_price_history"} <= names)

    def test_no_legacy_table_mutations(self):
        # Migration is deliberately isolated and must not mention legacy DML/DDL targets.
        self.assertNotRegex(SQL.lower(), r"\b(drop|alter)\s+table\s+(products|orders|offers|coupons|downloads)\b")
        self.assertNotRegex(SQL.lower(), r"\binsert\s+into\s+(products|orders|offers|coupons|downloads)\b")

    def test_price_constraints(self):
        insert = """INSERT INTO nv_products
          (product_id, slug, name, pdf_file_key, mrp_paise, selling_price_paise)
          VALUES (?, ?, ?, ?, ?, ?)"""
        self.db.execute(insert, ("p1", "test-book", "Test Book", "test.pdf", 49900, 4900))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(insert, ("p2", "bad-book", "Bad Book", "bad.pdf", 4900, 49900))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(insert, ("p3", "negative-book", "Negative Book", "negative.pdf", -1, 0))

    def test_duplicate_slug_rejected(self):
        insert = """INSERT INTO nv_products
          (product_id, slug, name, pdf_file_key, mrp_paise, selling_price_paise)
          VALUES (?, ?, ?, ?, ?, ?)"""
        self.db.execute(insert, ("p1", "same-slug", "Book 1", "a.pdf", 10000, 1000))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(insert, ("p2", "same-slug", "Book 2", "b.pdf", 10000, 1000))

if __name__ == "__main__":
    unittest.main()
