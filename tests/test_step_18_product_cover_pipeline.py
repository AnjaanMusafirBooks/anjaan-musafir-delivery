from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]


def test_cover_upload_and_public_cover_routes_are_wired():
    index = (ROOT / "src" / "index.js").read_text()
    upload = (ROOT / "src" / "cover-file-upload.js").read_text()
    assert 'import { handleCoverUpload, handlePublicCover } from "./cover-file-upload.js";' in index
    assert 'url.pathname.startsWith("/api/public/covers/")' in index
    assert 'url.pathname === "/api/v2/admin/products/cover-upload"' in index
    assert "public-covers/${crypto.randomUUID()}" in upload
    assert "customMetadata?.purpose !== \"public-book-cover\"" in upload
    assert '["image/png", "image/jpeg", "image/webp"]' in upload
    assert "MAX_COVER_BYTES = 3 * 1024 * 1024" in upload


def test_cover_asset_syncs_to_legacy_catalog_and_migration_is_additive():
    manager = (ROOT / "src" / "product-manager.js").read_text()
    index = (ROOT / "src" / "index.js").read_text()
    assert "active,cover_asset" in manager
    assert "cover_url: coverUrl" in index
    db = sqlite3.connect(":memory:")
    db.executescript((ROOT / "db" / "schema.sql").read_text())
    for migration in sorted((ROOT / "db" / "migration").glob("*.sql")):
        db.executescript(migration.read_text())
    assert "cover_asset" in {row[1] for row in db.execute("PRAGMA table_info(products)")}
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='014_product_cover_assets'").fetchone()[0] == 1


def test_existing_product_id_can_be_adopted_without_replacing_it():
    manager = (ROOT / "src" / "product-manager.js").read_text()
    assert "const requestedId = body.product_id.trim()" in manager
    assert "SELECT product_id FROM products WHERE product_id=?1 LIMIT 1" in manager
    assert "alreadyManaged" in manager
    assert "product_id must match an existing legacy product" in manager
