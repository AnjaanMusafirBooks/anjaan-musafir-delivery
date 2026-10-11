-- New Version only: additive Product Manager foundation.
-- Apply ONLY to the isolated New Version D1 database after reviewing the schema.
-- Does not alter legacy products, orders, offers, coupons, or downloads tables.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS nv_products (
  product_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT 'Anjaan Musafir Books',
  description TEXT NOT NULL DEFAULT '',
  page_count INTEGER,
  language TEXT NOT NULL DEFAULT 'Hindi',
  cover_asset TEXT,
  pdf_file_key TEXT NOT NULL,
  mrp_paise INTEGER NOT NULL CHECK (mrp_paise >= 0),
  selling_price_paise INTEGER NOT NULL CHECK (selling_price_paise >= 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED')),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  popular INTEGER NOT NULL DEFAULT 0 CHECK (popular IN (0, 1)),
  offer_label TEXT,
  offer_starts_at TEXT,
  offer_ends_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (selling_price_paise <= mrp_paise),
  CHECK (page_count IS NULL OR page_count > 0)
);

CREATE INDEX IF NOT EXISTS idx_nv_products_status
  ON nv_products(status);
CREATE INDEX IF NOT EXISTS idx_nv_products_featured
  ON nv_products(featured, status);
CREATE INDEX IF NOT EXISTS idx_nv_products_updated
  ON nv_products(updated_at);

CREATE TABLE IF NOT EXISTS nv_product_file_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  previous_file_key TEXT,
  new_file_key TEXT NOT NULL,
  changed_by TEXT,
  change_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES nv_products(product_id)
);

CREATE INDEX IF NOT EXISTS idx_nv_product_file_history_product
  ON nv_product_file_history(product_id, created_at);

CREATE TABLE IF NOT EXISTS nv_product_price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  old_mrp_paise INTEGER,
  new_mrp_paise INTEGER NOT NULL CHECK (new_mrp_paise >= 0),
  old_selling_price_paise INTEGER,
  new_selling_price_paise INTEGER NOT NULL CHECK (new_selling_price_paise >= 0),
  changed_by TEXT,
  change_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES nv_products(product_id),
  CHECK (new_selling_price_paise <= new_mrp_paise)
);

CREATE INDEX IF NOT EXISTS idx_nv_product_price_history_product
  ON nv_product_price_history(product_id, created_at);
