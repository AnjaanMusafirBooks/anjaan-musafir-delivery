# New Version — Admin Authentication Setup (Candidate only)

## Scope
This batch adds a candidate authentication API under `/api/v2/admin/`. It does not change existing payment, Cashfree, webhook, My Order, download, or legacy `/api/admin/` handlers. Existing `/api/admin/` routes still use the legacy `ADMIN_KEY` mechanism and must not be considered migrated to RBAC yet.

## Prerequisites
1. Use a separate candidate/staging Worker and a separate candidate D1 database.
2. Review and apply `db/migration/002_new_version_admin_foundation.sql` to candidate D1 only.
3. Set `ADMIN_BOOTSTRAP_SECRET` as a Cloudflare Worker secret. Generate at least 32 random characters. Do not put it in `wrangler.jsonc`, source code, GitHub, screenshots, or this guide.
4. Keep the existing production Worker and production D1 unchanged.

Example secret configuration command (run against the candidate Worker):

```sh
npx wrangler secret put ADMIN_BOOTSTRAP_SECRET --name <candidate-worker-name>
```

Do not include the secret value in shell history if your environment records commands; paste it only into the secure prompt.

## One-time Founder bootstrap
Send a `POST` request to `/api/v2/admin/bootstrap` with header `X-Bootstrap-Secret` and JSON body:

```json
{
  "email": "founder@example.com",
  "display_name": "Founder",
  "password": "Use-A-Unique-Strong-Password-42"
}
```

Password requirements: at least 12 characters, uppercase, lowercase, and a number. Bootstrap succeeds only when no Founder record exists. Once created, the bootstrap endpoint returns `409` even if the secret is correct. Protect the bootstrap secret and rotate/remove it after bootstrap as an operational hardening step; do not attempt to bootstrap production without explicit authorization.

The successful bootstrap/login response returns a random session token to the authenticated caller. The raw token is not stored in D1; only its SHA-256 hash is stored. Use it as `Authorization: Bearer <session_token>`. Keep it in memory where possible and never log it or put it in a URL.

## Endpoints in this batch
- `POST /api/v2/admin/bootstrap` — one-time Founder creation; requires bootstrap secret.
- `POST /api/v2/admin/login` — email/password login.
- `POST /api/v2/admin/logout` — revokes current session.
- `GET /api/v2/admin/me` — current user/session info.
- `GET /api/v2/admin/staff` — Founder-only staff listing.
- `POST /api/v2/admin/staff` — Founder-only staff creation; new staff must reset password.
- `POST /api/v2/admin/staff/{uuid}/disable` — Founder-only; revokes staff sessions.
- `POST /api/v2/admin/staff/{uuid}/enable` — Founder-only.
- `GET /api/v2/admin/role-permissions` — Founder-only permission listing.
- `POST /api/v2/admin/role-permissions` — Founder-only permission update.

Staff creation body example:

```json
{
  "email": "staff@example.com",
  "display_name": "Operations Staff",
  "role": "OPERATIONS_MANAGER",
  "password": "Use-A-Unique-Strong-Password-42"
}
```

Permission update body example:

```json
{
  "role": "OPERATIONS_MANAGER",
  "permission_key": "orders.read",
  "allowed": true
}
```

## Current limitations — do not treat this batch as production-ready
- The frontend login screen is not wired in this batch.
- Legacy `/api/admin/` endpoints are not yet protected by these roles. This batch intentionally preserves them while the staged migration is in progress. Do not expose the candidate as a complete Admin Panel until those routes are migrated and tested.
- Account lockout is per account after five bad password attempts; IP/network-level rate limiting is not implemented in this batch.
- Password reset/recovery and enforced password change are not implemented yet.
- A production-grade bootstrap ceremony, alerting, and session revocation dashboard still require further work.
- Cloudflare D1 live deployment, browser/CORS behavior, and end-to-end tests are `NOT TESTED` in this deliverable.
