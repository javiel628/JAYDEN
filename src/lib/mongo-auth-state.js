'use strict';

// MongoDB-backed Baileys auth state with a local-file fallback for migration.
// Set MONGODB_URI and optionally MONGODB_DB in the environment.
const { MongoClient } = require('mongodb');
const { BufferJSON, initAuthCreds } = require('@whiskeysockets/baileys');

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required for MongoDB auth storage');

const client = new MongoClient(uri);
let connectPromise;
async function collection() {
  if (!connectPromise) connectPromise = client.connect();
  await connectPromise;
  const db = client.db(process.env.MONGODB_DB || 'shadow_md');
  const coll = db.collection('baileys_auth');
  await coll.createIndex({ sessionId: 1, kind: 1, keyType: 1, keyId: 1 });
  return coll;
}

function encode(value) {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
}
function decode(value) {
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver);
}

async function useMongoAuthState(sessionId, localAuth) {
  const coll = await collection();
  const credsDoc = await coll.findOne({ sessionId, kind: 'creds' });
  const creds = credsDoc ? decode(credsDoc.value) : localAuth.state.creds;

  const keys = {
    async get(type, ids) {
      const result = {};
      const missing = [];
      for (const id of ids) {
        const doc = await coll.findOne({ sessionId, kind: 'key', keyType: type, keyId: id });
        if (doc) result[id] = decode(doc.value);
        else missing.push(id);
      }
      if (missing.length && localAuth?.state?.keys?.get) {
        const legacy = await localAuth.state.keys.get(type, missing);
        for (const id of missing) {
          if (legacy && legacy[id] !== undefined) {
            result[id] = legacy[id];
            await coll.updateOne(
              { sessionId, kind: 'key', keyType: type, keyId: id },
              { $set: { value: encode(legacy[id]) } },
              { upsert: true }
            );
          }
        }
      }
      return result;
    },
    async set(data) {
      const ops = [];
      for (const [type, entries] of Object.entries(data || {})) {
        for (const [id, value] of Object.entries(entries || {})) {
          const filter = { sessionId, kind: 'key', keyType: type, keyId: id };
          if (value == null) ops.push({ deleteOne: { filter } });
          else ops.push({ updateOne: { filter, update: { $set: { value: encode(value) } }, upsert: true } });
        }
      }
      if (ops.length) await coll.bulkWrite(ops);
    },
  };

  const state = { creds: creds || initAuthCreds(), keys };
  async function saveCreds() {
    await coll.updateOne(
      { sessionId, kind: 'creds' },
      { $set: { value: encode(state.creds), updatedAt: new Date() } },
      { upsert: true }
    );
    // Keep legacy local credentials updated during transition too.
    if (localAuth?.saveCreds) await localAuth.saveCreds();
  }
  if (!credsDoc) await saveCreds();
  return { state, saveCreds };
}

async function listMongoSessionIds() {
  const coll = await collection();
  const docs = await coll.find({ kind: 'creds' }, { projection: { sessionId: 1, value: 1 } }).toArray();
  return docs.filter(doc => decode(doc.value)?.me).map(doc => doc.sessionId);
}

async function deleteMongoSession(sessionId) {
  const coll = await collection();
  await coll.deleteMany({ sessionId });
}

module.exports = { useMongoAuthState, listMongoSessionIds, deleteMongoSession };
