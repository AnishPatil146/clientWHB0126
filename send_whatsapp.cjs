const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { exec } = require('child_process');
const qrcodeTerminal = require('qrcode-terminal');

const CLIENT_DIR = __dirname;
const DB_PATH = path.join(CLIENT_DIR, 'leads_WHB0126.db');
const AUTH_DIR = path.join(CLIENT_DIR, 'auth_info_WHB0126');

// Create auth directory if it doesn't exist
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

// Phone number to pair with (Indian country code +91 assumed for 10-digit 9398317754)
const TARGET_PHONE = "919398317754";

const US_AREA_CODES = [
  '800', '614', '212', '713', '312', '206', '215', '305', '404', '512', '303', '617', '201', '504', '213', '503', '214', '250'
];

/** Normalize lead phone to WhatsApp JID format */
function normalizeJid(phone) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  
  if (digits.length === 10) {
    const prefix = digits.substring(0, 3);
    if (US_AREA_CODES.includes(prefix)) {
      return '1' + digits + '@s.whatsapp.net';
    } else {
      return '91' + digits + '@s.whatsapp.net';
    }
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits + '@s.whatsapp.net';
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits + '@s.whatsapp.net';
  }
  return digits + '@s.whatsapp.net';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let sock;

async function initWhatsApp() {
  console.log(`\n======================================================`);
  console.log(`🔌 INITIALIZING WHB0126 WHATSAPP OUTREACH ENGINE...`);
  console.log(`======================================================`);

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Windows', 'Chrome', '110.0.0'],
    syncFullHistory: false,
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  // Request Pairing Code if not registered
  if (!sock.authState.creds.registered) {
    console.log(`\n📱 Requesting pairing code for +${TARGET_PHONE}...`);
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(TARGET_PHONE);
        console.log(`\n🔑====================================================`);
        console.log(`🔢 YOUR WHATSAPP LINKING CODE:  \x1b[32m\x1b[1m${code}\x1b[0m`);
        console.log(`======================================================`);
        console.log(`ℹ️ Open WhatsApp on your phone -> Linked Devices -> Link with Phone Number`);
        console.log(`   and enter the code above to connect.\n`);
      } catch (err) {
        console.error('❌ Failed to request pairing code:', err.message);
      }
    }, 3000);
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('\n======================================================');
      console.log('📷 SCAN WHATSAPP QR CODE TO CONNECT:');
      console.log('======================================================');
      qrcodeTerminal.generate(qr, { small: true });
      console.log('======================================================\n');
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(`⚠️ Connection closed. Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        initWhatsApp();
      } else {
        console.log('❌ Logged out. Please clear auth_info_WHB0126 directory and restart script to re-pair.');
      }
    } else if (connection === 'open') {
      console.log('\n✅ Connected successfully to WhatsApp!');
      console.log(`🤖 Logged in as: +${TARGET_PHONE}`);
      
      // Start sending campaign messages
      await sendCampaignMessages();
    }
  });

  // Listen for incoming replies to log them in the DB
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg || !msg.message || msg.key.fromMe) return;

    const senderJid = msg.key.remoteJid;
    if (!senderJid || senderJid.endsWith('@g.us') || senderJid === 'status@broadcast') return;

    const fromPhone = senderJid.split('@')[0];
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    if (!text) return;

    console.log(`\n📥 [Reply Received] From +${fromPhone}: "${text}"`);

    // Log reply and mark lead as replied in leads table
    const normalizedPhoneSearch = `%${fromPhone.slice(-10)}%`;
    db.run(
      `UPDATE leads SET status = 'replied', reply_received = 1, notes = COALESCE(notes, '') || '\n[WhatsApp Reply] ' || ? WHERE phone LIKE ?`,
      [text, normalizedPhoneSearch],
      (err) => {
        if (err) console.error(`❌ Failed to update lead reply in DB:`, err.message);
        else {
          console.log(`💾 Reply logged to leads database.`);
          
          // Re-export JSON
          triggerExport();
        }
      }
    );
  });
}

function triggerExport() {
  // Trigger Python JSON export to keep export file synchronized
  const pyScript = path.join(CLIENT_DIR, 'messaging.py');
  exec(`python "${pyScript}" export`, (err, stdout, stderr) => {
    if (!err) {
      console.log(`📤 Export JSON updated.`);
    }
  });
}

function getEligibleCountryCodes() {
  const currentHour = new Date().getHours(); // 0 to 23 (local IST time)
  
  if (currentHour >= 18 || currentHour < 8) {
    console.log(`⏰ [Timezone Routing] Night time (Hour: ${currentHour} IST). Targeting Western Hemisphere (USA/Canada - Country Code: 1)`);
    return ['1'];
  } else {
    console.log(`⏰ [Timezone Routing] Day time (Hour: ${currentHour} IST). Targeting Eastern + Western Hemisphere`);
    return ['1', '91', '61', '44', '65', '971', '49', '33', '34', '39', '41', '31', '64'];
  }
}

async function sendCampaignMessages() {
  console.log('\n🚀 Starting B2B WhatsApp Outreach Campaign Loop...');
  
  // Fetch all WhatsApp drafts
  db.all(
    `SELECT m.id as message_id, m.body, l.phone, l.company_name, l.id as lead_id, l.city, l.state
     FROM messages m
     JOIN leads l ON m.lead_id = l.id
     WHERE m.channel = 'whatsapp' AND m.status = 'draft'`,
    [],
    async (err, drafts) => {
      if (err) {
        console.error('❌ Error fetching drafts:', err.message);
        return;
      }

      if (!drafts || drafts.length === 0) {
        console.log('📭 No WhatsApp drafts pending. Outbox is empty.');
        console.log('📡 Engine listening for incoming messages...');
        return;
      }

      const eligibleCCs = getEligibleCountryCodes();
      const eligibleDrafts = drafts.filter(draft => {
        const jid = normalizeJid(draft.phone);
        if (!jid) return false;
        const cleanPhone = jid.split('@')[0];
        const isEligible = eligibleCCs.some(cc => cleanPhone.startsWith(cc));
        if (!isEligible) {
          console.log(`⏳ [Timezone Routing] Skipping +${cleanPhone} (${draft.company_name}) due to off-hours in their timezone.`);
        }
        return isEligible;
      });

      if (eligibleDrafts.length === 0) {
        console.log(`📭 No eligible WhatsApp drafts for the current timezone window (${eligibleCCs.join(', ')}).`);
        console.log('📡 Engine listening for incoming messages...');
        return;
      }

      console.log(`📦 Found ${eligibleDrafts.length} eligible WhatsApp drafts to send (out of ${drafts.length} total drafts).`);
      
      let sent = 0;
      let failed = 0;

      for (const draft of eligibleDrafts) {
        const jid = normalizeJid(draft.phone);
        if (!jid) {
          console.log(`❌ Invalid phone format for ${draft.company_name}: "${draft.phone}". Skipping.`);
          continue;
        }

        try {
          console.log(`\n📤 Sending message to ${draft.company_name} (+${jid.split('@')[0]})...`);
          
          await sock.sendMessage(jid, { text: draft.body });
          
          // Mark sent in messages table
          const nowStr = new Date().toISOString();
          await new Promise((resolve, reject) => {
            db.run(
              "UPDATE messages SET status = 'sent', sent_at = ? WHERE id = ?",
              [nowStr, draft.message_id],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });

          // Update lead status to contacted
          await new Promise((resolve, reject) => {
            db.run(
              "UPDATE leads SET status = 'contacted', contacted_at = ? WHERE id = ?",
              [nowStr, draft.lead_id],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });

          console.log(`✅ Message sent successfully.`);
          sent++;

          // Dynamic delay between 4 and 8 seconds to prevent rate limits
          const delay = Math.floor(Math.random() * 4000) + 4000;
          console.log(`⏳ Cooldown: Waiting ${(delay/1000).toFixed(1)}s...`);
          await sleep(delay);

        } catch (sendErr) {
          console.error(`❌ Failed to send to ${draft.company_name}:`, sendErr.message);
          failed++;
        }
      }

      console.log(`\n🏁 Campaign run finished. Sent: ${sent}, Failed: ${failed}`);
      
      // Update JSON export
      triggerExport();
      
      console.log('📡 Engine remaining online to monitor replies...');
    }
  );
}

// Start WhatsApp
initWhatsApp();
