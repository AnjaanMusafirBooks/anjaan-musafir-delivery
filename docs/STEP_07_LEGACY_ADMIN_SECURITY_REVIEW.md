# Step 07 — Legacy Admin Security Review

Status: source review only; NOT production approval.

## What the candidate currently does

- New Version routes under `/api/v2/admin/` are dispatched to separate modules.
- Product, coupon, order/customer, reports, operations and PDF-upload modules call `requireAdminPermission` before their protected actions (review each handler's permission mapping before launch).
- Legacy routes under `/api/admin/` are still dispatched to `handleAdmin` and authenticate with the legacy `x-admin-key` checked against `env.ADMIN_KEY`.
- This is a staged compatibility arrangement, not a completed migration to role-based access control for every legacy endpoint.

## Risks / required decisions

1. The legacy key is a shared credential: it does not provide per-user identity, role permissions, or individual audit attribution.
2. Do not expose `ADMIN_KEY` in public frontend JavaScript or commit it to GitHub.
3. Before launch, inventory each legacy route and decide whether to keep it temporarily behind `ADMIN_KEY`, migrate it to session/RBAC, or retire it.
4. Do not simply force RBAC onto all legacy routes without updating the old admin UI; that can break the existing Current Version.
5. Verify CORS and preflight behaviour for `Authorization` in staging.
6. Bootstrap secrets must remain server-side and must not be embedded in static frontend files.

## Safe next action

Use only a separate staging Worker, staging D1 database, and private staging R2 bucket. Exercise legacy and v2 routes with: no credentials, invalid credentials, valid legacy key where applicable, valid RBAC session, and insufficient role. Production remains untouched until an explicit approval.
