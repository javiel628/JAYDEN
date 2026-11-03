const statusEl = document.querySelector("#status");
const resultEl = document.querySelector("#result");
const phoneEl = document.querySelector("#phone");
const pairBtn = document.querySelector("#pairBtn");
let pollTimer = null;

async function checkStatus() {
  try {
    const response = await fetch("/api/status");
    const data = await response.json();
    statusEl.innerHTML = `<span class="pulse"></span> ${data.connected ? "Connected" : "Not connected"}`;
    statusEl.style.color = data.connected ? "#75ffc0" : "#a1b7ad";
  } catch {
    statusEl.textContent = "Backend unavailable";
  }
}

pairBtn.addEventListener("click", async () => {
  const phone = phoneEl.value.replace(/\D/g, "");
  if (phone.length < 10 || phone.length > 15) {
    resultEl.textContent = "Enter a valid international number with country code.";
    return;
  }
  pairBtn.disabled = true;
  pairBtn.textContent = "REQUESTING…";
  resultEl.textContent = "Starting pairing request…";
  try {
    const response = await fetch("/api/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Pairing request failed.");
    resultEl.textContent = data.message || "Request started.";
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      try {
        const r = await fetch(`/api/pair/${encodeURIComponent(data.requestId)}`);
        const d = await r.json();
        if (d.code) {
          resultEl.textContent = `Pairing code: ${d.code} — WhatsApp > Linked devices > Link with phone number`;
          clearInterval(pollTimer);
          pollTimer = null;
        } else if (d.error) {
          resultEl.textContent = d.error;
          clearInterval(pollTimer);
          pollTimer = null;
        } else if (d.connected) {
          resultEl.textContent = "WhatsApp linked successfully.";
          clearInterval(pollTimer);
          pollTimer = null;
        }
      } catch {}
    }, 1500);
  } catch (err) {
    resultEl.textContent = err.message || "Could not reach the pairing backend.";
  } finally {
    pairBtn.disabled = false;
    pairBtn.innerHTML = 'REQUEST PAIRING CODE <span>↗</span>';
  }
});
checkStatus();
setInterval(checkStatus, 10000);
