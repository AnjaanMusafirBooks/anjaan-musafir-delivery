# Anjaan Musafir Books — Master Requirement Tracker

Date: 2026-10-11  
Candidate checkpoint: v16  
Scope: New Version candidate source audit; production systems were not accessed or changed.  
Status legend: `LOCALLY TESTED` means source/local tests only; it does not mean Cloudflare staging or live customer-flow verification.

## Summary
## Candidate v16 checkpoint

- Backend test suite: **143 passed**.
- Frontend test suite: **42 passed**.
- Backend and frontend JavaScript syntax checks: passed.
- Inline HTML script syntax checks: **6 passed**.
- Added Cashfree payment amount integrity gate: successful payment amount must match server-calculated `orders.final_price` to the nearest paise; supplied currency must be INR. Amount mismatch blocks PAID status and delivery.
- This remains local-source/test verification; Cashfree Sandbox and Cloudflare staging are not verified.


- Backend test suite at this checkpoint: **115 passed**.
- Frontend test suite at this checkpoint: **39 passed** (rerun separately).
- JavaScript syntax checks: passed for backend and frontend files (rerun separately).
- Baseline `db/schema.sql` plus migrations `001`–`016`: passed in in-memory SQLite smoke test.
- Cloudflare D1/R2, Cashfree sandbox, Brevo inbox delivery and browser staging: **not verified**.
- No production Worker, `main` branch or production database was deployed/migrated by this audit.

## Requirements

