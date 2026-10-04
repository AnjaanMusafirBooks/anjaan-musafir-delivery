/*
  Add this script to your GitHub Pages product page.
  Replace API_BASE with your deployed Worker URL.

  Cashfree's official web checkout uses its JS SDK and a server-created
  payment session. Do NOT put your Cashfree secret key in this file.
*/

const API_BASE = "https://YOUR-WORKER.workers.dev";
const CASHFREE_MODE = "sandbox";

function loadCashfreeSdk() {
  return new Promise((resolve, reject) => {
    if (window.Cashfree) return resolve();
    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load Cashfree SDK."));
    document.head.appendChild(script);
  });
}

async function buyEbook(productId, customer) {
  await loadCashfreeSdk();

  const response = await fetch(`${API_BASE}/api/create-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      product_id: productId,
      name: customer.name,
      email: customer.email,
      phone: customer.phone
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not create order.");

  const cashfree = Cashfree({ mode: CASHFREE_MODE });

  const result = await cashfree.checkout({
    paymentSessionId: data.payment_session_id,
    redirectTarget: "_self"
  });

  // Cashfree may redirect/callback; final fulfillment must still be
  // verified server-side through /api/payment-status.
  return result;
}

/*
Example:

document.getElementById("buyBtn").addEventListener("click", async () => {
  const name = document.getElementById("customerName").value;
  const email = document.getElementById("customerEmail").value;
  const phone = document.getElementById("customerPhone").value;

  try {
    await buyEbook("DISTRACTION_TRAP", { name, email, phone });
  } catch (e) {
    alert(e.message);
  }
});
*/
