from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]


def test_password_reset_routes_and_hash_helper_are_wired():
    src = (ROOT / "src" / "index.js").read_text()
    auth = (ROOT / "src" / "admin-auth.js").read_text()
    reset = (ROOT / "src" / "password-reset.js").read_text()
    assert 'import { handlePasswordReset } from "./password-reset.js";' in src
    assert 'url.pathname === "/api/v2/admin/password-reset/request"' in src
    assert 'url.pathname === "/api/v2/admin/password-reset/confirm"' in src
    assert "export async function hashPasswordForReset" in auth
    assert "PBKDF2" in auth
    assert "token_hash" in reset and "used_at" in reset


def test_reset_request_is_non_enumerating_and_rate_limited():
    src = (ROOT / "src" / "password-reset.js").read_text()
    assert "If an active account matches this email" in src
    assert "email_hash" in src
    assert "COUNT(*) AS total" in src
    assert ">= 5" in src


def test_reset_confirm_revokes_sessions_and_checks_single_use_expiry():
    src = (ROOT / "src" / "password-reset.js").read_text()
    assert "used_at IS NULL" in src
    assert "reset-password.html#token=" in src
    assert "julianday(expires_at) > julianday('now')" in src
    assert "UPDATE admin_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=?1" in src
    assert "password_changed_at=CURRENT_TIMESTAMP" in src


def test_password_reset_migration_applies_after_prior_migrations():
    db = sqlite3.connect(":memory:")
    db.executescript((ROOT / "db" / "schema.sql").read_text())
    for migration in sorted((ROOT / "db" / "migration").glob("*.sql")):
        db.executescript(migration.read_text())
    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"nv_password_reset_tokens", "nv_password_reset_requests"} <= tables
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='009_admin_password_reset'").fetchone()[0] == 1
