from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]


def test_purchase_request_module_is_routed_and_imported():
    src = (ROOT / "src" / "index.js").read_text()
    assert 'import { handlePurchaseRequests } from "./purchase-requests.js";' in src
    assert 'url.pathname === "/api/v2/purchase-requests"' in src
    assert 'url.pathname.startsWith("/api/v2/admin/purchase-requests")' in src


def test_purchase_request_uses_server_price_and_human_payment_attestation():
    src = (ROOT / "src" / "purchase-requests.js").read_text()
    assert "currentPrice(env.DB, productId)" in src
    assert '"purchase_requests.read"' in src
    assert '"purchase_requests.review"' in src
    assert "verified_payment_reference" in src
    assert "Math.abs(verifiedAmount - Number(row.expected_amount)) > 0.009" in src
    assert "payment_status,paid_at" in src
    assert "status='PENDING'" in src
    assert "status='APPROVING'" in src


def test_purchase_request_migration_is_additive_and_has_review_states():
    schema = (ROOT / "db" / "schema.sql").read_text()
    sql = (ROOT / "db" / "migration" / "008_new_version_purchase_requests.sql").read_text()
    db = sqlite3.connect(":memory:")
    db.executescript(schema)
    for migration in sorted((ROOT / "db" / "migration").glob("*.sql")):
        db.executescript(migration.read_text())
    cols = {row[1] for row in db.execute("PRAGMA table_info(nv_purchase_requests)")}
    assert {"request_id", "expected_amount", "payment_reference", "verified_payment_reference", "order_id"} <= cols
    assert "APPROVING" in sql and "APPROVED" in sql and "REJECTED" in sql
    assert db.execute("SELECT COUNT(*) FROM admin_role_permissions WHERE permission_key='purchase_requests.review'").fetchone()[0] >= 3


def test_approval_does_not_claim_provider_automated_verification():
    src = (ROOT / "src" / "purchase-requests.js").read_text()
    assert "Explicit human attestation is mandatory" in src
    assert "does not claim to verify UTR/provider payment itself" in src
    assert "Too many requests for this email" in src
