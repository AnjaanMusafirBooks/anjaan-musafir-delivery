# New Version file map — initial candidate plan

Existing repository paths are retained where a replacement is required. New files receive new names. Original ZIP archives remain unchanged.

## Batch 01 — delivered
- `db/migration/002_new_version_admin_foundation.sql` — new additive migration.
- `docs/NEW_VERSION_AUDIT.md` — audit notes from the uploaded source archives.
- `docs/NEW_VERSION_MIGRATION_GUIDE.md` — staging-only migration procedure.
- `docs/NEW_VERSION_FILE_MAP.md` — this evolving file map.
- `tests/test_admin_foundation_migration.py` — local migration smoke test.

## Existing paths likely to require candidate-only updates (not changed in Batch 01)
- Frontend: `index.html`, `app.js`, `books.js`, `style.css`, `admin.html`, `content-manager.html`, `my-order.html`, `thank-you.html`, `book.html`.
- Backend: `src/index.js`, `wrangler.jsonc`, `README.md`, `SITE_CONTENT_SETUP.md`.

## Candidate-only new files planned
- Additional `db/migration/00x_*.sql` migrations after each schema change is reviewed.
- Separate admin pages/scripts/styles and backend modules as the implementation is split safely.
- API documentation, environment setup, backup/restore guide, test matrix, deployment and rollback checklist.

The exact final count may change after dependency and compatibility tests. Do not create replacement copies with different names for an existing path unless the file map explicitly marks the new file as a new module.
