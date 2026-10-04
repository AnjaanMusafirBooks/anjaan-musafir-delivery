const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
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

  if (order.payment_status !== "PAID") {
    await env.DB.prepare(
      "UPDATE orders SET payment_status = 'PAID', paid_at = CURRENT_TIMESTAMP WHERE order_id = ?1"
    ).bind(orderId).run();
  }

  return issueDownloadToken(env, orderId);
}

async function handleCreateOrder(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }

  const productId = String(body.product_id || "").trim();
  const email = cleanEmail(body.email);
  const phone = String(body.phone || "").replace(/\D/g, "");
  const name = String(body.name || "").trim().slice(0, 100);

  if (!productId || !validEmail(email) || !validPhone(phone)) {
    return json({ error: "Product, valid email and 10-digit Indian phone are required." }, 400);
  }

  const product = await env.DB.prepare(
    "SELECT * FROM products WHERE product_id = ?1 AND active = 1 LIMIT 1"
  ).bind(productId).first();

  if (!product) return json({ error: "Product not found or inactive." }, 404);

  const orderId = makeOrderId();
  const returnUrl = `${env.FRONTEND_URL.replace(/\/$/, "")}/?payment=return&order_id=${encodeURIComponent(orderId)}`;
  const notifyUrl = `${env.WORKER_PUBLIC_URL.replace(/\/$/, "")}/webhook/cashfree`;

  const cfPayload = {
    order_id: orderId,
    order_amount: Number(product.price),
    order_currency: "INR",
    customer_details: {
      customer_id: `cust_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`,
      customer_name: name || undefined,
      customer_email: email,
      customer_phone: phone,
    },
    order_meta: {
      return_url: returnUrl,
      notify_url: notifyUrl,
    },
    order_note: product.name,
  };

  const { res, data } = await cfFetch(env, "/orders", {
    method: "POST",
    headers: { "x-idempotency-key": crypto.randomUUID() },
    body: JSON.stringify(cfPayload),
  });

  if (!res.ok) {
    return json({
      error: "Cashfree order creation failed.",
      details: data,
    }, 502);
  }

  await env.DB.prepare(
    `INSERT INTO orders
      (order_id, product_id, customer_name, customer_email, customer_phone, amount, payment_status)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'CREATED')`
  ).bind(orderId, productId, name || null, email, phone, Number(product.price)).run();

  return json({
    order_id: orderId,
    payment_session_id: data.payment_session_id,
    amount: Number(product.price),
    product_name: product.name,
  });
}

async function handlePaymentStatus(request, env) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("order_id");
  if (!orderId) return json({ error: "order_id is required." }, 400);

  const order = await env.DB.prepare(
    "SELECT * FROM orders WHERE order_id = ?1 LIMIT 1"
  ).bind(orderId).first();

  if (!order) return json({ error: "Order not found." }, 404);

  const status = await getOrderPaymentStatus(env, orderId);

  if (status === "SUCCESS") {
    const token = await markOrderPaidAndToken(env, orderId);
    return json({
      order_id: orderId,
      status: "PAID",
      product_id: order.product_id,
      download_url: `${env.WORKER_PUBLIC_URL.replace(/\/$/, "")}/download?token=${encodeURIComponent(token)}`,
    });
  }

  if (status === "PENDING") {
    await env.DB.prepare(
      "UPDATE orders SET payment_status = 'PENDING' WHERE order_id = ?1 AND payment_status != 'PAID'"
    ).bind(orderId).run();
    return json({ order_id: orderId, status: "PENDING" });
  }

  await env.DB.prepare(
    "UPDATE orders SET payment_status = 'FAILED' WHERE order_id = ?1 AND payment_status != 'PAID'"
  ).bind(orderId).run();

  return json({ order_id: orderId, status: "FAILED" });
}

async function handleWebhook(request, env) {
  const rawBody = await request.text();

  if (!(await verifyCashfreeWebhook(request, env, rawBody))) {
    return text("Invalid webhook signature.", 401);
  }

  let payload;
  try { payload = JSON.parse(rawBody); } catch { return text("Invalid JSON.", 400); }

  const orderId =
    payload?.data?.order?.order_id ||
    payload?.data?.order_id ||
    payload?.order_id;

  if (!orderId) return text("Webhook accepted: no order id.", 200);

  // Do not trust the webhook's payment status alone.
  // Confirm it server-to-server with Cashfree.
  try {
    const status = await getOrderPaymentStatus(env, orderId);

    if (status === "SUCCESS") {
      await markOrderPaidAndToken(env, orderId);
    } else if (status === "PENDING") {
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

  if (!token) return text("Missing download token.", 400);

  const row = await env.DB.prepare(
    `SELECT d.*, o.payment_status, o.product_id, p.file_key, p.file_name, p.name
     FROM downloads d
     JOIN orders o ON o.order_id = d.order_id
     JOIN products p ON p.product_id = o.product_id
     WHERE d.token = ?1
     LIMIT 1`
  ).bind(token).first();

  if (!row) return text("Invalid download link.", 404);
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

  const assetPath = `/books/${String(row.file_key).replace(/^\/?books\//, "")}`;

  const assetUrl = new URL(assetPath, request.url);

  const assetResponse = await env.ASSETS.fetch(
    new Request(assetUrl.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/pdf"
      }
    })
  );

  if (!assetResponse.ok) {
    return text("File not found.", 404);
  }

  await env.DB.prepare(
    "UPDATE downloads SET download_count = download_count + 1, last_download_at = CURRENT_TIMESTAMP WHERE id = ?1"
  ).bind(row.id).run();

  const headers = new Headers(assetResponse.headers);

  headers.set(
    "Content-Disposition",
    `attachment; filename="${String(
      row.file_name || "ebook.pdf"
    ).replace(/["\r\n]/g, "")}"`
  );

  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Type", "application/pdf");

  return new Response(assetResponse.body, {
    status: 200,
    headers
  });
}

    const url = new URL(request.url);

    try {
      if (request.method === "POST" && url.pathname === "/api/create-order") {
        return await handleCreateOrder(request, env);
      }

      if (request.method === "GET" && url.pathname === "/api/payment-status") {
        return await handlePaymentStatus(request, env);
      }

      if (request.method === "POST" && url.pathname === "/webhook/cashfree") {
        return await handleWebhook(request, env);
      }

      if (request.method === "GET" && url.pathname === "/download") {
        return await handleDownload(request, env);
      }

      if (request.method === "GET" && url.pathname === "/api/product") {
        return await handleProduct(request, env);
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "anjaan-musafir-delivery" });
      }

      return json({ error: "Not found." }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: "Internal server error." }, 500);
    }
  },
};
