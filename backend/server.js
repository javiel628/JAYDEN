
'use strict';

/*
╔══════════════════════════════════╗
║          SHADOW PAIR API         ║
║       ADMIN CONTROL ENABLED      ║
║ Developer: 𝐒𝚳𝚰𝐋𝚵 𝚳𝚯𝐃𝚫       ║
╚══════════════════════════════════╝
*/

require('dotenv').config();

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const {
    startSession,
    removeSession,
    isConnected,
    listSavedSessionIds
} = require('../src/session');

const adminRouter = require('./admin');
const userAuth = require('./users');
const activityLog = require('../src/lib/activity-log');

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const REQUEST_TTL_MS = 3 * 60 * 1000;
const REQUEST_RETENTION_MS = 10 * 60 * 1000;
const MAX_ACTIVE_REQUESTS = 8;

const requests = new Map();
const ipWindows = new Map();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(express.json({ limit: '4kb' }));
app.use(express.urlencoded({ extended: false, limit: '4kb' }));
app.use(cookieParser());

app.use(express.static(PUBLIC_DIR, {
    extensions: ['html']
}));

// Admin API
app.use('/api/admin', adminRouter);

// User accounts: email + password.
const authWindows = new Map();
function allowAuthAttempt(req) {
    const ip = String(req.ip || req.socket.remoteAddress || 'unknown');
    const now = Date.now();
    const item = authWindows.get(ip) || { start: now, count: 0 };
    if (now - item.start > 15 * 60 * 1000) { item.start = now; item.count = 0; }
    item.count += 1;
    authWindows.set(ip, item);
    return item.count <= 12;
}

app.post('/api/auth/register', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!allowAuthAttempt(req)) return jsonError(res, 429, 'Too many attempts. Please wait and try again.');
    try {
        const user = userAuth.register(req.body?.email, req.body?.password);
        userAuth.setCookie(res, user);
        return res.status(201).json({ ok: true, user: userAuth.publicUser(user) });
    } catch (err) {
        if (err.code) {
            console.error('[SHADOW AUTH] Account registration storage error:', err.message);
            return jsonError(res, 500, 'Account creation is temporarily unavailable. Please try again later.');
        }
        return jsonError(res, 400, err.message || 'Could not create your account.');
    }
});

app.post('/api/auth/login', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!allowAuthAttempt(req)) return jsonError(res, 429, 'Too many attempts. Please wait and try again.');
    try {
        const user = userAuth.authenticate(req.body?.email, req.body?.password);
        if (!user) return jsonError(res, 401, 'Email or password is incorrect.');
        userAuth.setCookie(res, user);
        return res.json({ ok: true, user: userAuth.publicUser(user) });
    } catch (err) {
        console.error('[SHADOW AUTH] Login error:', err?.message || err);
        return jsonError(res, 500, 'Sign-in is temporarily unavailable. Please try again later.');
    }
});

app.post('/api/auth/logout', (_req, res) => {
    userAuth.clearCookie(res);
    res.json({ ok: true });
});

app.get('/api/auth/me', userAuth.requireUser, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, user: userAuth.publicUser(req.user) });
});

app.get('/api/user/session', userAuth.requireUser, async (req, res) => {
    let sessionId = req.user.sessionId;
    const savedSessionIds = await listSavedSessionIds();
    const paired = Boolean(sessionId && savedSessionIds.includes(sessionId));
    if (sessionId && !paired && !isConnected(sessionId)) {
        userAuth.clearSession(req.user.id, sessionId);
        sessionId = null;
    }
    res.set('Cache-Control', 'no-store');
    res.json({
        ok: true,
        hasSession: Boolean(sessionId),
        connected: sessionId ? isConnected(sessionId) : false,
        paired,
    });
});

// A signed-in user can only read logs for the session assigned to their account.
app.get('/api/user/logs', userAuth.requireUser, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const sessionId = req.user.sessionId;
    if (!sessionId) return res.json({ ok: true, logs: [] });
    const logs = activityLog.readEvents({ sessionId, limit: 100 }).map(({ sessionId: _privateSessionId, ...event }) => event);
    res.json({ ok: true, logs });
});

// Live stream is scoped server-side; clients cannot request another user's session ID.
app.get('/api/user/logs/stream', userAuth.requireUser, (req, res) => {
    const sessionId = req.user.sessionId;
    if (!sessionId) return res.status(204).end();

    res.status(200);
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    res.write(': SHADOW MD live logs connected\n\n');

    const unsubscribe = activityLog.subscribe((event) => {
        if (event.sessionId !== sessionId || res.writableEnded) return;
        const { sessionId: _privateSessionId, ...publicEvent } = event;
        res.write(`data: ${JSON.stringify(publicEvent)}\n\n`);
    });
    const heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(': keep-alive\n\n');
    }, 20000);
    heartbeat.unref?.();

    res.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
    });
});

