/* Private PDF upload for the New Version Product Manager.
 * Requires a private Cloudflare R2 bucket binding named BOOKS_BUCKET.
 * No public URL is returned; the returned key is stored in nv_products.pdf_file_key.
 */
import { requireAdminPermission } from "./admin-auth.js";

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

export async function handleProductFileUpload(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!env.DB) return json({ error: "Admin database binding is unavailable." }, 503);
  if (!env.BOOKS_BUCKET || typeof env.BOOKS_BUCKET.put !== "function") {
    return json({ error: "Private file storage is not configured for this environment." }, 503);
  }
  const access = await requireAdminPermission(request, env, "files.manage");
  if (!access.ok) return access.response;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_PDF_BYTES + 1024) return json({ error: "PDF exceeds the 25 MB limit." }, 413);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file.arrayBuffer !== "function") return json({ error: "Attach the PDF in the 'file' field." }, 400);
  if (file.size < 8 || file.size > MAX_PDF_BYTES) return json({ error: "PDF must be between 8 bytes and 25 MB." }, 413);
  const type = String(file.type || "").toLowerCase();
  if (type && type !== "application/pdf" && type !== "application/octet-stream") return json({ error: "Only PDF files are allowed." }, 415);
  const bytes = await file.arrayBuffer();
  const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 5));
  if (head.length !== 5 || String.fromCharCode(...head) !== "%PDF-") return json({ error: "File content is not a valid PDF header." }, 415);
  const safeName = String(file.name || "book.pdf").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "book.pdf";
  const key = `private-books/${crypto.randomUUID()}/${safeName}`;
  try {
    await env.BOOKS_BUCKET.put(key, bytes, {
      httpMetadata: { contentType: "application/pdf", contentDisposition: `attachment; filename="${safeName.replace(/["\r\n]/g, "")}"`, cacheControl: "private, no-store" },
      customMetadata: { uploadedBy: access.user.user_id, uploadedAt: new Date().toISOString() },
    });
    try {
      await env.DB.prepare(`INSERT INTO admin_audit_log (actor_user_id, actor_role, action, target_type, target_id, outcome, request_id, metadata_json)
        VALUES (?1,?2,'product.pdf.upload','r2_object',?3,'SUCCESS',?4,?5)`)
        .bind(access.user.user_id, access.user.role, key, request.headers.get("cf-ray") || null, JSON.stringify({ size: bytes.byteLength, content_type: "application/pdf" })).run();
    } catch (auditError) { console.error("pdf_upload_audit_failed", String(auditError?.message || "unknown").slice(0, 120)); }
    return json({ ok: true, pdf_file_key: key, file_name: safeName, size_bytes: bytes.byteLength });
  } catch (error) {
    console.error("pdf_upload_failed", String(error?.message || "unknown").slice(0, 120));
    return json({ error: "PDF upload failed. No public link was created." }, 502);
  }
}
