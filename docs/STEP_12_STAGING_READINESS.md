# Step 12 — Candidate Staging Readiness Gate

## Purpose
The previous steps added cumulative candidate code across authentication, product management, coupons, orders/customers, reports, dashboard UI, staff management, and operations. Before adding more features, verify that the *assembled* candidate branch is internally consistent. This step adds no runtime code and does not change the Current Version.

## Exact locations
- Repository: `anjaan-musafir-delivery`
- Branch: `new-version-candidate`
- New file: `docs/STEP_12_STAGING_READINESS.md`
- New file: `tests/test_step_12_staging_readiness.py`

## Mandatory safety rules
1. Do not replace `src/index.js` with a ZIP from an earlier step. The latest cumulative file must be reviewed once before deployment.
2. Do not run migrations 002–004 against production D1. Use a separate candidate/staging D1 database.
3. Do not deploy the candidate Worker to the production route.
4. Keep the current production `main` branches unchanged until approval.
5. Never paste API secrets, Cashfree credentials, bootstrap secrets, or customer data into chat or commit them to GitHub.

## Staging checklist
- [ ] Confirm the candidate `src/index.js` imports every referenced module that exists in `src/`.
- [ ] Confirm every imported handler has the same exported name as the import.
- [ ] Confirm the CORS allow-headers list includes `Authorization`, `Content-Type`, and any custom header actually used by the frontend.
- [ ] Confirm OPTIONS/preflight responses include the same CORS policy and do not require an authenticated session.
- [ ] Confirm frontend `new-version-config.js` points to the staging Worker URL, not a production URL.
- [ ] Confirm `env.DB` points to staging D1.
- [ ] Apply migrations only to staging D1, in the documented order, and check every migration's result.
- [ ] Verify admin bootstrap is unavailable unless `ADMIN_BOOTSTRAP_SECRET` is configured and cannot create a second Founder.
- [ ] Verify login, `/api/v2/admin/me`, logout, expired/revoked session behavior, and disabled staff behavior.
- [ ] Verify unauthorized requests to products, coupons, orders, customers, reports, health, email activity, audit logs, staff, and role-permissions return 401/403 as appropriate.
- [ ] Verify the old checkout, Cashfree order creation, webhook signature verification, coupon calculation, payment status, and download endpoints still behave as before.
- [ ] Verify the UI has loading, empty, error, and permission-denied states.
- [ ] Verify CSV export escaping and maximum row limit.
- [ ] Verify no admin endpoint returns secrets, password hashes, raw tokens, or sensitive payment credentials.

## Known unverified items to resolve before launch
- Live Cloudflare D1 migration results.
- Browser CORS/preflight behavior against the real staging Worker.
- Cashfree Sandbox order creation, webhook, duplicate webhook handling, and payment reconciliation.
- Real PDF/cover upload and file storage integration for Product Manager.
- Product/coupon editing workflows and customer-facing catalog/checkout synchronization.
- Canonical email-event schema and real email delivery status/retry.
- Backup/restore approach: prefer Cloudflare D1 backup/export and a documented, access-controlled restore procedure; do not expose an unrestricted destructive restore endpoint in the public Worker.
- Purchase request control: define the desired customer-facing behavior before enabling it.

## Completion status
This step is a readiness checklist and source-level guard only. It does not mean staging or production tests passed, and it does not implement the missing modules above. Mark each item complete only after recording the actual result.
