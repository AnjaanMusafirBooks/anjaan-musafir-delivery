-- Anjaan Musafir Books: additive Product Manager fields.
-- Apply once to the intended STAGING D1 first. Do not run blindly on production.
ALTER TABLE products ADD COLUMN author TEXT;
ALTER TABLE products ADD COLUMN description TEXT;
ALTER TABLE products ADD COLUMN language TEXT NOT NULL DEFAULT 'Hindi';
ALTER TABLE products ADD COLUMN pages INTEGER;
ALTER TABLE products ADD COLUMN cover_url TEXT;
ALTER TABLE products ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN popular INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;
