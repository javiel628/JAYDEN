'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  const loginForm = $('adminLoginForm');
  const loginBox = $('adminLogin');
  const dashboard = $('adminDashboard');
  const loginMessage = $('adminLoginMessage');
  const sessionsMessage = $('sessionsMessage');
  const sessionsList = $('sessionsList');
  const usersList = $('usersList');
  const logsList = $('logsList');
  const totalUsers = $('totalUsers');
  const totalSessions = $('totalSessions');
  const connectedSessions = $('connectedSessions');
  const offlineSessions = $('offlineSessions');
  const loginBtn = $('adminLoginBtn');
  const refreshBtn = $('refreshSessions');
  const logoutBtn = $('adminLogout');
  const liveState = $('liveLogState');
  const updateBotBtn = $('checkBotUpdates');
  const updateMessage = $('botUpdateMessage');
  let stream = null;
  let allUsers = [];
  let allSessions = [];
  let currentTab = 'sessions';
  const seenLogIds = new Set();

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }

  function showMessage(element, message, isError = false) {
    if (!element) return;
    element.textContent = message;
    element.style.color = isError ? '#ff7777' : '#00ffbd';
  }

  function showLogin() {
    stopLiveLogs();
    loginBox.hidden = false;
    dashboard.hidden = true;
  }

  async function showDashboard() {
    loginBox.hidden = true;
    dashboard.hidden = false;
    await Promise.all([loadDashboard(), loadUsers(), loadSessions()]);
    await loadLogs();
    startLiveLogs();
  }

  function setTab(tab) {
    currentTab = tab;
    document.querySelectorAll('[data-admin-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.adminTab === tab);
    });
    document.querySelectorAll('[data-admin-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.adminPanel !== tab;
    });
    if (tab === 'logs') loadLogs();
  }

  function createSessionCard(session) {
    const card = document.createElement('article');
    card.className = 'session-item admin-record';
    const details = document.createElement('div');
    details.className = 'session-details';
    const title = document.createElement('strong');
    title.textContent = session.ownerEmail || 'Unassigned account';
    const number = document.createElement('p');
    number.textContent = `WhatsApp: ${session.number || 'Not available'}`;
    const status = document.createElement('span');
    status.className = `record-status ${session.connected ? 'is-online' : 'is-offline'}`;
    status.textContent = session.connected ? '● CONNECTED' : '● OFFLINE';
    const id = document.createElement('small');
    id.textContent = session.id;
    details.append(title, number, status, id);
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-session-btn';
    deleteBtn.textContent = 'DELETE SESSION';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete the WhatsApp session for ${session.ownerEmail || 'this user'}? This cannot be undone.`)) return;
      deleteBtn.disabled = true;
      try {
        await api(`/api/admin/sessions/${encodeURIComponent(session.id)}`, { method: 'DELETE' });
        showMessage(sessionsMessage, 'Session deleted.');
        await Promise.all([loadSessions(), loadDashboard(), loadUsers()]);
      } catch (error) {
        showMessage(sessionsMessage, error.message, true);
        deleteBtn.disabled = false;
      }
    });
    card.append(details, deleteBtn);
    return card;
  }

  function renderSessions() {
    sessionsList.replaceChildren();
    if (!allSessions.length) {
      sessionsList.textContent = 'No website bot sessions found yet.';
      return;
    }
    allSessions.forEach((session) => sessionsList.append(createSessionCard(session)));
    const filter = $('logSessionFilter');
    if (filter) {
      const current = filter.value;
      filter.replaceChildren(new Option('All bot sessions', ''));
      allSessions.forEach((session) => filter.add(new Option(`${session.ownerEmail || 'Unassigned'} · ${session.number || session.id.slice(0, 12)}`, session.id)));
      filter.value = current;
    }
  }

  async function loadSessions() {
    if (!sessionsList) return;
    sessionsList.textContent = 'Loading sessions...';
    try {
      const data = await api('/api/admin/sessions');
      allSessions = data.sessions || [];
      renderSessions();
    } catch (error) {
      sessionsList.textContent = error.message;
      if (error.message.toLowerCase().includes('log in')) showLogin();
    }
  }

  async function loadDashboard() {
    try {
      const data = await api('/api/admin/overview');
      totalUsers.textContent = data.totalUsers ?? 0;
      totalSessions.textContent = data.totalSessions ?? 0;
      connectedSessions.textContent = data.connected ?? 0;
      offlineSessions.textContent = data.offline ?? 0;
    } catch (error) {
      showMessage(sessionsMessage, error.message, true);
    }
  }

  function renderUsers() {
    const query = ($('userSearch')?.value || '').trim().toLowerCase();
    usersList.replaceChildren();
    const users = allUsers.filter((user) => user.email.toLowerCase().includes(query));
    if (!users.length) {
      usersList.textContent = query ? 'No users match that search.' : 'No registered users yet.';
      return;
    }
    users.forEach((user) => {
      const card = document.createElement('article');
      card.className = 'session-item admin-record';
      const info = document.createElement('div');
      info.className = 'session-details';
      const email = document.createElement('strong');
      email.textContent = user.email;
      const joined = document.createElement('small');
      joined.textContent = `Joined ${new Date(user.createdAt).toLocaleString()}`;
      const status = document.createElement('span');
      status.className = `record-status ${user.connected ? 'is-online' : 'is-offline'}`;
      status.textContent = user.connected ? '● BOT CONNECTED' : (user.hasSession ? '● BOT OFFLINE' : '● NO BOT LINKED');
      info.append(email, status, joined);
      card.append(info);
      usersList.append(card);
    });
  }

  async function loadUsers() {
    if (!usersList) return;
    usersList.textContent = 'Loading users...';
    try {
      const data = await api('/api/admin/users');
      allUsers = data.users || [];
      renderUsers();
    } catch (error) {
      usersList.textContent = error.message;
    }
  }

  function addLog(event, atTop = true) {
    if (!event || seenLogIds.has(event.id)) return;
    seenLogIds.add(event.id);
    const empty = logsList.querySelector('.empty-logs');
    if (empty) empty.remove();
    const row = document.createElement('article');
    const level = ['success', 'warn', 'error'].includes(event.level) ? event.level : 'info';
    row.className = `log-row log-${level}`;
    const top = document.createElement('div');
    top.className = 'log-row-top';
    const type = document.createElement('strong');
    const typeName = String(event.type || 'event').replace(/_/g, ' ').toUpperCase();
    const icons = { connection: '◉', pairing: '⌁', command: '⚡', message: '✉', error: '⚠', admin: '◆' };
    type.textContent = `${icons[String(event.type || '').toLowerCase()] || '✦'}  ${typeName}`;
    const time = document.createElement('time');
    time.dateTime = event.at || '';
    const parsed = new Date(event.at);
    time.textContent = Number.isNaN(parsed.getTime()) ? 'TIME UNKNOWN' : parsed.toLocaleString();
    const levelTag = document.createElement('span');
    levelTag.className = `log-level-tag level-${level}`;
    levelTag.textContent = level.toUpperCase();
    top.append(type, levelTag, time);
    const message = document.createElement('p');
    message.textContent = event.message || 'Activity recorded';
    const meta = document.createElement('small');
    const owner = allSessions.find((session) => session.id === event.sessionId);
    meta.textContent = `ACCOUNT: ${owner?.ownerEmail || 'BOT SESSION'}  ·  SESSION: ${String(event.sessionId || '').slice(0, 12)}`;
    row.append(top, message, meta);
    if (atTop) logsList.prepend(row); else logsList.append(row);
    while (logsList.children.length > 150) logsList.lastElementChild.remove();
  }

  async function loadLogs() {
    if (!logsList) return;
    logsList.textContent = 'Loading activity logs...';
    seenLogIds.clear();
    const level = $('logLevelFilter')?.value || '';
    const sessionId = $('logSessionFilter')?.value || '';
    const params = new URLSearchParams({ limit: '150' });
    if (level) params.set('level', level);
    if (sessionId) params.set('sessionId', sessionId);
    try {
      const data = await api(`/api/admin/logs?${params.toString()}`);
      logsList.replaceChildren();
      if (!data.logs?.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-logs';
        empty.textContent = 'No matching activity yet. New events will appear here live.';
        logsList.append(empty);
        return;
      }
      data.logs.forEach((event) => addLog(event, false));
    } catch (error) {
      logsList.textContent = error.message;
    }
  }

  function startLiveLogs() {
    stopLiveLogs();
    const level = $('logLevelFilter')?.value || '';
    const sessionId = $('logSessionFilter')?.value || '';
    const params = new URLSearchParams();
    if (level) params.set('level', level);
    if (sessionId) params.set('sessionId', sessionId);
    stream = new EventSource(`/api/admin/logs/stream?${params.toString()}`);
    stream.onopen = () => { liveState.textContent = '● LIVE'; liveState.classList.add('live-on'); };
    stream.onmessage = (message) => {
      try { addLog(JSON.parse(message.data), true); } catch {}
    };
    stream.onerror = () => { liveState.textContent = '● RECONNECTING'; liveState.classList.remove('live-on'); };
  }

  function stopLiveLogs() {
    if (stream) stream.close();
    stream = null;
    if (liveState) { liveState.textContent = '● OFFLINE'; liveState.classList.remove('live-on'); }
  }

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginBtn.disabled = true;
    loginBtn.textContent = 'SIGNING IN...';
    showMessage(loginMessage, '');
    const username = $('adminUsername').value;
    const password = $('adminPassword').value;
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      loginForm.reset();
      showDashboard();
    } catch (error) {
      showMessage(loginMessage, error.message, true);
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'LOGIN TO DASHBOARD →';
    }
  });

  document.querySelectorAll('[data-admin-tab]').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.adminTab)));
  $('userSearch')?.addEventListener('input', renderUsers);
  $('logLevelFilter')?.addEventListener('change', () => { loadLogs(); startLiveLogs(); });
  $('logSessionFilter')?.addEventListener('change', () => { loadLogs(); startLiveLogs(); });
  $('refreshLogs')?.addEventListener('click', loadLogs);
  refreshBtn?.addEventListener('click', () => Promise.all([loadDashboard(), loadSessions(), loadUsers()]));

  updateBotBtn?.addEventListener('click', async () => {
    if (!confirm('Check GitHub for SHADOW MD updates and start a Render deployment if a newer version exists?')) return;
    updateBotBtn.disabled = true;
    updateBotBtn.classList.add('is-loading');
    updateBotBtn.innerHTML = '<span aria-hidden="true">↻</span> CHECKING UPDATES…';
    if (updateMessage) { updateMessage.hidden = false; updateMessage.className = 'update-notice is-loading'; updateMessage.textContent = 'Checking the SHADOW MD GitHub repository…'; }
    try {
      const data = await api('/api/admin/updates/check', { method: 'POST' });
      const upToDate = data.status === 'up-to-date';
      if (updateMessage) {
        updateMessage.hidden = false;
        updateMessage.className = `update-notice ${upToDate ? 'is-success' : 'is-loading'}`;
        updateMessage.textContent = data.message || 'Update check completed.';
      }
    } catch (error) {
      if (updateMessage) {
        updateMessage.hidden = false;
        updateMessage.className = 'update-notice is-error';
        updateMessage.textContent = error.message || 'Could not check for updates.';
      }
    } finally {
      updateBotBtn.disabled = false;
      updateBotBtn.classList.remove('is-loading');
      updateBotBtn.innerHTML = '<span aria-hidden="true">↻</span> UPDATE BOT';
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    try {
      await api('/api/admin/logout', { method: 'POST' });
      showLogin();
      showMessage(loginMessage, 'You have logged out.');
    } catch (error) {
      showMessage(sessionsMessage, error.message, true);
    }
  });

  api('/api/admin/me').then(showDashboard).catch(showLogin);
});
