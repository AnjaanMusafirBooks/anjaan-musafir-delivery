from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HELPERS = (ROOT / "src" / "order-delivery.js").read_text()
MIGRATION = (ROOT / "db" / "migration" / "004_new_version_order_delivery.sql").read_text()
API_DOC = (ROOT / "docs" / "MY_ORDER_DELIVERY_API.md").read_text()


def test_helpers_include_validation_and_token_hashing():
    assert "normalizeEmail" in HELPERS
    assert "isSafeOrderId" in HELPERS
    assert "createDownloadToken" in HELPERS
    assert "sha256Hex" in HELPERS


def test_download_limit_and_expiry_helpers_exist():
    assert "isFutureTimestamp" in HELPERS
    assert "isDownloadLimitAvailable" in HELPERS


def test_migration_is_additive_and_has_security_fields():
    assert "CREATE TABLE IF NOT EXISTS nv_download_tokens" in MIGRATION
    assert "token_hash TEXT NOT NULL UNIQUE" in MIGRATION
    assert "expires_at INTEGER NOT NULL" in MIGRATION
    assert "download_limit INTEGER NOT NULL" in MIGRATION
    assert "revoked_at INTEGER" in MIGRATION


def test_api_contract_requires_payment_verification_and_rate_limits():
    assert "payment" in API_DOC.lower()
    assert "rate-limit" in API_DOC.lower()
    assert "server-controlled" in API_DOC.lower()
