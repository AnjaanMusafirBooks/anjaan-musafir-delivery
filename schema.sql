PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  product_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  regular_price REAL NOT NULL DEFAULT 0,
  current_price REAL NOT NULL DEFAULT 0,
  discount_price REAL NOT NULL DEFAULT 0,
  final_price REAL NOT NULL DEFAULT 0,
  coupon_code TEXT,
  payment_status TEXT NOT NULL DEFAULT 'CREATED',
  paid_at TEXT,
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);

CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  download_count INTEGER NOT NULL DEFAULT 0,
  last_download_at TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

CREATE TABLE IF NOT EXISTS offers (
  product_id TEXT PRIMARY KEY,
  mrp REAL,
  sale_price REAL,
  label TEXT,
  starts_at TEXT,
  ends_at TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  discount_type TEXT NOT NULL,
  discount_value REAL NOT NULL,
  product_ids TEXT NOT NULL DEFAULT '*',
  min_amount REAL,
  max_uses INTEGER,
  starts_at TEXT,
  expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_discounts (
  order_id TEXT PRIMARY KEY,
  coupon_code TEXT NOT NULL,
  original_price REAL NOT NULL,
  discount_amount REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id);
CREATE INDEX IF NOT EXISTS idx_downloads_token ON downloads(token);
CREATE INDEX IF NOT EXISTS idx_coupons_product ON coupons(product_ids);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
