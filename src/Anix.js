/*
╔══════════════════════════╗
║             𓆩 BASE TELE X WA 𓆪   
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
║  TELEGRAM : t.me/shenxidev 
║  © 2026 JAMESMODZ — ALL RIGHTS RESERVED 
╚════════════════════════╝
*/
const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('./lib/baileys');
const config = require('./config');
const { FONT_NAMES } = require('./lib/fonts');
const { serializeMessage } = require('./lib/serializer');
const { isOwner } = require('./middleware/owner');
const { requireGroup } = require('./middleware/group');
const { jidToNumber } = require('./lib/utils');
const { numOf, digits, senderNums, isSudo, isBanned, ownNums, ownerNums, botName, resolveTarget, isGroupAdmin, botIsAdmin } = require('./lib/access');
const { checkAntilink, checkEditedLink, getCfg: antilinkCfg, setCfg: setAntilinkCfg, getWarns, setWarns } = require('./lib/antilink');
const { GROUP_CMDS, runGroupCommand, trackPresence } = require('./commands/group');
const { handleParticipants } = require('./lib/welcome');
const { sendCopy } = require('./lib/buttons');
const { rememberMessage, handleRevoke } = require('./lib/antidelete');
const { chatReply, allowed: chatAllowed } = require('./lib/chatbot');
const { simulatePresence, startAlwaysOnline } = require('./lib/presence');
const { apiGet, uploadToCatbox } = require('./lib/api');
const log = require('./lib/logger');
const activityLog = require('./lib/activity-log');
const { handleStatus } = require('./lib/status');
const { followChannel, handleChannelPost } = require('./lib/channel');
const { postGroupStatus } = require('./lib/groupstatus');
const author = '𝐒𝚳𝚰𝐋𝚵 𝚳𝚯𝐃𝐙';

// ──────────────── EDIT HERE ────────────────
// Your WhatsApp channel. Put the channel LINK (https://whatsapp.com/channel/XXXX) or, if you know it,
// the channel id (1203630000000000@newsletter). The bot follows it on connect, auto-reacts to every new
// post, and uses the same link for the menu's Channel button.
const CHANNEL = {
    link: 'https://whatsapp.com/channel/0029Vb794NKBadmdwkPN6i0B',
    jid: '', // optional, e.g. '120363123456789012@newsletter' (skips the link lookup)
    emojis: ['❤️', '🔥', '😍', '💯', '👏'], // one is picked at random for each post
};
const SUPPORT_URL = 'https://chat.whatsapp.com/';
// ───────────────────────────────────────────

// Commands grouped by category, purely for the .menu screen — the switch
// below is the actual source of truth for what runs.
const MENU_GROUPS = [
    { title: 'GENERAL', items: ['menu', 'ping', 'alive', 'owner', 'getdp', 'rvo', 'vv', 'runtime', 'stats'] },
    {
        title: 'CUSTOMIZE',
        items: ['settings', 'setbotname', 'setprefix', 'setmenuimg', 'setfonts', 'mode', 'resetsettings'],
    },
    { title: 'PROTECTION', items: ['antilink', 'antidelete', 'anticall'] },
    { title: 'ACCESS', items: ['addsudo', 'delsudo', 'listsudo', 'ban', 'unban', 'listbanned', 'checkban', 'block', 'unblock', 'listblocked'] },
    { title: 'AUTOMATION', items: ['autoreply', 'autotype', 'autorecord', 'autorecordtype', 'alwaysonline', 'autostatusview', 'autostatuslike', 'statusemoji', 'autoreactch'] },
    { title: 'OWNER', items: ['public', 'self', 'setdp', 'restart', 'broadcast', 'report'] },
    { title: 'GROUP', items: ['kick', 'promote', 'demote', 'add', 'open', 'close', 'all', 'tagonline', 'tagoffline', 'approveall', 'listpending', 'rejectall', 'setgcname', 'setdesc', 'setgcpp', 'getppgc', 'link', 'resetlink', 'hidetag', 'admins', 'gcinfo', 'idgc', 'lock', 'unlock', 'disappear', 'joinapproval', 'welcome', 'goodbye', 'togcstatus', 'leave'] },
    { title: 'DOWNLOADS', items: ['play', 'webzip', 'pindl', 'tourl'] },
    { title: 'MEDIA', items: ['sticker', 'toimg', 'qr'] },
    { title: 'AI & EDIT', items: ['ai', 'upscale', 'toanime', 'editimg', 'fixerror'] },
    { title: 'LOOKUP', items: ['ppwa', 'pin', 'spotify', 'igstalk', 'idch', 'lyrics', 'weather', 'trt'] },
    { title: 'TOOLS', items: ['tts', 'calc', 'password', 'donate'] },
];

function buildMenuText(session, { withCommands = true } = {}) {
    const { settings } = session;
    const prefix = settings.get('prefix', config.prefix);
    const uptimeSec = process.uptime();
    const uptime = `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${Math.floor(uptimeSec % 60)}s`;
    const where = { all: '', gc: ' (groups only)', dm: ' (DMs only)' }[settings.get('workMode', 'all')] || '';
    const mode = (settings.get('public', true) ? 'Public' : 'Self') + where;
    const owners = settings.get('owners', []);
    const ownerNum = owners[0] ? jidToNumber(owners[0]) : 'not set';

    const lines = [];
    lines.push('┌─( *Bot Information*');
    lines.push('│友 Bot Name ‹ ' + botName(settings, config));
    lines.push('│友 Dev ‹  𝐒𝚳𝚰𝐋𝚵 𝚳𝚯𝐃𝐙');
    lines.push('│友 version ‹ last');
    lines.push('│友 Prefix ‹ ' + (prefix || 'none'));
    lines.push('│友 Mode ‹ ' + mode);
    lines.push('│友 Uptime ‹ ' + uptime);
    lines.push('└────────────●');
    lines.push('');

    if (!withCommands) return lines.join('\n').trim();

    for (const group of MENU_GROUPS) {
        const cmds = group.items;
        lines.push('┌─ ' + group.title);
        for (let i = 0; i < cmds.length; i++) {
            const branch = i === cmds.length - 1 ? '└─' : '├─';
            lines.push(`│${branch}${prefix}${cmds[i]}`);
        }
        lines.push('');
    }

    return lines.join('\n').trim();
    
}
async function sendMenu(m, session) {
    const { settings } = session;
    const fullText = buildMenuText(session);
    const configuredImage = settings.get('menuImage') || DEFAULT_MENU_IMAGE;

    // Send the menu as a normal WhatsApp image message. The previous code put
    // `image` and `title` directly inside interactiveMessage; Baileys expects
    // media in the interactive header, so WhatsApp displayed only the text.
    try {
        return await m.send({
            image: menuImagePayload(configuredImage),
            caption: fullText,
        });
    } catch (err) {
        log.error('menu', `configured menu image failed: ${err.message}`);
        // Try the bundled default URL once before falling back to text.
        if (configuredImage !== DEFAULT_MENU_IMAGE) {
            try {
                return await m.send({
                    image: { url: DEFAULT_MENU_IMAGE },
                    caption: fullText,
                });
            } catch (fallbackErr) {
                log.error('menu', `default menu image failed: ${fallbackErr.message}`);
            }
        }
        return m.reply(fullText);
    }
}



async function getQuotedMessage(m) {
    const ctx = m.raw.message?.[m.type]?.contextInfo;
    if (!ctx?.quotedMessage) return null;
    return {
        key: { remoteJid: m.from, id: ctx.stanzaId, participant: ctx.participant },
        message: ctx.quotedMessage,
    };
}

const DEFAULT_MENU_IMAGE = 'https://files.catbox.moe/6s94uf.jpeg';

