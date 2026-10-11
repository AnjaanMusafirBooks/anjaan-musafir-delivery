from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def test_upload_route_is_wired_before_product_route():
    source = (ROOT / "src/index.js").read_text()
    assert 'import { handleProductFileUpload } from "./product-file-upload.js";' in source
    assert 'url.pathname === "/api/v2/admin/products/upload"' in source
    assert source.index('url.pathname === "/api/v2/admin/products/upload"') < source.index('url.pathname.startsWith("/api/v2/admin/products")')

def test_upload_requires_private_bucket_and_permission():
    source = (ROOT / "src/product-file-upload.js").read_text()
    assert 'env.BOOKS_BUCKET' in source
    assert '"files.manage"' in source
    assert 'MAX_PDF_BYTES = 25 * 1024 * 1024' in source
    assert '"%PDF-"' in source
    assert 'pdf_file_key: key' in source
    assert 'public URL' in source

def test_staging_example_has_separate_r2_placeholder():
    source = (ROOT / "wrangler.staging.example.jsonc").read_text()
    assert '"binding": "BOOKS_BUCKET"' in source
    assert 'REPLACE-WITH-PRIVATE-STAGING-BOOKS-BUCKET' in source

def test_migration_only_seeds_file_permission():
    source = (ROOT / "db/migration/005_new_version_file_upload_permission.sql").read_text()
    assert "files.manage" in source
    assert "DELETE FROM" not in source.upper()
    assert "DROP TABLE" not in source.upper()
