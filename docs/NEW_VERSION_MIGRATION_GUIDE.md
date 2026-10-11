# New Version — Candidate/Staging Migration Guide (Hindi)

## सुरक्षा
- केवल अलग candidate/staging D1 database पर चलाएँ। Production D1 पर न चलाएँ।
- Existing checkout baseline की tables (`products`, `offers`, `coupons`, `orders`) पहले से मौजूद हैं और उनका schema `db/schema.sql`/current candidate source से verify होना चाहिए।
- Migration को एक-एक करके numeric order में चलाएँ; हर command का result check करें।

## क्रम
1. `db/migration/001_site_content.sql` — dynamic website content table और policy seeds।
2. `db/migration/002_new_version_admin_foundation.sql` — admin users, sessions, roles, permissions, audit/security tables।
3. `db/migration/003_new_version_product_manager.sql` — product metadata तथा price/file history।
4. `db/migration/004_new_version_order_delivery.sql` — My Order lookup throttling और download-token foundation tables।
5. `db/migration/005_new_version_file_upload_permission.sql` — private PDF upload permission seed।
6. `db/migration/006_new_version_permission_alignment.sql` — actual route permission keys (`products.create/update/archive/read`, `coupons.read/write`, `files.manage`) align करता है।

## Migration के बाद
- `admin_users`, `admin_sessions`, `admin_role_permissions`, `admin_audit_log`, `admin_security_events`, `nv_products`, `nv_product_file_history`, `nv_product_price_history`, `nv_download_tokens`, `nv_order_lookup_attempts` मौजूद होने की जाँच करें।
- Existing baseline tables `products`, `offers`, `coupons`, `orders` के columns verify करें; उन्हें drop या recreate न करें।
- Founder bootstrap केवल staging secret के साथ secure request से करें; secret frontend में न रखें।
- Worker secrets, D1 IDs, R2 bucket और frontend API_BASE staging-only हों।
- सभी migrations और integration tests pass होने से पहले staging को production न मानें।


## Migration 007 — Email activity ledger

`db/migration/007_new_version_email_activity.sql` creates the canonical `nv_email_events` table used by `/api/v2/admin/email-activity`. It stores outcome/status metadata only; it does not store email bodies, API keys, or raw provider responses. Apply after migrations 001–006 on isolated staging D1 only.


## Candidate v7 migrations 008–013

Apply after migrations 001–007, in numeric order, only to isolated staging D1:

- `008_new_version_purchase_requests.sql` — manual purchase request ledger and review permissions.
- `009_admin_password_reset.sql` — expiring one-time reset tokens and privacy-preserving rate tracking.
- `010_legacy_admin_permission_alignment.sql` — RBAC keys for compatibility-preserving legacy route access. The legacy `ADMIN_KEY` remains an owner break-glass credential; never distribute it to staff.
- `011_admin_maintenance_backup.sql` — backup permissions.
- `012_admin_maintenance_controls.sql` — Owner Control Lock, Safe Mode and technical-log retention settings.

Do not apply to production D1 as part of this candidate work. After applying, verify `schema_migrations` contains versions 001–016 and run the full staging permission matrix.

- `013_orders_created_at.sql` — adds `orders.created_at`, backfills only known historical paid timestamps, and uses a trigger for future order inserts.

- `014_product_cover_assets.sql` — adds a cover asset mapping to the legacy storefront catalog so New Version product covers can be rendered by the public catalog.

- `015_checkout_event_tracking.sql` — adds privacy-preserving checkout/payment/token/download lifecycle events and read permissions for the admin activity screen.

- `016_email_retry_permission.sql` — adds role permissions for the audited, rate-limited email delivery retry endpoint.
