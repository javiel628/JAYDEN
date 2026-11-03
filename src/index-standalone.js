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
const config = require('./config');
const { startSession } = require('./session');
const { printBox, randomColor, ask } = require('./lib/console');
const log = require('./lib/logger');

printBox([`${config.botName}`, 'Starting up (standalone single-session mode)...']);

async function main() {
    let number = config.pairingNumber;
    if (!number) {
        number = await ask(randomColor('Enter phone number (e.g. 254123456789): '));
    }
    number = number.replace(/[^0-9]/g, '');

    await startSession('default', {
        pairingNumber: number,
        customPairingCode: config.customPairingCode,
        onPairingCode: (code) => {
            const formatted = code.match(/.{1,4}/g).join('-');
            printBox([
                `Number: ${number}`,
                `Pairing Code: ${formatted}`,
                'Open WhatsApp > Linked Devices',
                '> Link with phone number instead',
                '(enter it within ~60s, one attempt at a time)',
            ]);
        },
        onConnected: (isFirstTime) => {
            if (isFirstTime) log.success('index', 'paired for the first time!');
        },
    });
}

main().catch((err) => {
    log.error('fatal', err.stack || err.message);
    process.exit(1);
});
