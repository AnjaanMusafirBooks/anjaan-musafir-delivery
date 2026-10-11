-- Add an honest creation timestamp for new and future order-search/report workflows.
-- Historical paid orders use their known paid_at timestamp; historical unpaid orders remain NULL.
ALTER TABLE orders ADD COLUMN created_at TEXT;
UPDATE orders SET created_at=paid_at WHERE created_at IS NULL AND paid_at IS NOT NULL;
CREATE TRIGGER IF NOT EXISTS trg_orders_created_at_after_insert
AFTER INSERT ON orders
WHEN NEW.created_at IS NULL
BEGIN
  UPDATE orders SET created_at=CURRENT_TIMESTAMP WHERE order_id=NEW.order_id;
END;
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
INSERT OR IGNORE INTO schema_migrations(version,description)
VALUES ('013_orders_created_at','Add order creation timestamp and index without inventing historical pending-order timestamps');