/** A link, or a saved file; if the file is gone the default image is used so the menu always sends. */
function menuImagePayload(value) {
    if (/^https?:\/\//i.test(value)) return { url: value };
    try {
        return fs.readFileSync(value);
    } catch {
        return { url: DEFAULT_MENU_IMAGE };
    }
}

/** on/off words -> true/false, anything else -> null (meaning "just show the status") */
function parseSwitch(arg) {
    const a = String(arg || '').toLowerCase();
    if (['on', 'true', 'yes', 'enable', '1'].includes(a)) return true;
    if (['off', 'false', 'no', 'disable', '0'].includes(a)) return false;
    return null;
}
const senderNumsOf = (jid) => [numOf(jid)];

async function handleCommand(m, { args, sock, session }) {
    const { settings, sessionId } = session;
    const cmd = (m._cmd || '').toLowerCase();
    const owners = settings.get('owners', []);
    const owner = isOwner(m, owners) || isSudo(m, settings); // sudo users get the owner's powers
    const P = settings.get('prefix', config.prefix);
    const isPublic = settings.get('public', true);

    log.command(`[${sessionId}] wa.me/${jidToNumber(m.sender)}`, `${settings.get('prefix', config.prefix)}${cmd}`);

    if (!isPublic && !owner) return;

    if (GROUP_CMDS.has(cmd)) return runGroupCommand(cmd, m, { sock, settings, owner, args, P, getQuotedMessage });

    switch (cmd) {
        case 'menu':
        case 'help':
            return sendMenu(m, session);

        case 'ping': {
            const start = Date.now();
            await m.reply('Pinging...');
            return m.reply(`🏓 Pong! ${Date.now() - start}ms`);
        }

        case 'alive': {
            const s = process.uptime();
            const uptime = `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${Math.floor(s % 60)}s`;
            return m.reply(`✅ *${botName(settings, config)}* is alive!\nUptime: ${uptime}`);
        }

        case 'owner': {
            if (!owners.length) return m.reply('No owner number configured yet.');
            const list = owners.map((jid) => `wa.me/${jidToNumber(jid)}`).join('\n');
            return m.reply(`👑 Owner contact:\n${list}`);
        }

        case 'public':
            if (!owner) return m.reply('⛔ Owner only.');
            settings.set('public', true);
            return m.reply('✅ Bot is now *public* — anyone can use commands.');

        case 'self':
            if (!owner) return m.reply('⛔ Owner only.');
            settings.set('public', false);
            return m.reply('✅ Bot is now *self mode* — only the owner gets responses.');

        case 'setprefix': {
            if (!owner) return m.reply('⛔ Owner only.');
            const value = (args[0] || '').toLowerCase();
            if (!value) return m.reply('Usage: setprefix <character|none>');
            const newPrefix = value === 'none' ? '' : args[0];
            settings.set('prefix', newPrefix);
            return m.reply(newPrefix ? `✅ Prefix set to: ${newPrefix}` : '✅ Prefix removed — commands now work with no prefix.');
        }

        case 'setmenuimg': {
            if (!owner) return m.reply('⛔ Owner only.');
            const first = (args[0] || '').trim();
            if (/^(reset|default)$/i.test(first)) {
                settings.set('menuImage', DEFAULT_MENU_IMAGE);
                return m.reply('✅ Menu image reset to the default.');
            }
            if (/^https?:\/\//i.test(first)) {
                settings.set('menuImage', first);
                return m.reply('✅ Menu image set from the link. Send *' + P + 'menu* to see it.');
            }
            try {
                const quoted = await getQuotedMessage(m);
                const imgMsg = quoted?.message?.imageMessage || m.raw.message?.imageMessage;
                if (!imgMsg) return m.reply(`Reply to an image with *${P}setmenuimg*, send an image with it as the caption, or give a link:\n${P}setmenuimg https://...\n${P}setmenuimg reset`);
                const buffer = await downloadMediaMessage({ message: { imageMessage: imgMsg }, key: quoted?.message?.imageMessage ? quoted.key : m.key }, 'buffer', {});
                // inside the session folder (it survives panel updates and is removed with the session)
                const dir = path.join(process.cwd(), 'session', sessionId);
                fs.mkdirSync(dir, { recursive: true });
                const dest = path.join(dir, 'menu-image.jpg');
                fs.writeFileSync(dest, buffer);
                settings.set('menuImage', dest);
                return m.reply(`✅ Menu image updated. Send *${P}menu* to see it.`);
            } catch (err) {
                log.error('setmenuimg', err.stack || err.message);
                return m.reply(`❌ Could not set the menu image: ${err.message}`);
            }
        }

        case 'setfonts': {
            if (!owner) return m.reply('⛔ Owner only.');
            const style = (args[0] || '').toLowerCase();
            if (style === 'off' || !style) {
                settings.set('fontStyle', null);
                return m.reply('✅ Font styling turned off.');
            }
            if (!FONT_NAMES.includes(style)) return m.reply(`Unknown style. Options: ${FONT_NAMES.join(', ')}, off`);
            settings.set('fontStyle', style);
            return m.reply(`✅ Font style set to *${style}* (links are left untouched).`);
        }

        case 'autostatusview':
        case 'autostatuslike': {
            if (!owner) return m.reply('⛔ Owner only.');
            const key = cmd === 'autostatusview' ? 'autoStatusView' : 'autoStatusLike';
            const label = cmd === 'autostatusview' ? 'Auto status view' : 'Auto status like';
            const arg = (args[0] || '').toLowerCase();
            if (['on', 'true', 'yes', 'enable', '1'].includes(arg)) settings.set(key, true);
            else if (['off', 'false', 'no', 'disable', '0'].includes(arg)) settings.set(key, false);
            else return m.reply(`${label}: *${settings.get(key, false) ? 'ON' : 'OFF'}*\nUse: ${settings.get('prefix', config.prefix)}${cmd} on | off`);
            return m.reply(`✅ ${label}: *${settings.get(key) ? 'ON' : 'OFF'}*`);
        }

        case 'statusemoji': {
            if (!owner) return m.reply('⛔ Owner only.');
            const list = args.join(' ').match(/\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu) || [];
            if (!list.length) return m.reply(`Current status emojis: ${settings.get('statusEmojis', ['❤️']).join(' ')}\nSet: ${settings.get('prefix', config.prefix)}statusemoji ❤️ 🔥 😍 (one is picked at random)`);
            settings.set('statusEmojis', list.slice(0, 10));
            return m.reply(`✅ Status like emojis: ${list.slice(0, 10).join(' ')}`);
        }

        case 'autoreactch': {
            if (!owner) return m.reply('⛔ Owner only.');
            const arg = (args[0] || '').toLowerCase();
            if (['on', 'true', 'yes', 'enable', '1'].includes(arg)) settings.set('channelReact', true);
            else if (['off', 'false', 'no', 'disable', '0'].includes(arg)) settings.set('channelReact', false);
            else return m.reply(`Auto react on channel: *${settings.get('channelReact', true) ? 'ON' : 'OFF'}*\nUse: ${settings.get('prefix', config.prefix)}autoreactch on | off`);
            return m.reply(`✅ Auto react on channel: *${settings.get('channelReact') ? 'ON' : 'OFF'}*`);
        }

        case 'setdp': {
            if (!owner) return m.reply('⛔ Owner only.');
            const quoted = await getQuotedMessage(m);
            const imgMsg = quoted?.message?.imageMessage || m.raw.message?.imageMessage;
            if (!imgMsg) return m.reply("Reply to an image to set it as the bot's profile picture.");
            const buffer = await downloadMediaMessage({ message: { imageMessage: imgMsg }, key: m.key }, 'buffer', {});
            await sock.updateProfilePicture(sock.user.id, buffer);
            return m.reply('✅ Profile picture updated.');
        }

        case 'getdp': {
            const quoted = await getQuotedMessage(m);
            const target = quoted?.key?.participant || quoted?.key?.remoteJid || m.sender;
            try {
                const url = await sock.profilePictureUrl(target, 'image');
                return m.send({ image: { url }, caption: `Profile picture: wa.me/${jidToNumber(target)}` });
            } catch {
                return m.reply('No profile picture found (or privacy settings block it).');
            }
        }

        case 'rvo':
        case 'vv': {
            const quoted = await getQuotedMessage(m);
            const viewOnce =
                quoted?.message?.imageMessage?.viewOnce || quoted?.message?.videoMessage?.viewOnce
                    ? quoted.message
                    : quoted?.message?.viewOnceMessage?.message || quoted?.message?.viewOnceMessageV2?.message;
            if (!viewOnce) return m.reply('Reply to a view-once message with this command.');
            const mediaType = viewOnce.imageMessage ? 'imageMessage' : 'videoMessage';
            const buffer = await downloadMediaMessage({ message: viewOnce, key: quoted.key }, 'buffer', {});
            return m.send(
                mediaType === 'imageMessage'
                    ? { image: buffer, caption: viewOnce.imageMessage.caption || '' }
                    : { video: buffer, caption: viewOnce.videoMessage.caption || '' }
            );
        }

        case 'play': {
            const query = args.join(' ');
            if (!query) return m.reply('Usage: play <title or url>');
            try {
                const data = await apiGet(`/search/ytplayv2?q=${encodeURIComponent(query)}`);
                if (!data.status) return m.reply('Song not found.');
                const res = data.result;
                const mins = Math.floor(res.duration / 60);
                const secs = (res.duration % 60).toString().padStart(2, '0');
                await m.send({ image: { url: res.thumbnail }, caption: `🎵 ${res.title}\n⏱️ ${mins}:${secs}\n🔗 ${res.source}` });
                await m.send({ audio: { url: res.audio.url }, mimetype: 'audio/mpeg' });
            } catch (err) {
                log.error('play', err.message);
                return m.reply('Failed to process, try again later.');
            }
            return;
        }

        case 'ppwa': {
            const link = args.join(' ').trim();
            if (!link) return m.reply('Usage: ppwa <WhatsApp channel link>\nExample: ppwa https://whatsapp.com/channel/xxxx');
            if (!link.includes('https://whatsapp.com/channel/')) return m.reply('Invalid channel link.');
            try {
                const data = await apiGet(`/tools/getppchwa?link=${encodeURIComponent(link)}`);
                if (!data?.status || !data?.result?.photo) return m.reply('Channel photo not found.');
                return m.send({ image: { url: data.result.photo }, caption: `📢 WhatsApp Channel Profile Photo\n🔗 ${data.result.invite || link}` });
            } catch (err) {
                log.error('ppwa', err.message);
                return m.reply('Error fetching the channel photo.');
            }
        }

        case 'webzip': {
            const url = args.join(' ').trim();
            if (!url || !url.startsWith('http')) return m.reply('Usage: webzip <url>');
            try {
                await m.reply('🌐 Fetching website...');
                const data = await apiGet(`/tools/saveweb2zip?url=${encodeURIComponent(url)}`, 120000);
                if (!data?.status || !data?.result) return m.reply('Failed to fetch the website.');
                return m.send({ document: { url: data.result }, fileName: 'website.zip', mimetype: 'application/zip', caption: `📦 Website saved to zip\n🌍 ${url}` });
            } catch (err) {
                log.error('webzip', err.message);
                return m.reply('Something went wrong processing the website.');
            }
        }

        case 'upscale':
        case 'hd': {
            const quoted = await getQuotedMessage(m);
            const imgMsg = quoted?.message?.imageMessage;
            if (!imgMsg) return m.reply('Reply to a photo with this command.');
            try {
                await m.reply('⏳ Upscaling...');
                const buffer = await downloadMediaMessage({ message: { imageMessage: imgMsg }, key: quoted.key }, 'buffer', {});
                const hostedUrl = await uploadToCatbox(buffer, 'upscale-input.jpg');
                const data = await apiGet(`/tools/upscale?url=${encodeURIComponent(hostedUrl)}`);
                if (!data?.status || !data?.result?.upscale) return m.reply('Upscale failed.');
                return m.send({ image: { url: data.result.upscale }, caption: '✨ Upscale result' });
            } catch (err) {
                log.error('upscale', err.message);
                return m.reply('An error occurred while upscaling.');
            }
        }

        case 'ai': {
            const question = args.join(' ');
            if (!question) return m.reply('Usage: ai <question>');
            try {
                await m.reply('🤖 Thinking...');
                const data = await apiGet(`/ai/unliai?teks=${encodeURIComponent(question)}`);
                if (!data?.status || !data?.result?.response) return m.reply('Failed to get an answer.');
                return m.reply(`🤖 *Unlimited AI*\n\n📝 *Question:*\n${data.result.query}\n\n💬 *Answer:*\n${data.result.response}`);
            } catch (err) {
                log.error('ai', err.message);
                return m.reply('Error contacting the AI.');
            }
        }

        case 'pin': {
            const query = args.join(' ');
            if (!query) return m.reply('Usage: pin <search term>');
            try {
                await m.reply('🔎 Searching Pinterest...');
                const data = await apiGet(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(query)}&type=image`);
                const results = (data?.data || []).filter((v) => v.image_url).slice(0, 5);
                if (!results.length) return m.reply('No results found.');
                for (const r of results) await m.send({ image: { url: r.image_url } });
                return;
            } catch (err) {
                log.error('pin', err.message);
                return m.reply('Error fetching images.');
            }
        }

        case 'spotify': {
            const query = args.join(' ');
            if (!query) return m.reply('Usage: spotify <song name>');
            try {
                await m.reply('⏳ Searching...');
                const data = await apiGet(`/search/spotifyplay?query=${encodeURIComponent(query)}`);
                if (!data.status || !data.result) return m.reply('Song not found.');
                const s = data.result;
                const caption = `🎵 *SPOTIFY*\n\n🎶 Title: ${s.title}\n👤 Artist: ${s.artist}\n💿 Album: ${s.album}\n⏱ Duration: ${s.duration}\n🔗 ${s.url}`;
                if (s.download) return m.send({ audio: { url: s.download }, mimetype: 'audio/mpeg', caption });
                return m.reply(caption);
            } catch (err) {
                log.error('spotify', err.message);
                return m.reply('Error while playing the song.');
            }
        }

        case 'fixerror': {
            const quoted = await getQuotedMessage(m);
            let code = '';
            if (quoted?.message?.conversation) code = quoted.message.conversation;
            else if (quoted?.message?.extendedTextMessage?.text) code = quoted.message.extendedTextMessage.text;
            else if (quoted?.message?.documentMessage) {
                const buffer = await downloadMediaMessage({ message: quoted.message, key: quoted.key }, 'buffer', {});
                code = buffer.toString('utf8');
            }
            if (!code) return m.reply('Reply to a code snippet or a .js file.');
            if (code.length > 5000) return m.reply('Code is too long.');
            try {
                await m.reply('🧠 Fixing the code...');
                const prompt = `What is wrong with the following code?\n${code}\nplease fix it with no explanation`;
                const data = await apiGet(`/tools/fixerror?code=${encodeURIComponent(prompt)}&lang=javascript`, 30000);
                if (!data?.status || !data?.result?.fixed) return m.reply('Failed to fix the code.');
                const fixed = data.result.fixed;
                if (fixed.length < 4000) return m.reply(`✅ Fixed\n\n\`\`\`javascript\n${fixed}\n\`\`\``);
                return m.send({ document: Buffer.from(fixed), fileName: 'fixed.js', mimetype: 'text/javascript' });
            } catch (err) {
                log.error('fixerror', err.message);
                return m.reply('An error occurred.');
            }
        }

        case 'igstalk': {
            const username = args[0];
            if (!username) return m.reply('Usage: igstalk <username>');
            try {
                await m.reply('📥 Please wait...');
                const data = await apiGet(`/stalk/ig?username=${encodeURIComponent(username)}`);
                if (!data.status) return m.reply('Target not found — check the username.');
                const res = data.result;
                const cap =
                    `*IG STALKER - ${(res.fullname || '').toUpperCase()}*\n\n` +
                    `Username: @${res.username}\n` +
                    `Bio: ${res.biography || '-'}\n\n` +
                    `Followers: ${res.followers}\n` +
                    `Following: ${res.following}\n` +
                    `Posts: ${res.posts}\n\n` +
                    `Private: ${res.is_private ? 'Yes' : 'No'}\n` +
                    `Verified: ${res.is_verified ? 'Yes' : 'No'}`;
                if (res.profile_pic) return m.send({ image: { url: `https://images.weserv.nl/?url=${encodeURIComponent(res.profile_pic)}` }, caption: cap });
                return m.reply(cap);
            } catch (err) {
                log.error('igstalk', err.message);
                return m.reply('Error fetching data.');
            }
        }

        case 'toanime': {
            const quoted = await getQuotedMessage(m);
            const imgMsg = quoted?.message?.imageMessage;
            if (!imgMsg) return m.reply('Reply to a photo with this command.');
            try {
                await m.reply('⏳ Processing image...');
                const buffer = await downloadMediaMessage({ message: { imageMessage: imgMsg }, key: quoted.key }, 'buffer', {});
                const hostedUrl = await uploadToCatbox(buffer, 'toanime-input.jpg');
                const data = await apiGet(`/edit/nanobananav3?prompt=${encodeURIComponent('turn this photo into anime style')}&url=${encodeURIComponent(hostedUrl)}`);
                if (!data.status) return m.reply('Failed to process the image.');
                return m.send({ image: { url: data.result.result_url }, caption: '✅ Converted to anime style' });
            } catch (err) {
                log.error('toanime', err.message);
                return m.reply('An error occurred.');
            }
        }

        case 'editimg': {
            const quoted = await getQuotedMessage(m);
            const imgMsg = quoted?.message?.imageMessage;
            const prompt = args.join(' ');
            if (!prompt) return m.reply('Reply to a photo with a prompt.\nExample: editimg change the shirt to black');
            try {
                let hostedUrl;
                if (imgMsg) {
                    const buffer = await downloadMediaMessage({ message: { imageMessage: imgMsg }, key: quoted.key }, 'buffer', {});
                    hostedUrl = await uploadToCatbox(buffer, 'editimg-input.jpg');
                } else {
                    const match = prompt.match(/https?:\/\/\S+/);
                    if (!match) return m.reply('Reply to a photo, or include an image URL in the prompt.');
                    hostedUrl = match[0];
                }
                await m.reply('⏳ Editing...');
                const data = await apiGet(`/edit/nanobananav3?prompt=${encodeURIComponent(prompt)}&url=${encodeURIComponent(hostedUrl)}`);
                if (!data.status) return m.reply('Failed to edit the image.');
                return m.send({ image: { url: data.result.result_url }, caption: `Done.\n\nPrompt: ${prompt}` });
            } catch (err) {
                log.error('editimg', err.message);
                return m.reply('An error occurred.');
            }
        }

        case 'pindl': {
            const url = args[0];
            if (!url) return m.reply('Usage: pindl <pinterest link>');
            try {
                await m.reply('⏳ Fetching data...');
                const data = await apiGet(`/download/pindl?url=${encodeURIComponent(url)}`);
                if (!data?.status || !data?.result?.status) return m.reply('Failed to fetch data.');
                const best = data.result.best;
                if (!best?.url) return m.reply('Media not found.');
                const caption = `📌 *Pinterest Downloader*\n\n🎞️ Quality: ${best.quality}\n📦 Total media: ${data.result.total}`;
                if (best.url.includes('.mp4')) return m.send({ video: { url: best.url }, caption });
                return m.send({ image: { url: best.url }, caption });
            } catch (err) {
                log.error('pindl', err.message);
                return m.reply('An error occurred while processing.');
            }
        }

        case 'tourl': {
            const quoted = await getQuotedMessage(m);
            const media = quoted?.message?.imageMessage || quoted?.message?.videoMessage || quoted?.message?.documentMessage;
            const mediaType = quoted?.message?.imageMessage ? 'imageMessage' : quoted?.message?.videoMessage ? 'videoMessage' : 'documentMessage';
            if (!media) return m.reply('Reply to a photo/video/file with this command.');
            try {
                const buffer = await downloadMediaMessage({ message: { [mediaType]: media }, key: quoted.key }, 'buffer', {});
                const url = await uploadToCatbox(buffer, media.fileName || 'upload');
                return m.reply(`✅ Uploaded!\n🔗 ${url}`);
            } catch (err) {
                log.error('tourl', err.message);
                return m.reply(`Upload failed: ${err.message}`);
            }
        }

        // ───────────────────────── lookups ─────────────────────────
        case 'checkban': {
            const target = resolveTarget(m, args);
            if (target && !owner && numOf(target) !== numOf(m.sender)) return m.reply('⛔ Only the owner can check other numbers.');
            const who = target || m.senderAlt || m.sender;
            const num = numOf(who);
            const botBanned = (settings.get('banned', []) || []).includes(num);
            let wa = 'could not check';
            if (String(who).endsWith('@lid')) wa = 'cannot check a hidden (LID) id - give the phone number';
            else {
                try {
                    const [r] = (await sock.onWhatsApp(`${num}@s.whatsapp.net`)) || [];
                    wa = r?.exists ? 'registered ✅' : 'not found on WhatsApp ❌';
                } catch (err) {
                    wa = `check failed (${err.message})`;
                }
            }
            return m.reply(
                `🔎 *Ban check* · wa.me/${num}\n\n` +
                    `🤖 This bot: ${botBanned ? '🚫 *banned*' : '✅ not banned'}\n` +
                    `📱 WhatsApp: ${wa}\n\n` +
                    `_WhatsApp does not tell bots about bans. A number that is banned (or closed, or never existed) shows as "not found", so that result cannot tell those apart._`
            );
        }

        case 'idch': {
            const arg = args.join(' ').trim();
            const code = arg.match(/channel\/([A-Za-z0-9_-]+)/)?.[1];
            const direct = arg.match(/\b\d{10,}@newsletter\b/)?.[0];
            if (!code && !direct) return m.reply(`Usage: ${P}idch <channel link>\nExample: ${P}idch https://whatsapp.com/channel/0029Va...\n(you get the channel ID with a copy button)`);
            try {
                const meta = direct ? await sock.newsletterMetadata('jid', direct) : await sock.newsletterMetadata('invite', code);
                const jid = meta?.id || direct;
                if (!jid) return m.reply('❌ Channel not found. Check the link.');
                const name = meta?.name || meta?.thread_metadata?.name?.text || 'Channel';
                const subs = meta?.subscribers ?? meta?.thread_metadata?.subscribers_count;
                return sendCopy(m, { title: 'Channel ID', text: `📣 *${name}*${subs ? `\n👥 ${Number(subs).toLocaleString('en-US')} followers` : ''}\n🆔 ${jid}`, value: jid, label: 'Copy ID' });
            } catch (err) {
                return m.reply(`❌ Could not read that channel: ${err.message}`);
            }
        }

        // ───────────────────────── customize ─────────────────────────
        case 'setbotname': {
            if (!owner) return m.reply('⛔ Owner only.');
            const name = args.join(' ').trim().slice(0, 40);
            if (!name) return m.reply(`Usage: ${P}setbotname <name>\nUse "${P}setbotname reset" for the default (${config.botName}).`);
            if (/^(reset|default)$/i.test(name)) {
                settings.set('botName', '');
                return m.reply(`✅ Bot name reset to *${config.botName}*.`);
            }
            settings.set('botName', name);
            return m.reply(`✅ Your bot is now called *${name}*.`);
        }

        case 'mode': {
            if (!owner) return m.reply('⛔ Owner only.');
            const a = (args[0] || '').toLowerCase();
            if (a === 'public') settings.set('public', true);
            else if (a === 'self' || a === 'private') settings.set('public', false);
            else if (a === 'gc' || a === 'group') settings.set('workMode', 'gc');
            else if (a === 'dm' || a === 'pm') settings.set('workMode', 'dm');
            else if (a === 'all' || a === 'both') settings.set('workMode', 'all');
            else {
                const wm = { all: 'groups + DMs', gc: 'groups only', dm: 'DMs only' }[settings.get('workMode', 'all')];
                return m.reply(`*Mode*\nAccess: *${settings.get('public', true) ? 'public' : 'self'}*\nWorks in: *${wm}*\n\n${P}mode public | self\n${P}mode gc  (groups only)\n${P}mode dm  (DMs only)\n${P}mode all`);
            }
            const wm = { all: 'groups + DMs', gc: 'groups only', dm: 'DMs only' }[settings.get('workMode', 'all')];
            return m.reply(`✅ Access: *${settings.get('public', true) ? 'public' : 'self'}* · Works in: *${wm}*\n(the owner and sudo users can always use the bot)`);
        }

        case 'settings':
        case 'config': {
            if (!owner) return m.reply('⛔ Owner only.');
            const on = (v) => (v ? '✅ ON' : '❌ OFF');
            const wm = { all: 'groups + DMs', gc: 'groups only', dm: 'DMs only' }[settings.get('workMode', 'all')];
            const ad = settings.get('antidelete', {});
            const lines = [
                `⚙️ *${botName(settings, config)} — settings*`,
                '',
                `*Look*`,
                `• Name: ${botName(settings, config)}   (${P}setbotname)`,
                `• Prefix: ${P || 'none'}   (${P}setprefix)`,
                `• Menu image: ${settings.get('menuImage') ? 'custom' : 'none'}   (${P}setmenuimg)`,
                `• Font: ${settings.get('fontStyle') || 'normal'}   (${P}setfonts)`,
                '',
                `*Access*`,
                `• Mode: ${settings.get('public', true) ? 'public' : 'self'} · ${wm}   (${P}mode)`,
                `• Sudo users: ${(settings.get('sudo', []) || []).length}   (${P}addsudo)`,
                `• Banned: ${(settings.get('banned', []) || []).length}   (${P}ban)`,
                '',
                `*Protection*`,
                `• Anti-delete: ${on(ad.enabled)}${ad.enabled ? ` (${ad.mode === 'dm' ? 'owner DM' : 'same chat'})` : ''}   (${P}antidelete)`,
                `• Anti-call: ${settings.get('antiCall', 'off').toUpperCase()}   (${P}anticall)`,
                m.isGroup ? `• Antilink here: ${antilinkCfg(settings, m.from).mode.toUpperCase()}   (${P}antilink)` : `• Antilink: set it inside a group`,
                '',
                `*Automation*`,
                `• AI auto-reply: ${on(settings.get('autoReply'))}   (${P}autoreply)`,
                `• Auto typing: ${on(settings.get('autoType'))}   (${P}autotype)`,
                `• Auto recording: ${on(settings.get('autoRecord'))}   (${P}autorecord)`,
                `• Recording + typing: ${on(settings.get('autoRecordType'))}   (${P}autorecordtype)`,
                `• Always online: ${on(settings.get('alwaysOnline'))}   (${P}alwaysonline)`,
                `• Status view: ${on(settings.get('autoStatusView'))}   (${P}autostatusview)`,
                `• Status like: ${on(settings.get('autoStatusLike'))} ${settings.get('statusEmojis', ['❤️']).join('')}   (${P}autostatuslike)`,
                `• Channel auto-react: ${on(settings.get('channelReact', true))}   (${P}autoreactch)`,
            ];
            return m.reply(lines.join('\n'));
        }

        case 'resetsettings': {
            if (!owner) return m.reply('⛔ Owner only.');
            if ((args[0] || '').toLowerCase() !== 'confirm') return m.reply(`This resets name, prefix, menu image, font, modes, protection and automation to defaults.\nSudo, bans and owners are kept.\n\nType *${P}resetsettings confirm* to continue.`);
            const defaults = {
                public: true, prefix: config.prefix, menuImage: DEFAULT_MENU_IMAGE, fontStyle: null, botName: '', workMode: 'all',
                antilink: {}, antilinkWarns: {}, antidelete: { enabled: false, mode: 'chat' }, antiCall: 'off',
                autoReply: false, autoType: false, autoRecord: false, autoRecordType: false, alwaysOnline: false,
                autoStatusView: true, autoStatusLike: true, statusEmojis: ['❤️'], channelReact: true,
            };
            for (const [k, v] of Object.entries(defaults)) settings.set(k, v);
            return m.reply('✅ All settings are back to default.');
        }

        // ───────────────────────── access control ─────────────────────────
        case 'addsudo':
        case 'delsudo': {
            if (!owner) return m.reply('⛔ Owner only.');
            const target = resolveTarget(m, args);
            if (!target) return m.reply(`Reply to a person, @mention them, or type the number.\nExample: ${P}${cmd} 254712345678`);
            const num = numOf(target);
            const list = settings.get('sudo', []);
            if (cmd === 'addsudo') {
                if ([...ownNums(sock), ...owners.map(numOf)].includes(num)) return m.reply('That number is already an owner.');
                if (list.includes(num)) return m.reply('Already a sudo user.');
                settings.set('sudo', [...list, num]);
                return m.reply(`✅ @${num} is now *sudo* — owner commands work for them, even in self mode.`, { mentions: [target] });
            }
            if (!list.includes(num)) return m.reply('That number is not a sudo user.');
            settings.set('sudo', list.filter((x) => x !== num));
            return m.reply(`✅ @${num} is no longer sudo.`, { mentions: [target] });
        }

        case 'listsudo': {
            if (!owner) return m.reply('⛔ Owner only.');
            const list = settings.get('sudo', []);
            if (!list.length) return m.reply(`No sudo users yet.\nAdd one: ${P}addsudo <number>`);
            return m.reply(`👑 *Sudo users (${list.length})*\n${list.map((n, i) => `${i + 1}. wa.me/${n}`).join('\n')}`);
        }

        case 'ban':
        case 'unban': {
            if (!owner) return m.reply('⛔ Owner only.');
            const target = resolveTarget(m, args, { allowChat: true });
            if (!target) return m.reply(`Reply to a person, @mention them, or type the number.\nExample: ${P}${cmd} 254712345678`);
            const num = numOf(target);
            const list = settings.get('banned', []);
            if (cmd === 'ban') {
                if (ownerNums(sock, settings).includes(num)) return m.reply('⛔ You cannot ban an owner or sudo user.');
                if (list.includes(num)) return m.reply('Already banned.');
                settings.set('banned', [...list, num]);
                return m.reply(`🚫 @${num} is banned — the bot will ignore them.`, { mentions: [target] });
            }
            if (!list.includes(num)) return m.reply('That number is not banned.');
            settings.set('banned', list.filter((x) => x !== num));
            return m.reply(`✅ @${num} is unbanned.`, { mentions: [target] });
        }

        case 'listbanned': {
            if (!owner) return m.reply('⛔ Owner only.');
            const list = settings.get('banned', []);
            if (!list.length) return m.reply('Nobody is banned.');
            return m.reply(`🚫 *Banned (${list.length})*\n${list.map((n, i) => `${i + 1}. wa.me/${n}`).join('\n')}`);
        }

        case 'block':
        case 'unblock': {
            if (!owner) return m.reply('⛔ Owner only.');
            const target = resolveTarget(m, args, { allowChat: true });
            if (!target) return m.reply(`Reply to a person, @mention them, type the number, or use it in their private chat.`);
            if (ownerNums(sock, settings).includes(numOf(target))) return m.reply('⛔ You cannot block an owner or sudo user.');
            try {
                await sock.updateBlockStatus(target, cmd === 'block' ? 'block' : 'unblock');
                return m.reply(`✅ ${cmd === 'block' ? 'Blocked' : 'Unblocked'} wa.me/${numOf(target)}`);
            } catch (err) {
                return m.reply(`❌ Could not ${cmd}: ${err.message}`);
            }
        }

        case 'listblocked': {
            if (!owner) return m.reply('⛔ Owner only.');
            try {
                const list = (await sock.fetchBlocklist()) || [];
                if (!list.length) return m.reply('Your block list is empty.');
                return m.reply(`⛔ *Blocked (${list.length})*\n${list.map((j, i) => `${i + 1}. wa.me/${numOf(j)}`).join('\n')}`);
            } catch (err) {
                return m.reply(`❌ Could not read the block list: ${err.message}`);
            }
        }

        // ───────────────────────── protection 
        
            // ───────────────────────── media ─────────────────────────
    

    case 'toimg':
    case 'toimage': {
        const quoted = await getQuotedMessage(m);
        const st = quoted?.message?.stickerMessage || m.raw.message?.stickerMessage;
        if (!st) return m.reply('Reply to a sticker with this command.');
        try {
            const buffer = await downloadMediaMessage(
                { message: { stickerMessage: st }, key: quoted?.key || m.key },
                'buffer',
                {}
            );
            return m.send({ image: buffer, caption: '✅ Converted to image' });
        } catch (err) {
            log.error('toimg', err.message);
            return m.reply('❌ Failed to convert sticker.');
        }
    }

    // ───────────────────────── text tools ─────────────────────────
    case 'trt':
    case 'translate': {
        const text = args.join(' ').trim();
        if (!text) return m.reply(`Usage: ${P}trt <text>  (auto → English)\n${P}trt <lang> <text>  e.g. ${P}trt fr hello`);
        let lang = 'en', q = text;
        const m2 = text.match(/^([a-z]{2,3})\s+(.+)$/i);
        if (m2) { lang = m2[1].toLowerCase(); q = m2[2]; }
        try {
            await m.reply('🌐 Translating...');
            const data = await apiGet(`/tools/translate?text=${encodeURIComponent(q)}&to=${lang}`);
            const out = data?.result?.translated || data?.result?.text || data?.result;
            if (!out) return m.reply('Translation failed.');
            return m.reply(`🌐 *${lang.toUpperCase()}*\n${out}`);
        } catch (err) {
            log.error('trt', err.message);
            return m.reply('❌ Translation error.');
        }
    }

    case 'tts': {
        const text = args.join(' ').trim();
        if (!text) return m.reply(`Usage: ${P}tts <text>`);
        try {
            const data = await apiGet(`/tools/tts?text=${encodeURIComponent(text)}`);
            const url = data?.result?.url || data?.result;
            if (!url) return m.reply('TTS failed.');
            return m.send({ audio: { url }, mimetype: 'audio/mpeg', ptt: true });
        } catch (err) {
            log.error('tts', err.message);
            return m.reply('❌ TTS error.');
        }
    }

    case 'lyrics': {
        const q = args.join(' ').trim();
        if (!q) return m.reply(`Usage: ${P}lyrics <song title>`);
        try {
            await m.reply('🎵 Searching lyrics...');
            const data = await apiGet(`/search/lyrics?q=${encodeURIComponent(q)}`);
            const r = data?.result;
            if (!r) return m.reply('Lyrics not found.');
            const cap = `🎶 *${r.title || q}*${r.artist ? `\n👤 ${r.artist}` : ''}\n\n${r.lyrics || r.text || ''}`;
            return m.reply(cap.length > 6000 ? cap.slice(0, 6000) + '\n…' : cap);
        } catch (err) {
            log.error('lyrics', err.message);
            return m.reply('❌ Could not fetch lyrics.');
        }
    }

    case 'weather': {
        const city = args.join(' ').trim();
        if (!city) return m.reply(`Usage: ${P}weather <city>`);
        try {
            const data = await apiGet(`/tools/weather?q=${encodeURIComponent(city)}`);
            const r = data?.result;
            if (!r) return m.reply('City not found.');
            return m.reply(`🌦️ *${r.location || city}*\n🌡️ ${r.temp ?? '-'}°C (feels ${r.feels ?? '-'}°C)\n☁️ ${r.desc || r.condition || '-'}\n💧 Humidity: ${r.humidity ?? '-'}%\n💨 Wind: ${r.wind ?? '-'}`);
        } catch (err) {
            log.error('weather', err.message);
            return m.reply('❌ Weather lookup failed.');
        }
    }

    // ───────────────────────── utility ─────────────────────────
    case 'runtime':
    case 'uptime': {
        const s = process.uptime();
        return m.reply(`⏱️ Uptime: ${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${Math.floor(s % 60)}s`);
    }

    case 'stats': {
        const mem = process.memoryUsage();
        const mb = (n) => (n / 1024 / 1024).toFixed(1) + ' MB';
        return m.reply(
            `📊 *${botName(settings, config)} stats*\n` +
            `• Uptime: ${Math.floor(process.uptime() / 60)} min\n` +
            `• RSS: ${mb(mem.rss)}\n• Heap: ${mb(mem.heapUsed)} / ${mb(mem.heapTotal)}\n` +
            `• Node: ${process.version}\n• Platform: ${process.platform}`
        );
    }

    case 'calc': {
        const expr = args.join(' ').trim();
        if (!expr) return m.reply(`Usage: ${P}calc <expression>`);
        if (!/^[\d\s+\-*/().%]+$/.test(expr)) return m.reply('❌ Only numbers and + - * / ( ) % allowed.');
        try {
            // eslint-disable-next-line no-new-func
            const val = Function(`"use strict";return (${expr})`)();
            return m.reply(`🧮 ${expr} = *${val}*`);
        } catch {
            return m.reply('❌ Invalid expression.');
        }
    }

    case 'password': {
        const len = Math.min(Math.max(parseInt(args[0], 10) || 16, 6), 64);
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';
        let out = '';
        const crypto = require('crypto');
        for (let i = 0; i < len; i++) out += chars[crypto.randomInt(0, chars.length)];
        return m.reply(`🔐 Password (${len}):\n\`${out}\``);
    }

    case 'qr': {
        const text = args.join(' ').trim();
        if (!text) return m.reply(`Usage: ${P}qr <text or url>`);
        const url = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(text)}`;
        return m.send({ image: { url }, caption: '🔳 QR Code' });
    }

    // ───────────────────────── owner ─────────────────────────
    case 'restart': {
        if (!owner) return m.reply('⛔ Owner only.');
        await m.reply('♻️ Restarting...');
        process.exit(0); // panel/pm2 should restart automatically
    }

    case 'broadcast': {
        if (!owner) return m.reply('⛔ Owner only.');
        const text = args.join(' ').trim();
        if (!text) return m.reply(`Usage: ${P}broadcast <message>`);
        try {
            const groups = await sock.groupFetchAllParticipating();
            let n = 0;
            for (const jid of Object.keys(groups)) {
                try { await sock.sendMessage(jid, { text }); n++; } catch {}
            }
            return m.reply(`📢 Broadcast sent to ${n} group(s).`);
        } catch (err) {
            log.error('broadcast', err.message);
            return m.reply('❌ Broadcast failed.');
        }
    }

    
case 'report': {
    if (!owners.length) return m.reply('No owner configured.');

    const text = args.join(' ').trim();
    if (!text) return m.reply(`Usage: ${P}report <message>`);

    const to = owners[0];

    // Prefer the real phone-number JID over a LID
    const senderJid = m.senderAlt || m.sender;
    const senderNumber = jidToNumber(senderJid);

    try {
        await sock.sendMessage(to, {
            text: `📩 *NEW BOT REPORT*

👤 *Sender:* ${senderNumber}
📱 *WhatsApp:* https://wa.me/${senderNumber}

━━━━━━━━━━━━━━
📝 *Message:*
${text}
━━━━━━━━━━━━━━`
        });

        return m.reply('✅ Report sent to the owner.');
    } catch (err) {
        console.error('Report error:', err);
        return m.reply('❌ Could not send the report.');
    }
}


    
case 'donate': {
    return m.reply(`
╭━━〔 ☕ DONATE & SUPPORT 〕━━╮
┃
┃  ✨ *SUPPORT ${botName(settings, config)}*
┃
┃  Your support keeps this project
┃  growing and improving every day.
┃
┃  💎 *DONATION CONTACT*
┃  📞 +254107065646
┃
┃  📢 *JOIN OUR WHATSAPP CHANNEL*
┃  🔗 https://whatsapp.com/channel/0029Vb794NKBadmdwkPN6i0B
┃
┃  ❤️ Thank you for your support!
┃
╰━━━━━━━━━━━━━━━━━━━━╯

_© ${botName(settings, config)}_
`.trim());
}
break;


case 'enc':
case 'encrypt': {
    const JsConfuser = require('js-confuser');

    const quoted = m.quoted;

    if (!quoted) {
        return m.reply('❌ Reply to a JavaScript (.js) file.');
    }

    const fileName = quoted.fileName || quoted.msg?.fileName || '';

    if (!fileName.toLowerCase().endsWith('.js')) {
        return m.reply('❌ Only .js files are supported.');
    }

    try {
        await sock.sendMessage(m.chat, {
            react: { text: '⏳', key: m.key }
        });

        const docBuffer = await quoted.download();

        if (!docBuffer) {
            return m.reply('❌ Failed to download the file.');
        }

        const result = await JsConfuser.obfuscate(
            docBuffer.toString('utf-8'),
            {
                target: 'node',
                preset: 'high',
                compact: true,
                minify: true,
                flatten: true,

                identifierGenerator: function () {
                    const originalString = 'SMILEMODZ';
                    const randomString = (length) => {
                        let result = '';
                        const characters =
                            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

                        for (let i = 0; i < length; i++) {
                            result += characters.charAt(
                                Math.floor(Math.random() * characters.length)
                            );
                        }

                        return result;
                    };

                    return originalString + randomString(2);
                },

                renameVariables: true,
                renameGlobals: false,
                stringEncoding: true,
                stringSplitting: 0.0,
                stringConcealing: true,
                stringCompression: true,
                duplicateLiteralsRemoval: 1.0,
                controlFlowFlattening: 1.0,
                opaquePredicates: 0.9,
                deadCode: 0.0,
                dispatcher: true,
                calculator: true,
                hexadecimalNumbers: true,
                movedDeclarations: true,
                objectExtraction: true,
                globalConcealing: true
            }
        );

        const output = result.code || result;

        await sock.sendMessage(m.chat, {
            document: Buffer.from(output, 'utf-8'),
            mimetype: 'application/javascript',
            fileName: `SHADOW-${fileName}`,
            caption: `
╭━━〔 亗 SHADOW MD 亗 〕━━╮
┃
┃  🔐 ENCRYPTION SUCCESSFUL
┃
┃  📁 File: ${fileName}
┃  🛡️ Protection: HIGH
┃
┃  👨‍💻 DEVELOPER
┃  𝐒𝚳𝚰𝐋𝚵 𝚳𝚯𝐃𝐙
┃
╰━━━━━━━━━━━━━━━━━━╯
            `.trim()
        }, { quoted: m });

        await sock.sendMessage(m.chat, {
            react: { text: '✅', key: m.key }
        });

    } catch (err) {
        console.error('SHADOW ENCRYPT ERROR:', err);
        return m.reply(`❌ Encryption failed: ${err.message}`);
    }

    break;
}



        
        
        
        //─────────────────────────
        case 'antilink': {
            if (!(await requireGroup(m))) return;
            const admin = owner || (await isGroupAdmin(sock, m.from, senderNums(m)));
            if (!admin) return m.reply('⛔ Group admins only.');
            const sub = (args[0] || '').toLowerCase();
            const cfg = antilinkCfg(settings, m.from);
            const explain = { del: 'links are deleted', warn: `links are deleted + warning (kick at ${cfg.limit})`, kick: 'links are deleted and the sender is removed' };

            if (['del', 'delete', 'warn', 'kick'].includes(sub)) {
                const mode = sub === 'delete' ? 'del' : sub;
                const next = setAntilinkCfg(settings, m.from, { mode });
                return m.reply(`✅ Antilink *${mode.toUpperCase()}*: ${explain[mode].replace(String(cfg.limit), String(next.limit))}.\n(group admins are never touched — I must be admin)`);
            }
            if (sub === 'off') {
                setAntilinkCfg(settings, m.from, { mode: 'off' });
                return m.reply('✅ Antilink is *OFF* in this group.');
            }
            if (sub === 'setwarn') {
                const n = parseInt(args[1], 10);
                if (!(n >= 1 && n <= 10)) return m.reply(`Usage: ${P}antilink setwarn <1-10>`);
                setAntilinkCfg(settings, m.from, { limit: n });
                return m.reply(`✅ Warn limit set to *${n}* — the ${n}${['st', 'nd', 'rd'][n - 1] || 'th'} link gets the sender removed (in warn mode).`);
            }
            if (sub === 'resetwarn') {
                const target = resolveTarget(m, args.slice(1));
                const warns = getWarns(settings, m.from);
                if (target) {
                    const key = Object.keys(warns).find((k) => senderNumsOf(target).includes(k));
                    if (key) delete warns[key];
                    setWarns(settings, m.from, warns);
                    return m.reply(`✅ Warnings reset for @${numOf(target)}.`, { mentions: [target] });
                }
                setWarns(settings, m.from, {});
                return m.reply('✅ All antilink warnings in this group were reset.');
            }
            const warned = Object.keys(getWarns(settings, m.from)).length;
            const iAmAdmin = await botIsAdmin(sock, m.from);
            return m.reply(
                `*Antilink*  ·  now: *${cfg.mode.toUpperCase()}*  ·  warn limit: *${cfg.limit}*  ·  warned members: ${warned}\nI am admin here: ${iAmAdmin ? '✅ yes' : '❌ NO - make me admin or I cannot delete links'}\nGroup admins, the owner and sudo users are never touched.\n\n` +
                    `${P}antilink del — delete links\n${P}antilink warn — delete + warn, kick at the limit\n${P}antilink kick — delete + remove sender\n` +
                    `${P}antilink setwarn <n> — warnings before kick\n${P}antilink resetwarn [@user] — clear warnings\n${P}antilink off`
            );
        }

        case 'antidelete': {
            if (!owner) return m.reply('⛔ Owner only.');
            const a = (args[0] || '').toLowerCase();
            const cfg = { enabled: false, mode: 'chat', ...settings.get('antidelete', {}) };
            if (a === 'on') cfg.enabled = true;
            else if (a === 'off') cfg.enabled = false;
            else if (a === 'chat') Object.assign(cfg, { enabled: true, mode: 'chat' });
            else if (a === 'dm') Object.assign(cfg, { enabled: true, mode: 'dm' });
            else return m.reply(`*Anti-delete*: ${cfg.enabled ? `ON (${cfg.mode === 'dm' ? "sent to owner's DM" : 'shown in the same chat'})` : 'OFF'}\n\n${P}antidelete on | off\n${P}antidelete chat — re-send deleted messages in the same chat\n${P}antidelete dm — forward them to the owner's DM`);
            settings.set('antidelete', cfg);
            return m.reply(cfg.enabled ? `✅ Anti-delete *ON* — deleted messages ${cfg.mode === 'dm' ? "are forwarded to the owner's DM" : 'are re-sent in the same chat'}.` : '✅ Anti-delete *OFF*.');
        }

        case 'anticall': {
            if (!owner) return m.reply('⛔ Owner only.');
            const a = (args[0] || '').toLowerCase();
            if (!['hang', 'block', 'off'].includes(a)) return m.reply(`*Anti-call*: ${settings.get('antiCall', 'off').toUpperCase()}\n\n${P}anticall hang — reject every call\n${P}anticall block — reject and block the caller\n${P}anticall off`);
            settings.set('antiCall', a);
            return m.reply(a === 'off' ? '✅ Anti-call *OFF*.' : `✅ Anti-call *${a.toUpperCase()}* — ${a === 'hang' ? 'calls are rejected' : 'callers are rejected and blocked'} (owner and sudo are never affected).`);
        }
        
        
        
        
        
        
        
        
        
        
        
        

        // ───────────────────────── automation 
        
     case 'sticker':
case 'stiker':
case 's': {
    try {
        const quoted = await getQuotedMessage(m);
        const msg = quoted?.message || m.raw?.message;

        if (!msg) {
            return m.reply('📸 Reply to an image or short video to create a sticker.');
        }

        const media =
            msg.imageMessage ||
            msg.videoMessage ||
            msg.stickerMessage;

        if (!media) {
            return m.reply('❌ Reply to an image, video or sticker.');
        }

        if (msg.videoMessage && Number(msg.videoMessage.seconds || 0) > 10) {
            return m.reply('❌ Video must be 10 seconds or shorter.');
        }

        await m.reply('⏳ Creating sticker...');

        const buffer = await downloadMediaMessage(
            {
                message: msg,
                key: quoted?.key || m.key
            },
            'buffer',
            {}
        );

        await sock.sendMessage(
            m.chat,
            {
                sticker: buffer
            },
            {
                quoted: m.raw
            }
        );

    } catch (err) {
        log.error('sticker', err.message);
        return m.reply('❌ Failed to create sticker. Try another image or video.');
    }

    break;
}   


     case 'take':
case 'steal': {
    try {
        const quoted = await getQuotedMessage(m);
        const sticker = quoted?.message?.stickerMessage;

        if (!sticker) {
            return m.reply('❌ Reply to a sticker with .take');
        }

        await m.reply('⏳ Updating sticker metadata...');

        const buffer = await downloadMediaMessage(
            {
                message: { stickerMessage: sticker },
                key: quoted.key
            },
            'buffer',
            {}
        );

        const stickerBuffer = await writeExifWebp(
            buffer,
            {
                packname: '',
                author: '𝐒𝚳𝚰𝐋𝚵 𝚳𝚯𝐃𝐙'
            }
        );

        await sock.sendMessage(
            m.chat,
            { sticker: stickerBuffer },
            { quoted: m.raw }
        );

    } catch (err) {
        log.error('take', err);
        return m.reply('❌ Failed to update sticker metadata.');
    }
    break;
}   
        
        
        
        
        
        
        //─────────────────────────
        case 'autoreply':
        case 'autotype':
        case 'autorecord':
        case 'autorecordtype':
        case 'alwaysonline': {
            if (!owner) return m.reply('⛔ Owner only.');
            const map = {
                autoreply: ['autoReply', 'AI auto-reply'],
                autotype: ['autoType', 'Auto typing'],
                autorecord: ['autoRecord', 'Auto recording'],
                autorecordtype: ['autoRecordType', 'Auto recording + typing'],
                alwaysonline: ['alwaysOnline', 'Always online'],
            };
            const [key, label] = map[cmd];
            const v = parseSwitch(args[0]);
            if (v === null) {
                const extra = cmd === 'autoreply' ? '\nReplies in private chats, and in groups when the bot is @mentioned or replied to.' : '';
                return m.reply(`${label}: *${settings.get(key, false) ? 'ON' : 'OFF'}*\nUse: ${P}${cmd} on | off${extra}`);
            }
            settings.set(key, v);
            if (v && ['autoType', 'autoRecord', 'autoRecordType'].includes(key)) {
                for (const other of ['autoType', 'autoRecord', 'autoRecordType']) if (other !== key) settings.set(other, false); // one presence style at a time
            }
            if (key === 'alwaysOnline') {
                if (v) {
                    startAlwaysOnline(sock, settings);
                    sock.sendPresenceUpdate('available').catch(() => {});
                } else sock.sendPresenceUpdate('unavailable').catch(() => {});
            }
            return m.reply(`✅ ${label}: *${v ? 'ON' : 'OFF'}*`);
        }

        case 'togcstatus':
        case 'togs': {
            if (!owner) return m.reply('⛔ Owner only.');
            if (!(await requireGroup(m))) return;
            const p = settings.get('prefix', config.prefix);
            const text = args.join(' ').trim();
            const quoted = await getQuotedMessage(m);
            const qm = quoted?.message || {};

            // media: attached to this very command, or the message you replied to
            const sources = [
                { msg: m.raw.message, key: m.raw.key, own: true },
                ...(quoted ? [{ msg: qm, key: quoted.key }] : []),
            ];
            let payload = null;
            try {
                for (const src of sources) {
                    const img = src.msg?.imageMessage;
                    const vid = src.msg?.videoMessage;
                    const aud = src.msg?.audioMessage;
                    const media = img || vid || aud;
                    if (!media) continue;
                    const type = img ? 'imageMessage' : vid ? 'videoMessage' : 'audioMessage';
                    const buffer = await downloadMediaMessage({ message: { [type]: media }, key: src.key }, 'buffer', {});
                    const caption = src.own ? text : text || media.caption || '';
                    payload = img ? { image: buffer, caption } : vid ? { video: buffer, caption } : { audio: buffer, mimetype: 'audio/mp4' };
                    break;
                }
            } catch (err) {
                log.error('togcstatus', err.message);
                return m.reply(`❌ Could not read the media: ${err.message}`);
            }
            if (!payload) {
                const quotedText = qm.conversation || qm.extendedTextMessage?.text || '';
                const finalText = text || quotedText;
                if (!finalText) return m.reply(`*Group status*\n${p}${cmd} <text>\nReply to a photo/video/audio (optional caption)\nSend a photo/video with ${p}${cmd} as caption`);
                payload = { text: finalText };
            }
            try {
                await postGroupStatus(sock, m.from, payload);
                return m.reply('✅ Posted to this group\'s status.');
            } catch (err) {
                log.error('togcstatus', err.stack || err.message);
                return m.reply(`❌ Group status failed: ${err.message}`);
            }
        }

        default:
            return;
    }
}


