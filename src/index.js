import { handleAdminAuth, requireAdminPermission } from "./admin-auth.js";
import { handleProductManager } from "./product-manager.js";
import { handleProductFileUpload } from "./product-file-upload.js";
import { handleCouponManager } from "./coupon-manager.js";
import { handleAdminOrderCustomer } from "./order-customer-manager.js";
import { handleAdminReports } from "./admin-reports.js";
import { handleAdminOperations } from "./admin-operations.js";
import { handlePurchaseRequests } from "./purchase-requests.js";
import { handlePasswordReset } from "./password-reset.js";
import { handleAdminMaintenance, checkMaintenanceGate } from "./admin-maintenance.js";
import { handleCoverUpload, handlePublicCover } from "./cover-file-upload.js";
import { handleAdminCheckoutEvents } from "./admin-checkout-events.js";

const CHECKOUT_EVENT_ID = () => crypto.randomUUID();
function checkoutAttemptId(request) {
  const supplied = String(request.headers.get("x-checkout-attempt-id") || "").trim();
  return /^[A-Za-z0-9_-]{12,100}$/.test(supplied) ? supplied : crypto.randomUUID();
}
async function logCheckoutEvent(env, event = {}) {
  try {
    if (!env.DB) return;
    const email = String(event.email || "").trim().toLowerCase();
    let emailHash = null;
    if (email) {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
      emailHash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
    }
    await env.DB.prepare(`INSERT INTO nv_checkout_events
      (event_id,attempt_id,order_id,product_id,customer_email_hash,event_type,outcome,error_code,http_status,metadata_json)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`)
      .bind(CHECKOUT_EVENT_ID(), event.attemptId || null, event.orderId || null, event.productId || null,
        emailHash, String(event.type || "UNKNOWN").slice(0, 80), String(event.outcome || "RECORDED").slice(0, 40),
        event.errorCode ? String(event.errorCode).slice(0, 100) : null,
        Number.isInteger(event.httpStatus) ? event.httpStatus : null,
        JSON.stringify(event.metadata || {}).slice(0, 1200)).run();
  } catch { /* Telemetry must never break checkout/payment/delivery. */ }
}

/* ============================================================
   ANJAAN MUSAFIR BOOKS — CLOUDFLARE WORKER

   SECTION INDEX
   ------------------------------------------------------------
   SECTION 01 — Basic Configuration & CORS
   SECTION 02 — Response & Utility Helpers
   SECTION 03 — Security & Validation Helpers
   SECTION 04 — Cashfree API Connection
   SECTION 05 — Payment Verification / Webhook Security
   SECTION 06 — Download Token System
   SECTION 07 — Paid Order + Email Delivery
   SECTION 08 — My Order / Re-download
   SECTION 09 — Price, Offer & Coupon Calculation
   SECTION 10 — PDF / Book File Delivery
   SECTION 11 — Create Order & Customer Details
   SECTION 12 — 100% OFF / ₹0 Free Order Logic
   SECTION 13 — Payment Status
   SECTION 14 — Cashfree Webhook
   SECTION 15 — Product & Catalog
   SECTION 16 — Admin / Coupon Management
   SECTION 17 — Main Router / API Routes

   IMPORTANT
   ------------------------------------------------------------
   • Existing payment, webhook and download logic is preserved.
   • Phone validation and D1 phone saving are preserved.
   • Coupon codes are NOT hard-coded in this Worker.
   • Coupons are controlled through the D1 coupons table.
   • 99% coupon → normal Cashfree payment.
   • 100% coupon → ₹0 order → Cashfree bypass → direct PAID.
   • Existing markOrderPaidAndToken() is reused for free orders.
   ============================================================ */


/* ============================================================
   SECTION 01 — BASIC CONFIGURATION & CORS
   ------------------------------------------------------------
   इस section में Worker की basic response/CORS settings हैं।
   Website को Worker API से बात करने की अनुमति यहीं मिलती है।
   ============================================================ */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Bootstrap-Secret, x-admin-key, X-Checkout-Attempt-ID",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};


/* ============================================================
   SECTION 02 — RESPONSE & UTILITY HELPERS
   ------------------------------------------------------------
   JSON/text response, email cleanup, order ID और encoding जैसे
   छोटे helper functions यहाँ हैं।
   ============================================================ */

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, ...extra },
  });
}

function text(data, status = 200, extra = {}) {
  return new Response(data, {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
      ...extra
    },
  });
}

function cleanEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


/* ============================================================
   SECTION 03 — SECURITY & VALIDATION HELPERS
   ------------------------------------------------------------
   Email/mobile validation और आगे आने वाले security helpers का
   आधार यहाँ है।
   ============================================================ */

function validPhone(phone) {
  return /^[6-9]\d{9}$/.test(String(phone || ""));
}


/* ============================================================
   SECTION 04 — CASHFREE API CONNECTION
   ------------------------------------------------------------
   Production/Sandbox Cashfree URL, headers और API request helper।
   ============================================================ */

function cashfreeBase(env) {
  return env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
}

function cashfreeHeaders(env) {
  return {
    "x-client-id": env.CASHFREE_CLIENT_ID,
    "x-client-secret": env.CASHFREE_CLIENT_SECRET,
    "x-api-version": "2025-01-01",
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

async function cfFetch(env, path, options = {}) {
  const res = await fetch(`${cashfreeBase(env)}${path}`, {
    ...options,
    headers: {
      ...cashfreeHeaders(env),
      ...(options.headers || {}),
    },
  });

  const body = await res.text();

  let data;

  try {
    data = JSON.parse(body);
  } catch {
    data = { raw: body };
  }

  return { res, data };
}

async function makeOrderId(env) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type) => parts.find(p => p.type === type)?.value || "";
  const day = get("day");
  const month = get("month").toUpperCase();
  const year = get("year");
  const hour = get("hour") === "24" ? "00" : get("hour");
  const minute = get("minute");
  const dateKey = `${day}${month}${year}`;
  const prefix = `${dateKey}-`;

  const dailyRow = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM orders WHERE order_id LIKE ?1"
  ).bind(`${prefix}%`).first();

  const lifetimeRow = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM orders"
  ).first();

  const dailyNumber = Number(dailyRow?.count || 0) + 1;
  const lifetimeNumber = Number(lifetimeRow?.count || 0) + 1;

  return `${dateKey}-${hour}${minute}-${String(dailyNumber).padStart(4, "0")}-${String(lifetimeNumber).padStart(5, "0")}`;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;

  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }

  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function hmacSha256Base64(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );

  return bytesToBase64(new Uint8Array(sig));
}

function constantTimeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}


/* ============================================================
   SECTION 05 — PAYMENT VERIFICATION / WEBHOOK SECURITY
   ------------------------------------------------------------
   Cashfree webhook की signature verify की जाती है और payment
   status को Cashfree से सुरक्षित तरीके से check किया जाता है।
   ============================================================ */

async function verifyCashfreeWebhook(request, env, rawBody) {
  const timestamp =
    request.headers.get("x-webhook-timestamp") || "";

  const signature =
    request.headers.get("x-webhook-signature") || "";

  if (
    !timestamp ||
    !signature ||
    !env.CASHFREE_CLIENT_SECRET
  ) {
    return false;
  }

  const expected = await hmacSha256Base64(
    env.CASHFREE_CLIENT_SECRET,
    timestamp + rawBody
  );

  return constantTimeEqual(expected, signature);
}

async function getOrderPaymentStatus(env, orderId) {
  const { res, data } = await cfFetch(
    env,
    `/orders/${encodeURIComponent(orderId)}/payments`,
    { method: "GET" }
  );

  if (!res.ok) {
    throw new Error(`Cashfree payment lookup failed (${res.status})`);
  }

  const payments = Array.isArray(data) ? data : [];
  const successfulPayments = payments.filter(p => p?.payment_status === "SUCCESS");

  if (successfulPayments.length) {
    // A successful gateway status alone is not enough: the amount must match
    // the server-calculated order amount before any paid status/token is issued.
    const order = await env.DB.prepare(
      "SELECT final_price FROM orders WHERE order_id = ?1 LIMIT 1"
    ).bind(orderId).first();
    const expectedAmount = Number(order?.final_price);
    if (!order || !Number.isFinite(expectedAmount) || expectedAmount < 0 ||
        Math.round(expectedAmount * 100) !== expectedAmount * 100) {
      return "AMOUNT_MISMATCH";
    }

    const exactAmountPayment = successfulPayments.some(payment => {
      const actualAmount = Number(payment?.payment_amount);
      const currency = payment?.payment_currency;
      return Number.isFinite(actualAmount) && actualAmount >= 0 &&
        Math.abs(Math.round(actualAmount * 100) - Math.round(expectedAmount * 100)) <= 0 &&
        (!currency || String(currency).toUpperCase() === "INR");
    });
    if (!exactAmountPayment) return "AMOUNT_MISMATCH";
    return "SUCCESS";
  }

  if (payments.some(p => p?.payment_status === "PENDING")) return "PENDING";
  // An empty payment list is not proof of failure; keep the coupon reservation
  // and order pending until Cashfree reports a definitive payment outcome.
  if (payments.length === 0) return "PENDING";
  const definitiveFailures = new Set(["FAILED", "USER_DROPPED", "CANCELLED", "EXPIRED"]);
  if (payments.every(p => definitiveFailures.has(String(p?.payment_status || "").toUpperCase()))) return "FAILED";
  return "PENDING";
}


/* ============================================================
   SECTION 06 — DOWNLOAD TOKEN SYSTEM
   ------------------------------------------------------------
   Successful order के लिए temporary download token बनता है।
   Existing token valid हो तो वही reuse होता है।
   ============================================================ */

async function issueDownloadToken(env, orderId) {
  const existing = await env.DB.prepare(
    "SELECT token, expires_at FROM downloads WHERE order_id = ?1 ORDER BY id DESC LIMIT 1"
  ).bind(orderId).first();

  if (
    existing &&
    new Date(existing.expires_at).getTime() > Date.now()
  ) {
    return existing.token;
  }

  const token =
    `${crypto.randomUUID()}-${crypto.randomUUID()}`;

  const expiresAt =
    new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

  await env.DB.prepare(
    "INSERT INTO downloads (order_id, token, expires_at, download_count) VALUES (?1, ?2, ?3, 0)"
  ).bind(
    orderId,
    token,
    expiresAt
  ).run();

  return token;
}


/* ============================================================
   SECTION 07 — PAID ORDER + EMAIL DELIVERY
   ------------------------------------------------------------
   Order को PAID करना, coupon usage बढ़ाना, download token बनाना
   और Brevo से delivery email भेजना इसी flow में जुड़ा है।
   ============================================================ */

