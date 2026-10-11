/* Candidate-only manual payment fallback. All approvals require a privileged
 * server-side permission and an explicit human attestation of payment. */
import { requireAdminPermission } from "./admin-auth.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const emailNorm = (v) => clean(v, 254).toLowerCase();
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm(v));
const safeId = (v) => /^[A-Za-z0-9_-]{6,100}$/.test(String(v ?? ""));

async function audit(db, actor, action, targetId, outcome, metadata = {}) {
  try {
    await db.prepare(`INSERT INTO admin_audit_log
      (actor_user_id, actor_role, action, target_type, target_id, outcome, metadata_json)
      VALUES (?1,?2,?3,'purchase_request',?4,?5,?6)`)
      .bind(actor?.user_id || null, actor?.role || null, action, targetId || null, outcome,
        JSON.stringify(metadata).slice(0, 1500)).run();
  } catch { /* Audit failure must not leak SQL or customer data to the client. */ }
}

async function currentPrice(db, productId) {
  const product = await db.prepare(`SELECT product_id, name, price, currency, file_key, file_name, active
    FROM products WHERE product_id=?1 LIMIT 1`).bind(productId).first();
  if (!product || Number(product.active) !== 1) return null;
  const offer = await db.prepare(`SELECT mrp, sale_price, starts_at, ends_at, active FROM offers
    WHERE product_id=?1 LIMIT 1`).bind(productId).first().catch(() => null);
  const now = Date.now();
  const starts = offer?.starts_at ? Date.parse(offer.starts_at) : null;
  const ends = offer?.ends_at ? Date.parse(offer.ends_at) : null;
  const startsOk = !offer?.starts_at || (Number.isFinite(starts) && starts <= now);
  const endsOk = !offer?.ends_at || (Number.isFinite(ends) && ends >= now);
  const offerLive = !!offer && Number(offer.active) === 1 && Number.isFinite(Number(offer.sale_price)) && startsOk && endsOk;
  const mrp = Math.max(0, Number(offerLive && offer.mrp != null ? offer.mrp : product.price) || 0);
  const price = Math.max(0, Number(offerLive ? offer.sale_price : product.price) || 0);
  if (price > mrp) return null;
  return { ...product, mrp, price };
}

async function submitRequest(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Enter valid request details." }, 400); }
  const productId = clean(body?.product_id, 100);
  const name = clean(body?.customer_name, 100);
  const email = emailNorm(body?.customer_email);
  const phone = clean(body?.customer_phone, 24);
  const reference = clean(body?.payment_reference, 100);
  const amount = Number(body?.amount_paid);
  if (!productId || name.length < 2 || !validEmail(email) || !/^\+?[0-9 ()-]{8,20}$/.test(phone)) {
    return json({ error: "Provide a book, full name, valid email and phone number." }, 400);
  }
  if (reference && (reference.length < 4 || !Number.isFinite(amount) || amount <= 0)) {
    return json({ error: "If you enter a payment reference, also enter the amount paid." }, 400);
  }
  if (!env.DB) return json({ error: "Purchase requests are temporarily unavailable." }, 503);
  const product = await currentPrice(env.DB, productId);
  if (!product) return json({ error: "This book is unavailable for manual purchase requests." }, 404);
  const recent = await env.DB.prepare(`SELECT COUNT(*) AS total FROM nv_purchase_requests
    WHERE LOWER(customer_email)=?1 AND created_at >= datetime('now','-1 hour') AND status='PENDING'`)
    .bind(email).first().catch(() => null);
  if (Number(recent?.total || 0) >= 3) return json({ error: "Too many requests for this email. Please try again later." }, 429);
  const requestId = `PR-${crypto.randomUUID()}`;
  try {
    await env.DB.prepare(`INSERT INTO nv_purchase_requests
      (request_id, product_id, product_name, customer_name, customer_email, customer_phone,
       expected_amount, amount_claimed, payment_reference, status)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'PENDING')`)
      .bind(requestId, product.product_id, product.name, name, email, phone, product.price,
        reference ? amount : null, reference || null).run();
  } catch {
    return json({ error: "Could not save the request. Please try again later." }, 503);
  }
  return json({ ok: true, request_id: requestId, status: "PENDING",
    expected_amount: product.price,
    message: "Your request was recorded. Delivery starts only after an administrator verifies the payment." }, 201);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
async function sendManualApprovalEmail(env, row, orderId, token) {
  if (!env.BREVO_API_KEY || !env.WORKER_PUBLIC_URL || !/^https:\/\//i.test(String(env.WORKER_PUBLIC_URL))) {
    await recordEmailEvent(env, { email: row.customer_email, orderId, status: "SKIPPED_CONFIGURATION", errorCode: "MANUAL_DELIVERY_EMAIL_NOT_CONFIGURED" });
    return "SKIPPED_CONFIGURATION";
  }
  const downloadUrl = `${String(env.WORKER_PUBLIC_URL).replace(/\/+$/, "")}/download?token=${encodeURIComponent(token)}`;
  const myOrderUrl = env.FRONTEND_URL && /^https:\/\//i.test(String(env.FRONTEND_URL))
    ? `${String(env.FRONTEND_URL).replace(/\/+$/, "")}/my-order.html` : "";
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST", headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ sender: { name: "Anjaan Musafir Books", email: env.BREVO_SENDER || "officialsuperswagg@gmail.com" },
        to: [{ email: row.customer_email, name: row.customer_name }],
        subject: `Your eBook access — Order ${orderId}`,
        htmlContent: `<p>Hello ${escapeHtml(row.customer_name)},</p><p>Your manually reviewed purchase request has been approved.</p><p><strong>Book:</strong> ${escapeHtml(row.product_name)}<br><strong>Order ID:</strong> ${escapeHtml(orderId)}</p><p><a href="${downloadUrl}">Download your eBook</a></p>${myOrderUrl ? `<p>Later, you can use <a href="${myOrderUrl}">My Order</a> with your Order ID and registered email.</p>` : ""}<p>This download link is limited and expires in 7 days. Keep your Order ID for recovery.</p>` })
    });
    let data = {}; try { data = await response.json(); } catch {}
    if (!response.ok) {
      await recordEmailEvent(env, { email: row.customer_email, orderId, status: "FAILED", httpStatus: response.status, errorCode: `BREVO_HTTP_${response.status}` });
      return "FAILED";
    }
    await recordEmailEvent(env, { email: row.customer_email, orderId, status: "ACCEPTED", httpStatus: response.status, messageId: data.messageId });
    return "ACCEPTED";
  } catch {
    await recordEmailEvent(env, { email: row.customer_email, orderId, status: "FAILED", errorCode: "BREVO_REQUEST_ERROR" });
    return "FAILED";
  }
}
async function recordEmailEvent(env, event) {
  try {
    await env.DB.prepare(`INSERT INTO nv_email_events(order_id,recipient_email,event_type,provider,status,http_status,provider_message_id,error_code)
      VALUES (?1,?2,'MANUAL_PURCHASE_DELIVERY','BREVO',?3,?4,?5,?6)`)
      .bind(event.orderId || null, emailNorm(event.email), event.status,
        Number.isInteger(event.httpStatus) ? event.httpStatus : null,
        event.messageId ? String(event.messageId).slice(0, 200) : null,
        event.errorCode ? String(event.errorCode).slice(0, 100) : null).run();
  } catch { /* Email ledger migration is optional during staged rollout. */ }
}

