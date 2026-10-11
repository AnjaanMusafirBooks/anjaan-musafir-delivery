from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def test_release_does_not_mask_reserved_counter_underflow():
    source = (ROOT / 'src/index.js').read_text()
    block = source.split('async function releaseCouponReservation', 1)[1].split('async function consumeCouponReservation', 1)[0]
    assert 'SET reserved_count = reserved_count - 1' in block
    assert 'AND reserved_count > 0' in block
    assert 'SET reserved_count = MAX(0, reserved_count - 1)' not in block

def test_redemption_does_not_mask_reserved_counter_underflow():
    source = (ROOT / 'src/index.js').read_text()
    block = source.split('async function consumeCouponReservation', 1)[1].split('async function markOrderPaidAndToken', 1)[0]
    assert 'reserved_count = reserved_count - 1' in block
    assert 'AND reserved_count > 0' in block
    assert 'reserved_count = MAX(0, reserved_count - 1)' not in block
