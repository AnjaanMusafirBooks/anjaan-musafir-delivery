from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "src/index.js").read_text(encoding="utf-8")


def test_cashfree_success_requires_exact_server_calculated_order_amount():
    assert '"SELECT final_price FROM orders WHERE order_id = ?1 LIMIT 1"' in INDEX
    assert 'payment?.payment_amount' in INDEX
    assert 'Math.round(actualAmount * 100) - Math.round(expectedAmount * 100)' in INDEX
    assert 'String(currency).toUpperCase() === "INR"' in INDEX
    assert 'return "AMOUNT_MISMATCH"' in INDEX


def test_payment_status_mismatch_does_not_mark_paid_or_issue_download():
    block = INDEX.split('if (status === "AMOUNT_MISMATCH")', 1)[1].split('if (status === "PENDING")', 1)[0]
    assert 'status: "PAYMENT_REVIEW"' in block
    assert "markOrderPaidAndToken" not in block
    assert "PAYMENT_AMOUNT_MISMATCH" in block


def test_webhook_mismatch_is_blocked_before_delivery_flow():
    webhook = INDEX.split("async function handleWebhook(", 1)[1]
    block = webhook.split('if (status === "AMOUNT_MISMATCH")', 1)[1].split('if (status === "SUCCESS")', 1)[0]
    assert "order remains unpaid" in block
    assert "markOrderPaidAndToken" not in block
    assert "PAYMENT_AMOUNT_MISMATCH" in block
