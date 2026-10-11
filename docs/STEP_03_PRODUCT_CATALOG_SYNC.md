# Step 03 — Product Manager ↔ Legacy Checkout Catalog Sync

## Change made

The Product Manager stores editable metadata in `nv_products`, while the existing customer checkout and download flow reads `products` and `offers`. Previously, creating or editing a New Version product did not update those legacy checkout tables, so customers could continue seeing stale catalog data or could not buy the new product at all.

`src/product-manager.js` now calls `syncLegacyCatalog()` after product create/update/archive:

- `products.price` receives the product MRP in rupees.
- `products.file_key` receives the configured private-storage key from `pdf_file_key`.
- `products.file_name` is derived from the key and sanitized for a download filename.
- `products.active` is 1 only for `ACTIVE` products; DRAFT, INACTIVE, and ARCHIVED products are unavailable to checkout.
- `offers` receives MRP, selling price, label, start/end time, and active status. The existing checkout's `getOffer()` logic remains responsible for time-window evaluation.
- Both legacy-table writes are issued in one D1 `batch()` call.

## Important limitations

- This is a metadata/catalog bridge, not a binary PDF upload implementation. `pdf_file_key` must refer to a file already present in the configured private storage. Upload/storage binding and file-existence validation remain open work.
- The New Version row and legacy rows are not one cross-statement transaction: if legacy sync fails after the `nv_products` write, the API returns an error and an operator must reconcile the rows. A durable retry/outbox or an atomic write design should be considered before production.
- This has only source tests and local syntax checks so far. It has not been exercised against a real Cloudflare D1 staging database or Cashfree sandbox.
- Do not apply this draft to production. Test against an isolated staging database first.

## Local verification

Run from `backend/`:

```sh
python -m pytest -q
node --check src/product-manager.js
node --check src/index.js
```

The tests check source contracts; they do not substitute for runtime integration tests.