| ID | Requirement | Current source status | Remaining work / acceptance evidence |
|---|---|---|---|
| CUR-01 | Preserve Current Version and legacy checkout/payment behavior | PARTIALLY IMPLEMENTED | Run regression suite against a faithful staging baseline; do not deploy from candidate yet. |
| CUR-02 | Existing product IDs, old order amounts, coupons and downloads remain compatible | IMPLEMENTED — NOT STAGING TESTED | Verify representative legacy orders and all active product IDs in staging. |
| AUTH-01 | Founder bootstrap with server-side secret | LOCALLY TESTED | Verify one-time bootstrap and secret handling on isolated staging. |
| AUTH-02 | Secure password hashing and bearer sessions | LOCALLY TESTED | Staging test login, expiry, logout/revocation and token exposure checks. |
| AUTH-03 | Staff create/disable/enable and role assignment | IMPLEMENTED — NOT STAGING TESTED | Staging tests for all role paths and founder-only restrictions. |
| AUTH-04 | Server-side RBAC on every new-version protected endpoint | PARTIALLY IMPLEMENTED | Audit permission mappings for every endpoint; run allow/deny matrix. |
| AUTH-05 | Legacy `/api/admin/*` compatibility and RBAC migration | PARTIALLY IMPLEMENTED — Candidate v7 | Mapped routes require route-specific session permissions; legacy `ADMIN_KEY` remains a full owner break-glass bypass for compatibility. Never share it with staff; complete removal requires legacy client migration and owner approval. |
| AUTH-06 | Password reset/account recovery | LOCALLY TESTED — Candidate v7 | Added generic reset request, one-time hashed tokens, 30-minute expiry, PBKDF2 password update and active-session revocation; Brevo config and browser staging remain unverified. |
| AUTH-07 | Login rate limiting / brute-force protection | PARTIALLY IMPLEMENTED | Per-account lockout exists; assess distributed/IP rate limits and abuse resistance in staging. |
| ADM-01 | Dashboard real order/revenue metrics | IMPLEMENTED — NOT STAGING TESTED | Verify query definitions, amount units and data against known staging records. |
| ADM-02 | Orders and customer search/details | IMPLEMENTED — NOT STAGING TESTED | Test filters, pagination, privacy and actual record joins. |
| ADM-03 | Reports and CSV export | LOCALLY TESTED — Candidate v8 | Summary and CSV share date/status/product/coupon/search/min/max filters; formula-like CSV cells are prefixed to reduce spreadsheet formula injection risk. Verify totals against staging fixtures. |
| PROD-01 | Create product/book metadata | IMPLEMENTED — NOT STAGING TESTED | Verify all required fields, constraints and D1 persistence. |
| PROD-02 | Product Edit and Archive UI/API | LOCALLY TESTED | UI calls existing PATCH/archive APIs; test update/archive/refresh on staging. |
| PROD-03 | Cover/preview upload and product preview | IMPLEMENTED — NOT STAGING TESTED | Added image signature validation, R2 public-covers prefix, constrained public route, admin upload/preview and D1 catalog sync. Verify staging R2 bindings and browser rendering. |
| PROD-04 | Private PDF upload to R2 | IMPLEMENTED — NOT STAGING TESTED | Verify `BOOKS_BUCKET`, object permissions, file validation, failure cleanup and 25 MB limit. |
| PROD-05 | Product PDF mapping → checkout → customer download | NOT END-TO-END VERIFIED | Full staging purchase/download test required. |
| PROD-06 | Price hierarchy and old-order price snapshots | PARTIALLY IMPLEMENTED | Verify MRP → offer → coupon → payable consistency and historical amount immutability. |
| COUP-01 | Coupon create/list and server validation | IMPLEMENTED — NOT STAGING TESTED | Test percentage, flat, product restrictions, minimum, expiry, usage limits and concurrency. |
| COUP-02 | Coupon Edit and enable/disable UI/API | LOCALLY TESTED | Local source tests pass; verify persisted update and checkout reflection in staging. |
| COUP-03 | Scheduled offers, start/end times and reporting | PARTIALLY IMPLEMENTED / needs audit | Confirm every field and scheduler behavior required by the Master Plan. |
| PAY-01 | Cashfree order/session creation and server-side verification | EXISTING CODE PRESERVED; NOT STAGING VERIFIED | Test only with sandbox credentials; verify amount/currency and pending/failed/success states. |
| PAY-02 | Webhook signature verification and idempotency | EXISTING CODE PRESERVED; NOT STAGING VERIFIED | Verify signature test vectors, duplicate/reordered events and retry behavior. |
| PAY-03 | ₹0/free-order entitlement without Cashfree | NOT END-TO-END VERIFIED | Test 100% discount path and prove no gateway session is created. |
| PAY-04 | 99% discount and minimum supported payable amount | NOT END-TO-END VERIFIED | Test exact amount display and sandbox gateway behavior for small amounts. |
| DEL-01 | Download token issuance, expiry, usage limits and private R2 retrieval | EXISTING LEGACY FLOW + NEW TABLES; NOT END-TO-END VERIFIED | Test invalid/expired/revoked/exhausted token, correct PDF, and race conditions. |
| DEL-02 | My Order lookup by order ID + registered email | EXISTING LEGACY FLOW; NOT STAGING VERIFIED | Test valid/wrong email, throttling, expiry renewal and no extra payment. |
| DEL-03 | Download attempts displayed to customer | PARTIALLY IMPLEMENTED | Verify UI uses server-provided remaining/max counts and updates after download. |
| MAIL-01 | Brevo order email | IMPLEMENTED IN LEGACY FLOW; NOT INBOX VERIFIED | Verify staging secret, sender verification, accepted/delivered events and inbox result. |
| MAIL-02 | Canonical email activity ledger | LOCALLY TESTED — migration 007 added | Staging-apply migration 007; test accepted, failed and missing-config event rows. Provider delivery is not guaranteed by HTTP acceptance. |
| MAIL-03 | Email Activity admin API/UI | IMPLEMENTED — NOT STAGING TESTED | Endpoint now queries `nv_email_events`; verify role permission and UI table in staging. |
| MAIL-04 | Email retry workflow and duplicate-send policy | LOCALLY TESTED — Candidate v7 | Founder/staff permission-protected manual retry exists for PAID orders with a current unexpired token, checks per-order retry limits, records/audits outcomes; real Brevo delivery and duplicate behavior still need staging verification. |
| OPS-02 | Activity/audit logs | IMPLEMENTED — NOT STAGING TESTED | Verify coverage for every mutation, retention and pagination. |
| OPS-03 | Checkout attempts and abandoned/failed stages | PARTIALLY IMPLEMENTED / not fully proven | Add real event logging for observed stages; never invent unobservable `PAYMENT_STARTED` or abandonment. |
| OPS-04 | Advanced search and report filters | LOCALLY TESTED — Candidate v9 | Orders API/UI supports query, status, product, coupon, date, amount and recorded failed/pending problem filters. Report summary/CSV share filters; date range uses paid_at for paid orders and created_at fallback for unpaid orders. Live totals still need staging fixtures. |
| OPS-05 | Backup/export/restore/retention/safe mode/danger zone | PARTIALLY IMPLEMENTED — Candidate v9 | Added encrypted AES-256-GCM export and Founder-only staging merge restore, confirmation, audit, session invalidation, Owner Control Lock, Safe Mode, retention, and cleanup gated on an encrypted backup export within 30 minutes. Backup table inventory now includes real product file/price history tables. Still needs a staging restore drill, off-device backup verification and fuller Danger Zone coverage. |
| OPS-06 | Purchase Request/manual payment fallback | LOCALLY TESTED — Candidate v7 | Added public request, server price snapshot, per-email throttling, admin approve/reject, manual payment attestation, order/download entitlement and optional email. Staging still needs real payment-record verification. |
| CONTENT-01 | FAQ and website content manager | PARTIALLY IMPLEMENTED | Legacy content routes exist; compatibility and RBAC protection need migration and staging tests. |
| UX-01 | Premium checkout, instant coupon verification and payment modal | EXISTING CURRENT VERSION GAP; candidate integration not proven | This is explicitly part of Current Version stabilization; do not claim complete from admin candidate tests. |
| UX-02 | Congratulations/savings/download/My Order experience | EXISTING CURRENT VERSION GAP; not verified | Run all states on mobile staging; background remains visible and modal close/retry works. |
| UX-03 | Customer-facing errors and legal links | PARTIALLY IMPLEMENTED | Verify error copy, privacy/terms/refund links and no internal Cloudflare/D1/Brevo terminology. |
| CONFIG-01 | Candidate-only Wrangler config | LOCALLY REVIEWED | `wrangler.jsonc` is staging-placeholder config; fill only with separate staging D1/R2 IDs and staging URLs. Never use production IDs. |
| CONFIG-02 | Frontend API base | BLOCKED — STAGING URL NEEDED | `new-version-config.js` intentionally has blank `API_BASE`; set only to staging Worker HTTPS URL. |
| TEST-01 | Backend automated tests | LOCALLY TESTED | 109/109 passed at this checkpoint; rerun after further changes. |
| TEST-02 | Frontend automated tests | LOCALLY TESTED | 36/36 passed at this checkpoint; rerun after further changes. |
| TEST-03 | Schema+migrations compatibility | LOCALLY TESTED | Baseline schema + migrations 001–016 passed in SQLite; D1-specific staging execution still required. |
| TEST-04 | Browser and full staging integration | BLOCKED — EXTERNAL ACCESS | Requires isolated staging Worker, D1, R2, browser access, Cashfree sandbox credentials and optional Brevo setup. |
| DELIVER-01 | Consolidated backend/frontend ZIPs and setup guides | IN PROGRESS | Rebuild ZIPs after all code changes; verify archive integrity and include current tracker/test evidence. |


