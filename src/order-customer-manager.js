/* New Version read-only admin APIs for existing orders/customers tables.
 * Uses the existing `orders` schema; does not mutate payment/order records.
 */
import { requireAdminPermission } from "./admin-auth.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function positiveInt(value, fallback, max) {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

function safeSearch(value) {
  return String(value ?? "").trim().slice(0, 100);
}

async function permission(request, env, key) {
  if (!env.DB) return { response: json({ error: "Admin database binding is unavailable." }, 503) };
  const check = await requireAdminPermission(request, env, key);
  if (!check.ok) return { response: check.response };
  return { user: check.user };
}

export async function handleAdminOrderCustomer(request, env, url) {
  const path = url.pathname;
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);

  if (path === "/api/v2/admin/orders" || /^\/api\/v2\/admin\/orders\/[^/]+$/.test(path)) {
    const auth = await permission(request, env, "orders.read");
    if (auth.response) return auth.response;

    const detailMatch = /^\/api\/v2\/admin\/orders\/([^/]+)$/.exec(path);
    if (detailMatch) {
      let orderId;
      try { orderId = decodeURIComponent(detailMatch[1]); } catch { return json({ error: "Invalid order ID." }, 400); }
      if (!orderId || orderId.length > 100) return json({ error: "Invalid order ID." }, 400);
      const order = await env.DB.prepare(`SELECT order_id, product_id, customer_name, customer_phone, customer_email,
        regular_price, current_price, discount_price, final_price, coupon_code, payment_status, paid_at, created_at
        FROM orders WHERE order_id = ?1 LIMIT 1`).bind(orderId).first();
      if (!order) return json({ error: "Order not found." }, 404);
      return json({ ok: true, order });
    }

    const status = safeSearch(url.searchParams.get("status")).toUpperCase();
    const q = safeSearch(url.searchParams.get("q"));
    const productId = safeSearch(url.searchParams.get("product_id"));
    const coupon = safeSearch(url.searchParams.get("coupon")).toUpperCase();
    const from = safeSearch(url.searchParams.get("from"));
    const to = safeSearch(url.searchParams.get("to"));
    const minAmountText = url.searchParams.get("min_amount");
    const maxAmountText = url.searchParams.get("max_amount");
    const problemOnly = url.searchParams.get("problem_only") === "true";
    const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z"));
    if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) return json({ error: "Use valid YYYY-MM-DD dates; from must not be after to." }, 400);
    const minAmount = minAmountText === null || minAmountText === "" ? null : Number(minAmountText);
    const maxAmount = maxAmountText === null || maxAmountText === "" ? null : Number(maxAmountText);
    if ((minAmount !== null && (!Number.isFinite(minAmount) || minAmount < 0)) || (maxAmount !== null && (!Number.isFinite(maxAmount) || maxAmount < 0)) || (minAmount !== null && maxAmount !== null && minAmount > maxAmount)) return json({ error: "Amount range is invalid." }, 400);
    const limit = positiveInt(url.searchParams.get("limit"), 25, 100);
    const offset = positiveInt(url.searchParams.get("offset"), 1, 1000000) - 1;
    const clauses = [];
    const bindings = [];
    if (status) { clauses.push("UPPER(payment_status) = ?"); bindings.push(status); }
    if (productId) { clauses.push("product_id = ?"); bindings.push(productId); }
    if (coupon) { clauses.push("UPPER(COALESCE(coupon_code,'')) = ?"); bindings.push(coupon); }
    if (from) { clauses.push("date(created_at) >= date(?)"); bindings.push(from); }
    if (to) { clauses.push("date(created_at) <= date(?)"); bindings.push(to); }
    if (minAmount !== null) { clauses.push("COALESCE(final_price,0) >= ?"); bindings.push(minAmount); }
    if (maxAmount !== null) { clauses.push("COALESCE(final_price,0) <= ?"); bindings.push(maxAmount); }
    if (problemOnly) { clauses.push("UPPER(payment_status) IN ('FAILED','PENDING','CREATED','CANCELLED','EXPIRED')"); }
    if (q) {
      clauses.push("(order_id LIKE ? ESCAPE '\\' OR customer_email LIKE ? ESCAPE '\\' OR customer_phone LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\' OR product_id LIKE ? ESCAPE '\\')");
      const term = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
      bindings.push(term, term, term, term, term);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await env.DB.prepare(`SELECT order_id, product_id, customer_name, customer_phone, customer_email,
      regular_price, current_price, discount_price, final_price, coupon_code, payment_status, paid_at, created_at
      FROM orders ${where} ORDER BY created_at DESC, paid_at DESC, order_id DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, limit, offset).all();
    const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM orders ${where}`).bind(...bindings).first();
    return json({ ok: true, items: rows.results || [], filters: { status: status || null, q: q || null, product_id: productId || null, coupon: coupon || null, from: from || null, to: to || null, min_amount: minAmount, max_amount: maxAmount, problem_only: problemOnly, problem_filter_definition: problemOnly ? "failed/pending/created/cancelled/expired payment states only; abandoned checkout is not inferred" : null }, page: { limit, offset, total: Number(count?.total || 0) } });
  }

  if (path === "/api/v2/admin/customers") {
    const auth = await permission(request, env, "customers.read");
    if (auth.response) return auth.response;
    const q = safeSearch(url.searchParams.get("q"));
    const limit = positiveInt(url.searchParams.get("limit"), 25, 100);
    const offset = positiveInt(url.searchParams.get("offset"), 1, 1000000) - 1;
    const clauses = [];
    const bindings = [];
    if (q) {
      clauses.push("(customer_email LIKE ? ESCAPE '\\' OR customer_phone LIKE ? ESCAPE '\\' OR COALESCE(customer_name, '') LIKE ? ESCAPE '\\')");
      const term = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
      bindings.push(term, term, term);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await env.DB.prepare(`SELECT customer_email, MAX(customer_name) AS customer_name,
      MAX(customer_phone) AS customer_phone, COUNT(*) AS order_count,
      SUM(CASE WHEN UPPER(payment_status) IN ('PAID','SUCCESS','COMPLETED') THEN 1 ELSE 0 END) AS paid_order_count,
      SUM(CASE WHEN UPPER(payment_status) IN ('PAID','SUCCESS','COMPLETED') THEN COALESCE(final_price,0) ELSE 0 END) AS paid_total,
      MAX(paid_at) AS last_paid_at
      FROM orders ${where} GROUP BY LOWER(customer_email) ORDER BY last_paid_at DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, limit, offset).all();
    const count = await env.DB.prepare(`SELECT COUNT(DISTINCT LOWER(customer_email)) AS total FROM orders ${where}`).bind(...bindings).first();
    return json({ ok: true, items: rows.results || [], page: { limit, offset, total: Number(count?.total || 0) } });
  }
  return json({ error: "Not found." }, 404);
}
