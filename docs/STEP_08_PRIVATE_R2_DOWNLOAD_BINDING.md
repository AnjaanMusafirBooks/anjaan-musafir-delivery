# Step 08 — Private R2 upload/download binding compatibility

## Finding
The new PDF upload module writes objects to the `BOOKS_BUCKET` R2 binding and stores a private key such as `private-books/<uuid>/<filename>` in the new product record. The existing paid-download code previously read only from the legacy `BOOKS` binding, then fell back to static assets. In staging, where the documented binding is `BOOKS_BUCKET`, a newly uploaded PDF could therefore be present in R2 but not found by the existing `/download` handler.

## Change
`src/index.js` now prefers `env.BOOKS_BUCKET` and falls back to `env.BOOKS` for backward compatibility. The lookup uses the same private object key saved by the upload/product manager flow. No route, payment status, token policy, or production configuration is changed by this source edit.

## Validation
Run from the backend folder:

```bash
python -m pytest -q --disable-warnings
```

The new tests assert that the upload, staging binding, and download reader agree on `BOOKS_BUCKET`, while preserving the legacy `BOOKS` fallback.

## Not yet verified
- Actual Cloudflare staging R2 upload and download.
- Candidate D1 migration and product creation against a real staging database.
- Full Cashfree sandbox payment-to-download regression.

Do not deploy this draft to production. Validate it in an isolated staging Worker and staging D1/R2 first.
