'use strict';

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const ROOT = process.env.SHADOW_DATA_DIR || process.cwd();
const LOG_DIR = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'activity.jsonl');
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_MEMORY = 500;
const emitter = new EventEmitter();
emitter.setMaxListeners(100);
const recent = [];

fs.mkdirSync(LOG_DIR, { recursive: true });

function clean(value, max = 120) {
  return String(value ?? '').replace(/[\r\n\t]/g, ' ').slice(0, max);
}

function rotateIfNeeded(lineBytes) {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size + lineBytes > MAX_BYTES) {
      const previous = `${LOG_FILE}.1`;
      try { fs.rmSync(previous, { force: true }); } catch {}
      fs.renameSync(LOG_FILE, previous);
    }
  } catch (err) {
    // Logging must never interrupt bot processing.
  }
}

function writeEvent(sessionId, type, message, level = 'info', metadata = {}) {
  if (!sessionId) return null;
  const event = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    at: new Date().toISOString(),
    sessionId: clean(sessionId, 100),
    type: clean(type, 40),
    level: ['info', 'success', 'warn', 'error'].includes(level) ? level : 'info',
    message: clean(message, 240),
    metadata: {
      command: metadata.command ? clean(metadata.command, 40) : undefined,
      scope: metadata.scope ? clean(metadata.scope, 20) : undefined,
      code: metadata.code !== undefined ? clean(metadata.code, 30) : undefined,
    },
  };
  try {
    const line = `${JSON.stringify(event)}\n`;
    rotateIfNeeded(Buffer.byteLength(line));
    fs.appendFileSync(LOG_FILE, line, { mode: 0o600 });
  } catch (err) {
    // Keep logging failures from affecting WhatsApp sessions.
  }
  recent.push(event);
  if (recent.length > MAX_MEMORY) recent.shift();
  emitter.emit('event', event);
  return event;
}

function readEvents({ limit = 100, sessionId = '', level = '' } = {}) {
  const max = Math.max(1, Math.min(Number(limit) || 100, 300));
  const files = [`${LOG_FILE}.1`, LOG_FILE].filter((file) => fs.existsSync(file));
  const rows = [];
  for (const file of files) {
    try {
      const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try { rows.push(JSON.parse(line)); } catch {}
      }
    } catch {}
  }
  const filtered = rows.filter((row) =>
    (!sessionId || row.sessionId === sessionId) &&
    (!level || row.level === level)
  );
  return filtered.slice(-max).reverse();
}

function subscribe(listener) {
  emitter.on('event', listener);
  return () => emitter.off('event', listener);
}

module.exports = { writeEvent, readEvents, subscribe };

