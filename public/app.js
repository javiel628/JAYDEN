const statusEl = document.querySelector("#status");
const resultEl = document.querySelector("#result");
const phoneEl = document.querySelector("#phone");
const pairBtn = document.querySelector("#pairBtn");

async function checkStatus() {
  try {
    const response = await fetch("/api/status");
    const data = await response.json();
    statusEl.innerHTML = `<span class="pulse"></span> ${data.connected ? "Connected" : "Not connected"}`;
    statusEl.style.color = data.connected ? "#75ffc0" : "#a1b7ad";
  } catch {
    statusEl.innerHTML = '<span class="pulse"></span> Backend unavailable';
  }
}

pairBtn.addEventListener("click", async () => {
  const phone = phoneEl.value.replace(/\D/g, "");
  if (phone.length < 10 || phone.length > 15) {
    resultEl.textContent = "Please enter a valid international phone number.";
    return;
  }
  pairBtn.disabled = true;
  pairBtn.textContent = "REQUESTING…";
  try {
    const response = await fetch("/api/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone })
    });
    const data = await response.json();
    resultEl.textContent = data.message || data.error || "Pairing request completed.";
  } catch {
    resultEl.textContent = "Could not reach the pairing backend.";
  } finally {
    pairBtn.disabled = false;
    pairBtn.innerHTML = 'REQUEST PAIRING CODE <span>↗</span>';
  }
});
checkStatus();
setInterval(checkStatus, 10000);
