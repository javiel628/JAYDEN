
'use strict';

/*
╔══════════════════════════════════╗
║       SHADOW PAIR ADMIN API      ║
║       Developer: SMILE MODZ      ║
╚══════════════════════════════════╝
*/

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  removeSession,
  isConnected,
  listSavedSessionIds,
} = require('../src/session');

const router = express.Router();
const activityLog = require('../src/lib/activity-log');
const userAuth = require('./users');

const STORAGE_ROOT = process.env.SHADOW_DATA_DIR || process.cwd();
const AUTH_ROOT = path.join(STORAGE_ROOT, 'session');

const COOKIE_NAME = 'shadow_admin';
const COOKIE_MAX_AGE = 8 * 60 * 60 * 1000;

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

const loginAttempts = new Map();

router.use(express.json({ limit: '4kb' }));

function safeCompare(a, b) {
  const first = Buffer.from(String(a));
  const second = Buffer.from(String(b));

  if (first.length !== second.length) return false;

  return crypto.timingSafeEqual(first, second);
}

function sign(value) {
  return crypto
    .createHmac('sha256', ADMIN_SECRET)
    .update(value)
    .digest('hex');
}

function createToken() {
  const expires = Date.now() + COOKIE_MAX_AGE;
  const payload = `${ADMIN_USERNAME}:${expires}`;
  return `${payload}:${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || !ADMIN_SECRET) return false;

  const parts = token.split(':');

  if (parts.length !== 3) return false;

  const [username, expires, signature] = parts;
  const payload = `${username}:${expires}`;

  if (username !== ADMIN_USERNAME) return false;
  if (!/^\d+$/.test(expires)) return false;
  if (Date.now() > Number(expires)) return false;

  return safeCompare(signature, sign(payload));
}

function setAdminCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE,
    path: '/api/admin',
  });
}

function clearAdminCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/admin',
  });
}

function requireAdmin(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];

  if (!verifyToken(token)) {
    return res.status(401).json({
      ok: false,
      error: 'Please log in as administrator.',
    });
  }

  next();
}

function validSessionId(id) {
  return /^web_[a-f0-9]{32}$/.test(String(id));
}

function getPhoneNumber(sessionId) {
  try {
    const credsPath = path.join(
      AUTH_ROOT,
      sessionId,
      'creds.json'
    );

    const creds = JSON.parse(
      fs.readFileSync(credsPath, 'utf8')
    );

    const jid = creds?.me?.id || '';
    const number = String(jid).split('@')[0].split(':')[0];

    return number.replace(/\D/g, '') || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

// Login.
router.post('/login', (req, res) => {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !ADMIN_SECRET) {
    return res.status(503).json({
      ok: false,
      error: 'Admin environment variables are not configured.',
    });
  }

  const ip = String(
    req.ip || req.socket.remoteAddress || 'unknown'
  );

  const now = Date.now();
  const attempt = loginAttempts.get(ip) || {
    count: 0,
    start: now,
  };

  if (now - attempt.start > 15 * 60 * 1000) {
    attempt.count = 0;
    attempt.start = now;
  }

  if (attempt.count >= 5) {
    return res.status(429).json({
      ok: false,
      error: 'Too many login attempts. Try again later.',
    });
  }

  attempt.count += 1;
  loginAttempts.set(ip, attempt);

  const username = String(req.body?.username || '');
  const password = String(req.body?.password || '');

  const valid =
    safeCompare(username, ADMIN_USERNAME) &&
    safeCompare(password, ADMIN_PASSWORD);

  if (!valid) {
    return res.status(401).json({
      ok: false,
      error: 'Incorrect username or password.',
    });
  }

  loginAttempts.delete(ip);

  setAdminCookie(res, createToken());

  return res.json({
    ok: true,
    message: 'Administrator login successful.',
  });
});

// Check login status.
router.get('/me', requireAdmin, (_req, res) => {
  res.json({
    ok: true,
    authenticated: true,
    username: ADMIN_USERNAME,
  });
});

// Logout.
router.post('/logout', requireAdmin, (_req, res) => {
  clearAdminCookie(res);

  res.json({
    ok: true,
    message: 'Logged out successfully.',
  });
});

// Dashboard overview: account and connection totals.
router.get('/overview', requireAdmin, async (_req, res) => {
  const users = userAuth.listUsers();
  const sessionIds = (await listSavedSessionIds()).filter(validSessionId);
  const sessions = sessionIds.map((id) => ({ id, connected: Boolean(isConnected(id)) }));
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: true,
    totalUsers: users.length,
    totalSessions: sessions.length,
    connected: sessions.filter((item) => item.connected).length,
    offline: sessions.filter((item) => !item.connected).length,
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// List registered accounts without exposing password hashes or auth data.
router.get('/users', requireAdmin, (_req, res) => {
  const users = userAuth.listUsers().map((user) => ({
    id: user.id, email: user.email, createdAt: user.createdAt,
    hasSession: Boolean(user.sessionId),
    connected: Boolean(user.sessionId && isConnected(user.sessionId)),
  }));
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, total: users.length, users });
});

// Read persisted bot activity. Message bodies and private chat contents are never logged.
router.get('/logs', requireAdmin, (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 100, 300));
  const sessionId = String(req.query.sessionId || '');
  const level = String(req.query.level || '');
  if (sessionId && !validSessionId(sessionId)) {
    return res.status(400).json({ ok: false, error: 'Invalid session filter.' });
  }
  if (level && !['info', 'success', 'warn', 'error'].includes(level)) {
    return res.status(400).json({ ok: false, error: 'Invalid log level.' });
  }
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, logs: activityLog.readEvents({ limit, sessionId, level }) });
});

// Live log stream. Admin cookie is checked before the stream is opened.
router.get('/logs/stream', requireAdmin, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(': SHADOW MD live log stream connected\n\n');
  const sessionId = String(req.query.sessionId || '');
  const level = String(req.query.level || '');
  const unsubscribe = activityLog.subscribe((event) => {
    if (sessionId && event.sessionId !== sessionId) return;
    if (level && event.level !== level) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 20000);
  res.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
});


// Check GitHub for a newer revision and ask Render to deploy it.
let lastDeployRequestAt = 0;
router.post('/updates/check', requireAdmin, async (_req, res) => {
  const repoApi = 'https://api.github.com/repos/javiel628/shadow';
  try {
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'SHADOW-MD-Update-Checker',
    };
    const repoResponse = await fetch(repoApi, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!repoResponse.ok) throw new Error('GitHub repository could not be checked.');
    const repo = await repoResponse.json();
    const branch = String(process.env.RENDER_GIT_BRANCH || repo.default_branch || 'main');
    const commitResponse = await fetch(`${repoApi}/commits/${encodeURIComponent(branch)}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!commitResponse.ok) throw new Error('Could not read the latest GitHub update.');
    const latest = await commitResponse.json();
    const latestSha = String(latest.sha || '');
    const deployedSha = String(process.env.RENDER_GIT_COMMIT || process.env.SHADOW_CURRENT_COMMIT || '');
    if (!/^[a-f0-9]{40}$/i.test(latestSha)) throw new Error('GitHub returned an invalid revision.');
    if (!deployedSha) {
      return res.status(503).json({
        ok: false,
        code: 'DEPLOYED_REVISION_UNKNOWN',
        error: 'Cannot identify the deployed revision. Set SHADOW_CURRENT_COMMIT if your host does not provide RENDER_GIT_COMMIT.',
      });
    }
    if (latestSha.toLowerCase() === deployedSha.toLowerCase()) {
      return res.json({ ok: true, status: 'up-to-date', message: '✨ SHADOW MD is already up to date. No new updates are available.', latestCommit: latestSha.slice(0, 7) });
    }
    const deployHook = process.env.RENDER_DEPLOY_HOOK;
    if (!deployHook) {
      return res.status(503).json({
        ok: false,
        code: 'DEPLOY_HOOK_MISSING',
        error: 'A new update is available, but automatic updates are not configured. Add RENDER_DEPLOY_HOOK in your Render environment variables.',
        latestCommit: latestSha.slice(0, 7),
      });
    }
    if (Date.now() - lastDeployRequestAt < 60 * 1000) {
      return res.status(429).json({ ok: false, error: 'An update was requested recently. Please wait a minute before trying again.' });
    }
    lastDeployRequestAt = Date.now();
    const deployResponse = await fetch(deployHook, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
    });
    if (!deployResponse.ok) {
      lastDeployRequestAt = 0;
      throw new Error('Render did not accept the deployment request. Check your deploy hook.');
    }
    return res.json({
      ok: true,
      status: 'deploy-started',
      message: '🚀 Update found! Render has accepted the deployment request. SHADOW MD will restart when the update is ready.',
      latestCommit: latestSha.slice(0, 7),
    });
  } catch (error) {
    console.error('[SHADOW ADMIN] Update check failed:', error?.message || error);
    return res.status(502).json({ ok: false, error: error.message || 'Could not check for updates right now.' });
  }
});

