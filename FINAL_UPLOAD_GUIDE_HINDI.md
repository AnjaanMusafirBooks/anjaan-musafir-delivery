# Basic Version Worker (Backend) — Upload Guide

## Safety first
- This package intentionally contains a **staging-only** `wrangler.jsonc` with placeholders and `CASHFREE_ENV=sandbox`.
- Do not replace the production `main` branch or production Worker configuration with this package.
- Target repository: `anjaan-musafir-delivery`.
- Target branch: `basic-version`.
- Upload these contents at repository root so `src/`, `db/`, `public/`, `wrangler.jsonc`, `README.md`, and `tests/` are at the root.
- This package is a consolidated candidate, not proof of live deployment readiness. Configure separate staging D1 and R2 first.

## Before deploying staging
1. In Cloudflare, create a **separate staging D1 database** and a **private staging R2 bucket**.
2. Edit this package's `wrangler.jsonc` placeholders: `database_name`, `database_id`, and `bucket_name`. Keep worker name `anjaan-musafir-delivery-staging` and `CASHFREE_ENV: sandbox`.
3. Set Worker secrets in staging only: `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `ADMIN_BOOTSTRAP_SECRET` (minimum 32 characters), `ADMIN_KEY` for legacy routes, and optional email provider secrets if used. Never put secrets in source files or the frontend.
4. Configure `FRONTEND_URL` and `WORKER_PUBLIC_URL` for the staging addresses.
5. Review migrations `db/migration/001_site_content.sql` through `016_email_retry_permission.sql`. Apply them only to the staging D1 database, in numeric order. Migration 006 aligns seeded RBAC permissions with the route checks used by Product Manager, Coupon Manager and private PDF upload. Migration 007 creates the canonical email activity ledger. Migration 008 adds Purchase Requests, 009 adds one-time password reset tokens, 010 aligns RBAC keys for legacy admin routes, 011 adds backup permissions, 012 adds Owner Control Lock, safe mode and log-retention settings, and 013 adds order creation timestamps for advanced search.
6. Run tests from this folder: `pytest -q`. Check JavaScript syntax with `node --check src/index.js` and the other JS files.
7. Configure a staging-only Worker deployment. Do not deploy to production as part of this setup.
8. Bootstrap the Founder only by sending a secure POST request to `/api/v2/admin/bootstrap` with `X-Bootstrap-Secret` set to the staging `ADMIN_BOOTSTRAP_SECRET` and the required JSON fields expected by `src/admin-auth.js`. Never send this secret from the public website or share it in screenshots.

## Existing system compatibility
The New Version product manager synchronizes records to the existing `products` and `offers` tables. Confirm those tables and their expected columns exist in the staging D1 baseline before applying the new-version migrations. This package preserves the existing checkout code but live Cashfree, webhook, email, and download flows must be tested against staging credentials before any production release.

## Included
- `src/`: Worker and feature modules
- `db/migration/`: staged SQL migrations
- `db/schema.sql`: existing baseline schema reference
- `public/`: Worker static assets and included book files
- `website/`: shared checkout/success scripts
- `tests/`: automated source and migration checks
- `wrangler.jsonc`: staging-only config with placeholders


### Migration 007 — Email Activity
`db/migration/007_new_version_email_activity.sql` अब canonical email activity table बनाती है। इसे केवल isolated staging D1 पर migration 001–006 के बाद चलाएँ। Production D1 पर न चलाएँ।


### Candidate v7 — Added code paths
- Public manual request endpoint: `POST /api/v2/purchase-requests`
- Admin request list: `GET /api/v2/admin/purchase-requests`
- Review: `POST /api/v2/admin/purchase-requests/{request_id}/approve` or `/reject`
- Password recovery: `POST /api/v2/admin/password-reset/request` and `/confirm`
- Legacy `/api/admin/*` session requests now use route-specific RBAC. The legacy `ADMIN_KEY` remains a break-glass owner credential for compatibility and must never be shared with staff.
- System Health now reports safe configuration-presence flags and dependency warnings; it does not test external provider connectivity.
- Apply migrations 001–018 only to isolated staging D1. Set `FRONTEND_URL`, `WORKER_PUBLIC_URL`, Cashfree sandbox secrets, Brevo secret and private staging R2 binding only in staging.

- Encrypted backup/restore routes: `GET /api/v2/admin/maintenance/backup/export`, `POST /api/v2/admin/maintenance/backup/restore`.
- Configure `BACKUP_ENCRYPTION_KEY` as a Cloudflare secret (minimum 32 high-entropy characters) in staging only. Store the same key securely offline. Restore is blocked unless `APP_ENV=staging`, requires exact confirmation `RESTORE STAGING DATABASE`, merges rows only, and does not include R2 PDF object bytes.
- Backup/restore is Founder-only. Restore is not atomic across batches; use a clean isolated staging database and review its report.

- Owner Control Lock और Safe Mode सभी mapped New Version write routes तथा legacy admin mutations पर enforce होते हैं। Founder-only control routes से ही lock/mode बदले जा सकते हैं।
- Technical log cleanup केवल audit/security/email/password-reset logs पर चलता है; orders, products, coupons, purchase requests और download records delete नहीं होते। Retention default 90 days है; `ALWAYS` cleanup को disable करता है।


### New Version Candidate v7 — Added migrations
- `008_new_version_purchase_requests.sql`: manual purchase request ledger.
- `009_admin_password_reset.sql`: one-time hashed admin password reset tokens and rate tracking.
- `010_legacy_admin_permission_alignment.sql`: permission keys for mapped legacy admin routes.
- `011_admin_maintenance_backup.sql`: backup permissions.
- `012_admin_maintenance_controls.sql`: Owner Control Lock, Safe Mode and technical-log retention settings.

For encrypted database backup, configure `BACKUP_ENCRYPTION_KEY` as a Cloudflare secret with at least 32 high-entropy characters. The encrypted export includes database records/file keys, not R2 PDF bytes. Restore is Founder-only, merge-only, requires `APP_ENV=staging`, and is not atomic across batches; run it only against an isolated staging database.

- Migration `013_orders_created_at.sql` adds an order creation timestamp for future advanced search. Historical paid orders use known `paid_at`; historical pending orders remain NULL rather than inventing a date.

- Migration `014_product_cover_assets.sql` adds the cover asset field to the legacy catalog. Cover uploads are served publicly only under the restricted `public-covers/` prefix; PDF objects remain private. Existing product IDs can be adopted in Product Manager to preserve order references.

- Migration `015_checkout_event_tracking.sql` creates the checkout lifecycle event ledger and grants read permission to authorized operations/analyst roles. It stores email hashes, not raw email addresses, and telemetry failures never block checkout.

- Migration `016_email_retry_permission.sql` adds privileged manual email retry permissions. Retry only uses a current, unexpired token for a PAID order, has a per-order hourly limit, and records the provider outcome; use My Order if the token expired.
