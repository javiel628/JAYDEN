
'use strict';

const form = document.getElementById('pairForm');
const numberInput = document.getElementById('number');
const generateBtn = document.getElementById('generateBtn');
const result = document.getElementById('result');
const statusPill = document.getElementById('statusPill');
const message = document.getElementById('message');
const codeBox = document.getElementById('codeBox');
const codeEl = document.getElementById('code');
const instructions = document.getElementById('instructions');
const copyBtn = document.getElementById('copyBtn');

let pollTimer = null;
let activeRequestId = null;
let checkingStatus = false;

const terminalStatuses = ['connected', 'error', 'expired'];

function showStatus(status, text) {
  result.classList.remove('hidden');

  statusPill.textContent = String(status || 'unknown')
    .replace(/_/g, ' ')
    .toUpperCase();

  statusPill.className = 'status-pill';

  if (status === 'connected') {
    statusPill.classList.add('good');
  }

  if (status === 'error' || status === 'expired') {
    statusPill.classList.add('bad');
  }

  message.textContent = text || 'Waiting for an update...';
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  checkingStatus = false;
}

function finishRequest(buttonText = 'GENERATE NEW CODE') {
  stopPolling();
  activeRequestId = null;
  generateBtn.disabled = false;

  const span = generateBtn.querySelector('span');
  if (span) span.textContent = buttonText;
}

async function pollStatus(requestId) {
  if (!requestId || checkingStatus || requestId !== activeRequestId) {
    return;
  }

  checkingStatus = true;

  try {
    const response = await fetch(
      `/api/status/${encodeURIComponent(requestId)}`,
      { cache: 'no-store' }
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Could not check pairing status.');
    }

    showStatus(data.status, data.message);

    if (data.status === 'code_ready' && data.code) {
      codeEl.textContent = data.code;
      codeBox.classList.remove('hidden');
      instructions.classList.remove('hidden');
    } else {
      codeBox.classList.add('hidden');
      instructions.classList.toggle(
        'hidden',
        data.status !== 'connected'
      );
    }

    if (terminalStatuses.includes(data.status)) {
      finishRequest('GENERATE NEW CODE');
    }
  } catch (err) {
    showStatus(
      'error',
      err.message || 'Status check failed. Please try again.'
    );

    finishRequest('TRY AGAIN');
  } finally {
    checkingStatus = false;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const number = numberInput.value.replace(/\D/g, '');

  if (!/^\d{8,15}$/.test(number) || number.startsWith('0')) {
    showStatus(
      'error',
      'Enter a valid international phone number including its country code.'
    );
    return;
  }

  stopPolling();
  activeRequestId = null;

  codeBox.classList.add('hidden');
  instructions.classList.add('hidden');
  codeEl.textContent = '';

  generateBtn.disabled = true;

  const buttonText = generateBtn.querySelector('span');
  if (buttonText) buttonText.textContent = 'STARTING SESSION…';

  showStatus(
    'starting',
    'Contacting SHADOW MD and requesting a WhatsApp pairing code…'
  );

  try {
    const response = await fetch('/api/pair', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ number })
    });

    const data = await response.json();

    if (!response.ok || !data.ok || !data.requestId) {
      throw new Error(data.error || 'Pairing request failed.');
    }

    activeRequestId = data.requestId;

    await pollStatus(activeRequestId);

    // Start polling only if the request is still active.
    if (activeRequestId && generateBtn.disabled) {
      pollTimer = setInterval(() => {
        pollStatus(activeRequestId);
      }, 2200);

      if (buttonText) buttonText.textContent = 'PAIRING IN PROGRESS…';
    }

  } catch (err) {
    showStatus(
      'error',
      err.message || 'Could not start pairing.'
    );

    finishRequest('TRY AGAIN');
  }
});

copyBtn.addEventListener('click', async () => {
  const code = codeEl.textContent.trim();

  if (!code) return;

  try {
    await navigator.clipboard.writeText(code);
    copyBtn.textContent = 'COPIED';

    setTimeout(() => {
      copyBtn.textContent = 'COPY CODE';
    }, 1500);

  } catch {
    copyBtn.textContent = 'SELECT CODE';
  }
});

