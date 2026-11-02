
'use strict';

/*
╔══════════════════════════╗
║             SHADOW MD WHATSAPP BOT
║
║             ⚡ DEVELOPER CREDITS ⚡
║
║          ᴅᴇᴠᴇʟᴏᴘᴇʀ : ᴊᴀᴍᴇsᴍᴏᴅᴢ
║          ᴛᴇᴀᴍ      : james Inc
║
║  ⚠️  C R E D I T   N O T I C E  ⚠️
║
║  Do NOT remove or modify these credits
║  without permission from the original dev
║  Respect the work. Give credit where it's
║  due. Don't steal another developer's work.
║  WHATSAPP BOT
║  © 2026 JAMESMODZ — ALL RIGHTS RESERVED
╚══════════════════════════╝
*/

const fs = require('fs');
const path = require('path');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
} = require('./lib/baileys');

const pino = require('pino');
const config = require('./config');

const {
    handleMessages,
    onSessionOpen,
    handleCalls,
    handleGroupUpdate,
    handlePresence
} = require('./Anix');

const { createSessionSettings } = require('./lib/settings');
const log = require('./lib/logger');
const activityLog = require('./lib/activity-log');

const {
    useMongoAuthState,
    listMongoSessionIds,
    deleteMongoSession,
} = require('./lib/mongo-auth-state');

// Persistent storage
const STORAGE_ROOT = process.env.SHADOW_DATA_DIR || process.cwd();

const AUTH_ROOT = path.join(STORAGE_ROOT, 'session');
const DATA_ROOT = path.join(STORAGE_ROOT, 'data', 'sessions');

fs.mkdirSync(AUTH_ROOT, { recursive: true });
fs.mkdirSync(DATA_ROOT, { recursive: true });

// Session storage
const activeSessions = new Map();
const generations = new Map();
const retries = new Map();
const timers = new Map();
const pairingTimers = new Map();
const replacedAt = new Map();

const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

// Remember sent messages for WhatsApp resend requests.
const sentStore = new Map();

function rememberSent(id, message) {
    sentStore.set(id, message);

    if (sentStore.size > 3000) {
        sentStore.delete(sentStore.keys().next().value);
    }
}

function retryCache() {
    const cache = new Map();

    return {
        get: (key) => cache.get(key),

        set: (key, value) => {
            cache.set(key, value);

            if (cache.size > 5000) {
                cache.delete(cache.keys().next().value);
            }
        },

        del: (key) => cache.delete(key),

        flushAll: () => cache.clear(),
    };
}

// Clear pairing timer.
function clearPairingTimer(sessionId) {
    const timer = pairingTimers.get(sessionId);

    if (timer) {
        clearTimeout(timer);
        pairingTimers.delete(sessionId);
    }
}

// Session locking
const LOCK_FRESH = 30000;

const safeId = (id) => {
    const value = String(id);

    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) {
        throw new Error('Invalid session ID');
    }

    return value;
};

const authDir = (id) => path.join(AUTH_ROOT, safeId(id));
const dataDir = (id) => path.join(DATA_ROOT, safeId(id));
const lockFile = (id) => path.join(authDir(id), '.lock');

function lockConflict(sessionId) {
    try {
        const { pid, ts } = JSON.parse(
            fs.readFileSync(lockFile(sessionId), 'utf8')
        );

        if (
            pid === process.pid ||
            Date.now() - ts > LOCK_FRESH
        ) {
            return null;
        }

        process.kill(pid, 0);

        return pid;
    } catch {
        return null;
    }
}

function writeLock(sessionId) {
    try {
        fs.mkdirSync(authDir(sessionId), { recursive: true });

        fs.writeFileSync(
            lockFile(sessionId),
            JSON.stringify({
                pid: process.pid,
                ts: Date.now(),
            })
        );
    } catch (err) {
        log.warn(
            `session:${sessionId}`,
            `could not write session lock: ${err.message}`
        );
    }
}

// Refresh active session locks.
setInterval(() => {
    for (const id of activeSessions.keys()) {
        writeLock(id);
    }
}, 10000).unref();

// Delete session files.
function wipeSessionFiles(sessionId) {
    const id = safeId(sessionId);

    for (const dir of [authDir(id), dataDir(id)]) {
        try {
            fs.rmSync(dir, {
                recursive: true,
                force: true,
            });
        } catch (err) {
            log.warn(
                `session:${id}`,
                `could not delete ${dir}: ${err.message}`
            );
        }
    }
}

// Check whether a session has completed pairing.
function isPaired(sessionId) {
    try {
        const creds = JSON.parse(
            fs.readFileSync(
                path.join(authDir(sessionId), 'creds.json'),
                'utf8'
            )
        );

        return !!creds.me;
    } catch {
        return false;
    }
}

