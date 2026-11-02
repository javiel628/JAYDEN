'use strict';

const { MongoClient } = require('mongodb');
const {
    BufferJSON,
    initAuthCreds,
    proto,
} = require('./baileys');

let clientPromise;

function getCollection() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing');
    }

    if (!clientPromise) {
        const client = new MongoClient(process.env.MONGODB_URI);
        clientPromise = client.connect().then(() => client);
    }

    return clientPromise.then((client) =>
        client
            .db(process.env.MONGODB_DB || 'shadow_md')
            .collection('baileys_auth')
    );
}

const encode = (value) =>
    JSON.stringify(value, BufferJSON.replacer);

const decode = (value) =>
    value ? JSON.parse(value, BufferJSON.reviver) : null;

/**
 * MongoDB auth state with local-file fallback.
 * Local keys are copied into MongoDB when Baileys requests them.
 */
async function useMongoAuthState(sessionId, localAuth) {
    const collection = await getCollection();

    async function readCreds() {
        const doc = await collection.findOne({
            sessionId,
            kind: 'creds',
        });

        if (doc?.payload) {
            return decode(doc.payload);
        }

        // Keep an existing local login if MongoDB is empty.
        const creds = localAuth?.state?.creds || initAuthCreds();

        await collection.updateOne(
            { sessionId, kind: 'creds' },
            { $set: { payload: encode(creds) } },
            { upsert: true }
        );

        return creds;
    }

    const creds = await readCreds();

    const keys = {
        async get(type, ids) {
            const docs = await collection.find({
                sessionId,
                kind: 'key',
                type,
                keyId: { $in: ids },
            }).toArray();

            const result = {};

            for (const doc of docs) {
                result[doc.keyId] = decode(doc.payload);
            }

            const missing = ids.filter(
                (id) => result[id] === undefined
            );

            // Migrate missing keys from the old local auth folder.
            if (missing.length && localAuth?.state?.keys) {
                const localValues = await localAuth.state.keys.get(
                    type,
                    missing
                );

                for (const id of missing) {
                    const value = localValues?.[id];

                    if (value == null) continue;

                    result[id] = value;

                    await collection.updateOne(
                        {
                            sessionId,
                            kind: 'key',
                            type,
                            keyId: id,
                        },
                        {
                            $set: { payload: encode(value) },
                        },
                        { upsert: true }
                    );
                }
            }

            if (type === 'app-state-sync-key') {
                for (const id of ids) {
                    if (result[id]) {
                        result[id] =
                            proto.Message.AppStateSyncKeyData.fromObject(
                                result[id]
                            );
                    }
                }
            }

            return result;
        },

        async set(data) {
            for (const type of Object.keys(data)) {
                for (const id of Object.keys(data[type])) {
                    const value = data[type][id];

                    if (value == null) {
                        await collection.deleteOne({
                            sessionId,
                            kind: 'key',
                            type,
                            keyId: id,
                        });
                    } else {
                        await collection.updateOne(
                            {
                                sessionId,
                                kind: 'key',
                                type,
                                keyId: id,
                            },
                            {
                                $set: { payload: encode(value) },
                            },
                            { upsert: true }
                        );
                    }
                }
            }

            // Also update local files while migrating.
            if (localAuth?.state?.keys) {
                await localAuth.state.keys.set(data);
            }
        },
    };

    async function saveCreds() {
        await collection.updateOne(
            { sessionId, kind: 'creds' },
            { $set: { payload: encode(creds) } },
            { upsert: true }
        );

        // Keep the existing local session current during migration.
        if (localAuth?.saveCreds) {
            await localAuth.saveCreds();
        }
    }

    return {
        state: { creds, keys },
        saveCreds,
    };
}

async function listMongoSessionIds() {
    const collection = await getCollection();

    const docs = await collection.find({
        kind: 'creds',
    }).toArray();

    return docs
        .filter((doc) => {
            const creds = decode(doc.payload);
            return !!creds?.me;
        })
        .map((doc) => doc.sessionId);
}

async function deleteMongoSession(sessionId) {
    const collection = await getCollection();
    await collection.deleteMany({ sessionId });
}

module.exports = {
    useMongoAuthState,
    listMongoSessionIds,
    deleteMongoSession,
};
