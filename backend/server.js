
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
    listSavedSessionIds,
    shutdownSessions
} = require('../src/session');

const adminRouter = require('./admin');

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
app.post('/api/pair', async (req, res) => {
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
        sessionId,
        status: 'starting',
        code: null,
        message: 'Starting a WhatsApp pairing session...',
        createdAt: Date.now(),
        expiresAt: Date.now() + REQUEST_TTL_MS
    };

    requests.set(requestId, item);

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
                item.message =
                    'Enter this temporary code in WhatsApp Linked Devices.';
            },

            onPairingError: (err) => {
                if (isTerminal(item.status)) return;

                item.status = 'error';
                item.code = null;

                item.message = /429|rate/i.test(
                    String(err?.message || '')
                )
                    ? 'WhatsApp is temporarily rate-limiting pairing. Try again later.'
                    : 'WhatsApp could not issue a pairing code. Check the number and try again.';

                removeSession(sessionId).catch(() => {});
            },

            onPairingFailed: () => {
                if (isTerminal(item.status)) return;

                item.status = 'error';
                item.code = null;
                item.message =
                    'Pairing failed. Please start a new request.';
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
            },

            onLoggedOut: () => {
                if (item.status === 'expired') return;

                item.status = 'error';
                item.code = null;
                item.message = 'This WhatsApp session was logged out.';
            },

            onReplaced: () => {
                if (item.status === 'expired') return;

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
        }

    } catch (err) {
        if (!isTerminal(item.status)) {
            item.status = 'error';
            item.code = null;
            item.message =
                'Could not start the WhatsApp session. Check server logs.';
        }

        console.error(
            '[SHADOW PAIR] Session start failed:',
            err?.message || err
        );

        removeSession(sessionId).catch(() => {});
    }
});

// Pairing status
app.get('/api/status/:requestId', (req, res) => {
    const item = requests.get(req.params.requestId);

    res.set('Cache-Control', 'no-store');

    if (!item) {
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
    const saved = listSavedSessionIds().filter((id) =>
        /^web_[a-f0-9]{32}$/.test(id)
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

// Graceful shutdown. Close sockets without logging out or deleting auth files.
let shuttingDown = false;
async function gracefulShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`[SHADOW PAIR] ${signal} received; closing sessions safely...`);

    const forceExit = setTimeout(() => {
        console.error('[SHADOW PAIR] Shutdown timed out; exiting.');
        process.exit(1);
    }, 15000);
    forceExit.unref();

    try {
        await shutdownSessions();
    } catch (err) {
        console.error('[SHADOW PAIR] Session shutdown warning:', err?.message || err);
    }

    server.close(() => {
        clearTimeout(forceExit);
        process.exit(0);
    });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
