# Anjaan Musafir Books — Master Requirement Tracker

Date: 2026-10-11  
Scope: New Version candidate source audit; production systems were not accessed or changed.  
Status legend: `LOCALLY TESTED` means source/local tests only; it does not mean Cloudflare staging or live customer-flow verification.

## Summary

- Backend test suite at this checkpoint: **112 passed**.
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
| MAIL-04 | Email retry workflow and duplicate-send policy | PARTIALLY IMPLEMENTED / missing workflow | Add retry/queue or safe manual retry if required; define idempotency and audit. |
| OPS-02 | Activity/audit logs | IMPLEMENTED — NOT STAGING TESTED | Verify coverage for every mutation, retention and pagination. |
| OPS-03 | Checkout attempts and abandoned/failed stages | PARTIALLY IMPLEMENTED / not fully proven | Add real event logging for observed stages; never invent unobservable `PAYMENT_STARTED` or abandonment. |
| OPS-04 | Advanced search and report filters | PARTIALLY IMPLEMENTED — Candidate v7 | Orders API/UI now supports query, status, product, coupon, date, amount and recorded failed/pending problem filters. Report/CSV filter parity and live data validation remain. |
| OPS-05 | Backup/export/restore/retention/safe mode/danger zone | PARTIALLY IMPLEMENTED — Candidate v7 | Added encrypted AES-256-GCM database export and Founder-only staging merge restore, confirmation phrase, audit, session invalidation, Owner Control Lock, Safe Mode, configurable technical-log retention and manual cleanup. Still needs a staging restore drill and Danger Zone workflow. |
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


## Candidate v8 additions (2026-10-11)

- Reports and CSV now share filters for date, status, product ID, coupon, free-text order/customer/product search, and minimum/maximum amount. Invalid statuses and invalid amount ranges are rejected. CSV formula-like values are prefixed before export.
- Technical-log retention cleanup now fails closed unless a successful encrypted database backup was generated within the prior 30 minutes, and still requires the exact destructive-action confirmation phrase. This marker does not prove the downloaded file was stored safely.
- Latest local tests: backend **112 passed**, frontend **39 passed**. Browser, Cloudflare D1/R2, Cashfree sandbox, and Brevo delivery remain unverified.
