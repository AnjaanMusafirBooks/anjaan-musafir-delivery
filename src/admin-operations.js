import { requireAdminPermission } from "./admin-auth.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function allowed(request, env, permission) {
  const result = await requireAdminPermission(request, env, permission);
  return result.ok ? null : result.response;
}

async function tableExists(db, table) {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?1 LIMIT 1").bind(table).first();
  return !!row;
}

function htmlEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
async function recordEmailRetry(env, order, status, httpStatus = null, messageId = null, errorCode = null) {
  try {
    await env.DB.prepare(`INSERT INTO nv_email_events(order_id,recipient_email,event_type,provider,status,http_status,provider_message_id,error_code)
      VALUES (?1,?2,'ORDER_DELIVERY_RETRY','BREVO',?3,?4,?5,?6)`)
      .bind(order.order_id, String(order.customer_email).trim().toLowerCase(), status,
        Number.isInteger(httpStatus) ? httpStatus : null, messageId ? String(messageId).slice(0,200) : null,
        errorCode ? String(errorCode).slice(0,100) : null).run();
  } catch {}
}
async function retryOrderDeliveryEmail(request, env, url) {
  const auth = await requireAdminPermission(request, env, "email.retry");
  if (!auth.ok) return auth.response;
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const match = /^\/api\/v2\/admin\/email-activity\/([^/]+)\/retry$/.exec(url.pathname);
  if (!match) return json({ error: "Not found." }, 404);
  let orderId; try { orderId = decodeURIComponent(match[1]); } catch { return json({ error: "Invalid order ID." }, 400); }
  if (!orderId || orderId.length > 100) return json({ error: "Invalid order ID." }, 400);
  if (!(await tableExists(env.DB, "nv_email_events"))) return json({ error: "Apply migration 007 before retrying email." }, 503);
  const order = await env.DB.prepare(`SELECT o.order_id,o.product_id,o.customer_email,o.customer_name,o.final_price,o.payment_status,
      d.token,d.expires_at,d.download_count,p.name AS product_name
    FROM orders o LEFT JOIN downloads d ON d.id=(SELECT id FROM downloads WHERE order_id=o.order_id ORDER BY id DESC LIMIT 1)
    LEFT JOIN products p ON p.product_id=o.product_id WHERE o.order_id=?1 LIMIT 1`).bind(orderId).first();
  if (!order || String(order.payment_status).toUpperCase() !== "PAID") return json({ error: "Only verified PAID orders can receive a delivery-email retry." }, 404);
  if (!order.token || !order.expires_at || Date.parse(order.expires_at) <= Date.now()) return json({ error: "The download token is expired. Ask the customer to use My Order first; retry does not reset download limits." }, 409);
  if (!env.BREVO_API_KEY || !env.WORKER_PUBLIC_URL || !/^https:\/\//i.test(String(env.WORKER_PUBLIC_URL))) {
    await recordEmailRetry(env, order, "SKIPPED_CONFIGURATION", null, null, !env.BREVO_API_KEY ? "BREVO_API_KEY_MISSING" : "WORKER_PUBLIC_URL_MISSING");
    return json({ error: "Brevo or Worker URL is not configured; retry outcome was recorded and no email was sent." }, 503);
  }
  const maxDownloads = Math.max(1, Number(env.MAX_DOWNLOADS || 3));
  if (Number(order.download_count || 0) >= maxDownloads) return json({ error: "The download limit has been reached. Do not send another download link; review the request manually." }, 409);
  const recent = await env.DB.prepare(`SELECT COUNT(*) AS n FROM nv_email_events WHERE order_id=?1 AND event_type='ORDER_DELIVERY_RETRY' AND created_at >= datetime('now','-1 hour')`).bind(orderId).first();
  if (Number(recent?.n || 0) >= 3) return json({ error: "Email retry limit reached for this order. Try again later." }, 429);
  const downloadUrl = `${String(env.WORKER_PUBLIC_URL).replace(/\/+$/, "")}/download?token=${encodeURIComponent(order.token)}`;
  const myOrderUrl = env.FRONTEND_URL && /^https:\/\//i.test(String(env.FRONTEND_URL)) ? `${String(env.FRONTEND_URL).replace(/\/+$/, "")}/my-order.html` : "";
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST", headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ sender: { name: "Anjaan Musafir Books", email: env.BREVO_SENDER || "officialsuperswagg@gmail.com" },
        to: [{ email: order.customer_email, name: order.customer_name || undefined }],
        subject: `Your eBook delivery link — Order ${order.order_id}`,
        htmlContent: `<p>Hello ${htmlEscape(order.customer_name)},</p><p>Your eBook <strong>${htmlEscape(order.product_name)}</strong> is ready.</p><p><strong>Order ID:</strong> ${htmlEscape(order.order_id)}</p><p><a href="${htmlEscape(downloadUrl)}">Download eBook</a></p>${myOrderUrl ? `<p>For future recovery use <a href="${htmlEscape(myOrderUrl)}">My Order</a> with this Order ID and your purchase email.</p>` : ""}<p>This link is limited by its expiry and download attempts.</p>` })
    });
    let result = {}; try { result = await response.json(); } catch {}
    if (!response.ok) {
      await recordEmailRetry(env, order, "FAILED", response.status, null, `BREVO_HTTP_${response.status}`);
      return json({ error: `Brevo rejected the retry (HTTP ${response.status}). The paid order and website download remain available.` }, 502);
    }
    await recordEmailRetry(env, order, "ACCEPTED", response.status, result.messageId || result.message_id || null, null);
    try { await env.DB.prepare(`INSERT INTO admin_audit_log(actor_user_id,actor_role,action,target_type,target_id,outcome,metadata_json)
      VALUES (?1,?2,'email.delivery.retry','order',?3,'SUCCESS','{}')`).bind(auth.user.user_id,auth.user.role,orderId).run(); } catch {}
    return json({ ok: true, order_id: orderId, status: "ACCEPTED", message: "Brevo accepted the retry request; inbox delivery is not guaranteed by provider acceptance." });
  } catch {
    await recordEmailRetry(env, order, "FAILED", null, null, "BREVO_REQUEST_ERROR");
    return json({ error: "Email retry failed at the provider connection. The order remains PAID; use My Order as the fallback." }, 502);
  }
}

