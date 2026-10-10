# Proposed My Order + Download API Contract

These are target contracts for the New Version candidate, not a claim that the
routes are already live.

## `POST /api/v2/my-order`
Request JSON:
```json
{
  "order_id": "ORDER_ID_FROM_RECEIPT",
  "email": "buyer@example.com"
}
```

Server behavior:
- Validate and normalize both values.
- Apply rate limits before database lookup.
- Verify that the order exists, the normalized email matches, and payment is
  confirmed by a trusted server-side record.
- Return a generic error for invalid order/email/payment combinations.
- If eligible, create or refresh a short-lived download token, storing only its
  SHA-256 hash.
- Never reveal whether an unrelated order ID exists.

Suggested success response:
```json
{
  "ok": true,
  "message": "If the order details match, a download link is available.",
  "download_url": "/download?token=ONE_TIME_SECRET"
}
```

## `GET /download?token=...`
The Worker must:
1. Hash the supplied token and look up its hash.
2. Reject missing, expired, revoked, exhausted, or mismatched entitlements.
3. Confirm the linked order is still paid and the product is active/available.
4. Resolve the PDF from a server-controlled mapping, never from a request path.
5. Atomically increment the count only when a download is granted.
6. Set safe content headers and avoid logging the token.

## `POST /api/v2/my-order/resend`
Optional future endpoint. Must use the same verification and rate limits as
`/api/v2/my-order`; do not email a link for an unverified order.

## Integration checklist
- [ ] Confirm the existing order table and payment-status values.
- [ ] Confirm how Cashfree webhook verification persists payment success.
- [ ] Confirm PDF storage/binding and existing `/download` behavior.
- [ ] Implement atomic limit updates using a D1 batch/conditional update.
- [ ] Add per-IP and per-email rate limiting.
- [ ] Add route-level tests against a staging Worker and staging D1.
- [ ] Test expired, revoked, exhausted, unpaid, wrong-email, and successful cases.
- [ ] Keep `main` and production Worker untouched until explicit approval.
