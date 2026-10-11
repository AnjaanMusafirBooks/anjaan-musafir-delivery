from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "src" / "index.js").read_text(encoding="utf-8")
STAGING = (ROOT / "wrangler.staging.example.jsonc").read_text(encoding="utf-8")
UPLOAD = (ROOT / "src" / "product-file-upload.js").read_text(encoding="utf-8")


def test_download_prefers_new_private_staging_bucket_and_preserves_legacy_binding():
    assert "const privateBooksBucket = env.BOOKS_BUCKET || env.BOOKS;" in INDEX
    assert "privateBooksBucket.get(key)" in INDEX


def test_staging_bucket_binding_matches_upload_and_download_code():
    assert '"binding": "BOOKS_BUCKET"' in STAGING
    assert "env.BOOKS_BUCKET" in UPLOAD
    assert "env.BOOKS_BUCKET || env.BOOKS" in INDEX


def test_upload_stores_private_key_and_does_not_create_public_url():
    assert 'const key = `private-books/${crypto.randomUUID()}/${safeName}`;' in UPLOAD
    assert "pdf_file_key: key" in UPLOAD
    assert "No public link was created." in UPLOAD
