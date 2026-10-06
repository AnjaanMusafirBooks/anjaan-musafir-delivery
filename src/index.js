/* =====================================================================
   Anjaan Musafir Books — Worker (backend) का नक़्शा
   ---------------------------------------------------------------------
   /api/catalog        → सारी किताबों की कीमत + offer (website इसे पढ़ती है)
   /api/product        → एक किताब की कीमत
   /api/create-order   → order बनाना (server कीमत तय करता है) + Cashfree session
   /api/payment-status → पेमेंट जाँचकर download link देना
   /webhook/cashfree   → Cashfree का "पेमेंट हो गया" संदेश (signature जाँचकर)
   /download           → token जाँचकर PDF देना (सीमित समय/बार)
   /api/my-order       → Order ID + email से दोबारा download link
   /api/admin/*        → admin page के लिए (ADMIN_KEY password से सुरक्षित)
   Secrets (Cloudflare में): CASHFREE_CLIENT_ID, CASHFREE_CLIENT_SECRET, ADMIN_KEY,
                             (वैकल्पिक) BREVO_API_KEY, BREVO_SENDER
   ===================================================================== */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-key",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, ...extra },
  });
}

function text(data, status = 200, extra = {}) {
  return new Response(data, {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "text/plain; charset=utf-8", ...extra },
  });
}

function cleanEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validPhone(phone) {
  return /^[6-9]\d{9}$/.test(String(phone || ""));
}

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
  try { data = JSON.parse(body); } catch { data = { raw: body }; }
  return { res, data };
}

