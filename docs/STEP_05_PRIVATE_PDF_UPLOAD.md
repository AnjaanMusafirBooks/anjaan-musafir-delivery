# Step 5 — Private PDF upload foundation

## What this adds
- `POST /api/v2/admin/products/upload` protected by the `files.manage` permission.
- PDF-only validation (PDF header), 25 MB maximum, random private object key, and upload audit event.
- Requires a private R2 bucket binding named `BOOKS_BUCKET`.
- Response returns a storage key, not a public URL. Save that key as `pdf_file_key` when creating/updating the product.

## Staging-only setup required
1. Create a separate private R2 bucket for staging.
2. In the staging Worker configuration, set `BOOKS_BUCKET` to that bucket.
3. Apply `db/migration/005_new_version_file_upload_permission.sql` to the staging D1 database only.
4. Test unauthorized upload, wrong file type, oversized PDF, valid PDF upload, and download through the existing token-controlled download route.

## Limitations / not production-ready yet
- No browser upload form is wired to this endpoint yet.
- This endpoint does not publish PDFs or create product records automatically. The returned key must be saved via the Product Manager API.
- R2 object deletion/replacement lifecycle and rollback are not implemented here.
- A PDF header check is basic validation, not malware scanning.
- Do not deploy until all legacy routes have RBAC review and the full staging payment/download regression passes.