// List saved web pairing sessions.
router.get('/sessions', requireAdmin, async (_req, res) => {
  try {
    const sessionIds = (await listSavedSessionIds())
      .filter(validSessionId);

    const sessions = sessionIds.map((id) => ({
      id,
      number: getPhoneNumber(id),
      connected: Boolean(isConnected(id)),
      ownerEmail: userAuth.findUserBySession(id)?.email || 'Unassigned',
    }));

    res.json({
      ok: true,
      total: sessions.length,
      connected: sessions.filter((s) => s.connected).length,
      sessions,
    });
  } catch (err) {
    console.error('[SHADOW ADMIN] Session list error:', err);

    res.status(500).json({
      ok: false,
      error: 'Could not load sessions.',
    });
  }
});

// Delete a saved web pairing session.
router.delete('/sessions/:id', requireAdmin, async (req, res) => {
  const sessionId = String(req.params.id || '');

  if (!validSessionId(sessionId)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid session ID.',
    });
  }

  try {
    const sessionPath = path.join(AUTH_ROOT, sessionId);

    if (!fs.existsSync(sessionPath)) {
      return res.status(404).json({
        ok: false,
        error: 'Session not found.',
      });
    }

    await removeSession(sessionId);
    const owner = userAuth.findUserBySession(sessionId);
    if (owner) userAuth.clearSession(owner.id, sessionId);
    activityLog.writeEvent(sessionId, 'admin', 'Session deleted by administrator', 'warn');

    // Remove remaining files if the session manager left the directory.
    fs.rmSync(sessionPath, {
      recursive: true,
      force: true,
    });

    res.json({
      ok: true,
      message: 'Session deleted successfully.',
    });
  } catch (err) {
    console.error('[SHADOW ADMIN] Delete error:', err);

    res.status(500).json({
      ok: false,
      error: 'Could not delete this session.',
    });
  }
});

module.exports = router;
