/* New Version coupon manager API.
 * Reuses the existing `coupons` table to avoid creating a parallel coupon system.
 * Does not alter customer checkout/pricing calculation routes.
 */
import { requireAdminPermission } from "./admin-auth.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const CODE = /^[A-Z0-9][A-Z0-9_-]{2,39}$/;
const TYPES = new Set(["PERCENT", "FLAT"]);
const isoOrNull = value => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
};
const numOrNull = value => value === null || value === undefined || value === "" ? null : (typeof value === "number" && Number.isFinite(value) ? value : undefined);

function parseProductIds(value) {
  if (value === "*" || value === null || value === undefined || value === "") return ["*"];
  // The existing checkout reads product_ids as a comma-separated string.
  // Accept legacy JSON arrays when reading, but always write the checkout format.
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return String(value).split(",").map(x => x.trim()).filter(Boolean);
}
function serialize(row) {
  const rawType = String(row.discount_type || "").toUpperCase();
  const discountType = rawType === "PERCENTAGE" || rawType === "PERCENT" ? "PERCENT" : "FLAT";
  return { code: row.code, discount_type: discountType, discount_value: Number(row.discount_value), product_ids: parseProductIds(row.product_ids),
    min_amount: row.min_amount === null ? null : Number(row.min_amount), max_uses: row.max_uses === null ? null : Number(row.max_uses),
    starts_at: row.starts_at, expires_at: row.expires_at, active: Number(row.active) === 1,
    used_count: Number(row.used_count || 0), reserved_count: Number(row.reserved_count || 0) };
}
async function permission(request, env, key) {
  const result = await requireAdminPermission(request, env, key);
  return result.ok ? { user: result.user } : { response: result.response };
}
function validate(body, creating) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Invalid JSON body.";
  if (creating && (typeof body.code !== "string" || !CODE.test(body.code.trim().toUpperCase()))) return "Coupon code must be 3–40 characters using A–Z, 0–9, _ or -.";
  if (body.discount_type !== undefined && !TYPES.has(body.discount_type)) return "discount_type must be PERCENT or FLAT.";
  if (body.discount_value !== undefined) {
    if (typeof body.discount_value !== "number" || !Number.isFinite(body.discount_value) || body.discount_value <= 0 || Math.round(body.discount_value * 100) !== body.discount_value * 100) return "discount_value must be a positive number with at most 2 decimal places.";
    if (body.discount_type === "PERCENT" && body.discount_value > 100) return "Percent discount cannot exceed 100.";
  }
  if (body.product_ids !== undefined && !(body.product_ids === "*" || (Array.isArray(body.product_ids) && body.product_ids.length <= 100 && body.product_ids.every(x => typeof x === "string" && x.length <= 120)))) return "product_ids must be '*' or an array of product IDs.";
  for (const key of ["min_amount", "max_uses"]) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") {
      if (typeof body[key] !== "number" || !Number.isFinite(body[key]) || body[key] < 0 || (key === "max_uses" && (!Number.isInteger(body[key]) || body[key] < 1))) return `Invalid ${key}.`;
    }
  }
  for (const key of ["starts_at", "expires_at"]) if (body[key] !== undefined && isoOrNull(body[key]) === undefined) return `Invalid ${key}; use a valid date/time.`;
  if (body.active !== undefined && ![true, false, 0, 1].includes(body.active)) return "active must be true or false.";
  return null;
}
async function list(request, env, url) {
  const access = await permission(request, env, "coupons.read");
  if (access.response) return access.response;
  const q = (url.searchParams.get("q") || "").trim().toUpperCase().slice(0, 40);
  const active = url.searchParams.get("active");
  const rows = await env.DB.prepare(`SELECT code,discount_type,discount_value,product_ids,min_amount,max_uses,starts_at,expires_at,active,used_count,reserved_count FROM coupons WHERE (?1='' OR code LIKE '%' || ?1 || '%') AND (?2='' OR active=?2) ORDER BY code LIMIT 300`).bind(q, active === "true" ? "1" : active === "false" ? "0" : "").all();
  return json({ ok: true, items: (rows.results || []).map(serialize) });
}
async function create(request, env, auth) {
  const access = await permission(request, env, "coupons.write");
  if (access.response) return access.response;
  let body; try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  const error = validate(body, true); if (error) return json({ error }, 400);
  const code = body.code.trim().toUpperCase();
  const type = body.discount_type;
  if (!TYPES.has(type) || typeof body.discount_value !== "number") return json({ error: "discount_type and discount_value are required." }, 400);
  if (type === "PERCENT" && body.discount_value > 100) return json({ error: "Percent discount cannot exceed 100." }, 400);
  // Preserve the legacy checkout's comma-separated product_ids contract.
  const productIds = body.product_ids === undefined || body.product_ids === "*" ? "*" : body.product_ids.join(",");
  const minAmount = numOrNull(body.min_amount), maxUses = numOrNull(body.max_uses);
  const starts = isoOrNull(body.starts_at), expires = isoOrNull(body.expires_at);
  if (minAmount === undefined || maxUses === undefined || starts === undefined || expires === undefined) return json({ error: "Invalid amount, usage limit, or date." }, 400);
  if (starts && expires && Date.parse(expires) <= Date.parse(starts)) return json({ error: "expires_at must be later than starts_at." }, 400);
  try {
    await env.DB.prepare(`INSERT INTO coupons (code,discount_type,discount_value,product_ids,min_amount,max_uses,starts_at,expires_at,active,used_count) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,0)`)
      .bind(code, type, body.discount_value, productIds, minAmount, maxUses, starts, expires, body.active === false || body.active === 0 ? 0 : 1).run();
    return json({ ok: true, code, message: "Coupon created." }, 201);
  } catch (e) { return json({ error: "Coupon could not be created. The code may already exist or the database schema may differ." }, 409); }
}
async function update(request, env, code) {
  const access = await permission(request, env, "coupons.write");
  if (access.response) return access.response;
  let body; try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  const error = validate(body, false); if (error) return json({ error }, 400);
  const allowed = ["discount_type", "discount_value", "product_ids", "min_amount", "max_uses", "starts_at", "expires_at", "active"];
  const sets = [], values = [];
  const add = (column, value) => { values.push(value); sets.push(`${column}=?${values.length}`); };
  if (body.discount_type !== undefined) add("discount_type", body.discount_type);
  if (body.discount_value !== undefined) add("discount_value", body.discount_value);
  if (body.product_ids !== undefined) add("product_ids", body.product_ids === "*" ? "*" : body.product_ids.join(","));
  if (body.min_amount !== undefined) { const n = numOrNull(body.min_amount); if (n === undefined) return json({ error: "Invalid min_amount." }, 400); add("min_amount", n); }
  if (body.max_uses !== undefined) { const n = numOrNull(body.max_uses); if (n === undefined) return json({ error: "Invalid max_uses." }, 400); add("max_uses", n); }
  if (body.starts_at !== undefined) add("starts_at", isoOrNull(body.starts_at));
  if (body.expires_at !== undefined) add("expires_at", isoOrNull(body.expires_at));
  if (body.active !== undefined) add("active", body.active === true || body.active === 1 ? 1 : 0);
  if (!sets.length) return json({ error: "No supported fields provided." }, 400);
  // Keep discount type/value consistent when both are being changed.
  const current = await env.DB.prepare("SELECT discount_type,discount_value,starts_at,expires_at,max_uses,used_count,reserved_count FROM coupons WHERE code=?1").bind(code).first();
  if (!current) return json({ error: "Coupon not found." }, 404);
  if (body.max_uses !== undefined && body.max_uses !== null &&
      body.max_uses < Number(current.used_count || 0) + Number(current.reserved_count || 0)) {
    return json({ error: "max_uses cannot be lower than already redeemed plus reserved coupon uses." }, 409);
  }
  const newType = body.discount_type === undefined ? String(current.discount_type).toUpperCase() : body.discount_type;
  const newValue = body.discount_value === undefined ? Number(current.discount_value) : body.discount_value;
  if (newType === "PERCENT" && newValue > 100) return json({ error: "Percent discount cannot exceed 100." }, 400);
  const newStart = body.starts_at === undefined ? current.starts_at : isoOrNull(body.starts_at);
  const newEnd = body.expires_at === undefined ? current.expires_at : isoOrNull(body.expires_at);
  if (newStart && newEnd && Date.parse(newEnd) <= Date.parse(newStart)) return json({ error: "expires_at must be later than starts_at." }, 400);
  values.push(code); const result = await env.DB.prepare(`UPDATE coupons SET ${sets.join(", ")} WHERE code=?${values.length}`).bind(...values).run();
  if (!result.meta?.changes) return json({ error: "Coupon not found or no changes made." }, 404);
  return json({ ok: true, code, message: "Coupon updated." });
}
export async function handleCouponManager(request, env, url) {
  if (!env.DB) return json({ error: "Database binding is unavailable." }, 503);
  const path = url.pathname;
  try {
    if (path === "/api/v2/admin/coupons" && request.method === "GET") return await list(request, env, url);
    if (path === "/api/v2/admin/coupons" && request.method === "POST") return await create(request, env);
    const match = /^\/api\/v2\/admin\/coupons\/([A-Z0-9_-]{3,40})$/i.exec(path);
    if (match && request.method === "PATCH") return await update(request, env, match[1].toUpperCase());
    return json({ error: "Not found." }, 404);
  } catch (e) {
    console.error("coupon_manager_error", String(e?.message || "unknown").slice(0, 160));
    return json({ error: "Coupon manager request failed." }, 500);
  }
}
