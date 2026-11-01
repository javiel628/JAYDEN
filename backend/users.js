'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORAGE_ROOT = process.env.SHADOW_DATA_DIR || process.cwd();
const USER_DIR = path.join(STORAGE_ROOT, 'data');
const USERS_FILE = path.join(USER_DIR, 'users.json');
const SECRET_FILE = path.join(USER_DIR, '.user-auth-secret');
const COOKIE_NAME = 'shadow_user';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

fs.mkdirSync(USER_DIR, { recursive: true });

function loadSecret() {
  const configured = String(process.env.USER_AUTH_SECRET || '').trim();
  if (configured) return configured;

  try {
    const existing = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (existing) return existing;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const secret = crypto.randomBytes(48).toString('hex');
  try {
    fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600, flag: 'wx' });
    return secret;
  } catch (err) {
    // Another process may have created the secret during startup.
    if (err.code === 'EEXIST') {
      const existing = fs.readFileSync(SECRET_FILE, 'utf8').trim();
      if (existing) return existing;
    }
    throw err;
  }
}
const AUTH_SECRET = loadSecret();

function readStore() {
  try {
    const value = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    if (value && Array.isArray(value.users)) return value;
    throw new Error('Invalid account database format.');
  } catch (err) {
    if (err.code === 'ENOENT') return { users: [] };
    // Never silently replace a damaged account database with an empty one.
    throw new Error(`Could not read the SHADOW MD account database: ${err.message}`);
  }
}

let store = readStore();
function saveStore(nextStore = store) {
  const temp = `${USERS_FILE}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temp, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(nextStore, null, 2), 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(temp, USERS_FILE);
  } catch (err) {
    if (fd !== undefined && fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
    try { fs.unlinkSync(temp); } catch {}
    throw err;
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}
function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password, stored) {
  try {
    const [scheme, salt, expected] = String(stored || '').split('$');
    if (scheme !== 'scrypt' || !salt || !/^[a-f0-9]{128}$/i.test(expected || '')) return false;
    const actual = crypto.scryptSync(password, salt, 64);
    const target = Buffer.from(expected, 'hex');
    return actual.length === target.length && crypto.timingSafeEqual(actual, target);
  } catch {
    return false;
  }
}
function sign(value) {
  return crypto.createHmac('sha256', AUTH_SECRET).update(value).digest('hex');
}
function createToken(user) {
  const expires = Date.now() + COOKIE_MAX_AGE;
  const payload = `${user.id}:${expires}`;
  return `${payload}:${sign(payload)}`;
}
function verifyToken(token) {
  if (!token) return null;
  const parts = String(token).split(':');
  if (parts.length !== 3) return null;
  const [id, expires, signature] = parts;
  if (!/^[a-f0-9-]{36}$/i.test(id) || !/^\d+$/.test(expires) || Date.now() > Number(expires)) return null;
  const expected = sign(`${id}:${expires}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return store.users.find((user) => user.id === id) || null;
}
function setCookie(res, user) {
  res.cookie(COOKIE_NAME, createToken(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}
function clearCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}
function publicUser(user) {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}
function register(emailValue, password) {
  const email = normalizeEmail(emailValue);
  if (!validEmail(email)) throw new Error('Enter a valid email address.');
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
    throw new Error('Password must be between 10 and 128 characters.');
  }
  if (store.users.some((user) => user.email === email)) throw new Error('An account with this email already exists.');
  const user = {
    id: crypto.randomUUID(),
    email,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    sessionId: null,
  };
  const nextStore = { ...store, users: [...store.users, user] };
  saveStore(nextStore);
  store = nextStore;
  return user;
}
function authenticate(emailValue, password) {
  const email = normalizeEmail(emailValue);
  const safePassword = typeof password === 'string' && password.length <= 128 ? password : '';
  const user = store.users.find((item) => item.email === email);
  // Perform a scrypt operation for unknown emails too, reducing timing differences.
  if (!user) {
    hashPassword(safePassword, 'shadow-md-fixed-dummy-salt');
    return null;
  }
  if (!safePassword && password !== '') return null;
  return verifyPassword(safePassword, user.passwordHash) ? user : null;
}
function getUserById(id) {
  return store.users.find((user) => user.id === id) || null;
}
function setSession(userId, sessionId) {
  const user = getUserById(userId);
  if (!user) throw new Error('Account not found.');
  const nextStore = {
    ...store,
    users: store.users.map((item) => item.id === userId ? { ...item, sessionId } : item),
  };
  saveStore(nextStore);
  store = nextStore;
}
function clearSession(userId, expectedSessionId) {
  const user = getUserById(userId);
  if (!user) return;
  if (!expectedSessionId || user.sessionId === expectedSessionId) {
    const nextStore = {
      ...store,
      users: store.users.map((item) => item.id === userId ? { ...item, sessionId: null } : item),
    };
    saveStore(nextStore);
    store = nextStore;
  }
}
function findUserBySession(sessionId) {
  return store.users.find((user) => user.sessionId === sessionId) || null;
}
function listUsers() {
  return store.users.map((user) => ({
    id: user.id, email: user.email, createdAt: user.createdAt, sessionId: user.sessionId || null,
  }));
}
function requireUser(req, res, next) {
  const user = verifyToken(req.cookies?.[COOKIE_NAME]);
  if (!user) return res.status(401).json({ ok: false, error: 'Please log in to continue.' });
  req.user = user;
  next();
}

module.exports = {
  COOKIE_NAME, COOKIE_MAX_AGE, register, authenticate, setCookie, clearCookie,
  publicUser, requireUser, getUserById, setSession, clearSession, findUserBySession, listUsers,
};