const isRunning = (sessionId) =>
    activeSessions.has(sessionId);

const isConnected = (sessionId) =>
    !!activeSessions.get(sessionId)?.connected;

// List saved paired sessions.
function listSavedSessionIds() {
    try {
        return fs
            .readdirSync(AUTH_ROOT, { withFileTypes: true })
            .filter((dir) =>
                dir.isDirectory() &&
                !dir.name.startsWith('.') &&
                !dir.name.startsWith('_')
            )
            .map((dir) => dir.name)
            .filter((id) => isPaired(id));
    } catch {
        return [];
    }
}

// Send a message to the account itself.
async function sendToSelf(sessionId, text) {
    const entry = activeSessions.get(sessionId);

    if (!entry?.connected) {
        throw new Error('session is not connected');
    }

    const jid = String(entry.sock.user?.id || '')
        .replace(/:\d+(?=@)/, '');

    return entry.sock.sendMessage(jid, { text });
}

// WhatsApp version cache.
let versionCache = {
    at: 0,
    version: undefined,
};

async function waVersion() {
    if (
        versionCache.version &&
        Date.now() - versionCache.at < 6 * 60 * 60 * 1000
    ) {
        return versionCache.version;
    }

    try {
        const result = await fetchLatestBaileysVersion();

        if (result?.version) {
            versionCache = {
                at: Date.now(),
                version: result.version,
            };
        }
    } catch (err) {
        log.warn(
            'session',
            `could not fetch WhatsApp version (${err.message}) - using ${
                versionCache.version ? 'cached' : 'built-in'
            } version`
        );
    }

    return versionCache.version;
}

// Safe callback execution.
function fire(tag, fn, ...args) {
    try {
        const result = fn?.(...args);

        if (result && typeof result.catch === 'function') {
            result.catch((err) =>
                log.error(tag, `callback failed: ${err.message}`)
            );
        }
    } catch (err) {
        log.error(tag, `callback failed: ${err.message}`);
    }
}

/**
 * Starts or restarts one isolated WhatsApp session.
 */
