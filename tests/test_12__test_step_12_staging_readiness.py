from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_staging_checklist_has_production_safety_rules():
    doc = ROOT / "docs" / "STEP_12_STAGING_READINESS.md"
    assert doc.exists()
    text = doc.read_text(encoding="utf-8")
    assert "Do not run migrations" in text
    assert "production D1" in text
    assert "staging Worker" in text


def test_checklist_covers_cors_and_cashfree_regression():
    text = (ROOT / "docs" / "STEP_12_STAGING_READINESS.md").read_text(encoding="utf-8")
    assert "Authorization" in text
    assert "Cashfree Sandbox" in text
    assert "webhook signature verification" in text


def test_checklist_does_not_claim_live_testing_passed():
    text = (ROOT / "docs" / "STEP_12_STAGING_READINESS.md").read_text(encoding="utf-8")
    assert "does not mean staging or production tests passed" in text
