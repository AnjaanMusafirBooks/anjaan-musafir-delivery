from pathlib import Path
SRC = Path(__file__).resolve().parents[1] / "src" / "product-manager.js"
TEXT = SRC.read_text(encoding="utf-8")
def test_private_pdf_key_is_verified_with_r2_head():
    assert 'env.BOOKS_BUCKET.head(key)' in TEXT
def test_missing_private_pdf_blocks_activation():
    assert 'PDF file was not found in private storage' in TEXT
def test_missing_r2_binding_blocks_activation():
    assert 'Private PDF storage is not configured; product cannot be activated.' in TEXT
def test_create_active_product_calls_guard():
    assert 'activePdfCheck(env, body.pdf_file_key, true)' in TEXT
def test_update_active_product_calls_guard():
    assert 'activePdfCheck(env, nextFile, false, old.pdf_file_key)' in TEXT
def test_legacy_unchanged_key_is_preserved():
    assert 'key === String(previousFileKey || "")' in TEXT