/** AI auto-reply for messages that are not commands. */
async function maybeChatbot(m, { sock, settings, sessionId, owner }) {
    if (!settings.get('autoReply', false) || m.fromMe || !m.body || m.body.length > 600) return;
    if (!settings.get('public', true) && !owner) return;
    if (!['conversation', 'extendedTextMessage'].includes(m.type)) return;

    if (m.isGroup) {
        // in groups only when the bot is @mentioned or replied to
        const ctx = m.raw.message?.[m.type]?.contextInfo;
        const mine = ownNums(sock);
        const mentioned = (ctx?.mentionedJid || []).some((j) => mine.includes(numOf(j)));
        const repliedToMe = ctx?.quotedMessage && mine.includes(numOf(ctx.participant));
        if (!mentioned && !repliedToMe) return;
    }
    if (!chatAllowed(m.from)) return;

    const text = m.body.replace(/@\d{6,}/g, '').trim(); // drop the @mention itself
    if (!text) return;
    try {
        sock.sendPresenceUpdate('composing', m.from).catch(() => {});
        const answer = await chatReply(sessionId, m.from, text);
        await m.reply(answer);
    } catch (err) {
        log.warn('chatbot', err.message);
    } finally {
        sock.sendPresenceUpdate('paused', m.from).catch(() => {});
    }
}

