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
  "Access-Control-Allow-Headers": "Content-Type, x-admin-key",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
    {
      method: "GET",
    }
  );

  if (!res.ok) {
    throw new Error(
      `Cashfree payment lookup failed (${res.status})`
    );
  }

  const payments = Array.isArray(data) ? data : [];

  if (
    payments.some(
      p => p.payment_status === "SUCCESS"
    )
  ) {
    return "SUCCESS";
  }

  if (
    payments.some(
      p => p.payment_status === "PENDING"
    )
  ) {
    return "PENDING";
  }

  return "FAILED";
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

async function markOrderPaidAndToken(env, orderId) {
  const order = await env.DB.prepare(
    "SELECT * FROM orders WHERE order_id = ?1 LIMIT 1"
  ).bind(orderId).first();

  if (!order) return null;

  let firstTime = false;

  if (order.payment_status !== "PAID") {
    firstTime = true;

    await env.DB.prepare(
      "UPDATE orders SET payment_status = 'PAID', paid_at = CURRENT_TIMESTAMP WHERE order_id = ?1"
    ).bind(orderId).run();

    try {
      await env.DB.prepare(
        "UPDATE coupons SET used_count = used_count + 1 WHERE code = (SELECT coupon_code FROM order_discounts WHERE order_id = ?1)"
      ).bind(orderId).run();
    } catch (e) {
      console.error(e);
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

async function sendOrderEmail(env, order, token) {
  if (!env.BREVO_API_KEY) return;

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

    const senderEmail =
      env.BREVO_SENDER || "officialsuperswagg@gmail.com";

    const response = await fetch(
      "https://api.brevo.com/v3/smtp/email",
      {
        method: "POST",
        headers: {
          "api-key": env.BREVO_API_KEY,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          sender: {
            name: "Anjaan Musafir Books",
            email: senderEmail
          },
          to: [{
            email: order.customer_email,
            name: order.customer_name || undefined
          }],
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
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Brevo email failed:", response.status, errorText);
    } else {
      const result = await response.text();
      console.log("Brevo email accepted:", result);
    }
  } catch (e) {
    console.error("Brevo email error:", e);
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

  return json({
    ok: true,
    order_id: orderId,
    product_id: o.product_id,
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
  if (!row || !row.active) return false;

  const now = Date.now();

  if (
    row.starts_at &&
    Date.parse(row.starts_at) > now
  ) {
    return false;
  }

  if (
    row[endKey] &&
    Date.parse(row[endKey]) < now
  ) {
    return false;
  }

  return true;
}

async function getOffer(env, productId) {
  try {
    const o = await env.DB.prepare(
      "SELECT * FROM offers WHERE product_id = ?1 LIMIT 1"
    ).bind(productId).first();

    return isLive(o, "ends_at")
      ? o
      : null;

  } catch {
    return null;
  }
}

async function priceFor(
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

  if (offer) {
    if (offer.sale_price != null) {
      base =
        Number(offer.sale_price);
    }

    if (offer.mrp != null) {
      mrp =
        Number(offer.mrp);
    }

    label =
      offer.label || null;
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
      !c.product_ids
        .split(",")
        .map(
          s => s.trim()
        )
        .includes(
          product.product_id
        )
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
      discount =
        c.discount_type === "PERCENT"
          ? r2(
              base *
              Number(c.discount_value) /
              100
            )
          : Number(c.discount_value);

      coupon = c.code;
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

  if (env.BOOKS) {
    const o =
      await env.BOOKS.get(key);

    if (o) {
      return {
        body: o.body
      };
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
  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  const productId = String(body.product_id || "").trim();
  const code = String(body.coupon || "").trim().toUpperCase();

  if (!productId || !code) {
    return json({ error: "Product और coupon code दोनों जरूरी हैं।" }, 400);
  }

  const product = await env.DB.prepare(
    "SELECT * FROM products WHERE product_id = ?1 AND active = 1 LIMIT 1"
  ).bind(productId).first();

  if (!product) {
    return json({ error: "Product not found or inactive." }, 404);
  }

  const pr = await priceFor(env, product, code);

  if (pr.couponError || !pr.coupon) {
    return json({
      valid: false,
      error: pr.couponError || "यह coupon सही या चालू नहीं है।"
    }, 400);
  }

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
  let body;

  try {
    body =
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
    return json(
      {
        error:
          "Product, customer name, valid email and mobile number are required.",
      },
      400
    );
  }

  if (!validPhone(phone)) {
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

  const returnUrl =
    `${env.FRONTEND_URL.replace(/\/$/, "")}/?payment=return&order_id=${encodeURIComponent(orderId)}`;

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
    const token =
      await markOrderPaidAndToken(
        env,
        orderId
      );

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


  if (status === "PENDING") {
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


    if (status === "SUCCESS") {
      await markOrderPaidAndToken(
        env,
        orderId
      );
    }

    else if (
      status === "PENDING"
    ) {
      await env.DB.prepare(
        "UPDATE orders SET payment_status = 'PENDING' WHERE order_id = ?1 AND payment_status != 'PAID'"
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
      `SELECT d.*, o.payment_status, o.product_id, p.file_key, p.file_name, p.name
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
  const { results } =
    await env.DB.prepare(
      "SELECT product_id, name, price FROM products WHERE active = 1"
    ).all();


  const out = {};


  for (const p of results) {
    const o =
      await getOffer(
        env,
        p.product_id
      );


    out[p.product_id] = {
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
  if (
    !isAdmin(
      request,
      env
    )
  ) {
    return json(
      {
        error:
          "Password गलत है।"
      },
      401
    );
  }


  const path =
    url.pathname;


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
      b.product_id,
      num(b.mrp),
      num(b.sale_price),
      nz(b.label),
      nz(b.starts_at),
      nz(b.ends_at),
      b.active ? 1 : 0
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
    await env.DB.prepare(
      "DELETE FROM coupons WHERE code = ?1"
    ).bind(
      String(
        b.code || ""
      ).toUpperCase()
    ).run();


    return json({
      ok: true
    });
  }


  return json(
    {
      error:
        "Not found."
    },
    404
  );
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
      return json({
        cashfree_env:
          env.CASHFREE_ENV ||
          "MISSING",

        client_id_present:
          !!env.CASHFREE_CLIENT_ID,

        client_id_length:
          env.CASHFREE_CLIENT_ID?.length ||
          0,

        client_secret_present:
          !!env.CASHFREE_CLIENT_SECRET,

        client_secret_length:
          env.CASHFREE_CLIENT_SECRET?.length ||
          0,

        worker_public_url:
          env.WORKER_PUBLIC_URL ||
          "MISSING"
      });
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
