/* Read-only reporting APIs based on the existing orders table. */
import { requireAdminPermission } from "./admin-auth.js";

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra } });
}
function validDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")); }
function csvCell(v) {
  let s = String(v ?? "");
  // Prevent spreadsheet formula injection when an admin opens the export in Excel/Sheets.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function handleAdminReports(request, env, url) {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405, { Allow: "GET" });
  if (!env.DB) return json({ error: "Admin database binding is unavailable." }, 503);
  const auth = await requireAdminPermission(request, env, "reports.read");
  if (!auth.ok) return auth.response;
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) return json({ error: "Use valid YYYY-MM-DD dates; from must not be after to." }, 400);
  const clauses = [];
  const bindings = [];
  const status = (url.searchParams.get("status") || "").trim().toUpperCase();
  const productId = (url.searchParams.get("product_id") || "").trim().slice(0, 100);
  const coupon = (url.searchParams.get("coupon") || "").trim().slice(0, 80);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 160);
  const minAmountRaw = url.searchParams.get("min_amount");
  const maxAmountRaw = url.searchParams.get("max_amount");
  const minAmount = minAmountRaw === null || minAmountRaw === "" ? null : Number(minAmountRaw);
  const maxAmount = maxAmountRaw === null || maxAmountRaw === "" ? null : Number(maxAmountRaw);
  const allowedStatuses = new Set(["PAID", "SUCCESS", "COMPLETED", "PENDING", "ACTIVE", "FAILED", "CANCELLED", "CANCELED", "EXPIRED", "CREATED"]);
  if (status && !allowedStatuses.has(status)) return json({ error: "Unsupported status filter." }, 400);
  if ((minAmount !== null && (!Number.isFinite(minAmount) || minAmount < 0)) || (maxAmount !== null && (!Number.isFinite(maxAmount) || maxAmount < 0)) || (minAmount !== null && maxAmount !== null && minAmount > maxAmount)) return json({ error: "Amount filters must be non-negative numbers; min_amount cannot exceed max_amount." }, 400);
  /* Paid orders use paid_at; unpaid orders fall back to created_at so date-filtered order totals do not silently omit pending/failed orders. Historical rows with no created_at still fall back to paid_at. */
  if (from) { clauses.push("date(COALESCE(paid_at, created_at)) >= date(?)"); bindings.push(from); }
  if (to) { clauses.push("date(COALESCE(paid_at, created_at)) <= date(?)"); bindings.push(to); }
  if (status) { clauses.push("UPPER(payment_status) = ?"); bindings.push(status); }
  if (productId) { clauses.push("product_id = ?"); bindings.push(productId); }
  if (coupon) { clauses.push("UPPER(COALESCE(coupon_code,'')) = UPPER(?)"); bindings.push(coupon); }
  if (minAmount !== null) { clauses.push("COALESCE(final_price,0) >= ?"); bindings.push(minAmount); }
  if (maxAmount !== null) { clauses.push("COALESCE(final_price,0) <= ?"); bindings.push(maxAmount); }
  if (q) {
    // Treat %, _ and backslash as literal search characters rather than user-controlled LIKE wildcards.
    clauses.push("(order_id LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\' OR customer_email LIKE ? ESCAPE '\\' OR product_id LIKE ? ESCAPE '\\')");
    const term = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    bindings.push(term, term, term, term);
  }
  const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
  const filterInfo = { from: from || null, to: to || null, status: status || null, product_id: productId || null, coupon: coupon || null, q: q || null, min_amount: minAmount, max_amount: maxAmount };
  try {
    if (url.pathname === "/api/v2/admin/reports/summary") {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS total_orders,
        SUM(CASE WHEN UPPER(payment_status) IN ('PAID','SUCCESS','COMPLETED') THEN 1 ELSE 0 END) AS paid_orders,
        SUM(CASE WHEN UPPER(payment_status) IN ('PENDING','ACTIVE') THEN 1 ELSE 0 END) AS pending_orders,
        SUM(CASE WHEN UPPER(payment_status) IN ('PAID','SUCCESS','COMPLETED') THEN COALESCE(final_price,0) ELSE 0 END) AS gross_sales
        FROM orders ${where}`).bind(...bindings).first();
      return json({ ok: true, filters: filterInfo, summary: {
        total_orders: Number(row?.total_orders || 0), paid_orders: Number(row?.paid_orders || 0),
        pending_orders: Number(row?.pending_orders || 0), gross_sales: Number(row?.gross_sales || 0)
      } });
    }
    if (url.pathname === "/api/v2/admin/reports/sales") {
      const rows = await env.DB.prepare(`SELECT date(COALESCE(paid_at, created_at)) AS sale_date, COUNT(*) AS paid_orders,
        SUM(COALESCE(final_price,0)) AS gross_sales
        FROM orders ${where ? where + " AND" : "WHERE"} UPPER(payment_status) IN ('PAID','SUCCESS','COMPLETED')
        GROUP BY date(COALESCE(paid_at, created_at)) ORDER BY sale_date DESC LIMIT 366`).bind(...bindings).all();
      return json({ ok: true, filters: filterInfo, items: rows.results || [] });
    }
    if (url.pathname === "/api/v2/admin/reports/orders.csv") {
      // Fetch one extra row so an export never silently truncates a larger report.
      const rows = await env.DB.prepare(`SELECT order_id, product_id, customer_name, customer_email, customer_phone,
        final_price, coupon_code, payment_status, created_at, paid_at FROM orders ${where}
        ORDER BY COALESCE(paid_at, created_at) DESC LIMIT 5001`).bind(...bindings).all();
      if ((rows.results || []).length > 5000) {
        return json({ error: "This report contains more than 5,000 rows. Narrow the date range or add filters before exporting." }, 413);
      }
      const cols = ["order_id","product_id","customer_name","customer_email","customer_phone","final_price","coupon_code","payment_status","created_at","paid_at"];
      const body = [cols.join(","), ...(rows.results || []).map(r => cols.map(c => csvCell(r[c])).join(","))].join("\r\n");
      return new Response(body, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="anjaan-musafir-orders-report.csv"', "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET,OPTIONS" } });
    }
    return json({ error: "Not found." }, 404);
  } catch (error) {
    console.error("admin_reports_error", { message: String(error?.message || "unknown").slice(0, 160) });
    return json({ error: "Report query failed. Check the existing orders schema and Worker logs." }, 503);
  }
}