async function startSession(sessionId, opts = {}) {
    sessionId = safeId(sessionId);

    const {
        restored,
        pairingNumber,
        customPairingCode,
        onPairingCode,
        onPairingError,
        onPairingFailed,
        onConnected,
        onDisconnected,
        onLoggedOut,
        onReplaced,
    } = opts;

    const tag = `session:${sessionId}`;

    const other = lockConflict(sessionId);

    if (other) {
        throw new Error(
            `this session is already running in another process (pid ${other}). Stop the other copy first.`
        );
    }

    // Cancel previous timers before starting another generation.
    clearTimeout(timers.get(sessionId));
    timers.delete(sessionId);
    clearPairingTimer(sessionId);

    const gen = (generations.get(sessionId) || 0) + 1;

    generations.set(sessionId, gen);

    // Stop any previous socket for this session.
    const previous = activeSessions.get(sessionId);

    if (previous) {
        activeSessions.delete(sessionId);
        previous.stopping = true;

        try {
            previous.sock.end(undefined);
        } catch {
            // Already closed.
        }
    }

    const { state, saveCreds } = await useMultiFileAuthState(
        authDir(sessionId)
    );

    const version = await waVersion();

    if (generations.get(sessionId) !== gen) {
        return null;
    }

    const settings = createSessionSettings(
        sessionId,
        config.prefix
    );

    if (restored && !settings.get('notifiedConnected')) {
        settings.set('notifiedConnected', true);
    }

    const sock = makeWASocket({
        ...(version ? { version } : {}),
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '20.0.04'],

        getMessage: async (key) =>
            sentStore.get(key.id),

        msgRetryCounterCache: retryCache(),
    });

    // Remember sent messages.
    const rawSend = sock.sendMessage.bind(sock);

    sock.sendMessage = async (...args) => {
        const result = await rawSend(...args);

        if (result?.key?.id && result.message) {
            rememberSent(result.key.id, result.message);
        }

        const destination = String(args[0] || '');
        activityLog.writeEvent(
            sessionId,
            'outgoing',
            'Bot sent a WhatsApp message (content hidden)',
            'info',
            { scope: destination.endsWith('@g.us') ? 'group' : 'private' }
        );

        return result;
    };

    writeLock(sessionId);

    const entry = {
        sock,
        settings,
        sessionId,
        stopping: false,
        wiped: false,
        connected: false,
    };

    activeSessions.set(sessionId, entry);

    const creds = sock.authState.creds;

    // Request pairing code with a tracked timer.
    if (!creds.registered && !creds.me && pairingNumber) {
        clearPairingTimer(sessionId);

        const pairingTimer = setTimeout(async () => {
            pairingTimers.delete(sessionId);

            if (
                entry.stopping ||
                entry.wiped ||
                activeSessions.get(sessionId) !== entry ||
                generations.get(sessionId) !== gen
            ) {
                return;
            }

            try {
                const code = customPairingCode
                    ? await sock.requestPairingCode(
                        pairingNumber,
                        customPairingCode
                    )
                    : await sock.requestPairingCode(pairingNumber);

                // Check again after the asynchronous request.
                if (
                    entry.stopping ||
                    entry.wiped ||
                    activeSessions.get(sessionId) !== entry ||
                    generations.get(sessionId) !== gen
                ) {
                    return;
                }

                fire(tag, onPairingCode, code);
            } catch (err) {
                log.error(
                    tag,
                    `pairing code request failed: ${err.message}`
                );

                if (/429|rate/i.test(err.message)) {
                    log.warn(
                        tag,
                        'rate-limited by WhatsApp - wait a few minutes before retrying.'
                    );
                }

                if (
                    !entry.stopping &&
                    !entry.wiped &&
                    activeSessions.get(sessionId) === entry
                ) {
                    fire(tag, onPairingError, err);
                }
            }
        }, 3000);

        pairingTimers.set(sessionId, pairingTimer);
    }

    sock.ev.on('creds.update', () => {
        if (entry.wiped) return;

        Promise.resolve(saveCreds()).catch((err) => {
            log.warn(tag, `could not save credentials: ${err.message}`);
        });
    });

    sock.ev.on('connection.update', (update) => {
        if (update.connection === 'connecting') {
            activityLog.writeEvent(sessionId, 'connection', 'WhatsApp connection starting', 'info');
        }
        if (activeSessions.get(sessionId) !== entry) {
            return;
        }

        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            clearPairingTimer(sessionId);
            activityLog.writeEvent(sessionId, 'connection', `WhatsApp disconnected (code ${lastDisconnect?.error?.output?.statusCode ?? 'unknown'})`, 'warn', { code: lastDisconnect?.error?.output?.statusCode });

            const statusCode =
                lastDisconnect?.error?.output?.statusCode;

            activeSessions.delete(sessionId);
            entry.connected = false;

            if (entry.stopping) return;

            // Logged out.
            if (statusCode === DisconnectReason.loggedOut) {
                entry.wiped = true;

                retries.delete(sessionId);

                wipeSessionFiles(sessionId);

                log.warn(tag, 'logged out - session files deleted');

                fire(tag, onLoggedOut);

                return;
            }

            const restartRequired =
                statusCode === DisconnectReason.restartRequired;

            // Connection replaced elsewhere.
            if (
                statusCode ===
                (DisconnectReason.connectionReplaced ?? 440)
            ) {
                const now = Date.now();

                const recent = (
                    replacedAt.get(sessionId) || []
                ).filter((time) => now - time < 5 * 60 * 1000);

                recent.push(now);

                replacedAt.set(sessionId, recent);

                if (recent.length >= 2) {
                    replacedAt.delete(sessionId);

                    log.error(
                        tag,
                        'this login keeps being opened somewhere else - stopping THIS copy (files kept). Close the other copy, then use /pair with the number to resume.'
                    );

                    fire(tag, onReplaced);

                    return;
                }

                log.warn(
                    tag,
                    'opened somewhere else - retrying once in 30s'
                );

                clearTimeout(timers.get(sessionId));

                timers.set(
                    sessionId,
                    setTimeout(() => {
                        timers.delete(sessionId);

                        if (generations.get(sessionId) === gen) {
                            startSession(sessionId, opts).catch((err) =>
                                log.error(
                                    tag,
                                    `restart failed: ${err.message}`
                                )
                            );
                        }
                    }, 30000)
                );

                return;
            }

            // Pairing never completed.
            if (!sock.authState.creds.me && !restartRequired) {
                entry.wiped = true;

                retries.delete(sessionId);

                wipeSessionFiles(sessionId);

                log.warn(
                    tag,
                    `pairing did not complete (code ${statusCode}) - session files deleted`
                );

                fire(tag, onPairingFailed, statusCode);

                return;
            }

            // Normal reconnect.
            const failures = restartRequired
                ? 0
                : (retries.get(sessionId) || 0) + 1;

            retries.set(sessionId, failures);

            const delay = restartRequired
                ? 0
                : Math.min(
                    60000,
                    2000 * 2 ** Math.min(failures - 1, 5)
                );

            log.warn(
                tag,
                `closed (${statusCode}). reconnecting in ${Math.round(delay / 1000)}s`
            );

            fire(tag, onDisconnected, true);

            clearTimeout(timers.get(sessionId));

            timers.set(
                sessionId,
                setTimeout(() => {
                    timers.delete(sessionId);

                    if (generations.get(sessionId) !== gen) {
                        return;
                    }

                    startSession(sessionId, opts).catch((err) =>
                        log.error(
                            tag,
                            `restart failed: ${err.message}`
                        )
                    );
                }, delay)
            );
        }

        // Connected.
        else if (connection === 'open') {
            clearPairingTimer(sessionId);

            entry.connected = true;

            retries.delete(sessionId);

            log.success(tag, `${config.botName} is online`);
            activityLog.writeEvent(sessionId, 'connection', 'WhatsApp bot connected successfully', 'success');

            const ownJid =
                sock.user?.id?.split(':')[0] + '@s.whatsapp.net';

            const owners = settings.get('owners', []);

            if (ownJid && !owners.includes(ownJid)) {
                settings.set('owners', [...owners, ownJid]);
            }

            const isFirstTime =
                !settings.get('notifiedConnected');

            if (isFirstTime) {
                settings.set('notifiedConnected', true);
            }

            fire(tag, onConnected, isFirstTime);

            Promise.resolve(
                onSessionOpen(sock, { sessionId, settings })
            ).catch((err) =>
                log.warn(
                    tag,
                    `post-connect tasks failed: ${err.message}`
                )
            );
        }
    });

    // Group updates.
    sock.ev.on('group-participants.update', (update) => {
        if (entry.stopping || entry.wiped) return;

        Promise.resolve(
            handleGroupUpdate(sock, update, { sessionId, settings })
        ).catch((err) =>
            log.warn(tag, `welcome handler: ${err.message}`)
        );
    });

    // Presence updates.
    sock.ev.on('presence.update', (update) => {
        if (entry.stopping || entry.wiped) return;

        try {
            handlePresence(sock, update);
        } catch (err) {
            log.warn(tag, `presence handler: ${err.message}`);
        }
    });

    // Calls.
    sock.ev.on('call', (calls) => {
        if (entry.stopping || entry.wiped) return;

        Promise.resolve(
            handleCalls(sock, calls, { sessionId, settings })
        ).catch((err) =>
            log.warn(tag, `call handler: ${err.message}`)
        );
    });

    // Messages.
    sock.ev.on('messages.upsert', (upsert) => {
        if (entry.stopping || entry.wiped) return;
        if (upsert.type === 'notify' && Array.isArray(upsert.messages) && upsert.messages.length) {
            const incoming = upsert.messages.filter((item) => !item.key?.fromMe).length;
            if (incoming) activityLog.writeEvent(sessionId, 'message', `${incoming} incoming message event${incoming === 1 ? '' : 's'} received`, 'info');
        }

        try {
            Promise.resolve(
                handleMessages(sock, upsert, { sessionId, settings })
            ).catch((err) =>
                log.warn(tag, `message handler: ${err.message}`)
            );
        } catch (err) {
            log.warn(tag, `message handler: ${err.message}`);
        }
    });

    return sock;
}