// Account authentication and per-user dashboard.
(() => {
  const accountArea = document.getElementById('accountArea');
  const pairingPage = document.getElementById('pairingPage');
  const accountForm = document.getElementById('accountForm');
  const accountTitle = document.getElementById('accountTitle');
  const accountSubtitle = document.getElementById('accountSubtitle');
  const accountSubmit = document.getElementById('accountSubmit');
  const accountMessage = document.getElementById('accountMessage');
  const switchMode = document.getElementById('switchAccountMode');
  const signedInEmail = document.getElementById('signedInEmail');
  const userSessionCard = document.getElementById('userSessionCard');
  const userSessionMessage = document.getElementById('userSessionMessage');
  const pairCard = document.getElementById('pairCard');
  const disconnectButton = document.getElementById('disconnectSession');
  let accountMode = 'register';

  function setMode(mode) {
    accountMode = mode;
    const login = mode === 'login';
    accountTitle.textContent = login ? 'Welcome Back' : 'Create Your Account';
    accountSubtitle.textContent = login
      ? 'Sign in to manage your SHADOW MD bot.'
      : 'Register to connect and manage your own WhatsApp bot.';
    accountSubmit.textContent = login ? 'LOG IN →' : 'CREATE ACCOUNT →';
    document.getElementById('accountPassword').autocomplete = login ? 'current-password' : 'new-password';
    document.getElementById('accountPassword').placeholder = login ? 'Enter your password' : 'At least 10 characters';
    document.getElementById('accountPassword').minLength = login ? 1 : 10;
    switchMode.textContent = login
      ? 'NEW HERE? CREATE AN ACCOUNT'
      : 'ALREADY HAVE AN ACCOUNT? LOG IN';
    accountMessage.textContent = '';
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }

  async function showDashboard(user) {
    accountArea.hidden = true;
    pairingPage.hidden = false;
    signedInEmail.textContent = user.email;
    try {
      const state = await api('/api/user/session');
      if (state.hasSession) {
        userSessionCard.hidden = false;
        pairCard.hidden = true;
        userSessionMessage.textContent = state.connected
          ? 'Your WhatsApp bot is connected and running.'
          : state.paired
            ? 'Your WhatsApp session is saved. The bot is reconnecting or waiting for the server.'
            : 'A session is assigned to your account. You can disconnect it before pairing again.';
      } else {
        userSessionCard.hidden = true;
        pairCard.hidden = false;
      }
    } catch (err) {
      userSessionCard.hidden = true;
      pairCard.hidden = false;
      showStatus('error', err.message);
    }
  }

  switchMode.addEventListener('click', () => {
    setMode(accountMode === 'register' ? 'login' : 'register');
  });

  accountForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    accountSubmit.disabled = true;
    accountMessage.textContent = accountMode === 'register' ? 'Creating your account…' : 'Signing you in…';
    const email = document.getElementById('accountEmail').value.trim();
    const password = document.getElementById('accountPassword').value;
    try {
      const data = await api(`/api/auth/${accountMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      await showDashboard(data.user);
    } catch (err) {
      accountMessage.textContent = err.message;
    } finally {
      accountSubmit.disabled = false;
    }
  });

  document.getElementById('userLogout').addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    pairingPage.hidden = true;
    accountArea.hidden = false;
    accountForm.reset();
    setMode('login');
  });

  disconnectButton.addEventListener('click', async () => {
    if (!window.confirm('Disconnect and remove your linked WhatsApp session?')) return;
    disconnectButton.disabled = true;
    try {
      const data = await api('/api/user/session', { method: 'DELETE' });
      userSessionMessage.textContent = data.message;
      userSessionCard.hidden = true;
      pairCard.hidden = false;
      showStatus('expired', 'Your WhatsApp session was removed. You can pair again.');
    } catch (err) {
      userSessionMessage.textContent = err.message;
    } finally {
      disconnectButton.disabled = false;
    }
  });

  api('/api/auth/me')
    .then((data) => showDashboard(data.user))
    .catch(() => {
      accountArea.hidden = false;
      pairingPage.hidden = true;
      setMode('register');
    });
})();
