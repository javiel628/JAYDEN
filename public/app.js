const statusEl = document.querySelector("#status");
const resultEl = document.querySelector("#result");
const phoneEl = document.querySelector("#phone");
const pairBtn = document.querySelector("#pairBtn");
const copyBtn = document.querySelector("#copyBtn");

let pollTimer = null;
let currentPairingCode = "";

function showPairingCode(code) {
  currentPairingCode = String(code).trim();

  resultEl.textContent =
    `Pairing code: ${currentPairingCode} — WhatsApp > Linked devices > Link with phone number`;

  copyBtn.hidden = false;
  copyBtn.textContent = "COPY CODE";
  copyBtn.disabled = false;
}

function hideCopyButton() {
  currentPairingCode = "";

  copyBtn.hidden = true;
  copyBtn.textContent = "COPY CODE";
  copyBtn.disabled = false;
}

async function checkStatus() {
  try {
    const response = await fetch("/api/status");
    const data = await response.json();

    statusEl.innerHTML =
      `<span class="pulse"></span> ${
        data.connected ? "Connected" : "Not connected"
      }`;

    statusEl.style.color = data.connected
      ? "#75ffc0"
      : "#a1b7ad";
  } catch {
    statusEl.textContent = "Backend unavailable";
  }
}

copyBtn.addEventListener("click", async () => {
  if (!currentPairingCode) return;

  try {
    await navigator.clipboard.writeText(currentPairingCode);

    copyBtn.textContent = "COPIED ✓";
    copyBtn.disabled = true;

    setTimeout(() => {
      copyBtn.textContent = "COPY CODE";
      copyBtn.disabled = false;
    }, 1800);
  } catch {
    copyBtn.textContent = "COPY FAILED";

    setTimeout(() => {
      copyBtn.textContent = "COPY CODE";
    }, 1800);
  }
});

pairBtn.addEventListener("click", async () => {
  const phone = phoneEl.value.replace(/\D/g, "");

  if (phone.length < 10 || phone.length > 15) {
    hideCopyButton();

    resultEl.textContent =
      "Enter a valid international number with country code.";

    return;
  }

  pairBtn.disabled = true;
  pairBtn.textContent = "REQUESTING…";

  hideCopyButton();

  resultEl.textContent = "Starting pairing request…";

  try {
    const response = await fetch("/api/pair", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ phone })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Pairing request failed."
      );
    }

    resultEl.textContent =
      data.message || "Request started.";

    if (pollTimer) {
      clearInterval(pollTimer);
    }

    pollTimer = setInterval(async () => {
      try {
        const r = await fetch(
          `/api/pair/${encodeURIComponent(data.requestId)}`
        );

        const d = await r.json();

        if (d.code) {
          showPairingCode(d.code);

          clearInterval(pollTimer);
          pollTimer = null;
        } else if (d.error) {
          hideCopyButton();

          resultEl.textContent = d.error;

          clearInterval(pollTimer);
          pollTimer = null;
        } else if (d.connected) {
          hideCopyButton();

          resultEl.textContent =
            "WhatsApp linked successfully.";

          clearInterval(pollTimer);
          pollTimer = null;
        }
      } catch {
        // Continue polling after temporary request errors.
      }
    }, 1500);
  } catch (err) {
    hideCopyButton();

    resultEl.textContent =
      err.message ||
      "Could not reach the pairing backend.";
  } finally {
    pairBtn.disabled = false;

    pairBtn.innerHTML =
      'REQUEST PAIRING CODE <span>↗</span>';
  }
});

checkStatus();

setInterval(checkStatus, 10000);