function makeOrderId() {
  return `AMB_${Date.now()}_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
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
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
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
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return bytesToBase64(new Uint8Array(sig));
}

function constantTimeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function verifyCashfreeWebhook(request, env, rawBody) {
  const timestamp = request.headers.get("x-webhook-timestamp") || "";
  const signature = request.headers.get("x-webhook-signature") || "";
  if (!timestamp || !signature || !env.CASHFREE_CLIENT_SECRET) return false;

  const expected = await hmacSha256Base64(
    env.CASHFREE_CLIENT_SECRET,
    timestamp + rawBody
  );
  return constantTimeEqual(expected, signature);
}

async function getOrderPaymentStatus(env, orderId) {
  const { res, data } = await cfFetch(env, `/orders/${encodeURIComponent(orderId)}/payments`, {
    method: "GET",
  });
  if (!res.ok) {
    throw new Error(`Cashfree payment lookup failed (${res.status})`);
  }

  const payments = Array.isArray(data) ? data : [];
  if (payments.some(p => p.payment_status === "SUCCESS")) return "SUCCESS";
  if (payments.some(p => p.payment_status === "PENDING")) return "PENDING";
  return "FAILED";
}

async function issueDownloadToken(env, orderId) {
  const existing = await env.DB.prepare(
    "SELECT token, expires_at FROM downloads WHERE order_id = ?1 ORDER BY id DESC LIMIT 1"
  ).bind(orderId).first();

  if (existing && new Date(existing.expires_at).getTime() > Date.now()) {
    return existing.token;
  }

  const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    "INSERT INTO downloads (order_id, token, expires_at, download_count) VALUES (?1, ?2, ?3, 0)"
  ).bind(orderId, token, expiresAt).run();

  return token;
}

async function markOrderPaidAndToken(env, orderId) {
  const order = await env.DB.prepare(
    "SELECT * FROM orders WHERE order_id = ?1 LIMIT 1"
  ).bind(orderId).first();

  if (!order) return null;

  let firstTime = false; // क्या यह पहली बार PAID हो रहा है? (email सिर्फ़ तभी जाए)
  if (order.payment_status !== "PAID") {
    firstTime = true;
    await env.DB.prepare(
      "UPDATE orders SET payment_status = 'PAID', paid_at = CURRENT_TIMESTAMP WHERE order_id = ?1"
    ).bind(orderId).run();

    // coupon लगा था तो उसका इस्तेमाल +1 (सिर्फ़ पहली बार PAID होने पर)
    try {
      await env.DB.prepare(
        "UPDATE coupons SET used_count = used_count + 1 WHERE code = (SELECT coupon_code FROM order_discounts WHERE order_id = ?1)"
      ).bind(orderId).run();
    } catch (e) { console.error(e); }
  }

  const token = await issueDownloadToken(env, orderId);

  if (firstTime) {
    await sendOrderEmail(env, order, token);
  }

  return token;
}


// ---------- Email (Brevo, मुफ़्त) — BREVO_API_KEY और BREVO_SENDER न हों तो चुपचाप छोड़ देता है ----------
// ---------- Email (Brevo Template) ----------
async function sendOrderEmail(env, order, token) {
  if (!env.BREVO_API_KEY) return;

  try {
    const p = await env.DB.prepare(
      "SELECT name FROM products WHERE product_id = ?1"
    ).bind(order.product_id).first();

    const downloadUrl =
      `${env.WORKER_PUBLIC_URL.replace(/\/$/, "")}/download?token=${encodeURIComponent(token)}`;

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        sender: {
          name: "Anjaan Musafir Books",
          email: "officialsuperswagg@gmail.com"
        },

        to: [{
          email: order.customer_email,
          name: order.customer_name || undefined
        }],

        templateId: 1,

        params: {
          customer_name: order.customer_name || "",
          book_name: p ? p.name : "",
          order_id: order.order_id,
          amount: Number(order.amount || 0),
          download_url: downloadUrl
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Brevo email failed:", response.status, errorText);
    }
  } catch (e) {
    console.error("Brevo email error:", e);
  }
}

// ---------- Mera Order: Order ID + email मिलाकर नया download link ----------
async function handleMyOrder(request, env) {
  let b;

  try {
    b = await request.json();
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  const orderId = String(b.order_id || "").trim();
  const email = String(b.email || "").trim().toLowerCase();

  if (!orderId || !email) {
    return json({ error: "Order ID और email दोनों भरें।" }, 400);
  }

  const o = await env.DB.prepare(
    "SELECT * FROM orders WHERE order_id = ?1 LIMIT 1"
  ).bind(orderId).first();

  // गलत जानकारी पर हमेशा एक ही संदेश (ताकि कोई order ID का अंदाज़ा न लगा सके)
  if (
    !o ||
    String(o.customer_email).toLowerCase() !== email ||
    o.payment_status !== "PAID"
  ) {
    return json({
      error: "ऐसा कोई पूरा हुआ order नहीं मिला। Order ID और email दोबारा जाँचें।"
    }, 404);
  }

  const token = await issueDownloadToken(env, orderId);

  return json({
    ok: true,
    download_url:
      `${env.WORKER_PUBLIC_URL.replace(/\/$/, "")}/download?token=${encodeURIComponent(token)}`
  });
}


/* ======================================================
   भाव (price) तय करने वाला हिस्सा — offer + coupon
   सारा हिसाब SERVER पर होता है, customer कीमत बदल नहीं सकता।
   ====================================================== */

// दो दशमलव तक गोल करना
function r2(n) {
  return Math.round(n * 100) / 100;
}

// क्या offer/coupon अभी चालू है? (active + शुरू/ख़त्म का समय)
function isLive(row, endKey) {
  if (!row || !row.active) return false;

  const now = Date.now();

  if (row.starts_at && Date.parse(row.starts_at) > now) return false;
  if (row[endKey] && Date.parse(row[endKey]) < now) return false;

  return true;
}

// किताब का offer (अगर चालू हो)। नए table न बने हों तो चुपचाप null — पुराना सिस्टम चलता रहेगा।
async function getOffer(env, productId) {
  try {
    const o = await env.DB.prepare(
      "SELECT * FROM offers WHERE product_id = ?1 LIMIT 1"
    ).bind(productId).first();

    return isLive(o, "ends_at") ? o : null;
  } catch {
    return null;
  }
}

// अंतिम कीमत: सामान्य price → offer → coupon (इसी क्रम में)
async function priceFor(env, product, couponCode) {
  let base = Number(product.price),
      mrp = null,
      label = null;

  const offer = await getOffer(env, product.product_id);

  if (offer) {
    if (offer.sale_price != null) {
      base = Number(offer.sale_price);
    }

    if (offer.mrp != null) {
      mrp = Number(offer.mrp);
    }

    label = offer.label || null;
  }

  let discount = 0,
      coupon = null,
      couponError = null;

  const code = String(couponCode || "").trim().toUpperCase();

  if (code) {
    let c = null;

    try {
      c = await env.DB.prepare(
        "SELECT * FROM coupons WHERE code = ?1 LIMIT 1"
      ).bind(code).first();
    } catch {}

    if (!c || !isLive(c, "expires_at")) {
      couponError = "यह coupon सही या चालू नहीं है।";
    }

    else if (
      c.max_uses != null &&
      Number(c.used_count) >= Number(c.max_uses)
    ) {
      couponError = "इस coupon की सीमा पूरी हो चुकी है।";
    }

    else if (
      c.product_ids &&
      c.product_ids !== "*" &&
      !c.product_ids
        .split(",")
        .map((s) => s.trim())
        .includes(product.product_id)
    ) {
      couponError = "यह coupon इस किताब पर नहीं चलता।";
    }

    else if (
      c.min_amount != null &&
      base < Number(c.min_amount)
    ) {
      couponError = "यह coupon इस कीमत पर नहीं चलता।";
    }

    else {
      discount =
        c.discount_type === "PERCENT"
          ? r2(base * Number(c.discount_value) / 100)
          : Number(c.discount_value);

      coupon = c.code;
    }
  }

  // Cashfree में कम से कम ₹1 चाहिए, इसलिए कीमत 1 से नीचे नहीं जाने देते
  const final = Math.max(1, r2(base - discount));

  return {
    base,
    mrp,
    label,
    discount: r2(base - final),
    final,
    coupon,
    couponError
  };
}

// admin का password सही है या नहीं (Cloudflare में ADMIN_KEY secret से मिलाया जाता है)
function isAdmin(request, env) {
  const k = request.headers.get("x-admin-key") || "";

  return Boolean(env.ADMIN_KEY) &&
    k.length > 0 &&
    constantTimeEqual(k, env.ADMIN_KEY);
}

// PDF लाना: पहले R2 (अगर जुड़ा हो), वरना Static Assets (public/books/ वाली फ़ाइलें)
async function fetchBookFile(env, request, key) {
  const clean = String(key || "")
    .replace(/^\/+/, "")
    .replace(/^public\//, "");

  if (env.BOOKS) {
    const o = await env.BOOKS.get(key);

    if (o) {
      return { body: o.body };
    }
  }

  if (env.ASSETS) {
    for (const path of [clean, "books/" + clean]) {
      const r = await env.ASSETS.fetch(
        new Request(new URL("/" + path, request.url))
      );

      if (r.ok) {
        return { body: r.body };
      }
    }
  }

  return null;
}


async function handleCreateOrder(request, env) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  const productId = String(body.product_id || "").trim();
  const email = cleanEmail(body.email);
  const phone = String(body.phone || "").replace(/\D/g, "");
  const name = String(body.name || "").trim().slice(0, 100);

  /*
    Name + Email mandatory.
    Mobile optional है।
    अगर mobile दिया गया है तो ही उसकी validation होगी।
  */
  if (!productId || !name || !validEmail(email)) {
    return json({
      error: "Product, customer name and valid email are required.",
    }, 400);
  }

  if (phone && !validPhone(phone)) {
    return json({
      error: "If provided, mobile number must be a valid 10-digit Indian phone number.",
    }, 400);
  }

  const product = await env.DB.prepare(
    "SELECT * FROM products WHERE product_id = ?1 AND active = 1 LIMIT 1"
  ).bind(productId).first();

  if (!product) {
    return json({
      error: "Product not found or inactive."
    }, 404);
  }

  // offer + coupon लगाकर असली कीमत (server तय करता है)
  const pr = await priceFor(env, product, body.coupon);

  if (pr.couponError) {
    return json({
      error: pr.couponError,
      coupon_error: pr.couponError
    }, 400);
  }

  const orderId = makeOrderId();

  const returnUrl =
    `${env.FRONTEND_URL.replace(/\/$/, "")}/?payment=return&order_id=${encodeURIComponent(orderId)}`;

  const notifyUrl =
    `${env.WORKER_PUBLIC_URL.replace(/\/$/, "")}/webhook/cashfree`;

  /*
    IMPORTANT:
    Mobile number D1 में save किया जा सकता है,
    लेकिन Cashfree को customer_phone नहीं भेजा जाता।
    इससे mobile optional भी रहता है और Cashfree customer details
    में अनावश्यक dependency भी नहीं रहती।
  */
  const cfPayload = {
    order_id: orderId,
    order_amount: pr.final,
    order_currency: "INR",

    customer_details: {
      customer_id:
        `cust_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`,

      customer_name: name,
      customer_email: email,
    },

    order_meta: {
      return_url: returnUrl,
      notify_url: notifyUrl,
    },

    order_note: product.name,
  };

  const { res, data } = await cfFetch(env, "/orders", {
    method: "POST",

    headers: {
      "x-idempotency-key": crypto.randomUUID()
    },

    body: JSON.stringify(cfPayload),
  });

  /*
    Cashfree की technical error details customer को नहीं दिखानी हैं।
    Server logs में details रखी जाती हैं ताकि debugging हो सके।
  */
  if (!res.ok) {
    console.error(
      "Cashfree order creation failed:",
      res.status,
      data
    );

    return json({
      error: "Payment service is temporarily unavailable. Please try again.",
    }, 502);
  }

  await env.DB.prepare(
    `INSERT INTO orders
      (order_id, product_id, customer_name, customer_email, customer_phone, amount, payment_status)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'CREATED')`
  ).bind(
    orderId,
    productId,
    name,
    email,
    phone || null,
    pr.final
  ).run();

  // किस order में कौन सा coupon लगा — सिर्फ़ रिकॉर्ड के लिए (फेल हो तो पेमेंट नहीं रुकेगा)
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
    amount: pr.final,
    product_name: product.name,
  });
}


async function handlePaymentStatus(request, env) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("order_id");

  if (!orderId) {
    return json({ error: "order_id is required." }, 400);
  }

  const order = await env.DB.prepare(
    "SELECT * FROM orders WHERE order_id = ?1 LIMIT 1"
  ).bind(orderId).first();

  if (!order) {
    return json({ error: "Order not found." }, 404);
  }

  const status = await getOrderPaymentStatus(env, orderId);

  if (status === "SUCCESS") {
    const token = await markOrderPaidAndToken(env, orderId);

    return json({
      order_id: orderId,
      status: "PAID",
      product_id: order.product_id,

      download_url:
        `${env.WORKER_PUBLIC_URL.replace(/\/$/, "")}/download?token=${encodeURIComponent(token)}`,
    });
  }

  if (status === "PENDING") {
    await env.DB.prepare(
      "UPDATE orders SET payment_status = 'PENDING' WHERE order_id = ?1 AND payment_status != 'PAID'"
    ).bind(orderId).run();

    return json({
      order_id: orderId,
      status: "PENDING"
    });
  }

  await env.DB.prepare(
    "UPDATE orders SET payment_status = 'FAILED' WHERE order_id = ?1 AND payment_status != 'PAID'"
  ).bind(orderId).run();

  return json({
    order_id: orderId,
    status: "FAILED"
  });
}


async function handleWebhook(request, env) {
  const rawBody = await request.text();

  if (!(await verifyCashfreeWebhook(request, env, rawBody))) {
    return text("Invalid webhook signature.", 401);
  }

  let payload;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return text("Invalid JSON.", 400);
  }

  const orderId =
    payload?.data?.order?.order_id ||
    payload?.data?.order_id ||
    payload?.order_id;

  if (!orderId) {
    return text("Webhook accepted: no order id.", 200);
  }

  // Do not trust the webhook's payment status alone.
  // Confirm it server-to-server with Cashfree.
  try {
    const status = await getOrderPaymentStatus(env, orderId);

    if (status === "SUCCESS") {
      await markOrderPaidAndToken(env, orderId);
    }

    else if (status === "PENDING") {
      await env.DB.prepare(
        "UPDATE orders SET payment_status = 'PENDING' WHERE order_id = ?1 AND payment_status != 'PAID'"
      ).bind(orderId).run();
    }

  } catch (err) {
    console.error("Webhook verification error:", err);
    return text("Temporary verification failure.", 500);
  }

  return text("OK", 200);
}


async function handleDownload(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return text("Missing download token.", 400);
  }

  const row = await env.DB.prepare(
    `SELECT d.*, o.payment_status, o.product_id, p.file_key, p.file_name, p.name
     FROM downloads d
     JOIN orders o ON o.order_id = d.order_id
     JOIN products p ON p.product_id = o.product_id
     WHERE d.token = ?1
     LIMIT 1`
  ).bind(token).first();

  if (!row) {
    return text("Invalid download link.", 404);
  }

  if (row.payment_status !== "PAID") {
    return text("Payment not verified.", 403);
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return text("Download link expired.", 410);
  }

  const maxDownloads = Number(env.MAX_DOWNLOADS || 3);

  if (Number(row.download_count) >= maxDownloads) {
    return text("Download limit reached.", 429);
  }

  const object = await fetchBookFile(
    env,
    request,
    row.file_key
  );

  if (!object) {
    return text("File not found.", 404);
  }

  await env.DB.prepare(
    "UPDATE downloads SET download_count = download_count + 1, last_download_at = CURRENT_TIMESTAMP WHERE id = ?1"
  ).bind(row.id).run();

  const headers = new Headers();

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

  return new Response(object.body, {
    headers
  });
}


async function handleProduct(request, env) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("product_id");

  if (!productId) {
    return json({
      error: "product_id is required."
    }, 400);
  }

  const product = await env.DB.prepare(
    "SELECT product_id, name, price, currency FROM products WHERE product_id = ?1 AND active = 1 LIMIT 1"
  ).bind(productId).first();

  if (!product) {
    return json({
      error: "Product not found."
    }, 404);
  }

  return json(product);
}


// एक ही call में सारी किताबों की कीमत+offer (D1 पर कम बोझ, 30 सेकंड cache)
async function handleCatalog(env) {
  const { results } = await env.DB.prepare(
    "SELECT product_id, name, price FROM products WHERE active = 1"
  ).all();

  const out = {};

  for (const p of results) {
    const o = await getOffer(
      env,
      p.product_id
    );

    out[p.product_id] = {
      price:
        o && o.sale_price != null
          ? Number(o.sale_price)
          : Number(p.price),

      mrp:
        o && o.mrp != null
          ? Number(o.mrp)
          : null,

      label:
        o
          ? o.label || null
          : null,
    };
  }

  return json(
    { products: out },
    200,
    {
      "Cache-Control": "public, max-age=30"
    }
  );
}


// ADMIN: सब कुछ ADMIN_KEY (password) से सुरक्षित
async function handleAdmin(request, env, url) {
  if (!isAdmin(request, env)) {
    return json({
      error: "Password गलत है।"
    }, 401);
  }

  const path = url.pathname;

  const nz = (v) =>
    (v === "" || v === undefined || v === null
      ? null
      : v);

  const num = (v) =>
    (nz(v) === null
      ? null
      : Number(v));


  if (
    request.method === "GET" &&
    path === "/api/admin/data"
  ) {
    const products =
      (await env.DB.prepare(
        "SELECT product_id, name, price, active FROM products"
      ).all()).results;

    const offers =
      (await env.DB.prepare(
        "SELECT * FROM offers"
      ).all()).results;

    const coupons =
      (await env.DB.prepare(
        "SELECT * FROM coupons ORDER BY rowid DESC"
      ).all()).results;

    return json({
      products,
      offers,
      coupons
    });
  }


  if (request.method !== "POST") {
    return json({
      error: "Not found."
    }, 404);
  }

  let b;

  try {
    b = await request.json();
  } catch {
    return json({
      error: "Invalid JSON."
    }, 400);
  }


  if (path === "/api/admin/price") {
    // किताब की सामान्य कीमत बदलना

    if (!(Number(b.price) >= 1)) {
      return json({
        error: "कीमत कम से कम ₹1 हो।"
      }, 400);
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


  if (path === "/api/admin/offer") {
    // offer चालू/बदलना

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


  if (path === "/api/admin/coupon") {
    // coupon बनाना/बदलना

    const code =
      String(b.code || "")
        .trim()
        .toUpperCase();

    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
      return json({
        error: "Code 3-30 अक्षर/अंक का हो।"
      }, 400);
    }

    if (
      !["PERCENT", "FLAT"].includes(b.discount_type) ||
      !(Number(b.discount_value) > 0)
    ) {
      return json({
        error: "Discount सही भरें।"
      }, 400);
    }

    if (
      b.discount_type === "PERCENT" &&
      Number(b.discount_value) > 100
    ) {
      return json({
        error: "प्रतिशत 100 से ज़्यादा नहीं।"
      }, 400);
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
      Number(b.discount_value),
      nz(b.product_ids) || "*",
      num(b.min_amount),
      num(b.max_uses),
      nz(b.starts_at),
      nz(b.expires_at),
      b.active === false ? 0 : 1
    ).run();

    return json({
      ok: true
    });
  }


  if (path === "/api/admin/coupon-delete") {
    await env.DB.prepare(
      "DELETE FROM coupons WHERE code = ?1"
    ).bind(
      String(b.code || "").toUpperCase()
    ).run();

    return json({
      ok: true
    });
  }


  return json({
    error: "Not found."
  }, 404);
}


export default {
  async fetch(request, env) {
if (new URL(request.url).pathname === "/api/diagnostic") {
  return json({
    cashfree_env: env.CASHFREE_ENV || "MISSING",
    client_id_present: !!env.CASHFREE_CLIENT_ID,
    client_id_length: env.CASHFREE_CLIENT_ID?.length || 0,
    client_secret_present: !!env.CASHFREE_CLIENT_SECRET,
    client_secret_length: env.CASHFREE_CLIENT_SECRET?.length || 0,
    worker_public_url: env.WORKER_PUBLIC_URL || "MISSING"
  });
}
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: CORS_HEADERS
      });
    }

    const url = new URL(request.url);

    try {

      if (
        request.method === "POST" &&
        url.pathname === "/api/create-order"
      ) {
        return await handleCreateOrder(
          request,
          env
        );
      }


      if (
        request.method === "GET" &&
        url.pathname === "/api/payment-status"
      ) {
        return await handlePaymentStatus(
          request,
          env
        );
      }


      if (
        request.method === "POST" &&
        url.pathname === "/webhook/cashfree"
      ) {
        return await handleWebhook(
          request,
          env
        );
      }


      if (
        request.method === "GET" &&
        url.pathname === "/download"
      ) {
        return await handleDownload(
          request,
          env
        );
      }


      if (
        request.method === "GET" &&
        url.pathname === "/api/product"
      ) {
        return await handleProduct(
          request,
          env
        );
      }


      if (
        request.method === "POST" &&
        url.pathname === "/api/my-order"
      ) {
        return await handleMyOrder(
          request,
          env
        );
      }


      if (
        request.method === "GET" &&
        url.pathname === "/api/catalog"
      ) {
        return await handleCatalog(env);
      }


      if (url.pathname.startsWith("/api/admin/")) {
        return await handleAdmin(
          request,
          env,
          url
        );
      }


      if (
        request.method === "GET" &&
        url.pathname === "/health"
      ) {
        return json({
          ok: true,
          service: "anjaan-musafir-delivery"
        });
      }


      return json({
        error: "Not found."
      }, 404);

    } catch (err) {

      console.error(err);

      return json({
        error: "Internal server error."
      }, 500);
    }
  },
};