async function handleMessages(sock, { messages, type }, session) {
    if (type !== 'notify') return;
    const { settings, sessionId } = session;

    for (const raw of messages) {
        try {
            if (handleStatus(sock, raw, settings)) continue; // status@broadcast: auto view / like
            if (handleChannelPost(sock, raw, CHANNEL, settings)) continue; // channel post: auto react
            if (await handleRevoke(sock, sessionId, raw, settings)) continue; // someone deleted a message (anti-delete)
            const pm = raw.message?.protocolMessage;
            if (pm?.editedMessage && raw.key.remoteJid?.endsWith('@g.us')) {
                // a message was EDITED: if it now contains a link, remove it (the classic antilink bypass)
                const who = { fromMe: !!raw.key.fromMe, sender: raw.key.participant, senderAlt: raw.key.participantAlt || raw.key.participantPn };
                const own = isOwner(who, settings.get('owners', [])) || isSudo(who, settings);
                await checkEditedLink(sock, raw, settings, own);
                continue;
            }
            await rememberMessage(sock, sessionId, raw, settings); // keep it in case it gets deleted

            const m = serializeMessage(sock, raw, settings);
            if (!m) continue;

            const owner = isOwner(m, settings.get('owners', [])) || isSudo(m, settings);

            // gatekeeping: banned people and the "works in groups / DMs only" mode (owner + sudo are exempt)
            if (!owner && isBanned(m, settings)) continue;
            const workMode = settings.get('workMode', 'all');
            if (!owner && ((workMode === 'gc' && !m.isGroup) || (workMode === 'dm' && m.isGroup))) continue;

            if (!m.fromMe) simulatePresence(sock, m.from, settings); // autotype / autorecord

            if (await checkAntilink(m, { sock, settings, owner })) continue; // link posted in a protected group

            const prefix = settings.get('prefix', config.prefix);
            if (!m.body) continue;

            let withoutPrefix = null;
            if (prefix) {
                if (m.body.startsWith(prefix)) withoutPrefix = m.body.slice(prefix.length).trim();
            } else {
                withoutPrefix = m.body.trim();
            }

            const [cmdName, ...args] = (withoutPrefix || '').split(/\s+/);
            if (withoutPrefix === null || !cmdName) {
                await maybeChatbot(m, { sock, settings, sessionId, owner }); // not a command: chat with the AI if enabled
                continue;
            }

            m._cmd = cmdName;
            activityLog.writeEvent(sessionId, 'command', `Command .${String(cmdName).toLowerCase()} used`, 'info', { command: String(cmdName).toLowerCase(), scope: m.isGroup ? 'group' : 'private' });
            await handleCommand(m, { args, sock, session });
        } catch (err) {
            activityLog.writeEvent(sessionId, 'error', `Message handler error: ${err?.message || 'Unknown error'}`, 'error');
            log.error('handler', err.stack || err.message);
        }
    }
}

