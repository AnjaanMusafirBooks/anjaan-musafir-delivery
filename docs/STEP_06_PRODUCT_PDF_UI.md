# Step 06 — Admin PDF Upload UI

## Added
- Product Manager now has a PDF file picker and a secure-upload action.
- The browser sends `FormData` to `POST /api/v2/admin/products/upload` and does not manually set `Content-Type`, allowing the browser to add the multipart boundary.
- The request carries the admin Bearer session token.
- On success, `pdf_file_key` is inserted into the product form; the administrator must still save the product record.
- Client-side checks reject non-PDF MIME types and files over 25 MB. Server-side validation remains authoritative.

## Staging-only verification required
1. Configure a separate staging Worker, D1, and private R2 bucket binding `BOOKS_BUCKET`.
2. Ensure the logged-in role has `files.manage`.
3. Upload a valid PDF and confirm the returned key appears in the product form.
4. Try a non-PDF and a file over 25 MB; confirm they are rejected.
5. Save the product, then verify the order/download handler can retrieve the R2 object securely.
6. Confirm no public URL is exposed and unauthorised requests fail.

This UI is not proof of end-to-end storage/download integration. Do not deploy to production until staging tests pass.
