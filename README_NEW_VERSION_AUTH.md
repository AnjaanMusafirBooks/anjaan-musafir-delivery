# New Version Auth Batch

This is a candidate-only authentication foundation. See:
- `docs/ADMIN_AUTH_SETUP.md`
- `docs/ADMIN_AUTH_API.md`
- `db/migration/002_new_version_admin_foundation.sql` (delivered in Batch 1)

Do not deploy to the production Worker or apply migrations to production D1 without explicit owner authorization. Existing `/api/admin/` routes are intentionally still legacy and require migration before the full Admin Panel can be considered secure.
