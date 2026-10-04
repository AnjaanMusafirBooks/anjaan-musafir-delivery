# Anjaan Musafir Books — Custom eBook Delivery System

This starter project is designed for:

GitHub Pages website → Cloudflare Worker → Cashfree → D1 → R2 → secure PDF download.

## What is already prepared

- Server-side Cashfree order creation
- Fixed product pricing from D1 (client cannot choose the price)
- Cashfree payment-status verification
- Cashfree webhook signature verification
- Idempotent-ish fulfillment (repeated webhooks do not create multiple paid states)
- D1 order/product/download tables
- R2 private PDF access through Worker
- Temporary download tokens (7 days)
- Download limit (default 3)
- CORS for GitHub Pages
- Cashfree sandbox/production switch
- GitHub website Buy Now example
- Payment-return verification example

Cashfree's current web flow uses a server-created order/payment session, and payment status should be verified server-side. Webhooks must be signature-verified using the raw request body. See official docs:
https://www.cashfree.com/devstudio/preview/pg/web/inlineCheckout
https://www.cashfree.com/devstudio/preview/pg/tools/webhookVerification

Cloudflare D1 and R2 are attached to Workers through bindings:
https://developers.cloudflare.com/workers/runtime-apis/bindings/
https://developers.cloudflare.com/d1/worker-api/
https://developers.cloudflare.com/r2/api/workers/workers-api-reference/

## YOU MUST DO THESE ACCOUNT-SIDE STEPS

### 1. Create Cloudflare Worker

Create a Worker named:

anjaan-musafir-delivery

### 2. Create D1 database

Create:

anjaan-musafir-db

Copy its Database ID into wrangler.jsonc.

### 3. Create R2 bucket

Create:

anjaan-musafir-books

Upload your PDF to:

ebooks/the-distraction-trap.pdf

The object must be private. Do not enable public bucket access for this delivery flow.

### 4. Apply D1 schema

Run:

wrangler d1 execute anjaan-musafir-db --remote --file=./db/schema.sql

Or paste schema.sql into the Cloudflare D1 dashboard query editor.

### 5. Bind D1 and R2

Use the bindings in wrangler.jsonc:

DB = D1 database
BOOKS = R2 bucket

Cloudflare Dashboard also supports:
Worker → Bindings → Add binding → D1 database / R2 bucket.

### 6. Set Worker variables

Change:

FRONTEND_URL
WORKER_PUBLIC_URL

Example:

FRONTEND_URL = https://anjaanmusafirbooks.github.io/vichar
WORKER_PUBLIC_URL = https://anjaan-musafir-delivery.YOUR-SUBDOMAIN.workers.dev

Keep CASHFREE_ENV = sandbox until testing is complete.

### 7. Add Cashfree secrets

In Worker → Settings/Secrets, create:

CASHFREE_CLIENT_ID
CASHFREE_CLIENT_SECRET

Do NOT paste these secrets into GitHub code or into ChatGPT.

### 8. Deploy

Using Wrangler:

npm install
npx wrangler deploy

Or use the Cloudflare dashboard editor.

### 9. Cashfree webhook

Set the webhook/notify URL to:

https://YOUR-WORKER.workers.dev/webhook/cashfree

Use the payment webhook events appropriate for your Cashfree account.

The code verifies the webhook signature before fulfillment and then confirms payment server-to-server.

### 10. GitHub website

Copy website/buy-now.js into your product page and replace:

API_BASE

with your Worker URL.

Add customer fields:

- customerName
- customerEmail
- customerPhone

and a button with id:

buyBtn

Then call:

buyEbook("DISTRACTION_TRAP", { name, email, phone })

### 11. Return/success page

Cashfree returns the customer to:

YOUR_GITHUB_PAGE/?payment=return&order_id=...

The website/success-page.js script calls the backend, which checks Cashfree's payment status before creating a download token.

## Adding another eBook

1. Upload the PDF to R2.
2. Insert a product row into D1:

INSERT INTO products
(product_id, name, price, currency, file_key, file_name, active)
VALUES
('BOOK002', 'Aadaton Ke Paar', 149, 'INR',
 'ebooks/aadaton-ke-paar.pdf', 'Aadaton-Ke-Paar.pdf', 1);

3. Use BOOK002 in the Buy Now button.

## Important security rules

- Never put CASHFREE_CLIENT_SECRET in GitHub Pages JavaScript.
- Never make the R2 bucket public.
- Never trust the amount sent by the browser; the backend reads price from D1.
- Never fulfill based only on a browser callback.
- Webhook signature is verified against the raw request body.
- Cashfree payment status is checked server-to-server before fulfillment.
- Keep Cashfree in sandbox until the complete test flow works.

## Current starter limitations

This is the core payment + delivery system. It does NOT yet include:

- automatic email delivery
- admin dashboard
- coupons
- refunds UI
- GST invoice automation
- watermarking
- advanced anti-sharing/DRM

Those can be added after the core flow is live.
