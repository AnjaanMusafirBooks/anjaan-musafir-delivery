/* New Version Product Manager API.
 * Uses db/migration/003_new_version_product_manager.sql.
 * Product PDFs are referenced by private storage key; binary upload is handled
 * by the separate product-file-upload.js module.
 */
import { requireAdminPermission } from "./admin-auth.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const id = () => crypto.randomUUID();
const slugOk = value => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 120;
const textOk = (v, max, allowEmpty = false) => typeof v === "string" && v.trim().length <= max && (allowEmpty || v.trim().length > 0);
const statuses = new Set(["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]);
const truthy01 = v => v === true || v === 1 || v === "1" ? 1 : 0;
const toPaise = value => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || Math.round(value * 100) !== value * 100) return null;
  return Math.round(value * 100);
};
function serialize(row) {
  return { ...row, featured: !!row.featured, popular: !!row.popular,
    mrp_rupees: Number(row.mrp_paise) / 100,
    selling_price_rupees: Number(row.selling_price_paise) / 100 };
}
async function permitted(request, env, key) {
  const result = await requireAdminPermission(request, env, key);
  return result.ok ? { user: result.user } : { response: result.response };
}
async function audit(db, actor, action, targetId, outcome, requestId, metadata = {}) {
  try {
    await db.prepare(`INSERT INTO admin_audit_log (actor_user_id, actor_role, action, target_type, target_id, outcome, request_id, metadata_json)
      VALUES (?1,?2,?3,'nv_product',?4,?5,?6,?7)`)
      .bind(actor?.user_id || null, actor?.role || null, action, targetId || null, outcome, requestId || null, JSON.stringify(metadata).slice(0, 1800)).run();
  } catch (e) { console.error("product_audit_write_failed", String(e?.message || "unknown").slice(0, 120)); }
}

