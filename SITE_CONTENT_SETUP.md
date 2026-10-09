# Dynamic Site Content Manager — Setup

This is an additive Current Version feature. It does not change Cashfree payment, order, coupon, PDF delivery, download tokens, or existing product tables.

## Files changed/added
- `src/index.js`: public `GET /api/site-content`; authenticated `GET/POST /api/admin/site-content`. Existing routes retained.
- `db/migrations/001_site_content.sql`: additive `site_content` table and initial editable content.
- Frontend `content-manager.html`: founder-only UI using existing `ADMIN_KEY` secret.
- Frontend `app.js`, `index.html`, `terms.html`, `privacy.html`, `refund.html`, `style.css`: read published content and retain static fallback.
- `assets/digitech-move-logo.jpg`: original user-provided DigiTech Move logo asset (the uploaded file is JPEG data despite `.png` source extension).

## Required one-time action by owner
1. Take an export/backup of the existing D1 database before any migration.
2. Open Cloudflare D1 database `anjaan-musafir-db` and run the contents of `db/migrations/001_site_content.sql` once. It uses `CREATE TABLE IF NOT EXISTS` and `INSERT OR IGNORE`; it does not drop/overwrite existing rows. Do not rerun a modified version that changes existing keys without reviewing it.
3. Deploy the updated Worker from this backend ZIP. Keep all existing Cloudflare secrets/bindings; do not replace them with placeholders.
4. Upload the frontend files to the existing GitHub Pages repository preserving its existing folder/path structure.
5. Open `content-manager.html`, sign in with the existing Worker `ADMIN_KEY`, preview the editor text, save a draft, verify it is not public, publish, and test Disable/Enable on optional sections.

## Text format
Content is plain text. Use `## Heading` on its own line for headings and `- Item` for bullets. Raw HTML/scripts are not executed. The three policy pages retain their original static content if the API/migration is unavailable. Public content responses use `Cache-Control: no-store` so published edits are not held in a browser/CDN cache. Contact Email is validated in both the editor UI and Worker. The policy pages update their displayed “अंतिम अपडेट” date from the published database timestamp.

## Test checklist
- `GET /health` returns `ok:true`.
- `GET /api/site-content` returns seeded content after migration.
- `GET /api/admin/site-content` without `x-admin-key` returns 401; with valid key returns items.
- Save Draft changes draft fields but does not alter public API output.
- Publish updates the public API output.
- Disable hides the item from public API; Enable restores it.
- Existing checkout, Cashfree webhook, order lookup and download must be regression-tested in live/sandbox setup before calling the project fully verified.

## Important boundaries
Static GitHub Pages itself does not receive server-side content; the browser fetches the Worker API. If Worker/API is unavailable, the policy pages continue showing their static HTML fallback. This feature updates only the content keys supplied in this migration; it is not a full product manager or a complete New Version admin system.
