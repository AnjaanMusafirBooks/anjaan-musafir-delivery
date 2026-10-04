/*
  Put this logic on the same GitHub page used as Cashfree's return_url.
  It reads ?payment=return&order_id=... and asks the backend to verify
  the payment before showing the download link.
*/

const API_BASE = "https://YOUR-WORKER.workers.dev";

async function verifyAndShowDownload() {
  const params = new URLSearchParams(location.search);
  const orderId = params.get("order_id");

  if (!orderId) return;

  const statusBox = document.getElementById("paymentStatus");
  const downloadBox = document.getElementById("downloadBox");

  try {
    statusBox.textContent = "Checking your payment…";

    const res = await fetch(
      `${API_BASE}/api/payment-status?order_id=${encodeURIComponent(orderId)}`
    );
    const data = await res.json();

    if (data.status === "PAID") {
      statusBox.textContent = "Payment successful ✅";
      downloadBox.innerHTML =
        `<a href="${data.download_url}" target="_blank" rel="noopener">Download eBook 📕</a>`;
    } else if (data.status === "PENDING") {
      statusBox.textContent = "Payment is still being confirmed. Please wait and refresh.";
    } else {
      statusBox.textContent = "Payment was not successful.";
    }
  } catch (e) {
    statusBox.textContent = "Could not verify payment right now. Please try again.";
  }
}

verifyAndShowDownload();
