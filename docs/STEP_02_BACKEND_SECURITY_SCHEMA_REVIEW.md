# Step 02 — Backend Security & Schema Review

Date: 2026-10-10
Scope: consolidated local candidate source only. This is not a live Cloudflare/D1/Cashfree test.

## Checks completed

- `src/index.js` imports the candidate modules once each and CORS allows `Authorization` and `X-Bootstrap-Secret`.
- Product, coupon, order/customer, report, and operations modules call `requireAdminPermission` before their protected operations.
- The candidate `db/schema.sql` plus migrations `001_site_content.sql` through `004_new_version_order_delivery.sql` executed in a temporary in-memory SQLite database without SQL errors.
- Backend candidate pytest suite: 50 passed.
- No live Worker, production D1, or payment provider was contacted or changed.

## Confirmed blockers / risks

1. `wrangler.jsonc` in the consolidated source still contains production values (`CASHFREE_ENV=production`, production Worker URL, and production D1 database ID). Do not deploy this file as a candidate.
2. Legacy privileged routes under `/api/admin/*` remain on the legacy `ADMIN_KEY` flow and are not protected by the new role/permission system. This is an intentional staged compatibility boundary in the current draft, but it must be explicitly reviewed before the new Admin Panel is considered complete.
3. New Product Manager uses `nv_products`, but the existing customer catalog and checkout use legacy `products`/`offers` tables. Synchronization/migration policy is not implemented by the schema alone.
4. `pdf_file_key` and `cover_asset` are references only; upload/storage access controls and file replacement flows still need implementation and runtime verification.
5. Coupon manager updates the `coupons` table, but the checkout discount logic must be verified to enforce all coupon restrictions server-side and prevent over-discount/usage-limit races.
6. Email activity health route must not be called complete until its backing schema/logging and delivery failure cases are wired and tested.
7. Migration SQL was tested with SQLite in memory against the candidate base schema. Cloudflare D1 staging migration and representative data compatibility remain untested.
8. Bootstrap secret must remain a Cloudflare secret and must never be placed in a public frontend file or static HTML.

## Staging configuration requirements

Create a separate staging Worker and separate D1 database. Use a staging-only `wrangler` config, sandbox Cashfree credentials, and candidate frontend API URL. Do not copy production `database_id`, client secrets, or tokens into this example. Set secrets with Wrangler/Cloudflare secret settings, not in committed JSONC.

## Decision

Step 02 source review: **partially complete**. Local schema execution and source tests pass, but backend integration is not launch-ready. Next work: build explicit staging-safe configuration and implement/verify catalog synchronization, coupon server-side enforcement, and permission boundary tests without altering legacy production behavior.
