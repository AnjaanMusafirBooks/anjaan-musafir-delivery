from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
MIGRATION = (ROOT / "db/migration/006_new_version_permission_alignment.sql").read_text()
PRODUCT = (ROOT / "src/product-manager.js").read_text()
COUPON = (ROOT / "src/coupon-manager.js").read_text()
UPLOAD = (ROOT / "src/product-file-upload.js").read_text()

def test_permission_seed_matches_product_route_checks():
    for key in ["products.create", "products.update", "products.archive", "products.read"]:
        assert key in MIGRATION
    assert '"products.create"' in PRODUCT
    assert '"products.update"' in PRODUCT
    assert '"products.archive"' in PRODUCT
    assert '"products.read"' in PRODUCT

def test_permission_seed_matches_coupon_and_upload_checks():
    assert "coupons.read" in MIGRATION and "coupons.write" in MIGRATION
    assert '"coupons.read"' in COUPON and '"coupons.write"' in COUPON
    assert "files.manage" in MIGRATION and '"files.manage"' in UPLOAD

def test_migration_is_additive():
    assert "INSERT OR IGNORE" in MIGRATION
    assert "DROP TABLE" not in MIGRATION.upper()
    assert "DELETE FROM" not in MIGRATION.upper()
