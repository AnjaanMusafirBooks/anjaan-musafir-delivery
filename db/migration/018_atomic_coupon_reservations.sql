-- Candidate-only: reserve coupon capacity at checkout creation to prevent concurrent oversubscription.
ALTER TABLE coupons ADD COLUMN reserved_count INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS coupon_reservations (
  order_id TEXT PRIMARY KEY,
  coupon_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED','REDEEMED','RELEASED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_coupon_reservations_code_status ON coupon_reservations(coupon_code, status);
INSERT OR IGNORE INTO schema_migrations(version, description)
VALUES ('018_atomic_coupon_reservations', 'Reserve coupon usage atomically across concurrent checkouts and release failed attempts');