// Coupon usage limits are reserved atomically before creating a discounted order.
// This prevents concurrent checkouts from overselling the last available coupon use.
async function reserveCouponForOrder(env, orderId, couponCode) {
  if (!couponCode) return { ok: true, reserved: false };
  const code = String(couponCode).trim().toUpperCase();
  const update = await env.DB.prepare(
    `UPDATE coupons SET reserved_count = reserved_count + 1
     WHERE code = ?1 AND active = 1
       AND (max_uses IS NULL OR used_count + reserved_count < max_uses)`
  ).bind(code).run();
  if (Number(update?.meta?.changes || 0) !== 1) {
    return { ok: false, reserved: false };
  }
  try {
    await env.DB.prepare(
      `INSERT INTO coupon_reservations (order_id, coupon_code, status)
       VALUES (?1, ?2, 'RESERVED')`
    ).bind(orderId, code).run();
    return { ok: true, reserved: true };
  } catch (error) {
    // Compensate if reservation row creation fails after the capacity increment.
    await env.DB.prepare(
      `UPDATE coupons SET reserved_count = MAX(0, reserved_count - 1) WHERE code = ?1`
    ).bind(code).run();
    throw error;
  }
}

async function releaseCouponReservation(env, orderId) {
  const reservation = await env.DB.prepare(
    `SELECT coupon_code FROM coupon_reservations WHERE order_id = ?1 AND status = 'RESERVED' LIMIT 1`
  ).bind(orderId).first();
  if (!reservation) return false;

  // Do not mark a reservation RELEASED if its coupon row is missing: doing so
  // would hide an integrity fault and make the reserved counter impossible to reconcile.
  const coupon = await env.DB.prepare(
    `SELECT code FROM coupons WHERE code = ?1 LIMIT 1`
  ).bind(reservation.coupon_code).first();
  if (!coupon) throw new Error(`Coupon reservation references missing coupon during release: ${reservation.coupon_code}`);

  // D1 batch executes these statements atomically. Verify both guarded writes so
  // a concurrent resolver or unexpected data state is not reported as success.
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE coupons SET reserved_count = reserved_count - 1
      WHERE code = ?1 AND reserved_count > 0
        AND EXISTS (SELECT 1 FROM coupon_reservations WHERE order_id = ?2 AND status = 'RESERVED')`)
      .bind(reservation.coupon_code, orderId),
    env.DB.prepare(`UPDATE coupon_reservations SET status = 'RELEASED', updated_at = CURRENT_TIMESTAMP
      WHERE order_id = ?1 AND status = 'RESERVED'
        AND EXISTS (SELECT 1 FROM coupons WHERE code = ?2)`)
      .bind(orderId, reservation.coupon_code)
  ]);
  const couponChanges = Number(results?.[0]?.meta?.changes || 0);
  const reservationChanges = Number(results?.[1]?.meta?.changes || 0);
  if (couponChanges === 1 && reservationChanges === 1) return true;

  const current = await env.DB.prepare(
    `SELECT status FROM coupon_reservations WHERE order_id = ?1 LIMIT 1`
  ).bind(orderId).first();
  if (String(current?.status || '').toUpperCase() === 'RELEASED') return false;
  throw new Error(`Coupon reservation release was not applied consistently for order ${orderId}`);
}

async function consumeCouponReservation(env, orderId) {
  const reservation = await env.DB.prepare(
    `SELECT coupon_code FROM coupon_reservations WHERE order_id = ?1 AND status = 'RESERVED' LIMIT 1`
  ).bind(orderId).first();
  if (!reservation) return false;

  // A reservation without its coupon row is an integrity fault, not a successful
  // redemption. Keep it RESERVED so an operator can repair the data and reconcile.
  const coupon = await env.DB.prepare(
    `SELECT code FROM coupons WHERE code = ?1 LIMIT 1`
  ).bind(reservation.coupon_code).first();
  if (!coupon) throw new Error(`Coupon reservation references missing coupon: ${reservation.coupon_code}`);

  // The coupon update and state transition are one D1 batch. Both updates are
  // guarded so concurrent webhook/return-page calls cannot count a use twice.
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE coupons SET used_count = used_count + 1,
      reserved_count = reserved_count - 1
      WHERE code = ?1 AND reserved_count > 0
        AND EXISTS (SELECT 1 FROM coupon_reservations WHERE order_id = ?2 AND status = 'RESERVED')`)
      .bind(reservation.coupon_code, orderId),
    env.DB.prepare(`UPDATE coupon_reservations SET status = 'REDEEMED', updated_at = CURRENT_TIMESTAMP
      WHERE order_id = ?1 AND status = 'RESERVED'
        AND EXISTS (SELECT 1 FROM coupons WHERE code = ?2)`)
      .bind(orderId, reservation.coupon_code)
  ]);
  const couponChanges = Number(results?.[0]?.meta?.changes || 0);
  const reservationChanges = Number(results?.[1]?.meta?.changes || 0);
  if (couponChanges === 1 && reservationChanges === 1) return true;
  // A competing request may have resolved the reservation first. Do not claim a
  // redemption if the coupon count and reservation state did not both change.
  const current = await env.DB.prepare(
    `SELECT status FROM coupon_reservations WHERE order_id = ?1 LIMIT 1`
  ).bind(orderId).first();
  if (String(current?.status || '').toUpperCase() === 'REDEEMED') return false;
  throw new Error(`Coupon reservation redemption was not applied consistently for order ${orderId}`);
}

async function markOrderPaidAndToken(env, orderId) {
  const order = await env.DB.prepare(
    "SELECT * FROM orders WHERE order_id = ?1 LIMIT 1"
  ).bind(orderId).first();

  if (!order) return null;

  let firstTime = false;

  if (order.payment_status !== "PAID") {
    // Atomic switch: only ONE request (webhook / return page) can win this update,
    // so coupon count and delivery email are never duplicated by a race.
    const upd = await env.DB.prepare(
      "UPDATE orders SET payment_status = 'PAID', paid_at = CURRENT_TIMESTAMP WHERE order_id = ?1 AND payment_status != 'PAID'"
    ).bind(orderId).run();

    firstTime = Number(upd?.meta?.changes || 0) > 0;

    if (firstTime) {
      try {
        const reserved = await consumeCouponReservation(env, orderId);
        if (!reserved) {
          const reservationRecord = await env.DB.prepare(
            "SELECT status FROM coupon_reservations WHERE order_id = ?1 LIMIT 1"
          ).bind(orderId).first();
          if (!reservationRecord) {
            // Compatibility path only for orders created before reservations existed.
            await env.DB.prepare(
              "UPDATE coupons SET used_count = used_count + 1 WHERE code = (SELECT coupon_code FROM order_discounts WHERE order_id = ?1)"
            ).bind(orderId).run();
          } else if (String(reservationRecord.status || '').toUpperCase() !== 'REDEEMED') {
            throw new Error(`Coupon reservation is not redeemable for paid order ${orderId}: ${reservationRecord.status}`);
          }
        }
      } catch (e) {
        console.error("Coupon redemption accounting failed:", e);
      }
    }
  }

  const token =
    await issueDownloadToken(env, orderId);

  if (firstTime) {
    await sendOrderEmail(
      env,
      order,
      token
    );
  }

  return token;
}


// ---------- Email (Brevo, मुफ़्त) ----------
// ---------- Email (Brevo Template) ----------

async function recordEmailEvent(env, event) {
  // Email logging is additive and must never turn a successful paid order into a failure.
  // If migration 007 has not been applied in this environment, delivery still proceeds.
  try {
    await env.DB.prepare(`INSERT INTO nv_email_events
      (order_id, recipient_email, event_type, provider, status, http_status, provider_message_id, error_code)
      VALUES (?1, ?2, ?3, 'BREVO', ?4, ?5, ?6, ?7)`)
      .bind(
        event.orderId || null,
        event.recipientEmail ? String(event.recipientEmail).trim().toLowerCase().slice(0, 254) : null,
        'ORDER_DELIVERY',
        event.status,
        Number.isInteger(event.httpStatus) ? event.httpStatus : null,
        event.messageId ? String(event.messageId).slice(0, 200) : null,
        event.errorCode ? String(event.errorCode).replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 100) : null
      ).run();
  } catch (error) {
    // Do not log the recipient, request payload, credentials, or raw provider response.
    console.warn('Email activity ledger unavailable; delivery flow continues.');
  }
}

async function sendOrderEmail(env, order, token) {
  if (!env.BREVO_API_KEY) {
    await recordEmailEvent(env, { orderId: order.order_id, recipientEmail: order.customer_email, status: 'SKIPPED_CONFIGURATION', errorCode: 'BREVO_API_KEY_MISSING' });
    return;
  }

  try {
    const p = await env.DB.prepare(
      "SELECT name FROM products WHERE product_id = ?1"
    ).bind(order.product_id).first();

    const downloadUrl =
      `${env.WORKER_PUBLIC_URL.replace(/\/$/, "")}/download?token=${encodeURIComponent(token)}`;

    const safe = (value) =>
      String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[c]);

    const senderEmail = env.BREVO_SENDER || "officialsuperswagg@gmail.com";
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        sender: { name: "Anjaan Musafir Books", email: senderEmail },
        to: [{ email: order.customer_email, name: order.customer_name || undefined }],
        subject: "Your Anjaan Musafir Books eBook is ready",
        htmlContent:
          `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#101a26;max-width:600px;margin:auto">` +
          `<h2 style="color:#0b1426">Congratulations, ${safe(order.customer_name || "")}!</h2>` +
          `<p>Your eBook <strong>${safe(p ? p.name : "")}</strong> is ready.</p>` +
          `<p><strong>Order ID:</strong> ${safe(order.order_id)}</p>` +
          `<p><strong>Amount Paid:</strong> ₹${Number(order.final_price || 0).toFixed(2)}</p>` +
          `<p><a href="${safe(downloadUrl)}" style="display:inline-block;background:#c9a45c;color:#0b1426;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Download eBook</a></p>` +
          `<p style="color:#5b6572;font-size:13px">Download link सीमित समय और download attempts के लिए है।</p>` +
          `</div>`
      })
    });

    if (!response.ok) {
      // Do not store the raw provider body: it can contain customer data.
      await recordEmailEvent(env, { orderId: order.order_id, recipientEmail: order.customer_email, status: 'FAILED', httpStatus: response.status, errorCode: `BREVO_HTTP_${response.status}` });
      console.error("Brevo email failed with HTTP status:", response.status);
      return;
    }

    let result = {};
    try { result = await response.json(); } catch { /* provider may return an empty body */ }
    await recordEmailEvent(env, { orderId: order.order_id, recipientEmail: order.customer_email, status: 'ACCEPTED', httpStatus: response.status, messageId: result.messageId || result.message_id || null });
  } catch (error) {
    await recordEmailEvent(env, { orderId: order.order_id, recipientEmail: order.customer_email, status: 'FAILED', errorCode: 'BREVO_REQUEST_ERROR' });
    console.error("Brevo email request failed; order delivery remains available through the website.");
  }
}


