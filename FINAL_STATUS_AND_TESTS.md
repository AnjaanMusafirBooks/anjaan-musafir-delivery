# Candidate v21 — Local Status and Test Results

Date: 2026-10-11

## Latest local checks
- Backend pytest: **159 passed**.
- Frontend pytest: **43 passed**.
- `node --check` passed for backend `src/*.js`, backend `website/*.js`, and frontend root `*.js`.
- Baseline `db/schema.sql` plus migrations 001–018 passed in an in-memory SQLite smoke test.

## Candidate v21 coupon-accounting integrity improvement
- Coupon reservation release now fails closed when the referenced coupon row is missing.
- Both the coupon reserved-count decrement and reservation state transition must succeed before release is reported as successful.
- A concurrent request that already resolved the reservation is handled as already resolved; unexpected inconsistent states raise an error for operator investigation.
- Candidate v20 redemption hardening and legacy coupon fallback safeguards remain included.

## Not verified yet
- Cloudflare D1 runtime and real concurrent transaction behavior.
- Cashfree Sandbox payment/webhook and complete purchase-to-download.
- R2 private PDF access, token expiry/usage limits, Brevo inbox delivery, and Android/browser staging.
- Full admin permission allow/deny matrix and Current Version regression against faithful staging baseline.
- Production Worker, production D1, production secrets and production `main` were not changed.
