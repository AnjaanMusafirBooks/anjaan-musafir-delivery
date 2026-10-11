from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def test_csv_includes_created_at_and_paid_at_and_uses_consistent_sort():
    src = (ROOT / "src" / "admin-reports.js").read_text()
    assert "created_at, paid_at FROM orders" in src
    assert "ORDER BY COALESCE(paid_at, created_at) DESC LIMIT 5001" in src
    assert '\"created_at\",\"paid_at\"' in src

def test_csv_refuses_silent_truncation_over_5000_rows():
    src = (ROOT / "src" / "admin-reports.js").read_text()
    assert "(rows.results || []).length > 5000" in src
    assert "Narrow the date range or add filters before exporting." in src
    assert "}, 413)" in src