app.delete('/api/user/session', userAuth.requireUser, async (req, res) => {
    const sessionId = req.user.sessionId;
    if (!sessionId) return res.json({ ok: true, message: 'No WhatsApp session is linked.' });
    try {
        await removeSession(sessionId);
        userAuth.clearSession(req.user.id, sessionId);
        res.json({ ok: true, message: 'Your WhatsApp session was disconnected and removed.' });
    } catch (err) {
        console.error('[SHADOW USER] Session removal failed:', err?.message || err);
        jsonError(res, 500, 'Could not remove the WhatsApp session.');
    }
});

function jsonError(res, status, message) {
    return res.status(status).json({
        ok: false,
        error: message
    });
}

function isTerminal(status) {
    return ['connected', 'error', 'expired'].includes(status);
}

// Request rate limiting
function allowRequest(req) {
    const ip = String(
        req.ip || req.socket.remoteAddress || 'unknown'
    );

    const now = Date.now();

    const record = ipWindows.get(ip) || {
        start: now,
        count: 0
    };

    if (now - record.start > 10 * 60 * 1000) {
        record.start = now;
        record.count = 0;
    }

    record.count += 1;
    ipWindows.set(ip, record);

    return record.count <= 5;
}

// Expire and remove an unfinished pairing session.
function expireRequest(item) {
    if (isTerminal(item.status)) return;

    item.status = 'expired';
    item.code = null;
    item.message = 'Pairing request expired. Start again for a new code.';

    const owner = userAuth.findUserBySession(item.sessionId);
    if (owner) userAuth.clearSession(owner.id, item.sessionId);
    removeSession(item.sessionId).catch((err) => {
        console.error(
            '[SHADOW PAIR] Expiration cleanup failed:',
            err?.message || err
        );
    });
}

// Health check
app.get('/api/health', (_req, res) => {
    res.set('Cache-Control', 'no-store');

    res.json({
        ok: true,
        service: 'SHADOW PAIR',
        status: 'online'
    });
});

// Start pairing
app.post('/api/pair', userAuth.requireUser, async (req, res) => {
    if (!allowRequest(req)) {
        return jsonError(
            res,
            429,
            'Too many requests. Please wait before trying again.'
        );
    }

    const number = String(req.body?.number || '')
        .replace(/\D/g, '');

    if (!/^\d{8,15}$/.test(number) || number.startsWith('0')) {
        return jsonError(
            res,
            400,
            'Enter a valid international number with country code.'
        );
    }

    if (req.user.sessionId) {
        return jsonError(res, 409, 'You already have a WhatsApp session. Disconnect it before pairing another number.');
    }

    const active = [...requests.values()].filter((item) =>
        !isTerminal(item.status)
    );

    if (active.length >= MAX_ACTIVE_REQUESTS) {
        return jsonError(
            res,
            503,
            'Pairing is busy. Please try again shortly.'
        );
    }

    const requestId = crypto.randomUUID();

    const sessionId =
        `web_${crypto.randomBytes(16).toString('hex')}`;

    const item = {
        requestId,
        ownerId: req.user.id,
        sessionId,
        status: 'starting',
        code: null,
        message: 'Starting a WhatsApp pairing session...',
        createdAt: Date.now(),
        expiresAt: Date.now() + REQUEST_TTL_MS
    };

    requests.set(requestId, item);
    userAuth.setSession(req.user.id, sessionId);

    // Respond immediately so the browser can begin polling.
    res.status(202).json({
        ok: true,
        requestId,
        message: 'Pairing request started.'
    });

    try {
        const result = await startSession(sessionId, {
            pairingNumber: number,

            onPairingCode: (code) => {
                if (
                    isTerminal(item.status) ||
                    Date.now() > item.expiresAt
                ) {
                    if (!isTerminal(item.status)) {
                        expireRequest(item);
                    }

                    return;
                }

                item.code = String(code);
                item.status = 'code_ready';
                activityLog.writeEvent(sessionId, 'pairing', 'Pairing code generated', 'success');
                item.message =
                    'Enter this temporary code in WhatsApp Linked Devices.';
            },

            onPairingError: (err) => {
                if (isTerminal(item.status)) return;

                item.status = 'error';
                item.code = null;
                activityLog.writeEvent(sessionId, 'pairing', 'Pairing code request failed', 'error');

                item.message = /429|rate/i.test(
                    String(err?.message || '')
                )
                    ? 'WhatsApp is temporarily rate-limiting pairing. Try again later.'
                    : 'WhatsApp could not issue a pairing code. Check the number and try again.';

                removeSession(sessionId).catch(() => {});
                userAuth.clearSession(req.user.id, sessionId);
            },

            onPairingFailed: () => {
                if (isTerminal(item.status)) return;

                activityLog.writeEvent(sessionId, 'pairing', 'WhatsApp pairing failed', 'error');
                item.status = 'error';
                item.code = null;
                item.message =
                    'Pairing failed. Please start a new request.';
                removeSession(sessionId).catch(() => {});
                userAuth.clearSession(req.user.id, sessionId);
            },

            onConnected: () => {
                if (
                    item.status === 'expired' ||
                    Date.now() > item.expiresAt
                ) {
                    expireRequest(item);
                    return;
                }

                item.status = 'connected';
                item.code = null;
                item.message = 'WhatsApp connected successfully.';
                activityLog.writeEvent(sessionId, 'pairing', 'WhatsApp pairing completed', 'success');
            },

            onLoggedOut: () => {
                if (item.status === 'expired') return;

                activityLog.writeEvent(sessionId, 'connection', 'WhatsApp account logged out', 'warn');
                item.status = 'error';
                item.code = null;
                item.message = 'This WhatsApp session was logged out.';
                userAuth.clearSession(req.user.id, sessionId);
            },

            onReplaced: () => {
                if (item.status === 'expired') return;

                activityLog.writeEvent(sessionId, 'connection', 'WhatsApp session replaced by another connection', 'warn');
                item.status = 'error';
                item.code = null;
                item.message =
                    'This session was replaced by another connection.';
            }
        });

        if (!result && item.status === 'starting') {
            item.status = 'error';
            item.message =
                'Session initialization was interrupted. Please try again.';
            userAuth.clearSession(req.user.id, sessionId);
        }

    } catch (err) {
        if (!isTerminal(item.status)) {
            item.status = 'error';
            item.code = null;
            item.message =
                'Could not start the WhatsApp session. Check server logs.';
        }

        activityLog.writeEvent(sessionId, 'error', `Session start failed: ${err?.message || 'Unknown error'}`, 'error');
        console.error(
            '[SHADOW PAIR] Session start failed:',
            err?.message || err
        );

        removeSession(sessionId).catch(() => {});
        userAuth.clearSession(req.user.id, sessionId);
    }
});