/**
 * Fully removes a session:
 * stops reconnects, cancels pairing requests,
 * logs out, closes socket and deletes files.
 */
async function removeSession(sessionId) {
    sessionId = safeId(sessionId);

    generations.set(
        sessionId,
        (generations.get(sessionId) || 0) + 1
    );

    clearTimeout(timers.get(sessionId));
    timers.delete(sessionId);

    clearPairingTimer(sessionId);

    retries.delete(sessionId);
    replacedAt.delete(sessionId);

    const entry = activeSessions.get(sessionId);

    activeSessions.delete(sessionId);

    if (entry) {
        entry.stopping = true;
        entry.wiped = true;
        entry.connected = false;

        try {
            await Promise.race([
                entry.sock.logout(),
                sleep(8000),
            ]);
        } catch (err) {
            log.warn(
                `session:${sessionId}`,
                `logout error (ignoring): ${err.message}`
            );
        }

        try {
            entry.sock.end(undefined);
        } catch {
            // Already closed.
        }
    }

    wipeSessionFiles(sessionId);

    return !!entry;
}

function getSession(sessionId) {
    return activeSessions.get(sessionId);
}

function getAllSessions() {
    return activeSessions;
}

module.exports = {
    startSession,
    removeSession,
    stopSession: removeSession,
    getSession,
    getAllSessions,
    isPaired,
    isRunning,
    isConnected,
    listSavedSessionIds,
    sendToSelf,
    wipeSessionFiles,
};