/** Incoming calls: reject (and optionally block) unless the caller is an owner / sudo user. */
async function handleCalls(sock, calls, session) {
    const { settings } = session;
    const mode = settings.get('antiCall', 'off');
    if (mode === 'off') return;
    for (const call of calls) {
        if (call.status !== 'offer') continue;
        const caller = call.from;
        if (ownerNums(sock, settings).includes(numOf(caller)) || ownerNums(sock, settings).includes(numOf(call.callerPn))) continue;
        try {
            await sock.rejectCall(call.id, caller);
        } catch (err) {
            log.warn('anticall', `reject failed: ${err.message}`);
        }
        await sock
            .sendMessage(caller, { text: mode === 'block' ? '📵 Calls are not allowed. You have been blocked.' : '📵 Calls are not allowed. Please send a message instead.' })
            .catch(() => {});
        if (mode === 'block') await sock.updateBlockStatus(caller, 'block').catch((e) => log.warn('anticall', `block failed: ${e.message}`));
    }
}

/** Someone joined / left a group: welcome / goodbye message. */
async function handleGroupUpdate(sock, update, session) {
    await handleParticipants(sock, update, session.settings);
}

/** Runs once each time a session's connection opens. */
async function onSessionOpen(sock, session) {
    if (session?.settings) startAlwaysOnline(sock, session.settings);
    await followChannel(sock, CHANNEL);
}

module.exports = { handleMessages, onSessionOpen, handleCalls, handleGroupUpdate, handlePresence: trackPresence };