## Security notes

1. Mapped legacy admin routes now allow route-specific v2 session RBAC; the existing `ADMIN_KEY` remains a full owner break-glass bypass for compatibility. Never distribute it to staff. Removing the bypass requires migration of the legacy admin client and explicit owner approval.
2. `wrangler.jsonc` has staging placeholders. Do not replace them with production IDs or secrets.
3. `new-version-config.js` must point only to the isolated staging Worker before browser integration.
4. The presence of legacy static PDFs in `public/books/` does not prove they have been migrated to private R2. Confirm every product mapping and customer access path.
5. Email activity migration 007 is additive. If it is absent in an environment, email delivery attempts must not cause a paid order or download to fail.

## Candidate v7 coding checkpoint (2026-10-11)

- Backend tests: **109 passed** locally.
- Frontend tests: **36 passed** locally.
- Added code: `orders.created_at` migration and advanced order filters; `src/purchase-requests.js`, `src/password-reset.js`, `src/admin-maintenance.js`, migrations `008`–`016`, mapped legacy-route RBAC checks, safe expanded health diagnostics, encrypted database backup/merge restore, Owner Control Lock, Safe Mode and log retention, order created_at/advanced search, cover upload/catalog pipeline and existing product-ID adoption, privacy-preserving checkout lifecycle events, audited email retry, Purchase Requests admin UI, public manual request page, password recovery pages, and staging-safe checkout configuration.
- Candidate checkout no longer hardcodes the production Worker URL; `CHECKOUT_WORKER_URL` defaults blank and Cashfree mode defaults to sandbox.
- These are source/local results only. Cloudflare staging, D1/R2, Cashfree sandbox, Brevo inbox, and browser tests are still not verified.

