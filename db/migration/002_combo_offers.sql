-- Combo Offers: additive migration. Run ONCE against the existing D1 database.
-- Do not drop or recreate existing tables.
ALTER TABLE orders ADD COLUMN combo_id TEXT;

CREATE TABLE IF NOT EXISTS combo_offers (
  combo_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  combo_price REAL NOT NULL CHECK (combo_price >= 1),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS combo_items (
  combo_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (combo_id, product_id),
  FOREIGN KEY (combo_id) REFERENCES combo_offers(combo_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);

CREATE TABLE IF NOT EXISTS order_items (
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  download_count INTEGER NOT NULL DEFAULT 0,
  last_download_at TEXT,
  PRIMARY KEY (order_id, product_id),
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);

CREATE INDEX IF NOT EXISTS idx_combo_items_product ON combo_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