// Keep the existing customer checkout/catalog tables in sync with the New
// Version product record. Checkout still reads `products` and `offers`; without
// this bridge, admin edits would be invisible to customers. The PDF itself is
// NOT uploaded here: pdf_file_key must point to an object already present in
// the configured private storage.
function fileNameFromKey(key) {
  const clean = String(key || "").split(/[?#]/, 1)[0].replace(/\\/g, "/");
  const part = clean.split("/").filter(Boolean).pop();
  return (part || "ebook.pdf").replace(/[\"\r\n]/g, "").slice(0, 180) || "ebook.pdf";
}
async function syncLegacyCatalog(env, row) {
  if (!row) throw new Error("Cannot sync missing New Version product row.");
  const mrp = Number(row.mrp_paise) / 100;
  const selling = Number(row.selling_price_paise) / 100;
  const active = row.status === "ACTIVE" ? 1 : 0;
  const offerActive = active && (
    selling !== mrp || !!row.offer_label || !!row.offer_starts_at || !!row.offer_ends_at
  ) ? 1 : 0;
  const fileKey = String(row.pdf_file_key || "").trim();
  if (!fileKey) throw new Error("Product PDF storage key is missing.");
  // D1 batch groups the two legacy-table writes together. These tables are the
  // source read by the existing checkout and download code.
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO products (product_id,name,price,currency,file_key,file_name,active,cover_asset)
      VALUES (?1,?2,?3,'INR',?4,?5,?6,?7)
      ON CONFLICT(product_id) DO UPDATE SET name=excluded.name,price=excluded.price,
      currency=excluded.currency,file_key=excluded.file_key,file_name=excluded.file_name,active=excluded.active,cover_asset=excluded.cover_asset`)
      .bind(row.product_id, row.name, mrp, fileKey, fileNameFromKey(fileKey), active, row.cover_asset || null),
    env.DB.prepare(`INSERT INTO offers (product_id,mrp,sale_price,label,starts_at,ends_at,active)
      VALUES (?1,?2,?3,?4,?5,?6,?7)
      ON CONFLICT(product_id) DO UPDATE SET mrp=excluded.mrp,sale_price=excluded.sale_price,
      label=excluded.label,starts_at=excluded.starts_at,ends_at=excluded.ends_at,active=excluded.active`)
      .bind(row.product_id, mrp, selling, row.offer_label || null, row.offer_starts_at || null, row.offer_ends_at || null, offerActive)
  ]);
}

async function listProducts(request, env, url) {
  const access = await permitted(request, env, "products.read");
  if (access.response) return access.response;
  const status = url.searchParams.get("status");
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50));
  const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0);
  if (status && !statuses.has(status)) return json({ error: "Invalid status filter." }, 400);
  const where = [];
  const binds = [];
  if (status) { binds.push(status); where.push(`status=?${binds.length}`); }
  if (q) { binds.push(`%${q.replace(/[\\%_]/g, "\\$&")}%`); where.push(`(name LIKE ?${binds.length} ESCAPE '\\' OR slug LIKE ?${binds.length} ESCAPE '\\' OR author_name LIKE ?${binds.length} ESCAPE '\\')`); }
  const sqlWhere = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM nv_products ${sqlWhere}`).bind(...binds).first();
  const rows = await env.DB.prepare(`SELECT * FROM nv_products ${sqlWhere} ORDER BY updated_at DESC LIMIT ?${binds.length + 1} OFFSET ?${binds.length + 2}`)
    .bind(...binds, limit, offset).all();
  return json({ ok: true, items: (rows.results || []).map(serialize), total: Number(count?.total || 0), limit, offset });
}
function validateProduct(body, creating) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "A JSON object is required.";
  if (creating && !slugOk(body.slug)) return "slug must use lowercase letters, numbers and hyphens.";
  if (body.product_id !== undefined && body.product_id !== null && body.product_id !== "" && (!textOk(body.product_id, 100) || !/^[A-Za-z0-9_-]{3,100}$/.test(body.product_id))) return "Invalid product_id. Use an existing stable product ID or leave it blank for a new ID.";
  if (creating && !textOk(body.name, 180)) return "name is required (max 180 characters).";
  if (creating && !textOk(body.pdf_file_key, 500)) return "pdf_file_key is required (max 500 characters).";
  if (body.slug !== undefined && !slugOk(body.slug)) return "Invalid slug.";
  if (body.name !== undefined && !textOk(body.name, 180)) return "Invalid name.";
  if (body.author_name !== undefined && !textOk(body.author_name, 180)) return "Invalid author_name.";
  if (body.description !== undefined && !textOk(body.description, 10000, true)) return "Description is too long or invalid.";
  if (body.language !== undefined && !textOk(body.language, 50)) return "Invalid language.";
  if (body.cover_asset !== undefined && body.cover_asset !== null && !textOk(body.cover_asset, 500)) return "Invalid cover_asset.";
  if (body.pdf_file_key !== undefined && !textOk(body.pdf_file_key, 500)) return "Invalid pdf_file_key.";
  if (body.page_count !== undefined && body.page_count !== null && (!Number.isInteger(body.page_count) || body.page_count < 1 || body.page_count > 100000)) return "page_count must be a positive integer.";
  for (const key of ["mrp", "selling_price"]) if (body[key] !== undefined && toPaise(body[key]) === null) return `${key} must be a non-negative rupee amount with at most 2 decimals.`;
  if (creating && (toPaise(body.mrp) === null || toPaise(body.selling_price) === null)) return "mrp and selling_price are required rupee amounts.";
  const mrp = body.mrp === undefined ? null : toPaise(body.mrp);
  const selling = body.selling_price === undefined ? null : toPaise(body.selling_price);
  if (mrp !== null && selling !== null && selling > mrp) return "selling_price cannot exceed mrp.";
  if (body.status !== undefined && !statuses.has(body.status)) return "Invalid product status.";
  if (body.featured !== undefined && ![true, false, 0, 1, "0", "1"].includes(body.featured)) return "featured must be boolean.";
  if (body.popular !== undefined && ![true, false, 0, 1, "0", "1"].includes(body.popular)) return "popular must be boolean.";
  for (const key of ["offer_label"]) if (body[key] !== undefined && body[key] !== null && !textOk(body[key], 120)) return `Invalid ${key}.`;
  for (const key of ["offer_starts_at", "offer_ends_at"]) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") {
      if (typeof body[key] !== "string" || body[key].length > 40 || !Number.isFinite(Date.parse(body[key]))) return `Invalid ${key}; use a valid ISO date/time.`;
    }
  }
  const starts = body.offer_starts_at === undefined ? null : body.offer_starts_at;
  const ends = body.offer_ends_at === undefined ? null : body.offer_ends_at;
  if (starts && ends && Date.parse(ends) <= Date.parse(starts)) return "offer_ends_at must be later than offer_starts_at.";
  return null;
}
async function activePdfCheck(env, fileKey, isNewProduct, previousFileKey = null) {
  const key = String(fileKey || "").trim();
  if (!key) return { status: 400, error: "A PDF storage key is required." };
  if (key.startsWith("private-books/")) {
    if (!env.BOOKS_BUCKET || typeof env.BOOKS_BUCKET.head !== "function") {
      return { status: 503, error: "Private PDF storage is not configured; product cannot be activated." };
    }
    try {
      const object = await env.BOOKS_BUCKET.head(key);
      if (!object) return { status: 400, error: "PDF file was not found in private storage. Upload it before activating the product." };
      return null;
    } catch {
      return { status: 503, error: "Could not verify the PDF in private storage. Try again before activating." };
    }
  }
  // Preserve an unchanged legacy file key for existing active products.
  if (!isNewProduct && key === String(previousFileKey || "")) return null;
  return { status: 400, error: "New or changed active products must use a verified private-books PDF upload." };
}

