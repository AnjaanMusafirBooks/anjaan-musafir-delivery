# New Version — Product Manager Foundation (Batch 4)

## Scope
This batch creates an additive schema foundation for the isolated New Version Product Manager. It is intentionally separate from legacy `products`, `offers`, `coupons`, `orders`, and `downloads` tables.

## Files
- `db/migration/003_new_version_product_manager.sql` — new migration; does not replace any existing file.
- `tests/test_product_manager_migration.py` — local schema guard tests.
- `docs/PRODUCT_MANAGER_FOUNDATION.md` — this setup and safety note.

## Tables
- `nv_products`: stable product ID, slug, metadata, cover asset, PDF file key, paise-based prices, status, featured/popular flags, offer window, timestamps.
- `nv_product_file_history`: records PDF file-key changes.
- `nv_product_price_history`: records MRP/selling-price changes.

All prices are stored as integer paise to avoid floating-point currency errors. Product prices must be non-negative and selling price cannot exceed MRP. This migration does not create fake product rows.

## Important safety boundary
1. Use only in the New Version candidate's isolated D1 database.
2. Do not run this against production D1.
3. Do not change `main`, the current Worker, current product tables, Cashfree, coupons, or paid-order records.
4. Do not connect the frontend to these tables yet. Batch 4 is schema foundation only; API authorization, validation, audit logging, PDF allowlisting, and integration tests must be completed before any UI can save products.
5. Existing file keys must be validated against an explicit server-side allowlist in the future API. Never accept arbitrary paths from the browser.

## Manual review checklist
- [ ] Confirm this is the isolated New Version D1 database.
- [ ] Review SQL and ensure backup/export exists before applying.
- [ ] Apply migration only to that candidate database.
- [ ] Verify the three `nv_*` tables and indexes exist.
- [ ] Do not use production payment or customer data for tests.
