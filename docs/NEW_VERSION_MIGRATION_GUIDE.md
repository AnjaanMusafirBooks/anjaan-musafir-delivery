# New Version migration guide — Batch 01

## Safety boundary
- This migration is additive and intended for an isolated candidate/staging D1 database first.
- Do **not** apply it to the live production D1 as part of this batch.
- Do not run `DROP`, reset, or recreate commands against the current database.
- Existing `products`, `orders`, `downloads`, `offers`, `coupons`, `order_discounts` and `site_content` tables are not altered by this SQL.

## File
`db/migration/002_new_version_admin_foundation.sql`

## What it adds
- `schema_migrations`
- `admin_users`
- `admin_sessions` (stores a token hash field; raw session tokens must never be stored)
- `admin_role_permissions`
- `admin_audit_log`
- `admin_security_events`
- Indexes for role/status, session expiry, audit search and security event search.
- Least-privilege starter permission rows. These rows do not secure APIs until backend permission enforcement is implemented.

## Apply in staging only
1. Create/use a separate candidate D1 database, not the production D1.
2. Back up that candidate database before applying schema changes.
3. Review this SQL and compare its assumptions to the candidate schema.
4. Apply with Wrangler using the candidate database name/ID and an isolated Wrangler configuration. Do not copy production IDs into a candidate config.
5. Run the migration smoke test in `tests/test_admin_foundation_migration.py`.
6. Verify all new tables/indexes exist and all pre-existing table counts/rows remain unchanged.

Example command (replace with your actual candidate database name and candidate config):

```bash
npx wrangler d1 execute YOUR_CANDIDATE_DB --remote --file=./db/migration/002_new_version_admin_foundation.sql --config=./wrangler.candidate.jsonc
```

Do not run this command against `anjaan-musafir-db` unless the owner separately approves a reviewed production migration.

## Important limitation
This migration creates the authentication/RBAC data model only. It does not yet implement login, one-time Founder bootstrap, password hashing, session issuance/invalidation or API permission enforcement. Do not treat the Admin Panel as secured until those backend features and tests are delivered.