export async function handleAdminOperations(request, env, url) {
  if (!env.DB) return json({ error: "Admin database binding is unavailable." }, 503);
  const path = url.pathname;
  if (path.startsWith("/api/v2/admin/email-activity/") && path.endsWith("/retry")) return retryOrderDeliveryEmail(request, env, url);
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);

  if (path === "/api/v2/admin/health") {
    const denied = await allowed(request, env, "health.read");
    if (denied) return denied;
    try {
      await env.DB.prepare("SELECT 1 AS ok").first();
      const names = ["admin_users", "admin_sessions", "admin_role_permissions", "admin_audit_log", "admin_security_events", "orders", "products", "downloads", "nv_products", "nv_email_events", "nv_purchase_requests", "nv_system_settings", "nv_checkout_events"];
      const tables = {};
      for (const name of names) tables[name] = await tableExists(env.DB, name);
      const activeCatalog = {};
      if (tables.products) {
        try { activeCatalog.legacy_active_products = Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM products WHERE active=1").first())?.n || 0); }
        catch { activeCatalog.legacy_active_products = null; }
      }
      if (tables.nv_products) {
        try { activeCatalog.new_version_active_products = Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM nv_products WHERE status='ACTIVE'").first())?.n || 0); }
        catch { activeCatalog.new_version_active_products = null; }
      }
      const bindings = {
        cashfree_client_id_configured: !!env.CASHFREE_CLIENT_ID,
        cashfree_client_secret_configured: !!env.CASHFREE_CLIENT_SECRET,
        brevo_api_key_configured: !!env.BREVO_API_KEY,
        frontend_url_configured: !!env.FRONTEND_URL && /^https:\/\//i.test(String(env.FRONTEND_URL)),
        worker_public_url_configured: !!env.WORKER_PUBLIC_URL && /^https:\/\//i.test(String(env.WORKER_PUBLIC_URL)),
        private_pdf_bucket_binding_available: !!(env.BOOKS_BUCKET && typeof env.BOOKS_BUCKET.get === "function" && typeof env.BOOKS_BUCKET.put === "function"),
      };
      const warnings = [];
      if (!bindings.cashfree_client_id_configured || !bindings.cashfree_client_secret_configured) warnings.push("Cashfree credentials are not fully configured; payment has not been tested by this health check.");
      if (!bindings.brevo_api_key_configured) warnings.push("Brevo email is not configured; email delivery is unavailable until configured.");
      if (!bindings.private_pdf_bucket_binding_available) warnings.push("Private PDF R2 binding is unavailable.");
      if (!tables.nv_email_events) warnings.push("Email activity migration is not installed.");
      if (!tables.nv_purchase_requests) warnings.push("Purchase Request migration is not installed.");
      return json({ ok: true, checked_at: new Date().toISOString(), database_query: "ok", tables, active_catalog_counts: activeCatalog, configuration_presence: bindings, warnings, note: "Configuration presence is checked only; no secret values are returned and external provider connectivity is not tested." });
    } catch {
      return json({ ok: false, database_query: "failed", error: "Health check could not query the database." }, 503);
    }
  }

  if (path === "/api/v2/admin/audit-logs") {
    const denied = await allowed(request, env, "logs.read");
    if (denied) return denied;
    if (!(await tableExists(env.DB, "admin_audit_log"))) return json({ items: [], configured: false, warning: "Audit table is not installed." });
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50) || 50));
    const rows = await env.DB.prepare(`SELECT audit_id, actor_user_id, actor_role, action, target_type, target_id, outcome, request_id, created_at
      FROM admin_audit_log ORDER BY audit_id DESC LIMIT ?1`).bind(limit).all();
    return json({ items: rows.results || [], configured: true });
  }

  if (path === "/api/v2/admin/email-activity") {
    const denied = await allowed(request, env, "email.read");
    if (denied) return denied;
    if (!(await tableExists(env.DB, "nv_email_events"))) {
      return json({ items: [], configured: false, message: "Email activity migration 007 is not installed in this environment." });
    }
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50) || 50));
    const status = String(url.searchParams.get("status") || "").toUpperCase();
    const allowedStatuses = new Set(["ACCEPTED", "FAILED", "SKIPPED_CONFIGURATION"]);
    let rows;
    if (status && allowedStatuses.has(status)) {
      rows = await env.DB.prepare(`SELECT event_id, order_id, recipient_email, event_type, provider, status, http_status, provider_message_id, error_code, created_at
        FROM nv_email_events WHERE status=?1 ORDER BY event_id DESC LIMIT ?2`).bind(status, limit).all();
    } else {
      rows = await env.DB.prepare(`SELECT event_id, order_id, recipient_email, event_type, provider, status, http_status, provider_message_id, error_code, created_at
        FROM nv_email_events ORDER BY event_id DESC LIMIT ?1`).bind(limit).all();
    }
    return json({ items: rows.results || [], configured: true, limit, status_filter: status && allowedStatuses.has(status) ? status : null });
  }

  return json({ error: "Not found." }, 404);
}
