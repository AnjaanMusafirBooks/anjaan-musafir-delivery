-- Add cover reference to the legacy catalog without changing existing rows or product IDs.
ALTER TABLE products ADD COLUMN cover_asset TEXT;
CREATE INDEX IF NOT EXISTS idx_products_cover_asset ON products(cover_asset);
INSERT OR IGNORE INTO schema_migrations(version,description)
VALUES ('014_product_cover_assets','Add product cover asset mapping to legacy storefront catalog');
