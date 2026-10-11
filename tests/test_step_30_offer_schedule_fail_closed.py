from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "src/index.js").read_text(encoding="utf-8")


def test_active_offer_with_malformed_schedule_fails_closed_instead_of_falling_back():
    assert "__invalid_schedule: true" in INDEX
    assert "__lookup_error: true" in INDEX
    assert "offer?.__lookup_error || offer?.__invalid_schedule" in INDEX
    assert "offer schedule" not in INDEX.lower() or "malformed active schedule" in INDEX.lower()


def test_valid_future_or_expired_offer_remains_not_live():
    assert "return isLive(o, \"ends_at\") ? o : null;" in INDEX
    assert "const malformed =" in INDEX
