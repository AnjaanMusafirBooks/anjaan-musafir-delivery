# Anjaan Musafir Books — New Version Backend Candidate v4

This package is **candidate/staging code**, not a production release. It preserves the existing Cashfree order/payment/webhook and secure download code while adding New Version admin modules.

## Safety requirements

- Repository target: `anjaan-musafir-delivery`, branch `basic-version`.
- Use only a dedicated staging Worker, D1 database, private R2 bucket, Cashfree sandbox credentials and staging secrets.
- `wrangler.jsonc` has staging placeholders. Never replace them with production IDs or secrets.
- Set `APP_ENV=staging`, `CASHFREE_ENV=sandbox`, `FRONTEND_URL`, `WORKER_PUBLIC_URL` and a separate D1/R2 binding.
- Configure Cloudflare secrets in staging only: `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `ADMIN_BOOTSTRAP_SECRET` (32+ characters), `ADMIN_KEY` for legacy owner compatibility, optional `BREVO_API_KEY`, `BREVO_SENDER`, and `BACKUP_ENCRYPTION_KEY` (32+ high-entropy characters).
- Do not distribute `ADMIN_KEY` to staff. It remains a legacy owner break-glass credential.
- Do not deploy to production or migrate production D1 as part of this work.

## Migrations

Apply `db/migration/001_site_content.sql` through `013_orders_created_at.sql` in numeric order to a separate staging D1. Review `FINAL_UPLOAD_GUIDE_HINDI.md` and `docs/NEW_VERSION_MIGRATION_GUIDE.md` first. Do not blindly run these migrations against an existing production database.

## Important endpoints added in Candidate v4

- Purchase request: `POST /api/v2/purchase-requests`
- Admin request review: `GET /api/v2/admin/purchase-requests`, `POST .../{request_id}/approve`, `POST .../{request_id}/reject`
- Password recovery: `POST /api/v2/admin/password-reset/request`, `POST /api/v2/admin/password-reset/confirm`
- Maintenance state: `GET /api/v2/admin/maintenance/state`
- Owner Control Lock: `POST /api/v2/admin/maintenance/owner-control/lock` and `/unlock`
- Safe Mode: `POST /api/v2/admin/maintenance/mode`
- Technical log retention: `POST /api/v2/admin/maintenance/retention` and `/retention/apply`
- Encrypted database backup: `GET /api/v2/admin/maintenance/backup/export`
- Staging merge restore: `POST /api/v2/admin/maintenance/backup/restore`
- Checkout events: `GET /api/v2/admin/checkout-events`
- Product cover upload: `POST /api/v2/admin/products/cover-upload`; public cover read is limited to `/api/public/covers/public-covers/...`

Manual payment approval is a human attestation; code does not independently verify UTR/payment. Encrypted database backups exclude R2 PDF object bytes. Restore is merge-only and non-atomic across batches, and it is disabled unless `APP_ENV=staging`.

## Local checks

```bash
pytest -q
node --check src/index.js
```

Also run `node --check` for every JavaScript file under `src/` and `website/`. Local tests do not prove Cloudflare D1/R2, Cashfree sandbox, Brevo inbox delivery or browser staging success.

## Status

See `FINAL_STATUS_AND_TESTS.md` and `MASTER_REQUIREMENT_TRACKER.md`. Do not declare 100% or production-ready until the staging purchase-to-download flow, role matrix, email, backup/restore and browser acceptance tests pass.
