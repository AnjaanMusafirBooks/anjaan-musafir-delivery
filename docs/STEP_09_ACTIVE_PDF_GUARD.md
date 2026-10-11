# Step 09 — Active Product PDF Guard

## Change
- Before a new product is created with `status=ACTIVE`, the Worker verifies that a `private-books/` PDF key exists in the bound R2 bucket using `head()`.
- Before an existing product is activated, the same check is performed for private-book keys.
- Missing bucket, missing object, or R2 verification error blocks activation with an explicit error.
- An unchanged legacy file key is allowed when updating an existing product to avoid breaking current legacy catalog records. New or changed active product file references must use a verified private upload.

## Still required
- Test against a staging-only R2 bucket.
- Confirm download delivery uses the same key namespace and private bucket.
- Verify the existing legacy-key exception against actual candidate data before rollout.
- Do not deploy this draft to production.