/* ============================================================
   SECTION 08 — MY ORDER / RE-DOWNLOAD
   ------------------------------------------------------------
   Customer Order ID + email से दोबारा valid download link ले सकता है।
   ============================================================ */

// ---------- Mera Order: Order ID + email मिलाकर नया download link ----------

async function handleMyOrder(request, env) {
  let b;

  try {
    b = await request.json();
  } catch {
    return json(
      { error: "Invalid JSON." },
      400
    );
  }

  const orderId =
    String(b.order_id || "").trim();

  const email =
    String(b.email || "")
      .trim()
      .toLowerCase();

  if (!orderId || !email) {
    return json(
      {
        error:
          "Order ID और email दोनों भरें।"
      },
      400
    );
  }

  const o = await env.DB.prepare(
    "SELECT * FROM orders WHERE order_id = ?1 LIMIT 1"
  ).bind(orderId).first();

  if (
    !o ||
    String(o.customer_email).toLowerCase() !== email ||
    o.payment_status !== "PAID"
  ) {
    return json(
      {
        error:
          "ऐसा कोई पूरा हुआ order नहीं मिला। Order ID और email दोबारा जाँचें।"
      },
      404
    );
  }

  const token =
    await issueDownloadToken(
      env,
      orderId
    );

  const latestDownload = await env.DB.prepare(
    "SELECT download_count, expires_at FROM downloads WHERE order_id = ?1 ORDER BY id DESC LIMIT 1"
  ).bind(orderId).first();

  const maxDownloads = Number(env.MAX_DOWNLOADS || 3);
  const usedDownloads = Number(latestDownload?.download_count || 0);
  const remainingDownloads = Math.max(0, maxDownloads - usedDownloads);

  const myProduct = await env.DB.prepare(
    "SELECT name FROM products WHERE product_id = ?1 LIMIT 1"
  ).bind(o.product_id).first();

  return json({
    ok: true,
    order_id: orderId,
    product_id: o.product_id,
    product_name: myProduct?.name || "",
    regular_price: Number(o.regular_price || 0),
    current_price: Number(o.current_price || 0),
    discount_price: Number(o.discount_price || 0),
    final_price: Number(o.final_price || 0),
    coupon_code: o.coupon_code || null,
    download_url:
      `${env.WORKER_PUBLIC_URL.replace(/\/$/, "")}/download?token=${encodeURIComponent(token)}`,
    downloads_used: usedDownloads,
    downloads_remaining: remainingDownloads,
    max_downloads: maxDownloads,
    expires_at: latestDownload?.expires_at || null
  });
}


/* ============================================================
   SECTION 09 — PRICE, OFFER & COUPON CALCULATION
   ------------------------------------------------------------
   Product price, active offer और D1 coupon का final server-side
   हिसाब यहीं होता है। Customer अपनी price खुद तय नहीं कर सकता।
   ============================================================ */

/* ======================================================
   भाव (price) तय करने वाला हिस्सा — offer + coupon
   सारा हिसाब SERVER पर होता है, customer कीमत बदल नहीं सकता।
   ====================================================== */

function r2(n) {
  return Math.round(n * 100) / 100;
}

function isLive(row, endKey) {
  if (!row || ![1, true, "1"].includes(row.active)) return false;

  const now = Date.now();
  // Invalid schedule values must never silently activate an offer/coupon.
  for (const key of ["starts_at", endKey]) {
    if (row[key] !== null && row[key] !== undefined && row[key] !== "") {
      const timestamp = Date.parse(row[key]);
      if (!Number.isFinite(timestamp)) return false;
      if (key === "starts_at" && timestamp > now) return false;
      if (key === endKey && timestamp <= now) return false;
    }
  }
  if (row.starts_at && row[endKey] && Date.parse(row.starts_at) >= Date.parse(row[endKey])) return false;
  return true;
}

async function getOffer(env, productId) {
  try {
    const o = await env.DB.prepare(
      "SELECT * FROM offers WHERE product_id = ?1 LIMIT 1"
    ).bind(productId).first();

    if (!o || ![1, true, "1"].includes(o.active)) return null;

    // A valid future/expired schedule means the offer is simply not live.
    // A malformed active schedule is different: silently falling back to the
    // base price can make the customer-facing offer disagree with checkout.
    const starts = o.starts_at == null || o.starts_at === "" ? null : Date.parse(o.starts_at);
    const ends = o.ends_at == null || o.ends_at === "" ? null : Date.parse(o.ends_at);
    const malformed =
      (o.starts_at != null && o.starts_at !== "" && !Number.isFinite(starts)) ||
      (o.ends_at != null && o.ends_at !== "" && !Number.isFinite(ends)) ||
      (starts !== null && ends !== null && starts >= ends);
    if (malformed) return { ...o, __invalid_schedule: true };

    return isLive(o, "ends_at") ? o : null;
  } catch {
    // Database/schema errors must not be confused with a valid no-offer state.
    return { __lookup_error: true };
  }
}

export async function priceFor(
  env,
  product,
  couponCode
) {
  // The current D1 schema uses `price` as the normal product price,
  // while the optional fields below make the code tolerant of an existing
  // product row that also carries an explicit MRP/current price.
  let base =
        product.offer_price != null
          ? Number(product.offer_price)
          : product.current_price != null
            ? Number(product.current_price)
            : Number(product.price),
      mrp =
        product.mrp != null
          ? Number(product.mrp)
          : product.base_price != null
            ? Number(product.base_price)
            : Number(product.price),
      label = null;

  const offer =
    await getOffer(
      env,
      product.product_id
    );

  if (offer?.__lookup_error || offer?.__invalid_schedule) {
    return { base, mrp, label: null, discount: 0, final: null, coupon: null,
      couponError: "इस किताब के offer की setting सही नहीं है। कृपया सहायता से संपर्क करें।", pricingError: true };
  }

  if (offer) {
    const offerSale = offer.sale_price == null ? base : Number(offer.sale_price);
    const offerMrp = offer.mrp == null ? mrp : Number(offer.mrp);
    // An active but corrupt legacy offer must not silently change checkout pricing.
    if (!Number.isFinite(offerSale) || !Number.isFinite(offerMrp) ||
        offerSale <= 0 || offerMrp <= 0 ||
        Math.round(offerSale * 100) !== offerSale * 100 ||
        Math.round(offerMrp * 100) !== offerMrp * 100 || offerSale > offerMrp) {
      return { base, mrp, label: null, discount: 0, final: null, coupon: null,
        couponError: "इस किताब के offer की कीमत सही नहीं है। कृपया कुछ देर बाद दोबारा प्रयास करें।", pricingError: true };
    }
    base = offerSale;
    mrp = offerMrp;
    label = offer.label || null;
  }

  // Reject corrupt legacy product prices before any payment amount is created.
  if (!Number.isFinite(base) || !Number.isFinite(mrp) || base <= 0 || mrp <= 0 ||
      Math.round(base * 100) !== base * 100 || Math.round(mrp * 100) !== mrp * 100) {
    return { base, mrp, label, discount: 0, final: null, coupon: null,
      couponError: "इस किताब की कीमत सही नहीं है। कृपया सहायता से संपर्क करें।", pricingError: true };
  }

  let discount = 0,
      coupon = null,
      couponError = null;

  const code =
    String(couponCode || "")
      .trim()
      .toUpperCase();

  if (code) {
    let c = null;

    try {
      c = await env.DB.prepare(
        "SELECT * FROM coupons WHERE code = ?1 LIMIT 1"
      ).bind(code).first();
    } catch {}

    if (
      !c ||
      !isLive(c, "expires_at")
    ) {
      couponError =
        "यह coupon सही या चालू नहीं है।";
    }

    else if (
      c.max_uses != null &&
      Number(c.used_count) >=
      Number(c.max_uses)
    ) {
      couponError =
        "इस coupon की सीमा पूरी हो चुकी है।";
    }

    else if (
      c.product_ids &&
      c.product_ids !== "*" &&
      !(function () {
        // Legacy rows may contain either the canonical CSV string or a JSON array.
        let ids;
        try {
          const parsed = JSON.parse(c.product_ids);
          ids = Array.isArray(parsed) ? parsed.map(String) : String(c.product_ids).split(",");
        } catch {
          ids = String(c.product_ids).split(",");
        }
        return ids.map(s => s.trim()).includes(String(product.product_id));
      })()
    ) {
      couponError =
        "यह coupon इस किताब पर नहीं चलता।";
    }

    else if (
      c.min_amount != null &&
      base < Number(c.min_amount)
    ) {
      couponError =
        "यह coupon इस कीमत पर नहीं चलता।";
    }

    else {
      const normalizedType = String(c.discount_type || "").trim().toUpperCase();
      const discountValue = Number(c.discount_value);
      if (!Number.isFinite(discountValue) || discountValue <= 0 ||
          Math.round(discountValue * 100) !== discountValue * 100 ||
          !["PERCENT", "PERCENTAGE", "FLAT"].includes(normalizedType) ||
          ((normalizedType === "PERCENT" || normalizedType === "PERCENTAGE") && discountValue > 100)) {
        couponError = "इस coupon की discount setting सही नहीं है।";
      } else {
        // Historical records may store PERCENTAGE while new manager writes PERCENT.
        discount = (normalizedType === "PERCENT" || normalizedType === "PERCENTAGE")
          ? r2(base * discountValue / 100)
          : discountValue;
        coupon = c.code;
      }
    }
  }

  // 100% coupon पर price ₹0 रहेगा।
  // ₹0 से अधिक और ₹1 से कम price को ₹1 करें।
  let final = Math.max(
    0,
    r2(base - discount)
  );

  if (final > 0 && final < 1) {
    final = 1;
  }

  return {
    base,
    mrp,
    label,
    discount:
      r2(base - final),
    final,
    coupon,
    couponError
  };
}


function isAdmin(request, env) {
  const k =
    request.headers.get(
      "x-admin-key"
    ) || "";

  return Boolean(env.ADMIN_KEY) &&
    k.length > 0 &&
    constantTimeEqual(
      k,
      env.ADMIN_KEY
    );
}
/* ============================================================
   SECTION 10 — PDF / BOOK FILE DELIVERY
   ------------------------------------------------------------
   Book file पहले R2 से और जरूरत पड़ने पर Static Assets से खोजी जाती है।
   ============================================================ */

// PDF लाना: पहले R2, वरना Static Assets

