/*
╔══════════════════════════╗
║             SHADOW MD WHATSAPP BOT   
║                                      
║             ⚡ DEVELOPER CREDITS ⚡      
║                                   
║          ᴅᴇᴠᴇʟᴏᴘᴇʀ : ᴊᴀᴍᴇsᴍᴏᴅᴢ  
║          ᴛᴇᴀᴍ      : james Inc 

║  ⚠️  C R E D I T   N O T I C E  ⚠️ 

║  Do NOT remove or modify these credits
║  without permission from the original dev
║  Respect the work. Give credit where it's
║  due. Don't steal another developer's work.
║  WHATSAPP BOT 
║  © 2026 JAMESMODZ — ALL RIGHTS RESERVED 
╚════════════════════════╝
*/
const fs = require('fs');
const path = require('path');

/**
 * One settings store per paired WhatsApp session, keyed by phone number.
 * Isolation lives here: session A can never read or write session B's file,
 * because each gets its own JSONStore instance pointed at its own path.
 */
function createSessionSettings(sessionId, defaultPrefix) {
    // Lives inside the session folder on purpose: whoever keeps `session/` when updating the panel keeps
    // every user's customisation (sudo, bans, antilink, bot name...) together with their WhatsApp login.
    const storageRoot = process.env.SHADOW_DATA_DIR || process.cwd();
    const dir = path.join(storageRoot, 'session', sessionId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'bot-settings.json');
    const legacy = path.join(storageRoot, 'data', 'sessions', sessionId, 'settings.json'); // old location
    if (!fs.existsSync(file) && fs.existsSync(legacy)) {
        try { fs.copyFileSync(legacy, file); } catch { /* start fresh */ }
    }

    let data = {
        public: true,
        prefix: defaultPrefix,
        menuImage: "https://files.catbox.moe/6s94uf.jpeg",
        fontStyle: null,
        autoStatusView: true,
        autoStatusLike: true,
        statusEmojis: ['❤️'], // `.statusemoji` changes these; one is picked at random per status
        channelReact: true, // auto-react to new posts on the channel set in Anix.js
        owners: [], // filled with the session's own paired JID on first connect
        sudo: [], // numbers allowed to use owner commands (.addsudo / .delsudo)
        banned: [], // numbers the bot ignores completely (.ban / .unban)
        botName: '', // custom name (.setbotname); empty = default
        workMode: 'all', // 'all' | 'gc' (groups only) | 'dm' (private chats only)
        antilink: {}, // per group: { [groupJid]: { mode: 'off'|'del'|'warn'|'kick', limit: 3 } }
        antilinkWarns: {}, // per group: { [groupJid]: { [number]: warnings } }
        antidelete: { enabled: false, mode: 'chat' }, // mode: 'chat' (same chat) | 'dm' (owner's DM)
        autoType: false,
        autoRecord: false,
        autoRecordType: false,
        alwaysOnline: false,
        antiCall: 'off', // 'off' | 'hang' | 'block'
        autoReply: false, // AI chatbot
        notifiedConnected: false, // tracks whether the connection announcement has been shown
    };

    function load() {
        try {
            if (fs.existsSync(file)) data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
            else save();
        } catch (err) {
            console.error(`[settings:${sessionId}] failed to load:`, err.message);
        }
    }

    function save() {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    }

    load();

    return {
        get(key, fallback) {
            return key in data ? data[key] : fallback;
        },
        set(key, value) {
            data[key] = value;
            save();
            return value;
        },
        all() {
            return data;
        },
    };
}

module.exports = { createSessionSettings };
