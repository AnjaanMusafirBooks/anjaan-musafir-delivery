# Batch 05 — My Order + Secure Digital Delivery Foundation

## Scope
This batch prepares reusable security helpers and additive D1 tables for the
New Version candidate. It does not replace the current Worker or connect routes
automatically.

## Files
- `src/order-delivery.js`: email/order-ID validation, random token creation,
  SHA-256 token hashing, expiry/limit helpers, constant-time string comparison.
- `db/migration/004_new_version_order_delivery.sql`: candidate-only token and
  lookup-attempt tables.
- `docs/MY_ORDER_DELIVERY_API.md`: proposed API contract.
- `tests/test_order_delivery_source.py`: static contract checks.

## Required security rules
1. Never trust a price, payment status, product ID, or email supplied by the browser.
2. Only issue a download entitlement after the server verifies a successful payment
   from the payment provider or a trusted stored payment record.
3. Store only the SHA-256 hash of each download token in D1. Do not log raw tokens.
4. Bind each token to one order, one normalized email, and one product.
5. Check expiry, revocation, and download limit on every download request.
6. Stream only a server-configured PDF path. Never accept a filesystem/object path
   directly from the customer.
7. Rate-limit My Order lookups and return generic failure messages to reduce
   order-ID/email enumeration.
8. Do not expose payment secrets, admin keys, or bearer sessions in HTML or URLs.

## Important integration note
The existing `src/index.js`, actual D1 schema, and payment verification flow must be
reviewed before these helpers are wired into the Worker. The new endpoints must be
added without removing existing routes such as catalog, product, create-order,
payment-status, Cashfree webhook, download, and admin routes.

## Migration warning
Apply migration `004` only to an isolated staging D1 database after reviewing
the actual schema. Do not run it against production during this candidate stage.