async function adminRequests(request, env, url, path) {
  const permission = await requireAdminPermission(request, env, "purchase_requests.read");
  if (!permission.ok) return permission.response;
  if (path === "/api/v2/admin/purchase-requests" && request.method === "GET") {
    // Recover requests claimed by a Worker instance that terminated mid-approval.
    await env.DB.prepare(`UPDATE nv_purchase_requests SET status='PENDING',reviewed_by=NULL,reviewed_at=NULL
      WHERE status='APPROVING' AND reviewed_at < datetime('now','-10 minutes')`).run().catch(() => {});
    const status = clean(url.searchParams.get("status"), 20).toUpperCase();
    const limit = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50));
    const rows = status && ["PENDING", "APPROVED", "REJECTED"].includes(status)
      ? await env.DB.prepare(`SELECT request_id,product_id,product_name,customer_name,customer_email,customer_phone,
          expected_amount,amount_claimed,payment_reference,status,admin_note,created_at,reviewed_at,order_id
          FROM nv_purchase_requests WHERE status=?1 ORDER BY created_at DESC LIMIT ?2`).bind(status, limit).all()
      : await env.DB.prepare(`SELECT request_id,product_id,product_name,customer_name,customer_email,customer_phone,
          expected_amount,amount_claimed,payment_reference,status,admin_note,created_at,reviewed_at,order_id
          FROM nv_purchase_requests ORDER BY created_at DESC LIMIT ?1`).bind(limit).all();
    return json({ ok: true, items: rows.results || [], limit });
  }
  const approve = /^\/api\/v2\/admin\/purchase-requests\/([^/]+)\/approve$/.exec(path);
  const reject = /^\/api\/v2\/admin\/purchase-requests\/([^/]+)\/reject$/.exec(path);
  if (!approve && !reject) return json({ error: "Not found." }, 404);
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const writePermission = await requireAdminPermission(request, env, "purchase_requests.review");
  if (!writePermission.ok) return writePermission.response;
  let requestId;
  try { requestId = decodeURIComponent((approve || reject)[1]); } catch { return json({ error: "Invalid request ID." }, 400); }
  if (!requestId.startsWith("PR-") || requestId.length > 100) return json({ error: "Invalid request ID." }, 400);
  let body = {};
  try { body = await request.json(); } catch { /* optional JSON */ }
  const row = await env.DB.prepare("SELECT * FROM nv_purchase_requests WHERE request_id=?1 LIMIT 1").bind(requestId).first();
  if (!row) return json({ error: "Purchase request not found." }, 404);
  if (row.status !== "PENDING") return json({ error: "This request has already been reviewed." }, 409);
  const note = clean(body?.note, 500);
  if (reject) {
    const rejected = await env.DB.prepare(`UPDATE nv_purchase_requests SET status='REJECTED',admin_note=?2,reviewed_at=CURRENT_TIMESTAMP,
      reviewed_by=?3 WHERE request_id=?1 AND status='PENDING'`)
      .bind(requestId, note || "Rejected by administrator", writePermission.user.user_id).run();
    if (Number(rejected?.meta?.changes || 0) !== 1) return json({ error: "This request is already being reviewed." }, 409);
    await audit(env.DB, writePermission.user, "purchase_request.reject", requestId, "SUCCESS");
    return json({ ok: true, request_id: requestId, status: "REJECTED" });
  }
  // Explicit human attestation is mandatory; this endpoint does not claim to verify UTR/provider payment itself.
  const verifiedReference = clean(body?.verified_payment_reference || row.payment_reference, 100);
  const verifiedAmount = Number(body?.verified_amount ?? row.amount_claimed);
  if (!verifiedReference || verifiedReference.length < 4 || !Number.isFinite(verifiedAmount) ||
      Math.abs(verifiedAmount - Number(row.expected_amount)) > 0.009) {
    return json({ error: "Approval requires a verified payment reference and an amount matching the recorded price." }, 400);
  }
  const product = await currentPrice(env.DB, row.product_id);
  if (!product) return json({ error: "The product is no longer active. Review the request before taking action." }, 409);
  if (Math.abs(Number(row.expected_amount) - Number(product.price)) > 0.009) {
    return json({ error: "The product price changed after the request. Reconcile the amount manually before approval." }, 409);
  }
  // Claim the request atomically before creating an order, preventing two admins
  // from issuing duplicate entitlements for the same request.
  const claim = await env.DB.prepare(`UPDATE nv_purchase_requests SET status='APPROVING', reviewed_by=?2, reviewed_at=CURRENT_TIMESTAMP
    WHERE request_id=?1 AND status='PENDING'`).bind(requestId, writePermission.user.user_id).run();
  if (Number(claim?.meta?.changes || 0) !== 1) return json({ error: "This request is already being reviewed." }, 409);
  const orderId = `MAN-${crypto.randomUUID()}`;
  const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO orders (order_id,product_id,customer_name,customer_phone,customer_email,
        regular_price,current_price,discount_price,final_price,coupon_code,payment_status,paid_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,NULL,'PAID',CURRENT_TIMESTAMP)`)
        .bind(orderId, row.product_id, row.customer_name, row.customer_phone, row.customer_email,
          Number(product.mrp), Number(product.price), Number(product.mrp) - Number(product.price), Number(product.price)),
      env.DB.prepare(`INSERT INTO downloads (order_id,token,expires_at,download_count) VALUES (?1,?2,?3,0)`)
        .bind(orderId, token, expiresAt),
      env.DB.prepare(`UPDATE nv_purchase_requests SET status='APPROVED',admin_note=?2,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=?3,
        order_id=?4,verified_payment_reference=?5,verified_amount=?6
        WHERE request_id=?1 AND status='APPROVING'`)
        .bind(requestId, note || "Payment reference and amount manually verified", writePermission.user.user_id,
          orderId, verifiedReference, verifiedAmount),
    ]);
  } catch {
    await env.DB.prepare(`UPDATE nv_purchase_requests SET status='PENDING',reviewed_by=NULL,reviewed_at=NULL WHERE request_id=?1 AND status='APPROVING'`)
      .bind(requestId).run().catch(() => {});
    return json({ error: "Approval could not be completed. No success is reported; inspect staging database constraints." }, 503);
  }
  await audit(env.DB, writePermission.user, "purchase_request.approve", requestId, "SUCCESS", { order_id: orderId, amount: verifiedAmount });
  const notificationStatus = await sendManualApprovalEmail(env, row, orderId, token);
  return json({ ok: true, request_id: requestId, status: "APPROVED", order_id: orderId,
    notification_status: notificationStatus, download_expires_at: expiresAt,
    message: notificationStatus === "ACCEPTED"
      ? "Order entitlement created and email accepted by Brevo. Provider acceptance is not proof of inbox delivery."
      : "Order entitlement created, but email was not accepted. Contact the customer using the registered details and provide the Order ID." }, 200);
}

export async function handlePurchaseRequests(request, env, url) {
  if (!env.DB) return json({ error: "Database binding is unavailable." }, 503);
  if (url.pathname === "/api/v2/purchase-requests") return submitRequest(request, env);
  if (url.pathname.startsWith("/api/v2/admin/purchase-requests")) return adminRequests(request, env, url, url.pathname);
  return json({ error: "Not found." }, 404);
}
