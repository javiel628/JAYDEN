const express = require('express');
const path = require('path');
const { startSession, getAllSessions, isConnected } = require('./session');

const app = express();
app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(process.cwd(), 'public')));

const pendingCodes = new Map();
const lastRequests = new Map();
const MIN_INTERVAL_MS = 60_000;

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

app.get('/api/status', (_req, res) => {
  const sessions = getAllSessions();
  const connected = [...sessions.values()].some(s => s.connected);
  res.json({ connected, status: connected ? 'Connected' : 'Waiting for WhatsApp link' });
});

app.post('/api/pair', async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (phone.length < 10 || phone.length > 15) {
    return res.status(400).json({ error: 'Enter a valid international phone number, digits only.' });
  }

  const now = Date.now();
  const last = lastRequests.get(phone) || 0;
  if (now - last < MIN_INTERVAL_MS) {
    return res.status(429).json({ error: 'Please wait one minute before requesting another code.' });
  }
  lastRequests.set(phone, now);
  pendingCodes.set(phone, { code: null, error: null, at: now });

  try {
    await startSession(phone, {
      pairingNumber: phone,
      onPairingCode: code => {
        const item = pendingCodes.get(phone);
        if (item) item.code = String(code).match(/.{1,4}/g).join('-');
      },
      onPairingError: err => {
        const item = pendingCodes.get(phone);
        if (item) item.error = err?.message || 'WhatsApp could not issue a pairing code.';
      },
      onConnected: () => {
        const item = pendingCodes.get(phone);
        if (item) item.connected = true;
      }
    });
    return res.json({ message: 'Request started. Check again shortly for your pairing code.', requestId: phone });
  } catch (err) {
    pendingCodes.set(phone, { code: null, error: err?.message || 'Could not start pairing.', at: now });
    return res.status(409).json({ error: err?.message || 'Could not start pairing.' });
  }
});

app.get('/api/pair/:requestId', (req, res) => {
  const phone = normalizePhone(req.params.requestId);
  const item = pendingCodes.get(phone);
  if (!item) return res.status(404).json({ error: 'No pairing request found.' });
  if (Date.now() - item.at > 5 * 60_000) {
    pendingCodes.delete(phone);
    return res.status(410).json({ error: 'Pairing request expired. Request a new code.' });
  }
  res.json({ code: item.code, error: item.error, connected: !!item.connected });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`SHADOW MD pairing portal listening on ${port}`));