## Exit criteria

Do not report 100% until every in-scope row is `COMPLETE — ACCEPTANCE CRITERIA PASSED`, or an exclusion is explicitly approved, and the staging purchase-to-download flow plus the admin role matrix passes. Production release is a separate approval step.


## Candidate v9 audit fixes (2026-10-11)

- Backend automated tests: **115 passed**; frontend automated tests: **39 passed**.
- Fixed a backup inventory mismatch: the export now names the actual `nv_product_file_history` and `nv_product_price_history` tables instead of a non-existent `nv_product_history` table. Active sessions and password-reset tokens remain excluded intentionally.
- Fixed report date filtering: paid orders use `paid_at`; orders without a paid timestamp use `created_at` as fallback, so date-filtered summaries/CSV do not silently omit pending/failed orders. Sales aggregation remains grouped by `paid_at`.
- SQL query parameters remain bound; text search is a substring search and does not claim to escape SQL wildcard characters.
- Re-ran JavaScript syntax checks, 6 inline HTML script syntax checks, and SQLite baseline schema + migrations 001–016; all passed locally.
- These are local source tests only; D1-specific behavior, R2 backup/PDF contents, Cashfree sandbox, Brevo inbox and browser checkout remain unverified.

## Candidate v10 audit update
- Report/order/customer search now treats `%`, `_`, and `\\` entered by an admin as literal characters rather than SQL LIKE wildcards. SQL values remain bound parameters.
- Regression tests cover report date semantics, wildcard escaping, bounded filters, and order/customer pagination.
- Backend suite: 118 passed locally. Cloudflare D1 runtime and staging remain unverified.


## Candidate v11 report export improvements (2026-10-11)
- CSV includes `created_at` and `paid_at`, and sorts by `COALESCE(paid_at, created_at)` to preserve a visible date for unpaid orders.
- Exports with more than 5,000 matching rows fail clearly with HTTP 413 instead of silently exporting a partial result. Admin should narrow filters and retry.
- Backend test suite: 120 passed locally. Frontend test suite: 40 passed locally.
- CSV browser download now delays object URL revocation by one second. Mobile browser staging still required.
- Completion remains blocked on staging-only Cloudflare D1/R2, Cashfree Sandbox, Brevo inbox, role matrix and purchase-to-download verification.

## Candidate v13 offer/coupon consistency audit (2026-10-11)
- Backend tests: **129 passed locally**; frontend tests: **42 passed locally**.
- Offer/coupon liveness now fails closed on malformed schedule timestamps, expired end times, and start/end windows where the start is not before the end.
- Legacy offer-write API validates product ID, non-negative rupee values with at most two decimal places, sale price not above MRP, date parsing/order, and requires an existing active product before activating an offer.
- New Version product manager validates offer date/time parsing and start/end order before saving metadata.
- Coupon manager rejects discount values with more than two decimal places; percentage cap remains 100%. Existing 100% coupon path still needs end-to-end staging verification for ₹0 order and entitlement.
- JavaScript syntax checks passed for backend and frontend JS; six inline HTML script checks passed. ZIP extraction and extracted test suites must be verified for this candidate.
- Not verified in Cloudflare D1/R2, Cashfree Sandbox, Brevo inbox, or browser staging. Do not claim offer/coupon production readiness from source tests alone.


