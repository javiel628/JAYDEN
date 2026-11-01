
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
  const userLogsList = document.getElementById('userLogsList');
  const userLogsStatus = document.getElementById('userLogsStatus');
  const userLogsLive = document.getElementById('userLogsLive');
  const userLogLevel = document.getElementById('userLogLevel');
  const refreshUserLogsButton = document.getElementById('refreshUserLogs');
  let accountMode = 'register';
  let userLogEvents = [];
  let userLogStream = null;
  let userHasLogSession = false;

  function closeUserLogStream() {
    if (userLogStream) userLogStream.close();
    userLogStream = null;
    userLogsLive.textContent = '● OFFLINE';
    userLogsLive.classList.remove('is-live');
  }

  function formatLogTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown time';
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium', timeStyle: 'short'
    }).format(date);
  }

  function renderUserLogs() {
    const level = userLogLevel.value;
    const rows = userLogEvents.filter((item) => level === 'all' || item.level === level);
    userLogsList.replaceChildren();
    if (!userHasLogSession) {
      userLogsStatus.textContent = 'Connect your WhatsApp account to start seeing bot activity here.';
      return;
    }
    if (!rows.length) {
      userLogsStatus.textContent = userLogEvents.length
        ? 'No activity matches this filter.'
        : 'No activity recorded yet. Connect your bot or use a command to generate logs.';
      return;
    }
    userLogsStatus.textContent = `${rows.length} recent ${rows.length === 1 ? 'event' : 'events'} shown`;
    for (const item of rows) {
      const row = document.createElement('article');
      row.className = `user-log-row log-${['success','warn','error'].includes(item.level) ? item.level : 'info'}`;
      const top = document.createElement('div');
      top.className = 'user-log-top';
      const type = document.createElement('strong');
      const typeName = String(item.type || 'activity').replace(/_/g, ' ').toUpperCase();
      const icons = { connection: '◉', pairing: '⌁', command: '⚡', message: '✉', error: '⚠' };
      type.textContent = `${icons[String(item.type || '').toLowerCase()] || '✦'}  ${typeName}`;
      const level = document.createElement('span');
      level.className = `user-log-level level-${['success','warn','error'].includes(item.level) ? item.level : 'info'}`;
      level.textContent = String(item.level || 'info').toUpperCase();
      const time = document.createElement('time');
      time.dateTime = item.at || '';
      time.textContent = formatLogTime(item.at);
      top.append(type, level, time);
      const message = document.createElement('p');
      message.textContent = item.message || 'Activity recorded';
      row.append(top, message);
      if (item.metadata && (item.metadata.command || item.metadata.scope)) {
        const details = document.createElement('small');
        const bits = [];
        if (item.metadata.command) bits.push(`Command: .${item.metadata.command}`);
        if (item.metadata.scope) bits.push(`LOCATION: ${item.metadata.scope}`);
        details.textContent = bits.join('  ·  ');
        row.append(details);
      }
      userLogsList.append(row);
    }
  }

  function addUserLog(item) {
    if (!item || !item.id || userLogEvents.some((entry) => entry.id === item.id)) return;
    userLogEvents.unshift(item);
    userLogEvents = userLogEvents.slice(0, 100);
    renderUserLogs();
  }

  async function refreshUserLogs() {
    if (!userHasLogSession) {
      userLogEvents = [];
      renderUserLogs();
      return;
    }
    refreshUserLogsButton.disabled = true;
    userLogsStatus.textContent = 'Loading your bot activity…';
    try {
      const data = await api('/api/user/logs');
      userLogEvents = Array.isArray(data.logs) ? data.logs : [];
      renderUserLogs();
    } catch (err) {
      userLogsStatus.textContent = err.message || 'Could not load your bot logs.';
    } finally {
      refreshUserLogsButton.disabled = false;
    }
  }

  function openUserLogStream() {
    closeUserLogStream();
    if (!userHasLogSession) return;
    userLogStream = new EventSource('/api/user/logs/stream');
    userLogStream.onopen = () => {
      userLogsLive.textContent = '● LIVE';
      userLogsLive.classList.add('is-live');
    };
    userLogStream.onmessage = (event) => {
      try { addUserLog(JSON.parse(event.data)); } catch {}
    };
    userLogStream.onerror = () => {
      userLogsLive.textContent = '● RECONNECTING';
      userLogsLive.classList.remove('is-live');
    };
  }

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
    accountMessage.classList.remove('is-error');
  }

  async function api(url, options = {}) {
    let response;
    try {
      response = await fetch(url, {
        credentials: 'same-origin',
        cache: 'no-store',
        ...options,
        headers: { ...(options.headers || {}) }
      });
    } catch {
      throw new Error('Could not reach SHADOW MD. Check your internet connection and try again.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      if (response.status >= 500) throw new Error(data.error || 'The server is temporarily unavailable. Please try again.');
      throw new Error(data.error || 'Request failed. Please check your details and try again.');
    }
    return data;
  }

  async function showDashboard(user) {
    accountArea.hidden = true;
    pairingPage.hidden = false;
    signedInEmail.textContent = user.email;
    try {
      const state = await api('/api/user/session');
      userHasLogSession = Boolean(state.hasSession);
      await refreshUserLogs();
      if (userHasLogSession) openUserLogStream();
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

  refreshUserLogsButton.addEventListener('click', refreshUserLogs);
  userLogLevel.addEventListener('change', renderUserLogs);

  switchMode.addEventListener('click', () => {
    setMode(accountMode === 'register' ? 'login' : 'register');
  });

  accountForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!accountForm.reportValidity()) return;

    const email = document.getElementById('accountEmail').value.trim().toLowerCase();
    const password = document.getElementById('accountPassword').value;
    if (accountMode === 'register' && (password.length < 10 || password.length > 128)) {
      accountMessage.textContent = 'Your password must be between 10 and 128 characters.';
      accountMessage.classList.add('is-error');
      return;
    }

    accountSubmit.disabled = true;
    switchMode.disabled = true;
    accountMessage.textContent = accountMode === 'register' ? 'Creating your account…' : 'Signing you in…';
    accountMessage.classList.remove('is-error');
    try {
      const data = await api(`/api/auth/${accountMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      await showDashboard(data.user);
    } catch (err) {
      accountMessage.textContent = err.message || 'Something went wrong. Please try again.';
      accountMessage.classList.add('is-error');
    } finally {
      accountSubmit.disabled = false;
      switchMode.disabled = false;
    }
  });

  document.getElementById('userLogout').addEventListener('click', async () => {
    closeUserLogStream();
    userHasLogSession = false;
    userLogEvents = [];
    userLogsList.replaceChildren();
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
      userHasLogSession = false;
      closeUserLogStream();
      await refreshUserLogs();
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
      closeUserLogStream();
      accountArea.hidden = false;
      pairingPage.hidden = true;
      setMode('register');
    });
})();