async function fetchBookFile(
  env,
  request,
  key
) {
  const clean =
    String(key || "")
      .replace(/^\/+/, "")
      .replace(/^public\//, "");

  // New Version staging uses BOOKS_BUCKET for private PDF uploads.
  // Keep BOOKS as a backward-compatible binding for the Current Version.
  const privateBooksBucket = env.BOOKS_BUCKET || env.BOOKS;
  if (privateBooksBucket && typeof privateBooksBucket.get === "function") {
    const o = await privateBooksBucket.get(key);
    if (o) {
      return { body: o.body };
    }
  }

  if (env.ASSETS) {
    for (
      const path of [
        clean,
        "books/" + clean
      ]
    ) {
      const r =
        await env.ASSETS.fetch(
          new Request(
            new URL(
              "/" + path,
              request.url
            )
          )
        );

      if (r.ok) {
        return {
          body: r.body
        };
      }
    }
  }

  return null;
}


/* ============================================================
   SECTION 11 — CREATE ORDER & CUSTOMER DETAILS
   ------------------------------------------------------------
   Customer details validate होती हैं, product/coupon price निकलती है
   और normal paid order के लिए Cashfree session बनाया जाता है।
   ============================================================ */

async function handleValidateCoupon(request, env) {
  const attemptId = checkoutAttemptId(request);
  let body;

  try {
    body = await request.json();
  } catch {
    await logCheckoutEvent(env, { attemptId, type: "COUPON_VERIFICATION", outcome: "FAILED", errorCode: "INVALID_JSON" });
    return json({ error: "Invalid JSON." }, 400);
  }

  const productId = String(body.product_id || "").trim();
  const code = String(body.coupon || "").trim().toUpperCase();

  if (!productId || !code) {
    await logCheckoutEvent(env, { attemptId, productId, type: "COUPON_VERIFICATION", outcome: "FAILED", errorCode: "MISSING_PRODUCT_OR_CODE" });
    return json({ error: "Product और coupon code दोनों जरूरी हैं।" }, 400);
  }

  const product = await env.DB.prepare(
    "SELECT * FROM products WHERE product_id = ?1 AND active = 1 LIMIT 1"
  ).bind(productId).first();

  if (!product) {
    await logCheckoutEvent(env, { attemptId, productId, type: "COUPON_VERIFICATION", outcome: "FAILED", errorCode: "PRODUCT_INACTIVE" });
    return json({ error: "Product not found or inactive." }, 404);
  }

  const pr = await priceFor(env, product, code);

  if (pr.couponError || !pr.coupon) {
    await logCheckoutEvent(env, { attemptId, productId, type: "COUPON_VERIFICATION", outcome: "FAILED", errorCode: "COUPON_REJECTED" });
    return json({
      valid: false,
      error: pr.couponError || "यह coupon सही या चालू नहीं है।"
    }, 400);
  }
  await logCheckoutEvent(env, { attemptId, productId, type: "COUPON_VERIFICATION", outcome: "SUCCESS", metadata: { free: pr.final === 0 } });

  return json({
    valid: true,
    product_id: productId,
    product_name: product.name,
    coupon_code: pr.coupon,
    regular_price: pr.mrp != null ? Number(pr.mrp) : Number(product.base_price ?? product.price),
    current_price: Number(pr.base),
    discount_price: Number(pr.discount),
    final_price: Number(pr.final),
    free: pr.final === 0
  });
}


async function handleCreateOrder(
  request,
  env
) {
  const attemptId = checkoutAttemptId(request);
  let body;

  try {
    body =
      await request.json();
  } catch {
    await logCheckoutEvent(env, { attemptId, type: "DETAILS_SUBMITTED", outcome: "FAILED", errorCode: "INVALID_JSON" });
    return json(
      {
        error:
          "Invalid JSON."
      },
      400
    );
  }

  const productId =
    String(
      body.product_id || ""
    ).trim();

  const email =
    cleanEmail(body.email);

  const phone =
    String(
      body.phone || ""
    ).replace(/\D/g, "");

  const name =
    String(
      body.name || ""
    )
      .trim()
      .slice(0, 100);

  await logCheckoutEvent(env, { attemptId, productId, email, type: "DETAILS_ENTERED", outcome: "RECEIVED", metadata: { name_present: !!name, phone_present: !!phone, coupon_present: !!body.coupon } });

  /*
    Name + Email + Mobile mandatory.
    Mobile exactly 10 digits का होना चाहिए और 6-9 से शुरू होना चाहिए।
  */

  if (
    !productId ||
    !name ||
    !validEmail(email) ||
    !phone
  ) {
    await logCheckoutEvent(env, { attemptId, productId, email, type: "CHECKOUT_VALIDATION", outcome: "FAILED", errorCode: "MISSING_OR_INVALID_DETAILS" });
    return json(
      {
        error:
          "Product, customer name, valid email and mobile number are required.",
      },
      400
    );
  }

  if (!validPhone(phone)) {
    await logCheckoutEvent(env, { attemptId, productId, email, type: "CHECKOUT_VALIDATION", outcome: "FAILED", errorCode: "INVALID_PHONE" });
    return json(
      {
        error:
          "Mobile number must be a valid 10-digit Indian phone number.",
      },
      400
    );
  }


  const product =
    await env.DB.prepare(
      "SELECT * FROM products WHERE product_id = ?1 AND active = 1 LIMIT 1"
    ).bind(productId).first();

  if (!product) {
    await logCheckoutEvent(env, { attemptId, productId, email, type: "PRODUCT_LOOKUP", outcome: "FAILED", errorCode: "PRODUCT_INACTIVE" });
    return json(
      {
        error:
          "Product not found or inactive."
      },
      404
    );
  }


  const pr =
    await priceFor(
      env,
      product,
      body.coupon
    );

  if (pr.couponError) {
    await logCheckoutEvent(env, { attemptId, productId, email, type: "COUPON_VERIFICATION", outcome: "FAILED", errorCode: "COUPON_REJECTED" });
    return json(
      {
        error:
          pr.couponError,

        coupon_error:
          pr.couponError
      },
      400
    );
  }


  /* ============================================================
     SECTION 12 — 100% OFF / ₹0 FREE ORDER LOGIC
     ------------------------------------------------------------
     केवल valid coupon की वजह से price ₹0 होने पर यह रास्ता चलेगा।
     इससे बिना coupon कोई accidental free order नहीं बनेगा।

     Flow:
     1. D1 में order CREATED save
     2. Coupon details save
     3. Existing PAID/token/email logic reuse
     4. Cashfree को call नहीं किया जाएगा
     ============================================================ */

  if (pr.final === 0 && pr.coupon) {
    const freeOrderId =
      await makeOrderId(env);
    const freeCouponReservation = await reserveCouponForOrder(env, freeOrderId, pr.coupon);
    if (!freeCouponReservation.ok) {
      return json({ error: "इस coupon की usage limit अभी पूरी हो गई है। कृपया दूसरा coupon चुनें।" }, 409);
    }

    try {
      await env.DB.prepare(
      `INSERT INTO orders
        (customer_name, customer_phone, customer_email, order_id, product_id, regular_price, current_price, discount_price, final_price, coupon_code, payment_status)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'CREATED')`
    ).bind(
      name,
      phone,
      email,
      freeOrderId,
      productId,
      pr.mrp != null ? Number(pr.mrp) : Number(product.base_price ?? product.price),
      Number(pr.base),
      Number(pr.discount),
      0,
      pr.coupon || null
      ).run();
    } catch (error) {
      await releaseCouponReservation(env, freeOrderId);
      throw error;
    }

    await logCheckoutEvent(env, { attemptId, orderId: freeOrderId, productId, email, type: "ORDER_CREATED", outcome: "CREATED", metadata: { free: true, amount: 0 } });
    try {
      await env.DB.prepare(
        "INSERT OR REPLACE INTO order_discounts (order_id, coupon_code, original_price, discount_amount) VALUES (?1, ?2, ?3, ?4)"
      ).bind(
        freeOrderId,
        pr.coupon,
        pr.base,
        pr.discount
      ).run();
    } catch (e) {
      console.error(e);
    }

    // Existing delivery system ही इस्तेमाल होगा।
    const token =
      await markOrderPaidAndToken(
        env,
        freeOrderId
      );

    await logCheckoutEvent(env, { attemptId, orderId: freeOrderId, productId, email, type: "ORDER_PAID", outcome: "SUCCESS", metadata: { free: true } });
    await logCheckoutEvent(env, { attemptId, orderId: freeOrderId, productId, email, type: "TOKEN_CREATED", outcome: "SUCCESS", metadata: { free: true } });
    await logCheckoutEvent(env, { attemptId, orderId: freeOrderId, productId, email, type: "FREE_ORDER_COMPLETED", outcome: "SUCCESS" });
    const freeDownload = await env.DB.prepare(
      "SELECT download_count, expires_at FROM downloads WHERE order_id = ?1 ORDER BY id DESC LIMIT 1"
    ).bind(freeOrderId).first();
    const freeMaxDownloads = Number(env.MAX_DOWNLOADS || 3);
    const freeUsedDownloads = Number(freeDownload?.download_count || 0);

    return json({
      order_id: freeOrderId,
      free: true,
      amount: 0,
      regular_price: pr.mrp != null ? Number(pr.mrp) : Number(product.base_price ?? product.price),
      current_price: Number(pr.base),
      discount_price: Number(pr.discount),
      final_price: 0,
      coupon_code: pr.coupon,
      product_name: product.name,
      download_url:
        `${env.WORKER_PUBLIC_URL.replace(/\/$/, "")}/download?token=${encodeURIComponent(token)}`,
      downloads_used: freeUsedDownloads,
      downloads_remaining: Math.max(0, freeMaxDownloads - freeUsedDownloads),
      max_downloads: freeMaxDownloads,
      expires_at: freeDownload?.expires_at || null
    });
  }


  const orderId =
    await makeOrderId(env);
  const couponReservation = await reserveCouponForOrder(env, orderId, pr.coupon);
  if (!couponReservation.ok) {
    return json({ error: "इस coupon की usage limit अभी पूरी हो गई है। कृपया दूसरा coupon चुनें।" }, 409);
  }

  const returnUrl =
    `${env.FRONTEND_URL.replace(/\/$/, "")}/?payment=return&order_id=${encodeURIComponent(orderId)}&attempt_id=${encodeURIComponent(attemptId)}`;

  const notifyUrl =
    `${env.WORKER_PUBLIC_URL.replace(/\/$/, "")}/webhook/cashfree`;


  /*
    Mobile number D1 में भी save होगा
    और Cashfree customer details में भी जाएगा।
  */
const cashfreeAmount =
  pr.final > 0 && pr.final < 1
    ? 1
    : pr.final;
  const cfPayload = {
    order_id:
      orderId,

    order_amount:
      cashfreeAmount,

    order_currency:
      "INR",

    customer_details: {
      customer_id:
        `cust_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`,

      customer_name:
        name,

      customer_email:
        email,

      customer_phone:
        phone,
    },

    order_meta: {
      return_url:
        returnUrl,

      notify_url:
        notifyUrl,
    },

    order_note:
      product.name,
  };


  await logCheckoutEvent(env, { attemptId, orderId, productId, email, type: "PAYMENT_SESSION_REQUESTED", outcome: "STARTED", metadata: { amount: cashfreeAmount } });
  const { res, data } =
    await cfFetch(
      env,
      "/orders",
      {
        method: "POST",

        headers: {
          "x-idempotency-key":
            crypto.randomUUID()
        },

        body:
          JSON.stringify(
            cfPayload
          ),
      }
    );


  if (!res.ok) {
    await releaseCouponReservation(env, orderId);
    await logCheckoutEvent(env, { attemptId, orderId, productId, email, type: "PAYMENT_SESSION_FAILED", outcome: "FAILED", errorCode: "CASHFREE_ORDER_CREATE_FAILED", httpStatus: res.status });
    console.error(
      "Cashfree order creation failed:",
      res.status,
      data
    );

    return json(
      {
        error:
          "Payment service is temporarily unavailable. Please try again.",
      },
      502
    );
  }


  try {
    await env.DB.prepare(
      `INSERT INTO orders
        (customer_name, customer_phone, customer_email, order_id, product_id, regular_price, current_price, discount_price, final_price, coupon_code, payment_status)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'CREATED')`
    ).bind(
      name,
      phone,
      email,
      orderId,
      productId,
      pr.mrp != null ? Number(pr.mrp) : Number(product.base_price ?? product.price),
      Number(pr.base),
      Number(pr.discount),
      Number(cashfreeAmount),
      pr.coupon || null
    ).run();
  } catch (error) {
    await releaseCouponReservation(env, orderId);
    throw error;
  }


  await logCheckoutEvent(env, { attemptId, orderId, productId, email, type: "ORDER_CREATED", outcome: "CREATED", metadata: { amount: cashfreeAmount, coupon_present: !!pr.coupon } });
  await logCheckoutEvent(env, { attemptId, orderId, productId, email, type: "PAYMENT_SESSION_CREATED", outcome: "SUCCESS", metadata: { amount: cashfreeAmount } });
  if (pr.coupon) {
    try {
      await env.DB.prepare(
        "INSERT OR REPLACE INTO order_discounts (order_id, coupon_code, original_price, discount_amount) VALUES (?1, ?2, ?3, ?4)"
      ).bind(
        orderId,
        pr.coupon,
        pr.base,
        pr.discount
      ).run();

    } catch (e) {
      console.error(e);
    }
  }


  return json({
    order_id: orderId,
    payment_session_id: data.payment_session_id,
    amount: cashfreeAmount,
    regular_price: pr.mrp != null ? Number(pr.mrp) : Number(product.base_price ?? product.price),
    current_price: Number(pr.base),
    discount_price: Number(pr.discount),
    final_price: Number(cashfreeAmount),
    coupon_code: pr.coupon || null,
    product_name: product.name,
  });
}


/* ============================================================
   SECTION 13 — PAYMENT STATUS
   ------------------------------------------------------------
   Cashfree से order का current payment status check होता है।
   SUCCESS होने पर existing PAID + token + email flow चलता है।
   ============================================================ */

async function handlePaymentStatus(
  request,
  env
) {
  const url =
    new URL(request.url);

  const orderId =
    url.searchParams.get(
      "order_id"
    );
  const attemptId = String(url.searchParams.get("attempt_id") || "").slice(0, 100) || null;

  if (!orderId) {
    return json(
      {
        error:
          "order_id is required."
      },
      400
    );
  }

  const order =
    await env.DB.prepare(
      "SELECT * FROM orders WHERE order_id = ?1 LIMIT 1"
    ).bind(orderId).first();

  if (!order) {
    await logCheckoutEvent(env, { attemptId, orderId, type: "PAYMENT_STATUS_CHECK", outcome: "FAILED", errorCode: "ORDER_NOT_FOUND" });
    return json(
      {
        error:
          "Order not found."
      },
      404
    );
  }


  const status =
    await getOrderPaymentStatus(
      env,
      orderId
    );


  if (status === "SUCCESS") {
    await logCheckoutEvent(env, { attemptId, orderId, productId: order.product_id, email: order.customer_email, type: "PAYMENT_VERIFIED", outcome: "SUCCESS" });
    const token =
      await markOrderPaidAndToken(
        env,
        orderId
      );

    await logCheckoutEvent(env, { attemptId, orderId, productId: order.product_id, email: order.customer_email, type: "ORDER_PAID", outcome: "SUCCESS" });
    await logCheckoutEvent(env, { attemptId, orderId, productId: order.product_id, email: order.customer_email, type: "TOKEN_CREATED", outcome: "SUCCESS" });
    const product = await env.DB.prepare(
      "SELECT name FROM products WHERE product_id = ?1 LIMIT 1"
    ).bind(order.product_id).first();

    const paidDownload = await env.DB.prepare(
      "SELECT download_count, expires_at FROM downloads WHERE order_id = ?1 ORDER BY id DESC LIMIT 1"
    ).bind(orderId).first();
    const paidMaxDownloads = Number(env.MAX_DOWNLOADS || 3);
    const paidUsedDownloads = Number(paidDownload?.download_count || 0);

    return json({
      order_id: orderId,
      status: "PAID",
      product_id: order.product_id,
      product_name: product?.name || "",
      regular_price: Number(order.regular_price || 0),
      current_price: Number(order.current_price || 0),
      discount_price: Number(order.discount_price || 0),
      final_price: Number(order.final_price || 0),
      coupon_code: order.coupon_code || null,
      download_url:
        `${env.WORKER_PUBLIC_URL.replace(/\/$/, "")}/download?token=${encodeURIComponent(token)}`,
      downloads_used: paidUsedDownloads,
      downloads_remaining: Math.max(0, paidMaxDownloads - paidUsedDownloads),
      max_downloads: paidMaxDownloads,
      expires_at: paidDownload?.expires_at || null,
    });
  }


  if (status === "AMOUNT_MISMATCH") {
    await logCheckoutEvent(env, { attemptId, orderId, productId: order.product_id, email: order.customer_email, type: "PAYMENT_AMOUNT_MISMATCH", outcome: "BLOCKED", errorCode: "CASHFREE_AMOUNT_MISMATCH" });
    // Do not mark paid, issue a token, or send a delivery email on amount mismatch.
    return json({ order_id: orderId, status: "PAYMENT_REVIEW", error: "Payment amount could not be verified against the order. Please contact support." }, 409);
  }

  if (status === "PENDING") {
    await logCheckoutEvent(env, { attemptId, orderId, productId: order.product_id, email: order.customer_email, type: "PAYMENT_STATUS_CHECK", outcome: "PENDING" });
    await env.DB.prepare(
      "UPDATE orders SET payment_status = 'PENDING' WHERE order_id = ?1 AND payment_status != 'PAID'"
    ).bind(orderId).run();

    return json({
      order_id: orderId,
      status: "PENDING",
      final_price: Number(order.final_price || 0),
      coupon_code: order.coupon_code || null
    });
  }


  await logCheckoutEvent(env, { attemptId, orderId, productId: order.product_id, email: order.customer_email, type: "PAYMENT_STATUS_CHECK", outcome: "FAILED" });
  await releaseCouponReservation(env, orderId);
  await env.DB.prepare(
    "UPDATE orders SET payment_status = 'FAILED' WHERE order_id = ?1 AND payment_status != 'PAID'"
  ).bind(orderId).run();

  return json({
    order_id:
      orderId,

    status:
      "FAILED"
  });
}


/* ============================================================
   SECTION 14 — CASHFREE WEBHOOK
   ------------------------------------------------------------
   Cashfree webhook आने पर signature verify करके payment status
   दोबारा Cashfree से confirm किया जाता है।
   ============================================================ */

async function handleWebhook(
  request,
  env
) {
  const rawBody =
    await request.text();

  if (
    !(await verifyCashfreeWebhook(
      request,
      env,
      rawBody
    ))
  ) {
    return text(
      "Invalid webhook signature.",
      401
    );
  }


  let payload;

  try {
    payload =
      JSON.parse(rawBody);

  } catch {
    return text(
      "Invalid JSON.",
      400
    );
  }


  const orderId =
    payload?.data?.order?.order_id ||
    payload?.data?.order_id ||
    payload?.order_id;


  if (!orderId) {
    return text(
      "Webhook accepted: no order id.",
      200
    );
  }


  try {
    const status =
      await getOrderPaymentStatus(
        env,
        orderId
      );


    if (status === "AMOUNT_MISMATCH") {
      await logCheckoutEvent(env, { orderId, type: "PAYMENT_AMOUNT_MISMATCH", outcome: "BLOCKED", errorCode: "CASHFREE_AMOUNT_MISMATCH" });
      // Keep the order unpaid. A verified signature does not prove the amount is correct.
      return text("Payment amount mismatch; order remains unpaid.", 409);
    }

    if (status === "SUCCESS") {
      await logCheckoutEvent(env, { orderId, type: "WEBHOOK_PAYMENT_VERIFIED", outcome: "SUCCESS" });
      const token = await markOrderPaidAndToken(env, orderId);
      const order = await env.DB.prepare("SELECT product_id,customer_email FROM orders WHERE order_id=?1 LIMIT 1").bind(orderId).first();
      await logCheckoutEvent(env, { orderId, productId: order?.product_id, email: order?.customer_email, type: "ORDER_PAID", outcome: "SUCCESS" });
      await logCheckoutEvent(env, { orderId, productId: order?.product_id, email: order?.customer_email, type: "TOKEN_CREATED", outcome: token ? "SUCCESS" : "RECORDED" });
    }

    else if (
      status === "PENDING"
    ) {
      await logCheckoutEvent(env, { orderId, type: "WEBHOOK_PAYMENT_PENDING", outcome: "PENDING" });
      await env.DB.prepare(
        "UPDATE orders SET payment_status = 'PENDING' WHERE order_id = ?1 AND payment_status != 'PAID'"
      ).bind(orderId).run();
    } else if (status === "FAILED") {
      await releaseCouponReservation(env, orderId);
      await env.DB.prepare(
        "UPDATE orders SET payment_status = 'FAILED' WHERE order_id = ?1 AND payment_status != 'PAID'"
      ).bind(orderId).run();
    }

  } catch (err) {
    console.error(
      "Webhook verification error:",
      err
    );

    return text(
      "Temporary verification failure.",
      500
    );
  }


  return text(
    "OK",
    200
  );
}
/* ============================================================
   SECTION 10 — DOWNLOAD REQUEST / PDF DELIVERY
   ------------------------------------------------------------
   Customer के token को verify करके PDF download कराया जाता है।
   Token expiry और maximum download limit दोनों check होते हैं।
   ============================================================ */

async function handleDownload(
  request,
  env
) {
  const url =
    new URL(request.url);

  const token =
    url.searchParams.get(
      "token"
    );

  if (!token) {
    return text(
      "Missing download token.",
      400
    );
  }


  const row =
    await env.DB.prepare(
      `SELECT d.*, o.payment_status, o.product_id, o.customer_email, p.file_key, p.file_name, p.name
       FROM downloads d
       JOIN orders o ON o.order_id = d.order_id
       JOIN products p ON p.product_id = o.product_id
       WHERE d.token = ?1
       LIMIT 1`
    ).bind(token).first();


  if (!row) {
    return text(
      "Invalid download link.",
      404
    );
  }


  if (
    row.payment_status !==
    "PAID"
  ) {
    return text(
      "Payment not verified.",
      403
    );
  }


  if (
    new Date(
      row.expires_at
    ).getTime() < Date.now()
  ) {
    return text(
      "Download link expired.",
      410
    );
  }


  const maxDownloads =
    Number(
      env.MAX_DOWNLOADS || 3
    );


  if (
    Number(row.download_count) >=
    maxDownloads
  ) {
    return text(
      "Download limit reached.",
      429
    );
  }


  const object =
    await fetchBookFile(
      env,
      request,
      row.file_key
    );


  if (!object) {
    return text(
      "File not found.",
      404
    );
  }


  await env.DB.prepare(
    "UPDATE downloads SET download_count = download_count + 1, last_download_at = CURRENT_TIMESTAMP WHERE id = ?1"
  ).bind(row.id).run();
  await logCheckoutEvent(env, { orderId: row.order_id, productId: row.product_id, email: row.customer_email, type: "DOWNLOADED", outcome: "SUCCESS", metadata: { download_count: Number(row.download_count) + 1 } });

  const headers =
    new Headers();


  headers.set(
    "Content-Type",
    "application/pdf"
  );


  headers.set(
    "Content-Disposition",
    `attachment; filename="${String(row.file_name || "ebook.pdf").replace(/["\r\n]/g, "")}"`
  );


  headers.set(
    "Cache-Control",
    "private, no-store"
  );


  headers.set(
    "X-Content-Type-Options",
    "nosniff"
  );


  return new Response(
    object.body,
    {
      headers
    }
  );
}


/* ============================================================
   SECTION 15 — PRODUCT & CATALOG
   ------------------------------------------------------------
   Website के लिए individual product और पूरी active catalog की
   current price/offer information यहाँ से आती है।
   ============================================================ */

async function handleProduct(
  request,
  env
) {
  const url =
    new URL(request.url);

  const productId =
    url.searchParams.get(
      "product_id"
    );


  if (!productId) {
    return json(
      {
        error:
          "product_id is required."
      },
      400
    );
  }


  const product =
    await env.DB.prepare(
      "SELECT product_id, name, price, currency FROM products WHERE product_id = ?1 AND active = 1 LIMIT 1"
    ).bind(productId).first();


  if (!product) {
    return json(
      {
        error:
          "Product not found."
      },
      404
    );
  }


  return json(
    product
  );
}


// एक ही call में सारी किताबों की कीमत+offer

async function handleCatalog(
  env
) {
  const { results } = await env.DB.prepare(
    "SELECT product_id, name, price, cover_asset FROM products WHERE active = 1"
  ).all();
  let metadataById = {};
  try {
    const meta = await env.DB.prepare(`SELECT product_id,slug,name,author_name,description,page_count,language,cover_asset,featured,popular,status
      FROM nv_products WHERE status='ACTIVE'`).all();
    metadataById = Object.fromEntries((meta.results || []).map(row => [row.product_id, row]));
  } catch { /* Current Version may not yet have New Version product metadata migration. */ }
  const out = {};
  for (const p of results) {
    const o =
      await getOffer(
        env,
        p.product_id
      );


    const meta = metadataById[p.product_id] || {};
    const coverAsset = meta.cover_asset || p.cover_asset || null;
    const workerBase = String(env.WORKER_PUBLIC_URL || "").replace(/\/+$/, "");
    const coverUrl = typeof coverAsset === "string" && coverAsset.startsWith("public-covers/") && /^https:\/\//i.test(workerBase)
      ? `${workerBase}/api/public/covers/${coverAsset}` : coverAsset;
    out[p.product_id] = {
      product_id: p.product_id,
      slug: meta.slug || null,
      name: meta.name || p.name,
      author_name: meta.author_name || null,
      description: meta.description || "",
      page_count: meta.page_count || null,
      language: meta.language || null,
      cover_asset: coverAsset,
      cover_url: coverUrl,
      featured: !!meta.featured,
      popular: !!meta.popular,
      price:
        o &&
        o.sale_price != null
          ? Number(o.sale_price)
          : Number(p.price),

      mrp:
        o &&
        o.mrp != null
          ? Number(o.mrp)
          : (p.mrp != null
              ? Number(p.mrp)
              : (p.base_price != null
                  ? Number(p.base_price)
                  : Number(p.price))),

      label:
        o
          ? o.label || null
          : null,
    };
  }


  return json(
    {
      products:
        out
    },
    200,
    {
      "Cache-Control":
        "public, max-age=30"
    }
  );
}


/* ============================================================
   SECTION 16 — ADMIN / COUPON MANAGEMENT
   ------------------------------------------------------------
   Admin key से protected routes।
   Product price, offer और coupon create/update/delete यहीं manage होते हैं।
   Coupon code यहाँ hard-code नहीं है; D1 में जो code बनाया जाएगा वही चलेगा।
   ============================================================ */

// ADMIN

async function handleAdmin(
  request,
  env,
  url
) {
  const path = url.pathname;
  // Compatibility-preserving migration: the existing owner ADMIN_KEY remains a
  // break-glass credential for the legacy UI. New Version sessions must pass a
  // route-specific server-side permission check before reaching the same handlers.
  // Do not distribute ADMIN_KEY to staff accounts.
  const legacyOwnerKey = isAdmin(request, env);
  if (!legacyOwnerKey) {
    const permissionByRoute = new Map([
      ["GET /api/admin/site-content", "content.read"],
      ["POST /api/admin/site-content", "content.write"],
      ["GET /api/admin/data", "products.read"],
      ["POST /api/admin/price", "products.update"],
      ["POST /api/admin/offer", "offers.write"],
      ["POST /api/admin/coupon", "coupons.write"],
      ["POST /api/admin/coupon-delete", "coupons.delete"],
    ]);
    const permission = permissionByRoute.get(`${request.method} ${path}`);
    if (!permission) return json({ error: "Authentication required for this legacy admin route." }, 401);
    if (path === "/api/admin/data" && request.method === "GET") {
      for (const key of ["products.read", "offers.read", "coupons.read"]) {
        const check = await requireAdminPermission(request, env, key);
        if (!check.ok) return check.response;
      }
    } else {
      const check = await requireAdminPermission(request, env, permission);
      if (!check.ok) return check.response;
    }
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    try {
      const settingsExists = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nv_system_settings' LIMIT 1").first();
      if (!settingsExists) return json({ error: "Maintenance settings migration is missing. Write action was blocked for safety." }, 503);
      const flags = await env.DB.prepare("SELECT setting_key,setting_value FROM nv_system_settings WHERE setting_key IN ('owner_control_locked','maintenance_mode')").all();
      const values = Object.fromEntries((flags.results || []).map(x => [x.setting_key, x.setting_value]));
      if (!["0", "1"].includes(values.owner_control_locked) || !["0", "1"].includes(values.maintenance_mode)) return json({ error: "Maintenance settings are incomplete. Write action was blocked for safety." }, 503);
      if (values.owner_control_locked === "1") return json({ error: "Owner Control Lock is enabled. Use the Founder workspace to unlock it." }, 423);
      if (values.maintenance_mode === "1") return json({ error: "Maintenance/Safe Mode is enabled. Write actions are temporarily paused." }, 423);
    } catch { return json({ error: "Maintenance state could not be verified. Write action was blocked for safety." }, 503); }
  }

  // Dynamic site-content editor. Requires db/migration/001_site_content.sql.
  if (request.method === "GET" && path === "/api/admin/site-content") {
    try {
      const rows = (await env.DB.prepare(
        "SELECT content_key, title, body, draft_title, draft_body, enabled, published_at, updated_at FROM site_content ORDER BY content_key"
      ).all()).results || [];
      return json({ items: rows });
    } catch (err) {
      return json({ error: "Site content migration is not installed. Run db/migration/001_site_content.sql once in the existing D1 database." }, 503);
    }
  }

  if (request.method === "POST" && path === "/api/admin/site-content") {
    let content;
    try { content = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
    const key = String(content.content_key || "").trim();
    const title = String(content.title || "").trim();
    const body = String(content.body || "");
    const action = String(content.action || "save_draft");
    if (!/^[a-z][a-z0-9_-]{1,63}$/.test(key)) return json({ error: "Invalid content key." }, 400);
    if (!["save_draft", "publish", "disable", "enable"].includes(action)) return json({ error: "Invalid action." }, 400);
    if (action === "disable" && ["terms", "privacy", "refund", "contact_email"].includes(key)) return json({ error: "Core legal policy pages and the primary contact email cannot be disabled." }, 400);
    if (action === "save_draft" || action === "publish") {
      if (title.length > 180 || body.length > 50000) return json({ error: "Title must be under 180 characters and content under 50,000 characters." }, 400);
      if (!title || !body.trim()) return json({ error: "Title and content cannot be empty." }, 400);
      // The email value is used for mailto links. Validate it server-side before saving.
      if (key === "contact_email" && !validEmail(body.trim())) return json({ error: "Contact Email में एक valid email address डालें।" }, 400);
    }
    try {
      if (action === "save_draft") {
        await env.DB.prepare("UPDATE site_content SET draft_title=?2, draft_body=?3, updated_at=CURRENT_TIMESTAMP WHERE content_key=?1").bind(key, title, body).run();
      } else if (action === "publish") {
        await env.DB.prepare("UPDATE site_content SET title=?2, body=?3, draft_title=NULL, draft_body=NULL, enabled=1, published_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE content_key=?1").bind(key, title, body).run();
      } else {
        await env.DB.prepare("UPDATE site_content SET enabled=?2, updated_at=CURRENT_TIMESTAMP WHERE content_key=?1").bind(key, action === "enable" ? 1 : 0).run();
      }
      const saved = await env.DB.prepare("SELECT content_key, title, body, draft_title, draft_body, enabled, published_at, updated_at FROM site_content WHERE content_key=?1").bind(key).first();
      if (!saved) return json({ error: "Unknown content key. Install the supplied migration and check the key." }, 404);
      return json({ ok: true, item: saved });
    } catch (err) {
      console.error("site content update failed", err);
      return json({ error: "Site content table is unavailable. Run the supplied migration once." }, 503);
    }
  }

  const nz = (v) =>
    (
      v === "" ||
      v === undefined ||
      v === null
    )
      ? null
      : v;


  const num = (v) =>
    (
      nz(v) === null
        ? null
        : Number(v)
    );


  if (
    request.method === "GET" &&
    path === "/api/admin/data"
  ) {
    const products =
      (
        await env.DB.prepare(
          "SELECT product_id, name, price, active FROM products"
        ).all()
      ).results;


    const offers =
      (
        await env.DB.prepare(
          "SELECT * FROM offers"
        ).all()
      ).results;


    const coupons =
      (
        await env.DB.prepare(
          "SELECT * FROM coupons ORDER BY rowid DESC"
        ).all()
      ).results;


    return json({
      products,
      offers,
      coupons
    });
  }


  if (
    request.method !==
    "POST"
  ) {
    return json(
      {
        error:
          "Not found."
      },
      404
    );
  }


  let b;

  try {
    b =
      await request.json();

  } catch {
    return json(
      {
        error:
          "Invalid JSON."
      },
      400
    );
  }


  if (
    path ===
    "/api/admin/price"
  ) {
    if (
      !(Number(b.price) >= 1)
    ) {
      return json(
        {
          error:
            "कीमत कम से कम ₹1 हो।"
        },
        400
      );
    }


    await env.DB.prepare(
      "UPDATE products SET price = ?2 WHERE product_id = ?1"
    ).bind(
      b.product_id,
      Number(b.price)
    ).run();


    return json({
      ok: true
    });
  }


  if (
    path ===
    "/api/admin/offer"
  ) {
    const productId = typeof b.product_id === "string" ? b.product_id.trim() : "";
    const mrp = num(b.mrp), salePrice = num(b.sale_price);
    const startsAt = nz(b.starts_at), endsAt = nz(b.ends_at);
    const active = b.active === true || b.active === 1 || b.active === "1";
    if (!productId || productId.length > 100) return json({ error: "A valid product_id is required." }, 400);
    if (mrp === null || salePrice === null || !Number.isFinite(mrp) || !Number.isFinite(salePrice) || mrp < 0 || salePrice < 0 || salePrice > mrp || Math.round(mrp * 100) !== mrp * 100 || Math.round(salePrice * 100) !== salePrice * 100) {
      return json({ error: "Offer prices must be valid rupee amounts (max 2 decimals), and sale_price cannot exceed mrp." }, 400);
    }
    const validSchedule = value => value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
    if (!validSchedule(startsAt) || !validSchedule(endsAt)) return json({ error: "Offer dates must be valid date/time values." }, 400);
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) return json({ error: "ends_at must be later than starts_at." }, 400);
    if (active) {
      const product = await env.DB.prepare("SELECT product_id, active FROM products WHERE product_id=?1 LIMIT 1").bind(productId).first();
      if (!product || Number(product.active) !== 1) return json({ error: "An active offer requires an existing active product." }, 400);
    }
    await env.DB.prepare(
      `INSERT INTO offers
        (product_id, mrp, sale_price, label, starts_at, ends_at, active)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(product_id) DO UPDATE SET
         mrp = excluded.mrp,
         sale_price = excluded.sale_price,
         label = excluded.label,
         starts_at = excluded.starts_at,
         ends_at = excluded.ends_at,
         active = excluded.active`
    ).bind(
      productId,
      mrp,
      salePrice,
      nz(b.label),
      startsAt,
      endsAt,
      active ? 1 : 0
    ).run();


    return json({
      ok: true
    });
  }


  if (
    path ===
    "/api/admin/coupon"
  ) {
    const code =
      String(b.code || "")
        .trim()
        .toUpperCase();


    if (
      !/^[A-Z0-9_-]{3,30}$/.test(
        code
      )
    ) {
      return json(
        {
          error:
            "Code 3-30 अक्षर/अंक का हो।"
        },
        400
      );
    }


    if (
      ![
        "PERCENT",
        "FLAT"
      ].includes(
        b.discount_type
      ) ||
      !(
        Number(
          b.discount_value
        ) > 0
      )
    ) {
      return json(
        {
          error:
            "Discount सही भरें।"
        },
        400
      );
    }


    if (
      b.discount_type ===
      "PERCENT" &&
      Number(
        b.discount_value
      ) > 100
    ) {
      return json(
        {
          error:
            "प्रतिशत 100 से ज़्यादा नहीं।"
        },
        400
      );
    }


    await env.DB.prepare(
      `INSERT INTO coupons
        (code, discount_type, discount_value, product_ids, min_amount, max_uses, starts_at, expires_at, active)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT(code) DO UPDATE SET
         discount_type = excluded.discount_type,
         discount_value = excluded.discount_value,
         product_ids = excluded.product_ids,
         min_amount = excluded.min_amount,
         max_uses = excluded.max_uses,
         starts_at = excluded.starts_at,
         expires_at = excluded.expires_at,
         active = excluded.active`
    ).bind(
      code,
      b.discount_type,
      Number(
        b.discount_value
      ),
      nz(b.product_ids) || "*",
      num(b.min_amount),
      num(b.max_uses),
      nz(b.starts_at),
      nz(b.expires_at),
      b.active === false
        ? 0
        : 1
    ).run();


    return json({
      ok: true
    });
  }
     if (
    path ===
    "/api/admin/coupon-delete"
  ) {
    const code = String(b.code || "").trim().toUpperCase();
    if (!code) return json({ error: "Coupon code is required." }, 400);
    const coupon = await env.DB.prepare(
      "SELECT code, used_count, reserved_count FROM coupons WHERE code = ?1 LIMIT 1"
    ).bind(code).first();
    if (!coupon) return json({ error: "Coupon not found." }, 404);
    if (Number(coupon.reserved_count || 0) > 0) {
      return json({ error: "Coupon has reserved checkouts. Wait for reconciliation before deleting it." }, 409);
    }
    // Preserve coupon history for past orders: used coupons are archived, not deleted.
    if (Number(coupon.used_count || 0) > 0) {
      await env.DB.prepare("UPDATE coupons SET active = 0 WHERE code = ?1").bind(code).run();
      return json({ ok: true, archived: true, message: "Coupon deactivated to preserve order history." });
    }
    await env.DB.prepare("DELETE FROM coupons WHERE code = ?1 AND reserved_count = 0 AND used_count = 0").bind(code).run();
    return json({ ok: true, archived: false });
  }


  return json(
    {
      error:
        "Not found."
    },
    404
  );
}


// Safe, manual reconciliation for old coupon reservations. Time alone never releases a
// reservation: the authoritative Cashfree payment status must be terminal first.
async function handleCouponReservationReconciliation(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, { Allow: "POST" });
  if (!env.DB) return json({ error: "Database binding is unavailable." }, 503);
  const auth = await requireAdminPermission(request, env, "coupons.manage");
  if (!auth.ok) return auth.response;

  const candidates = await env.DB.prepare(`SELECT r.order_id, r.coupon_code, r.created_at, o.payment_status
    FROM coupon_reservations r JOIN orders o ON o.order_id = r.order_id
    WHERE r.status = 'RESERVED'
      AND datetime(r.created_at) <= datetime('now', '-30 minutes')
    ORDER BY r.created_at ASC LIMIT 20`).all();
  const results = [];
  for (const reservation of (candidates?.results || [])) {
    try {
      // Recover a crash window where an order became PAID but reservation redemption
      // failed afterward. Never query/release an already-paid order's reservation.
      if (String(reservation.payment_status || "").toUpperCase() === "PAID") {
        const recovered = await consumeCouponReservation(env, reservation.order_id);
        results.push({ order_id: reservation.order_id, result: recovered ? "PAID_ORDER_RESERVATION_REDEEMED" : "PAID_ORDER_RESERVATION_ALREADY_RESOLVED" });
        continue;
      }
      const status = await getOrderPaymentStatus(env, reservation.order_id);
      if (status === "FAILED") {
        await releaseCouponReservation(env, reservation.order_id);
        await env.DB.prepare("UPDATE orders SET payment_status = 'FAILED' WHERE order_id = ?1 AND payment_status != 'PAID'")
          .bind(reservation.order_id).run();
        results.push({ order_id: reservation.order_id, result: "RELEASED_CONFIRMED_FAILURE" });
      } else if (status === "SUCCESS") {
        const token = await markOrderPaidAndToken(env, reservation.order_id);
        results.push({ order_id: reservation.order_id, result: token ? "PAYMENT_CONFIRMED_AND_REDEEMED" : "PAYMENT_CONFIRMED" });
      } else if (status === "AMOUNT_MISMATCH") {
        await logCheckoutEvent(env, { orderId: reservation.order_id, type: "PAYMENT_AMOUNT_MISMATCH", outcome: "BLOCKED", errorCode: "CASHFREE_AMOUNT_MISMATCH" });
        results.push({ order_id: reservation.order_id, result: "PAYMENT_REVIEW_RESERVATION_RETAINED" });
      } else {
        results.push({ order_id: reservation.order_id, result: "STILL_PENDING_RESERVATION_RETAINED" });
      }
    } catch {
      // Provider/API transient errors never free coupon capacity.
      results.push({ order_id: reservation.order_id, result: "RETRY_LATER_RESERVATION_RETAINED" });
    }
  }
  return json({ ok: true, examined: results.length, limit: 20, minimum_age_minutes: 30, results,
    note: "Reservations are released only after Cashfree confirms a definitive terminal failure." });
}