## Candidate v14 update — checkout pricing consistency
- Fixed legacy coupon type mismatch: `PERCENTAGE` records are now calculated as percentage discounts, not flat currency discounts.
- Checkout product restrictions accept legacy JSON arrays as well as the canonical comma-separated format written by the admin manager.
- Invalid active offer values, sale price above MRP, invalid precision, and malformed base prices fail closed before payment amount creation.
- Runtime checkout validation rejects corrupt legacy coupon discount rows (non-finite/non-positive values, excess precision, unknown type, percentage above 100%).
- Backend local tests: 133 passed; frontend local tests: 42 passed; JavaScript syntax checks are required again for the final archive.
- Still not production/staging verified: coupon usage-limit concurrency, end-to-end Cashfree webhook/download, R2 cover/PDF behavior, Brevo delivery, role matrix, backup/restore drill and browser mobile checks.


## Candidate v17 — atomic coupon reservation and payment-state safety (2026-10-11)

- Backend pytest: **148 passed locally**; frontend pytest: **42 passed locally**.
- Added migration `018_atomic_coupon_reservations.sql`: coupon `reserved_count` plus `coupon_reservations` lifecycle table. Before a discounted paid or free order proceeds, the Worker atomically reserves available coupon capacity with a conditional update. This closes the last-use concurrency race at checkout creation.
- On successful payment, reservation redemption is guarded by the `RESERVED` state and executed through a D1 batch, so duplicate webhook/return-page handling does not count a reservation twice. Legacy orders without a reservation keep the prior usage-count compatibility path.
- Coupon capacity is released when Cashfree order creation fails, the local order insert fails, or Cashfree reports a definitive failure. An empty Cashfree payment list is now treated as `PENDING`, not a definitive failure, so an early status poll does not release a coupon while payment may still be in progress.
- SQLite baseline + migrations 001–018 smoke test passed; backend and frontend JS syntax checks passed; 6 inline HTML script checks passed. ZIP extraction and extracted tests are checked separately for the v17 handoff.
- **Known remaining risk:** reservations for abandoned but still-pending Cashfree orders need an explicit, safe expiry/reconciliation policy. They are not automatically released merely because time passed, to avoid releasing a slot for a payment that may still complete. A staging test must confirm Cashfree's terminal-status behavior before defining this cleanup policy.
- Still not verified: Cloudflare D1/R2 runtime, Cashfree Sandbox response shapes and webhook delivery, Brevo inbox, real concurrent staging checkouts, browser/mobile behavior, and the full purchase-to-download flow. Production Worker, production D1, production secrets and production `main` remain untouched.

## Candidate v18 — stale coupon reservation reconciliation (2026-10-11)
- Added protected `POST /api/v2/admin/coupons/reconcile-reservations`, requiring `coupons.manage` session permission.
- Reconciliation inspects at most 20 reservations older than 30 minutes per call. Age alone never releases a reservation: it queries Cashfree and releases only on a definitive `FAILED` result; `PENDING`, provider errors and amount mismatch retain the reservation; `SUCCESS` goes through the existing paid-order/token path.
- Added Admin Coupons UI control with confirmation and visible per-order results. Route is matched before generic coupon-manager routing.
- Added four backend contract/security regression tests and one frontend UI test.
- Local checks: backend **152 passed**, frontend **43 passed**, JS syntax checks passed, inline HTML script checks passed, SQLite schema + migrations **001–018** passed.
- This is a manual staging reconciliation tool, not an automated scheduler. Cloudflare D1 concurrency, Cashfree status response behavior and full purchase-to-download still require staging verification. No production Worker, D1, secrets or `main` was changed.


## Candidate v21 — coupon release accounting hardening (2026-10-11)
- Backend pytest: **159 passed locally**; frontend pytest: **43 passed locally**.
- Coupon reservation release now fails closed when its coupon row is missing, rather than changing reservation state and hiding an accounting-integrity fault.
- Release verifies both the coupon reserved-count decrement and reservation status transition; inconsistent outcomes raise an error, while a competing request that already released the reservation is treated as already resolved.
- JavaScript syntax checks passed for backend `src/*.js`, backend `website/*.js`, and frontend root `*.js`.
- Baseline SQLite schema plus migrations **001–018** passed in an in-memory smoke test.
- No production Worker, production D1, production secrets, or `main` branch was changed.
- Still not verified: Cloudflare D1 runtime/concurrency, Cashfree Sandbox, Brevo inbox, R2 private PDF delivery, Android/browser staging, admin role matrix, and complete purchase-to-download.
