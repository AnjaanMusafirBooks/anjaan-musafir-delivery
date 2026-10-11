"""Offline SQLite contract checks for the New Version admin foundation migration.
Run from repository root: python -m pytest tests/test_admin_auth_migration.py -q
These tests never connect to Cloudflare or production D1.
"""
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[2]
REPO = ROOT / "anjaan-musafir-delivery-new-version-candidate"


def _candidate_root() -> Path:
    # Works both when copied into the repo's tests/ folder and when run from this ZIP.
    here = Path(__file__).resolve()
    for candidate in (here.parents[2], here.parents[1], here.parents[0]):
        if (candidate / "db" / "schema.sql").exists():
            return candidate
    # ZIP layout includes step02/tests; repo is supplied separately by the user.
    raise AssertionError("Could not locate repository root containing db/schema.sql")


def _build_db():
    root = _candidate_root()
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript((root / "db" / "schema.sql").read_text(encoding="utf-8"))
    db.executescript((root / "db" / "migration" / "002_new_version_admin_foundation.sql").read_text(encoding="utf-8"))
    return db


def test_admin_tables_and_required_columns_exist():
    db = _build_db()
    expected = {
        "admin_users": {"user_id", "email", "password_hash", "role", "status", "failed_login_count", "locked_until"},
        "admin_sessions": {"session_id", "user_id", "token_hash", "expires_at", "revoked_at", "last_seen_at"},
        "admin_role_permissions": {"role", "permission_key", "allowed"},
        "admin_audit_log": {"action", "outcome", "request_id", "metadata_json"},
        "admin_security_events": {"event_type", "outcome", "detail_code", "request_id"},
    }
    for table, columns in expected.items():
        actual = {row[1] for row in db.execute(f"PRAGMA table_info({table})")}
        assert columns <= actual, f"{table} missing columns: {columns - actual}"


def test_role_seed_and_founder_wildcard_exist():
    db = _build_db()
    row = db.execute("SELECT allowed FROM admin_role_permissions WHERE role='FOUNDER' AND permission_key='*'").fetchone()
    assert row == (1,)
    roles = {r[0] for r in db.execute("SELECT DISTINCT role FROM admin_role_permissions")}
    assert {"FOUNDER", "ADMINISTRATOR", "OPERATIONS_MANAGER", "PRODUCT_MANAGER", "MARKETING_MANAGER", "CUSTOMER_SUPPORT", "CONTENT_EDITOR", "ANALYST", "TECHNICAL_SUPPORT"} <= roles


def test_existing_commerce_tables_remain_present_after_additive_migration():
    db = _build_db()
    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"products", "orders", "downloads", "offers", "coupons", "order_discounts", "admin_users", "admin_sessions"} <= tables


def test_unique_active_founder_constraint_exists():
    db = _build_db()
    db.execute("INSERT INTO admin_users (user_id,email,display_name,password_hash,role,status) VALUES ('u1','one@example.com','One','hash','FOUNDER','ACTIVE')")
    try:
        db.execute("INSERT INTO admin_users (user_id,email,display_name,password_hash,role,status) VALUES ('u2','two@example.com','Two','hash','FOUNDER','ACTIVE')")
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("Database allowed two ACTIVE Founder accounts")
