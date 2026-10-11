from pathlib import Path

SRC = Path(__file__).parents[1] / "src" / "product-manager.js"
TEXT = SRC.read_text(encoding="utf-8")


def test_product_manager_syncs_legacy_checkout_products_table():
    assert "async function syncLegacyCatalog(env, row)" in TEXT
    assert "INSERT INTO products (product_id,name,price,currency,file_key,file_name,active,cover_asset)" in TEXT
    assert "ON CONFLICT(product_id) DO UPDATE" in TEXT


def test_product_manager_syncs_legacy_checkout_offers_table():
    assert "INSERT INTO offers (product_id,mrp,sale_price,label,starts_at,ends_at,active)" in TEXT
    assert "selling !== mrp" in TEXT
    assert "row.status === \"ACTIVE\" ? 1 : 0" in TEXT


def test_create_update_and_archive_sync_catalog():
    assert TEXT.count("await syncLegacyCatalog(env, row);") >= 2
    assert "await syncLegacyCatalog(env, archived);" in TEXT


def test_sync_uses_storage_key_and_safe_filename():
    assert "PDF storage key is missing" in TEXT
    assert "fileNameFromKey(fileKey)" in TEXT
    assert "The PDF itself is" in TEXT
