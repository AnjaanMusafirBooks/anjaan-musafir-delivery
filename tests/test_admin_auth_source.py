"""Static contract tests for the candidate auth module. Not an end-to-end Worker test."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
auth = (ROOT / "src" / "admin-auth.js").read_text()
worker = (ROOT / "src" / "index.js").read_text()


def test_password_hashing_and_token_hashing_are_present():
    assert "PBKDF2" in auth
    assert "pbkdf2-sha256" in auth
    assert "sha256Hex(token)" in auth
    assert "token_hash" in auth


def test_one_time_bootstrap_and_founder_only_staff_management():
    assert "ADMIN_BOOTSTRAP_SECRET" in auth
    assert "FOUNDER_ALREADY_EXISTS" in auth
    assert "auth.user.role !== \"FOUNDER\"" in auth


def test_session_expiry_revocation_and_safe_responses():
    assert "expires_at" in auth
    assert "revoked_at" in auth
    assert "password_hash" not in auth[auth.find("function safeUser"):auth.find("function bearer")]
    assert 'return json({ error: "a server error occurred. reference: " + requestid }, 500)' in auth.lower()


def test_v2_routes_are_separate_and_existing_worker_is_retained():
    assert 'from "./admin-auth.js"' in worker
    assert 'url.pathname.startsWith("/api/v2/admin/")' in worker
    assert '"/api/admin/"' in worker
    assert "handleCreateOrder" in worker
    assert "handleWebhook" in worker
