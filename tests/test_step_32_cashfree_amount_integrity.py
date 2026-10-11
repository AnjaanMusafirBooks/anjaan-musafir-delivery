from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "src/index.js").read_text(encoding="utf-8")


def test_cashfree_success_requires_gateway_amount_to_match_server_order_amount():
    assert '"SELECT final_price FROM orders WHERE order_id = ?1 LIMIT 1"' in INDEX
    assert 'payment?.payment_amount' in INDEX
    assert 'String(currency).toUpperCase() === "INR"' in INDEX
    assert 'return "AMOUNT_MISMATCH"' in INDEX


def test_payment_status_amount_mismatch_does_not_issue_delivery():
    block = INDEX.split('if (status === "AMOUNT_MISMATCH")', 1)[1].split('if (status === "PENDING")', 1)[0]
    assert "PAYMENT_REVIEW" in block
    assert "markOrderPaidAndToken" not in block
    assert "PAYMENT_AMOUNT_MISMATCH" in block


def test_webhook_amount_mismatch_is_blocked_before_paid_flow():
    webhook = INDEX.split("async function handleWebhook(", 1)[1]
    mismatch = webhook.split('if (status === "AMOUNT_MISMATCH")', 1)[1].split('if (status === "SUCCESS")', 1)[0]
    assert "order remains unpaid" in mismatch
    assert "markOrderPaidAndToken" not in mismatch
    assert "PAYMENT_AMOUNT_MISMATCH" in mismatch