/* ============================================================
   SECTION 17 — MAIN ROUTER / API ROUTES
   ------------------------------------------------------------
   Worker में आने वाली सभी API requests को उनके सही handler तक
   पहुँचाने का काम यहाँ होता है।
   ============================================================ */

export default {
  async fetch(
    request,
    env
  ) {

    if (
      new URL(request.url)
        .pathname ===
      "/api/diagnostic"
    ) {
      const info = {
        cashfree_env:
          env.CASHFREE_ENV ||
          "MISSING",

        client_id_present:
          !!env.CASHFREE_CLIENT_ID,

        client_secret_present:
          !!env.CASHFREE_CLIENT_SECRET,

        worker_public_url:
          env.WORKER_PUBLIC_URL ||
          "MISSING"
      };

      // Key lengths are shown only to the admin (x-admin-key), never publicly.
      if (isAdmin(request, env)) {
        info.client_id_length =
          env.CASHFREE_CLIENT_ID?.length || 0;
        info.client_secret_length =
          env.CASHFREE_CLIENT_SECRET?.length || 0;
      }

      return json(info);
    }


    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        null,
        {
          headers:
            CORS_HEADERS
        }
      );
    }


    const url =
      new URL(request.url);


    try {
      if (url.pathname.startsWith("/api/public/covers/")) {
        const coverResponse = await handlePublicCover(request, env, url);
        const coverHeaders = new Headers(coverResponse.headers);
        for (const [name, value] of Object.entries(CORS_HEADERS)) {
          if (name.toLowerCase() !== "access-control-allow-origin") coverHeaders.set(name, value);
        }
        return new Response(coverResponse.body, { status: coverResponse.status, statusText: coverResponse.statusText, headers: coverHeaders });
      }
      const maintenanceGateResponse = await checkMaintenanceGate(request, env, url);
      if (maintenanceGateResponse) {
        const gateHeaders = new Headers(maintenanceGateResponse.headers);
        for (const [name, value] of Object.entries(CORS_HEADERS)) gateHeaders.set(name, value);
        gateHeaders.set("Cache-Control", "no-store");
        return new Response(maintenanceGateResponse.body, { status: maintenanceGateResponse.status, statusText: maintenanceGateResponse.statusText, headers: gateHeaders });
      }

      if (
        request.method === "POST" &&
        url.pathname ===
          "/api/validate-coupon"
      ) {
        return await handleValidateCoupon(
          request,
          env
        );
      }


      if (
        request.method === "POST" &&
        url.pathname ===
          "/api/create-order"
      ) {
        return await handleCreateOrder(
          request,
          env
        );
      }


      if (
        request.method === "GET" &&
        url.pathname ===
          "/api/payment-status"
      ) {
        return await handlePaymentStatus(
          request,
          env
        );
      }


      if (
        request.method === "POST" &&
        url.pathname ===
          "/webhook/cashfree"
      ) {
        return await handleWebhook(
          request,
          env
        );
      }


      if (
        request.method === "GET" &&
        url.pathname ===
          "/download"
      ) {
        return await handleDownload(
          request,
          env
        );
      }


      if (
        request.method === "GET" &&
        url.pathname ===
          "/api/product"
      ) {
        return await handleProduct(
          request,
          env
        );
      }


      if (
        request.method === "POST" &&
        url.pathname ===
          "/api/my-order"
      ) {
        return await handleMyOrder(
          request,
          env
        );
      }


      if (
        request.method === "GET" &&
        url.pathname ===
          "/api/catalog"
      ) {
        return await handleCatalog(
          env
        );
      }


      if (request.method === "GET" && url.pathname === "/api/site-content") {
        try {
          const rows = (await env.DB.prepare(
            "SELECT content_key, title, body, enabled, published_at, updated_at FROM site_content WHERE enabled=1 ORDER BY content_key"
          ).all()).results || [];
          const content = {};
          for (const row of rows) content[row.content_key] = {
            title: row.title, body: row.body, enabled: !!row.enabled,
            published_at: row.published_at, updated_at: row.updated_at
          };
          return json({ ok: true, content }, 200, { "Cache-Control": "no-store" });
        } catch (err) {
          // Static HTML remains the fallback until the one-time D1 migration is installed.
          return json({ ok: false, content: {}, message: "Site content is using the static fallback." }, 200, { "Cache-Control": "no-store" });
        }
      }

      if (url.pathname === "/api/v2/admin/checkout-events") {
        const eventsResponse = await handleAdminCheckoutEvents(request, env, url);
        const eventsHeaders = new Headers(eventsResponse.headers);
        for (const [name, value] of Object.entries(CORS_HEADERS)) eventsHeaders.set(name, value);
        eventsHeaders.set("Cache-Control", "no-store");
        return new Response(eventsResponse.body, { status: eventsResponse.status, statusText: eventsResponse.statusText, headers: eventsHeaders });
      }

      if (url.pathname === "/api/v2/admin/products/cover-upload") {
        const coverUploadResponse = await handleCoverUpload(request, env);
        const coverUploadHeaders = new Headers(coverUploadResponse.headers);
        for (const [name, value] of Object.entries(CORS_HEADERS)) coverUploadHeaders.set(name, value);
        coverUploadHeaders.set("Cache-Control", "no-store");
        return new Response(coverUploadResponse.body, { status: coverUploadResponse.status, statusText: coverUploadResponse.statusText, headers: coverUploadHeaders });
      }

      if (url.pathname.startsWith("/api/v2/admin/maintenance/")) {
        const maintenanceResponse = await handleAdminMaintenance(request, env, url);
        const maintenanceHeaders = new Headers(maintenanceResponse.headers);
        for (const [name, value] of Object.entries(CORS_HEADERS)) maintenanceHeaders.set(name, value);
        maintenanceHeaders.set("Cache-Control", "no-store");
        return new Response(maintenanceResponse.body, { status: maintenanceResponse.status, statusText: maintenanceResponse.statusText, headers: maintenanceHeaders });
      }

      if (url.pathname === "/api/v2/admin/password-reset/request" || url.pathname === "/api/v2/admin/password-reset/confirm") {
        const resetResponse = await handlePasswordReset(request, env, url);
        const resetHeaders = new Headers(resetResponse.headers);
        for (const [name, value] of Object.entries(CORS_HEADERS)) resetHeaders.set(name, value);
        resetHeaders.set("Cache-Control", "no-store");
        return new Response(resetResponse.body, { status: resetResponse.status, statusText: resetResponse.statusText, headers: resetHeaders });
      }

      if (url.pathname === "/api/v2/purchase-requests" || url.pathname.startsWith("/api/v2/admin/purchase-requests")) {
        const purchaseRequestResponse = await handlePurchaseRequests(request, env, url);
        const purchaseRequestHeaders = new Headers(purchaseRequestResponse.headers);
        for (const [name, value] of Object.entries(CORS_HEADERS)) purchaseRequestHeaders.set(name, value);
        purchaseRequestHeaders.set("Cache-Control", "no-store");
        return new Response(purchaseRequestResponse.body, {
          status: purchaseRequestResponse.status,
          statusText: purchaseRequestResponse.statusText,
          headers: purchaseRequestHeaders,
        });
      }

      // New Version authentication endpoints are isolated under /api/v2/admin/.
      // Legacy /api/admin routes preserve their existing handlers; mapped routes are
      // also guarded by route-specific session permissions unless the owner break-glass
      // ADMIN_KEY is used. Unmapped legacy routes fail closed for session callers.
      if (url.pathname === "/api/v2/admin/coupons/reconcile-reservations") {
        const reconcileResponse = await handleCouponReservationReconciliation(request, env);
        const reconcileHeaders = new Headers(reconcileResponse.headers);
        for (const [name, value] of Object.entries(CORS_HEADERS)) reconcileHeaders.set(name, value);
        reconcileHeaders.set("Cache-Control", "no-store");
        return new Response(reconcileResponse.body, { status: reconcileResponse.status, statusText: reconcileResponse.statusText, headers: reconcileHeaders });
      }

      if (url.pathname.startsWith("/api/v2/admin/coupons")) {
        const couponResponse = await handleCouponManager(request, env, url);
        const couponHeaders = new Headers(couponResponse.headers);
        for (const [name, value] of Object.entries(CORS_HEADERS)) couponHeaders.set(name, value);
        couponHeaders.set("Cache-Control", "no-store");
        return new Response(couponResponse.body, {
          status: couponResponse.status,
          statusText: couponResponse.statusText,
          headers: couponHeaders,
        });
      }

      if (url.pathname === "/api/v2/admin/products/upload") {
        const uploadResponse = await handleProductFileUpload(request, env);
        const uploadHeaders = new Headers(uploadResponse.headers);
        for (const [name, value] of Object.entries(CORS_HEADERS)) uploadHeaders.set(name, value);
        uploadHeaders.set("Cache-Control", "no-store");
        return new Response(uploadResponse.body, { status: uploadResponse.status, statusText: uploadResponse.statusText, headers: uploadHeaders });
      }

      if (url.pathname.startsWith("/api/v2/admin/products")) {
        const productResponse = await handleProductManager(request, env, url);
        const productHeaders = new Headers(productResponse.headers);
        for (const [name, value] of Object.entries(CORS_HEADERS)) productHeaders.set(name, value);
        productHeaders.set("Cache-Control", "no-store");
        return new Response(productResponse.body, {
          status: productResponse.status,
          statusText: productResponse.statusText,
          headers: productHeaders,
        });
      }

      if (["/api/v2/admin/health", "/api/v2/admin/audit-logs", "/api/v2/admin/email-activity"].includes(url.pathname) || url.pathname.startsWith("/api/v2/admin/email-activity/")) {
        const operationsResponse = await handleAdminOperations(request, env, url);
        const operationsHeaders = new Headers(operationsResponse.headers);
        for (const [name, value] of Object.entries(CORS_HEADERS)) operationsHeaders.set(name, value);
        operationsHeaders.set("Cache-Control", "no-store");
        return new Response(operationsResponse.body, { status: operationsResponse.status, statusText: operationsResponse.statusText, headers: operationsHeaders });
      }

      if (url.pathname.startsWith("/api/v2/admin/reports")) {
        const reportResponse = await handleAdminReports(request, env, url);
        const reportHeaders = new Headers(reportResponse.headers);
        for (const [name, value] of Object.entries(CORS_HEADERS)) reportHeaders.set(name, value);
        reportHeaders.set("Cache-Control", "no-store");
        if (url.pathname === "/api/v2/admin/reports/orders.csv") {
          reportHeaders.set("Content-Type", "text/csv; charset=utf-8");
        }
        return new Response(reportResponse.body, {
          status: reportResponse.status,
          statusText: reportResponse.statusText,
          headers: reportHeaders,
        });
      }

      if (url.pathname.startsWith("/api/v2/admin/orders") || url.pathname.startsWith("/api/v2/admin/customers")) {
        const orderCustomerResponse = await handleAdminOrderCustomer(request, env, url);
        const responseHeaders = new Headers(orderCustomerResponse.headers);
        for (const [name, value] of Object.entries(CORS_HEADERS)) responseHeaders.set(name, value);
        responseHeaders.set("Cache-Control", "no-store");
        return new Response(orderCustomerResponse.body, {
          status: orderCustomerResponse.status,
          statusText: orderCustomerResponse.statusText,
          headers: responseHeaders,
        });
      }

      if (url.pathname.startsWith("/api/v2/admin/")) {
        const authResponse = await handleAdminAuth(request, env, url);
        // The auth module builds its own JSON responses; copy the shared CORS
        // headers onto every response so browser login/session requests work.
        const authHeaders = new Headers(authResponse.headers);
        for (const [name, value] of Object.entries(CORS_HEADERS)) {
          authHeaders.set(name, value);
        }
        authHeaders.set("Cache-Control", "no-store");
        return new Response(authResponse.body, {
          status: authResponse.status,
          statusText: authResponse.statusText,
          headers: authHeaders,
        });
      }

      if (
        url.pathname.startsWith(
          "/api/admin/"
        )
      ) {
        return await handleAdmin(
          request,
          env,
          url
        );
      }


      if (
        request.method === "GET" &&
        url.pathname ===
          "/health"
      ) {
        return json({
          ok: true,
          service:
            "anjaan-musafir-delivery"
        });
      }


      return json(
        {
          error:
            "Not found."
        },
        404
      );

    } catch (err) {

      console.error(err);

      return json(
        {
          error:
            "Internal server error."
        },
        500
      );
    }
  },
};
