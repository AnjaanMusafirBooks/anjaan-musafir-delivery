# Admin Auth API — Candidate v2

All endpoints return JSON and `Cache-Control: no-store`. Never include session tokens in URLs, logs, or screenshots.

## Authentication

### POST `/api/v2/admin/bootstrap`
Headers: `Content-Type: application/json`, `X-Bootstrap-Secret: <secret>`

Body: `{ "email": "founder@example.com", "display_name": "Founder", "password": "Strong-Unique-Password-42" }`

Responses: `201` created (returns one-time session token to caller), `400` validation error, `403` invalid bootstrap authorization, `409` Founder already exists, `503` secret/DB configuration missing.

### POST `/api/v2/admin/login`
Body: `{ "email": "founder@example.com", "password": "..." }`

Responses: `200` authenticated user + session token + expiry, `400` invalid input, `401` invalid credentials, `423` account locked/disabled.

### POST `/api/v2/admin/logout`
Header: `Authorization: Bearer <session_token>`

Responses: `200 { "ok": true }`; `401` invalid/expired session.

### GET `/api/v2/admin/me`
Header: `Authorization: Bearer <session_token>`

Response: `{ "ok": true, "user": { ...safe user fields... }, "expires_at": "..." }`.

## Founder-only staff management
All endpoints below require a valid session and role `FOUNDER`.

- `GET /api/v2/admin/staff` — returns at most 200 safe user records; no password hashes or session tokens.
- `POST /api/v2/admin/staff` — body includes email, display_name, role (must not be FOUNDER), and strong password; new account is marked `must_reset_password`.
- `POST /api/v2/admin/staff/{uuid}/disable` — disables the staff account and revokes its sessions.
- `POST /api/v2/admin/staff/{uuid}/enable` — re-enables a disabled staff account.
- `GET /api/v2/admin/role-permissions` — lists permission rows.
- `POST /api/v2/admin/role-permissions` — body `{ "role": "OPERATIONS_MANAGER", "permission_key": "orders.read", "allowed": true }`.

Error responses use a customer-safe message. Internal diagnostics are logged server-side with a request reference; SQL errors and stack traces are not returned.
