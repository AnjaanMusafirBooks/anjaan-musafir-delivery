import { requireAdminPermission } from "./admin-auth.js";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z")); }
export async function handleAdminCheckoutEvents(request, env, url) {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  if (!env.DB) return json({ error: "Admin database binding is unavailable." }, 503);
  const auth = await requireAdminPermission(request, env, "checkout_events.read");
  if (!auth.ok) return auth.response;
  const from = url.searchParams.get("from") || "", to = url.searchParams.get("to") || "";
  if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) return json({ error: "Use valid YYYY-MM-DD dates; from must not be after to." }, 400);
  const filters = {
    order_id: String(url.searchParams.get("order_id") || "").trim().slice(0, 100),
    attempt_id: String(url.searchParams.get("attempt_id") || "").trim().slice(0, 100),
    product_id: String(url.searchParams.get("product_id") || "").trim().slice(0, 100),
    event_type: String(url.searchParams.get("event_type") || "").trim().slice(0, 80).toUpperCase(),
  };
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50));
  const requestedOffset = Number.parseInt(url.searchParams.get("offset") || "0", 10);
  if (!Number.isSafeInteger(requestedOffset) || requestedOffset < 0 || requestedOffset > 100000) return json({ error: "Offset must be an integer between 0 and 100000." }, 400);
  const offset = requestedOffset;
  if (filters.event_type && !/^[A-Z0-9_:-]{1,80}$/.test(filters.event_type)) return json({ error: "Invalid event_type filter." }, 400);
  const clauses = [], binds = [];
  for (const key of ["order_id", "attempt_id", "product_id", "event_type"]) if (filters[key]) { clauses.push(`${key}=?`); binds.push(filters[key]); }
  if (from) { clauses.push("date(created_at)>=date(?)"); binds.push(from); }
  if (to) { clauses.push("date(created_at)<=date(?)"); binds.push(to); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  try {
    const rows = await env.DB.prepare(`SELECT event_id,attempt_id,order_id,product_id,event_type,outcome,error_code,http_status,metadata_json,created_at
      FROM nv_checkout_events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...binds, limit, offset).all();
    const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM nv_checkout_events ${where}`).bind(...binds).first();
    return json({ ok: true, items: rows.results || [], filters: { ...filters, from: from || null, to: to || null }, page: { limit, offset, total: Number(count?.total || 0) }, note: "Customer email is not returned. PAYMENT_STARTED is logged only when reliably observable; abandoned checkout is not inferred." });
  } catch {
    return json({ error: "Checkout event log is unavailable. Apply migration 015 to staging D1." }, 503);
  }
}
