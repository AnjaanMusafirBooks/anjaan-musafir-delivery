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
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'CREATED',
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_downloads_token ON downloads(token);

-- Replace this example with your real product after creating the R2 object.
INSERT OR IGNORE INTO products
(product_id, name, price, currency, file_key, file_name, active)
VALUES
('DISTRACTION_TRAP', 'The Distraction Trap', 99, 'INR',
 'ebooks/the-distraction-trap.pdf',
 'The-Distraction-Trap.pdf', 1);