// Pairing status
app.get('/api/status/:requestId', userAuth.requireUser, (req, res) => {
    const item = requests.get(req.params.requestId);

    res.set('Cache-Control', 'no-store');

    if (!item || item.ownerId !== req.user.id) {
        return jsonError(
            res,
            404,
            'Pairing request not found or expired.'
        );
    }

    if (
        !isTerminal(item.status) &&
        Date.now() > item.expiresAt
    ) {
        expireRequest(item);
    }

    if (
        item.status !== 'expired' &&
        item.status !== 'error' &&
        isConnected(item.sessionId)
    ) {
        item.status = 'connected';
        item.code = null;
        item.message = 'WhatsApp connected successfully.';
    }

    res.json({
        ok: true,
        status: item.status,
        code: item.status === 'code_ready' ? item.code : null,
        message: item.message,
        expiresAt: item.expiresAt
    });
});

// Restore only website-created paired sessions.
async function restoreSessions() {
    const saved = (await listSavedSessionIds()).filter((id) =>
        /^web_[a-f0-9]{32}$/.test(id) && userAuth.findUserBySession(id)
    );

    console.log(
        `[SHADOW PAIR] Found ${saved.length} saved website session(s).`
    );

    for (const sessionId of saved) {
        try {
            await startSession(sessionId, {
                restored: true
            });

            console.log(
                `[SHADOW PAIR] Restoring session ${sessionId.slice(0, 8)}...`
            );

        } catch (err) {
            console.error(
                '[SHADOW PAIR] Restore failed:',
                sessionId.slice(0, 8),
                err?.message || err
            );
        }
    }
}

// Cleanup expired requests and old rate-limit records.
setInterval(() => {
    const now = Date.now();

    for (const [id, item] of requests) {
        if (
            !isTerminal(item.status) &&
            now > item.expiresAt
        ) {
            expireRequest(item);
        }

        if (now - item.createdAt > REQUEST_RETENTION_MS) {
            requests.delete(id);
        }
    }

    for (const [ip, record] of authWindows) {
        if (now - record.start > 30 * 60 * 1000) authWindows.delete(ip);
    }

    for (const [ip, record] of ipWindows) {
        if (now - record.start > 20 * 60 * 1000) {
            ipWindows.delete(ip);
        }
    }
}, 30000).unref();

// Admin page uses the main index.html.
app.get('/admin', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Website fallback — Express 4 and 5 compatible.
app.use((req, res, next) => {
    if (
        req.method !== 'GET' ||
        req.path.startsWith('/api/')
    ) {
        return next();
    }

    res.sendFile(
        path.join(PUBLIC_DIR, 'index.html'),
        (err) => {
            if (err && !res.headersSent) {
                next(err);
            }
        }
    );
});

// Error handler.
app.use((err, _req, res, _next) => {
    console.error(
        '[SHADOW PAIR] Request error:',
        err?.message || err
    );

    if (res.headersSent) return;

    jsonError(
        res,
        500,
        'Unexpected server error. Please try again later.'
    );
});

// Start server.
const server = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[SHADOW PAIR] Listening on port ${PORT}`);

    await restoreSessions();
});

// Graceful shutdown.
process.on('SIGTERM', () => {
    console.log('[SHADOW PAIR] Shutting down...');

    server.close(() => {
        process.exit(0);
    });
});
