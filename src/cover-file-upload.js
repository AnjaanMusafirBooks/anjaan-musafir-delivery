/* Public cover upload/read path. Cover objects share the private R2 bucket but
 * only the public-covers/ prefix is served without authentication. PDFs remain private. */
import { requireAdminPermission } from "./admin-auth.js";
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});
const MAX_COVER_BYTES = 3 * 1024 * 1024;
function sniffImage(bytes) {
  if (bytes.length >= 8 && bytes[0]===0x89 && bytes[1]===0x50 && bytes[2]===0x4e && bytes[3]===0x47 && bytes[4]===0x0d && bytes[5]===0x0a && bytes[6]===0x1a && bytes[7]===0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff) return "image/jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4))==="RIFF" && String.fromCharCode(...bytes.slice(8,12))==="WEBP") return "image/webp";
  return "";
}
export async function handleCoverUpload(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!env.DB) return json({ error: "Admin database binding is unavailable." }, 503);
  if (!env.BOOKS_BUCKET || typeof env.BOOKS_BUCKET.put !== "function") return json({ error: "Private R2 storage is not configured." }, 503);
  const access = await requireAdminPermission(request, env, "files.manage");
  if (!access.ok) return access.response;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_COVER_BYTES + 1024) return json({ error: "Cover image must be 3 MB or smaller." }, 413);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file.arrayBuffer !== "function" || file.size < 8 || file.size > MAX_COVER_BYTES) return json({ error: "Choose a cover image between 8 bytes and 3 MB." }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImage(bytes);
  if (!contentType) return json({ error: "Cover must be a valid PNG, JPEG or WebP image." }, 415);
  const ext = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
  const safeName = String(file.name || `cover.${ext}`).replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || `cover.${ext}`;
  const key = `public-covers/${crypto.randomUUID()}/${safeName}`;
  try {
    await env.BOOKS_BUCKET.put(key, bytes, {
      httpMetadata: { contentType, contentDisposition: `inline; filename="${safeName.replace(/["\r\n]/g, "")}"`, cacheControl: "public, max-age=86400" },
      customMetadata: { purpose: "public-book-cover", uploadedBy: access.user.user_id, uploadedAt: new Date().toISOString() }
    });
    try { await env.DB.prepare(`INSERT INTO admin_audit_log(actor_user_id,actor_role,action,target_type,target_id,outcome,metadata_json)
      VALUES (?1,?2,'product.cover.upload','r2_object',?3,'SUCCESS',?4)`)
      .bind(access.user.user_id, access.user.role, key, JSON.stringify({ size: bytes.byteLength, content_type: contentType })).run(); } catch {}
    const base = String(env.WORKER_PUBLIC_URL || "").replace(/\/+$/, "");
    return json({ ok: true, cover_asset: key, cover_url: /^https:\/\//i.test(base) ? `${base}/api/public/covers/${key}` : null, content_type: contentType, size_bytes: bytes.byteLength });
  } catch {
    return json({ error: "Cover upload failed. No public link was created." }, 502);
  }
}
export async function handlePublicCover(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed.", { status: 405, headers: { Allow: "GET, HEAD" } });
  if (!env.BOOKS_BUCKET || typeof env.BOOKS_BUCKET.get !== "function") return new Response("Cover service unavailable.", { status: 503 });
  let key = "";
  try { key = decodeURIComponent(url.pathname.slice("/api/public/covers/".length)); } catch { return new Response("Not found.", { status: 404 }); }
  if (!/^public-covers\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,80}$/.test(key)) return new Response("Not found.", { status: 404 });
  const object = await env.BOOKS_BUCKET.get(key);
  if (!object || object.customMetadata?.purpose !== "public-book-cover") return new Response("Not found.", { status: 404 });
  const contentType = String(object.httpMetadata?.contentType || "");
  if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) return new Response("Not found.", { status: 404 });
  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Access-Control-Allow-Origin": "*"
  });
  if (object.size != null) headers.set("Content-Length", String(object.size));
  return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers });
}