async function createProduct(request, env, requestId) {
  const access = await permitted(request, env, "products.create");
  if (access.response) return access.response;
  const body = await request.json().catch(() => null);
  const error = validateProduct(body, true);
  if (error) return json({ error }, 400);
  if ((body.status || "DRAFT") === "ACTIVE") {
    const pdfError = await activePdfCheck(env, body.pdf_file_key, true);
    if (pdfError) return json({ error: pdfError.error }, pdfError.status);
  }
  let productId = id();
  if (typeof body.product_id === "string" && body.product_id.trim()) {
    const requestedId = body.product_id.trim();
    const legacyProduct = await env.DB.prepare("SELECT product_id FROM products WHERE product_id=?1 LIMIT 1").bind(requestedId).first();
    if (!legacyProduct) return json({ error: "To preserve existing order references, product_id must match an existing legacy product. Leave it blank to create a new product ID." }, 400);
    const alreadyManaged = await env.DB.prepare("SELECT product_id FROM nv_products WHERE product_id=?1 LIMIT 1").bind(requestedId).first();
    if (alreadyManaged) return json({ error: "This product ID is already managed by New Version." }, 409);
    productId = requestedId;
  }
  const mrp = toPaise(body.mrp), selling = toPaise(body.selling_price);
  try {
    await env.DB.prepare(`INSERT INTO nv_products (product_id,slug,name,author_name,description,page_count,language,cover_asset,pdf_file_key,mrp_paise,selling_price_paise,status,featured,popular,offer_label,offer_starts_at,offer_ends_at,created_by,updated_by)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?18)`)
      .bind(productId, body.slug, body.name.trim(), (body.author_name || "Anjaan Musafir Books").trim(), body.description || "", body.page_count ?? null, body.language || "Hindi", body.cover_asset || null, body.pdf_file_key.trim(), mrp, selling, body.status || "DRAFT", truthy01(body.featured), truthy01(body.popular), body.offer_label || null, body.offer_starts_at || null, body.offer_ends_at || null, access.user.user_id).run();
    await env.DB.prepare(`INSERT INTO nv_product_price_history (product_id,old_mrp_paise,new_mrp_paise,old_selling_price_paise,new_selling_price_paise,changed_by,change_reason)
      VALUES (?1,NULL,?2,NULL,?3,?4,'Initial product price')`).bind(productId, mrp, selling, access.user.user_id).run();
    await env.DB.prepare(`INSERT INTO nv_product_file_history (product_id,previous_file_key,new_file_key,changed_by,change_reason) VALUES (?1,NULL,?2,?3,'Initial product file reference')`).bind(productId, body.pdf_file_key.trim(), access.user.user_id).run();
    const row = await env.DB.prepare("SELECT * FROM nv_products WHERE product_id=?1").bind(productId).first();
    await syncLegacyCatalog(env, row);
    await audit(env.DB, access.user, "product.create", productId, "SUCCESS", requestId, { slug: body.slug, catalog_synced: true });
    return json({ ok: true, product: serialize(row) }, 201);
  } catch (e) {
    if (/UNIQUE|constraint/i.test(String(e?.message || ""))) return json({ error: "Product slug already exists or product data violates a database constraint." }, 409);
    throw e;
  }
}
async function updateProduct(request, env, url, productId, requestId) {
  const access = await permitted(request, env, "products.update");
  if (access.response) return access.response;
  const body = await request.json().catch(() => null);
  const error = validateProduct(body, false);
  if (error) return json({ error }, 400);
  const old = await env.DB.prepare("SELECT * FROM nv_products WHERE product_id=?1").bind(productId).first();
  if (!old) return json({ error: "Product not found." }, 404);
  const pick = (key, fallback) => body[key] === undefined ? fallback : body[key];
  const nextMrp = body.mrp === undefined ? Number(old.mrp_paise) : toPaise(body.mrp);
  const nextSelling = body.selling_price === undefined ? Number(old.selling_price_paise) : toPaise(body.selling_price);
  if (nextSelling > nextMrp) return json({ error: "selling_price cannot exceed mrp." }, 400);
  const nextFile = pick("pdf_file_key", old.pdf_file_key);
  const fields = {
    slug: pick("slug", old.slug), name: pick("name", old.name), author_name: pick("author_name", old.author_name),
    description: pick("description", old.description), page_count: pick("page_count", old.page_count), language: pick("language", old.language),
    cover_asset: pick("cover_asset", old.cover_asset), status: pick("status", old.status), featured: truthy01(pick("featured", old.featured)),
    popular: truthy01(pick("popular", old.popular)), offer_label: pick("offer_label", old.offer_label),
    offer_starts_at: pick("offer_starts_at", old.offer_starts_at), offer_ends_at: pick("offer_ends_at", old.offer_ends_at)
  };
  if (fields.status === "ACTIVE") {
    const pdfError = await activePdfCheck(env, nextFile, false, old.pdf_file_key);
    if (pdfError) return json({ error: pdfError.error }, pdfError.status);
  }
  try {
    await env.DB.prepare(`UPDATE nv_products SET slug=?2,name=?3,author_name=?4,description=?5,page_count=?6,language=?7,cover_asset=?8,pdf_file_key=?9,mrp_paise=?10,selling_price_paise=?11,status=?12,featured=?13,popular=?14,offer_label=?15,offer_starts_at=?16,offer_ends_at=?17,updated_by=?18,updated_at=CURRENT_TIMESTAMP WHERE product_id=?1`)
      .bind(productId, fields.slug, fields.name, fields.author_name, fields.description, fields.page_count, fields.language, fields.cover_asset, nextFile, nextMrp, nextSelling, fields.status, fields.featured, fields.popular, fields.offer_label, fields.offer_starts_at, fields.offer_ends_at, access.user.user_id).run();
    if (nextMrp !== Number(old.mrp_paise) || nextSelling !== Number(old.selling_price_paise)) {
      await env.DB.prepare(`INSERT INTO nv_product_price_history (product_id,old_mrp_paise,new_mrp_paise,old_selling_price_paise,new_selling_price_paise,changed_by,change_reason) VALUES (?1,?2,?3,?4,?5,?6,?7)`)
        .bind(productId, old.mrp_paise, nextMrp, old.selling_price_paise, nextSelling, access.user.user_id, textOk(body.price_change_reason || "", 500, true) ? (body.price_change_reason || "") : "").run();
    }
    if (nextFile !== old.pdf_file_key) {
      await env.DB.prepare(`INSERT INTO nv_product_file_history (product_id,previous_file_key,new_file_key,changed_by,change_reason) VALUES (?1,?2,?3,?4,?5)`)
        .bind(productId, old.pdf_file_key, nextFile, access.user.user_id, textOk(body.file_change_reason || "", 500, true) ? (body.file_change_reason || "") : "").run();
    }
    const row = await env.DB.prepare("SELECT * FROM nv_products WHERE product_id=?1").bind(productId).first();
    await syncLegacyCatalog(env, row);
    await audit(env.DB, access.user, "product.update", productId, "SUCCESS", requestId, { price_changed: nextMrp !== Number(old.mrp_paise) || nextSelling !== Number(old.selling_price_paise), file_changed: nextFile !== old.pdf_file_key, catalog_synced: true });
    return json({ ok: true, product: serialize(row) });
  } catch (e) {
    if (/UNIQUE|constraint/i.test(String(e?.message || ""))) return json({ error: "Product slug already exists or product data violates a database constraint." }, 409);
    throw e;
  }
}
async function history(request, env, productId, kind) {
  const access = await permitted(request, env, "products.read");
  if (access.response) return access.response;
  const exists = await env.DB.prepare("SELECT product_id FROM nv_products WHERE product_id=?1").bind(productId).first();
  if (!exists) return json({ error: "Product not found." }, 404);
  const table = kind === "price-history" ? "nv_product_price_history" : "nv_product_file_history";
  const rows = await env.DB.prepare(`SELECT * FROM ${table} WHERE product_id=?1 ORDER BY created_at DESC LIMIT 100`).bind(productId).all();
  return json({ ok: true, items: rows.results || [] });
}
export async function handleProductManager(request, env, url) {
  if (!env.DB) return json({ error: "Admin database binding is unavailable." }, 503);
  const requestId = request.headers.get("cf-ray") || crypto.randomUUID();
  try {
    if (url.pathname === "/api/v2/admin/products" && request.method === "GET") return await listProducts(request, env, url);
    if (url.pathname === "/api/v2/admin/products" && request.method === "POST") return await createProduct(request, env, requestId);
    const match = /^\/api\/v2\/admin\/products\/([0-9a-f-]{36})(?:\/(price-history|file-history|archive))?$/.exec(url.pathname);
    if (!match) return json({ error: "Not found." }, 404);
    const productId = match[1], action = match[2];
    if (action === "price-history" && request.method === "GET") return await history(request, env, productId, action);
    if (action === "file-history" && request.method === "GET") return await history(request, env, productId, action);
    if (action === "archive" && request.method === "POST") {
      const access = await permitted(request, env, "products.archive");
      if (access.response) return access.response;
      const result = await env.DB.prepare("UPDATE nv_products SET status='ARCHIVED',updated_by=?2,updated_at=CURRENT_TIMESTAMP WHERE product_id=?1 AND status!='ARCHIVED'").bind(productId, access.user.user_id).run();
      if (!result.meta?.changes) return json({ error: "Product not found or already archived." }, 404);
      const archived = await env.DB.prepare("SELECT * FROM nv_products WHERE product_id=?1").bind(productId).first();
      await syncLegacyCatalog(env, archived);
      await audit(env.DB, access.user, "product.archive", productId, "SUCCESS", requestId, { catalog_synced: true });
      return json({ ok: true, product_id: productId, status: "ARCHIVED" });
    }
    if (request.method === "GET") {
      const access = await permitted(request, env, "products.read");
      if (access.response) return access.response;
      const row = await env.DB.prepare("SELECT * FROM nv_products WHERE product_id=?1").bind(productId).first();
      return row ? json({ ok: true, product: serialize(row) }) : json({ error: "Product not found." }, 404);
    }
    if (request.method === "PUT" || request.method === "PATCH") return await updateProduct(request, env, url, productId, requestId);
    return json({ error: "Method not allowed." }, 405);
  } catch (e) {
    console.error("product_manager_error", { requestId, path: url.pathname, message: String(e?.message || "unknown").slice(0, 160) });
    return json({ error: "Product Manager request failed. Reference: " + requestId }, 500);
  }
}
