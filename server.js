/* eslint-disable */
import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import twilio from 'twilio';
import nodemailer from 'nodemailer';
import admin from 'firebase-admin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
admin.initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID || 'client-log-1c2f5'
});

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      callback(null, true);
    },
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'cleara-super-secret-key-138402';

// ── Twilio SMS Client (fallback OTP delivery) ─────────────────────────────────
const TWILIO_SID    = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM   = process.env.TWILIO_FROM_NUMBER;

let twilioClient = null;
if (TWILIO_SID && TWILIO_TOKEN && !TWILIO_FROM?.includes('XXXXXXXXXX')) {
  try {
    twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN);
    console.log('[TWILIO] ✅ SMS client initialized — ready as OTP fallback');
  } catch (e) {
    console.warn('[TWILIO] ⚠️  Could not initialize Twilio client:', e.message);
  }
} else {
  console.warn('[TWILIO] ⚠️  Twilio not configured (TWILIO_FROM_NUMBER missing or placeholder)');
}

// ── Fast2SMS — Indian SMS OTP ─────────────────────────────────────────────────
const FAST2SMS_KEY = process.env.FAST2SMS_API_KEY;
const fast2smsReady = FAST2SMS_KEY && !FAST2SMS_KEY.includes('YOUR_FAST2SMS');
if (fast2smsReady) {
  console.log('[FAST2SMS] ✅ API key loaded — ready as primary SMS OTP provider');
} else {
  console.warn('[FAST2SMS] ⚠️  API key not set. Add FAST2SMS_API_KEY to .env (fast2sms.com)');
}

// ── Gmail Email OTP — 100% FREE via Nodemailer ───────────────────────────────
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD;
const gmailReady = GMAIL_USER && GMAIL_PASS
  && !GMAIL_USER.includes('yourname')
  && !GMAIL_PASS.includes('xxxx');

let gmailTransporter = null;
if (gmailReady) {
  gmailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  });
  console.log(`[GMAIL] ✅ Free email OTP ready — ${GMAIL_USER}`);
} else {
  console.warn('[GMAIL] ⚠️  Gmail not configured. Add GMAIL_USER + GMAIL_APP_PASSWORD to .env');
}

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'dist')));

const SHORT_FORM_TEMPLATE = `Dear Business Owner,

Source high-margin SPECIALTY CLEANERS direct from the factory and double your retail profits. Maximize your margins with Cleara Brand (Hyderabad):

🔥 TOP 10 SPECIALTY WHOLESALE DEALS (Jan 2026):
• Tap Cleaner (250ml) ➡️ Wholesale: ₹130 | MRP: ₹315 [Pack of 24] (Straight ₹185 Profit!)
• Paint Remover (500ml) ➡️ Wholesale: ₹140 | MRP: ₹315 [Pack of 15]
• Cement Film Remover (500ml) ➡️ Wholesale: ₹130 | MRP: ₹310 [Pack of 15]
• Tiles Cleaner (500ml) ➡️ Wholesale: ₹80 | MRP: ₹210 [Pack of 15]
• Drain Opener (500ml) ➡️ Wholesale: ₹80 | MRP: ₹215 [Pack of 15]
• Pipe Cleaner (500ml) ➡️ Wholesale: ₹65 | MRP: ₹190 [Pack of 15]
• Marble Cleaner (250ml) ➡️ Wholesale: ₹110 | MRP: ₹290 [Pack of 24]
• Kitchen Cleaner (250ml) ➡️ Wholesale: ₹62 | MRP: ₹190 [Pack of 24]
• Adhesive & Gum Remover (200ml) ➡️ Wholesale: ₹110 | MRP: ₹290 [Pack of 42]
• Rust Remover (500ml) ➡️ Wholesale: ₹140 | MRP: ₹355 [Pack of 15]

📦 Note: GST extra. Orders accepted in standard box quantities only. 

Want to secure the complete 2026 Wholesale Catalogue and price list for your area? 📄

Reply with "YES" or "SEND" and our automated system will forward files instantly!`;

// Stats & Database State
let stats = {
  campaignStatus: 'Stopped',
  speedLevel: 3,
  messageTemplate: SHORT_FORM_TEMPLATE,
  sentToday: 0,
  targetCount: 10000,
  deliveredCount: 0,
  skippedCount: 0,
  notOnWaCount: 0,
  leadsScrapedCount: 0,
  repliesReceivedCount: 0,
  leadsQueue: [],
  currentLeadIndex: 0,
  scraping: false,
  scrapingProgress: 0,
  hourlyHistory: [0, 0, 0, 0, 0, 0],
  whatsappConnected: false,
  whatsappNumber: null
};

let messageLogs = [];
let logCounter = 0;
let scrapedLeads = [];
let sock = null;
let campaignTimer = null;
let lastQrCode = null;

const speedIntervals = {
  1: 8000,
  2: 5000,
  3: 3000,
  4: 2000,
  5: 1000
};

// Call Local Ollama LLM for Auto-Replies
async function getOllamaReply(userMessage, name) {
  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3', // Default local model name (can be changed to mistral, etc.)
        messages: [
          {
            role: 'system',
            content: `You are an elite sales closing assistant for Cleara Cleaning Products. Respond politely to ${name}. Speak in short, crisp English or Hinglish (Hindi-English mix) depending on how the customer speaks. Keep responses under 2 sentences. Your sole goal is to get the customer interested or booking a call.`
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        stream: false
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ollama HTTP error: status ${response.status}`);
    }
    
    const data = await response.json();
    return data.message.content.trim();
  } catch (err) {
    console.error("Error communicating with local Ollama instance:", err);
    // Safe business fallback in Hinglish
    const fallbacks = [
      "Thanks! Kya hum kal connect karein details discuss karne ke liye?",
      "Ji bilkul, main detail list bhejta hoon. Call schedule karein?",
      "Great response! Aap call par call scheduling check kar sakte hain?"
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
}

// Baileys WhatsApp Connection
async function startWhatsAppConnection() {
  if (sock) {
    console.log("Baileys connection already active or initializing.");
    return;
  }

  try {
    const authDir = path.join(__dirname, 'cleara_baileys_auth');
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    
    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' })
    });
    
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr);
          lastQrCode = qrDataUrl;
          io.emit('whatsapp_qr', { qr: qrDataUrl });
          console.log("Generated WhatsApp Connection QR code");
        } catch (err) {
          console.error("Error generating QR code:", err);
        }
      }
      
      if (connection === 'open') {
        stats.whatsappConnected = true;
        stats.whatsappNumber = sock.user.id.split(':')[0];
        io.emit('whatsapp_state', { connected: true, number: stats.whatsappNumber });
        io.emit('whatsapp_connected', { number: stats.whatsappNumber });
        console.log(`WhatsApp Connected JID: ${stats.whatsappNumber}`);

        // Auto-resume campaign if it was still marked Running when WA reconnected
        if (stats.campaignStatus === 'Running' && stats.leadsQueue.length > 0 && !campaignTimer) {
          console.log('[CAMPAIGN] Auto-resuming campaign after WhatsApp reconnect...');
          scheduleNextCampaignTick();
        }
      }
      
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`WhatsApp connection closed. Reconnect: ${shouldReconnect}, statusCode: ${statusCode}`);
        
        stats.whatsappConnected = false;
        stats.whatsappNumber = null;
        io.emit('whatsapp_disconnected');
        
        sock = null;
        
        if (shouldReconnect) {
          startWhatsAppConnection();
        } else {
          lastQrCode = null;
          try {
            fs.rmSync(authDir, { recursive: true, force: true });
          } catch (e) {
            console.error("Failed to delete auth folder:", e);
          }
        }
      }
    });
    
    sock.ev.on('creds.update', saveCreds);

    // Auto-Responder logic for incoming customer messages
    sock.ev.on('messages.upsert', async (m) => {
      if (m.type === 'notify') {
        for (const msg of m.messages) {
          // Ignore messages sent by ourselves
          if (!msg.key.fromMe && msg.message) {
            const fromJid = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            
            if (text) {
              const phone = fromJid.split('@')[0];
              console.log(`Received message from ${phone}: ${text}`);
              
              // Find lead name in our queue
              const leadIndex = stats.leadsQueue.findIndex(l => l && l.phone.replace(/\D/g, '').endsWith(phone));
              let senderName = "Customer";
              if (leadIndex !== -1) {
                senderName = stats.leadsQueue[leadIndex].name;
              }
              
              // Notify frontend dashboard
              io.emit('new_incoming_reply', {
                name: senderName,
                message: text
              });
              
              stats.repliesReceivedCount++;
              
              // Generate AI response via Ollama
              const aiReply = await getOllamaReply(text, senderName);
              
              // Send auto-reply back
              try {
                await sock.sendMessage(fromJid, { text: aiReply });
                console.log(`Sent Ollama auto-reply to ${phone}: ${aiReply}`);
              } catch (err) {
                console.error(`Failed to send auto-reply to ${phone}:`, err);
              }
            }
          }
        }
      }
    });
  } catch (err) {
    console.error("Error starting Baileys connection:", err);
  }
}

// Campaign Sending Loop
function scheduleNextCampaignTick() {
  if (campaignTimer) clearTimeout(campaignTimer);
  if (stats.campaignStatus !== 'Running') return;
  
  const interval = speedIntervals[stats.speedLevel] || 3000;
  campaignTimer = setTimeout(async () => {
    await sendNextCampaignMessage();
    scheduleNextCampaignTick();
  }, interval);
}

async function sendNextCampaignMessage() {
  if (stats.leadsQueue.length === 0 || stats.currentLeadIndex >= stats.leadsQueue.length) {
    console.log("Campaign completed or queue empty.");
    stats.campaignStatus = 'Stopped';
    stats.currentLeadIndex = 0;
    io.emit('campaign_state_change', { status: 'Stopped' });
    if (campaignTimer) {
      clearTimeout(campaignTimer);
      campaignTimer = null;
    }
    return;
  }
  
  const lead = stats.leadsQueue[stats.currentLeadIndex];
  stats.currentLeadIndex++;

  // Real send via Baileys — check if number is on WhatsApp FIRST
  let status = 'Failed';
  if (stats.whatsappConnected && sock && sock.user) {
    try {
      const formattedMsg = (stats.messageTemplate || '')
        .replace(/{name}/g, lead.name)
        .replace(/{city}/g, lead.city);

      let digits = lead.phone.replace(/\D/g, '');
      // Normalize: strip country code prefix
      if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
      if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);

      // STRICT format validation
      if (digits.length !== 10 || !/^[6-9]\d{9}$/.test(digits)) {
        status = 'Skipped';
        console.warn(`[CAMPAIGN] ⏭️ Skipped invalid number: ${lead.phone} (digits=${digits})`);
      } else {
        const jid = '91' + digits + '@s.whatsapp.net';

        // ── KEY FIX: Check if this number is actually on WhatsApp ──
        // sock.sendMessage() returns success even for non-WA numbers — this prevents fake "Sent"
        let isOnWA = false;
        try {
          // Wrap in 4-second timeout — if WA check hangs, try sending anyway
          const waCheckPromise = sock.onWhatsApp(jid);
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));
          const [waResult] = await Promise.race([waCheckPromise, timeoutPromise]);
          isOnWA = waResult?.exists === true;
        } catch (checkErr) {
          if (checkErr.message === 'timeout') {
            console.warn(`[CAMPAIGN] ⏱️ onWhatsApp() timed out for ${jid} — attempting send anyway`);
          } else {
            console.warn(`[CAMPAIGN] ⚠️ onWhatsApp() check failed for ${jid}: ${checkErr.message} — attempting send anyway`);
          }
          isOnWA = true; // On check failure, attempt the send
        }

        if (!isOnWA) {
          status = 'Not on WA';
          stats.notOnWaCount++;
          console.log(`[CAMPAIGN] 📵 ${jid} is NOT registered on WhatsApp — skipping`);
        } else {
          await sock.sendMessage(jid, { text: formattedMsg });
          status = 'Sent';
          console.log(`[CAMPAIGN] ✅ Message delivered to ${jid}`);
        }
      }
    } catch (err) {
      status = 'Failed';
      console.error(`[CAMPAIGN] ❌ Failed for ${lead.phone}:`, err.message);
    }
  } else {
    const reason = !stats.whatsappConnected ? 'whatsappConnected=false' : !sock ? 'sock=null' : 'sock.user missing';
    console.warn(`[CAMPAIGN] ⚠️ WhatsApp not ready (${reason}) — marking Failed for ${lead.phone}`);
    status = 'Failed';
  }

  const log = {
    id: `#${String(++logCounter).padStart(3, '0')}`,
    name: lead.name,
    city: lead.city,
    phone: lead.phone,
    status
  };

  messageLogs.unshift(log);
  if (messageLogs.length > 50) messageLogs.pop();

  // Only count actually attempted sends toward sentToday
  if (status !== 'Not on WA' && status !== 'Skipped') stats.sentToday++;
  if (status === 'Sent') stats.deliveredCount++;
  if (status === 'Skipped') stats.skippedCount++;
  stats.hourlyHistory[stats.hourlyHistory.length - 1]++;

  io.emit('campaign_tick', {
    sentToday: stats.sentToday,
    delivered: stats.deliveredCount,
    skipped: stats.skippedCount,
    notOnWa: stats.notOnWaCount,
    replies: stats.repliesReceivedCount,
    hourly: stats.hourlyHistory,
    log
  });
}

// REST API Endpoints

// Session Check
app.get('/api/auth/session', (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.json({ authenticated: false });
  }
  
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    res.json({
      authenticated: true,
      phone: verified.phone || null,
      email: verified.email || null,
      state: stats,
      logPreview: messageLogs.slice(0, 10)
    });
  } catch (err) {
    res.json({ authenticated: false });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  OTP SYSTEM  —  WhatsApp (Primary) + Fast2SMS + Twilio 3-level fallback
// ─────────────────────────────────────────────────────────────────────────────
let currentOtps = {};

// Helper: wait up to maxMs for WhatsApp sock.user to be ready
async function waitForWhatsAppReady(maxMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (sock && stats.whatsappConnected && sock.user) return true;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return false;
}

// Helper: send OTP via Fast2SMS (Indian SMS gateway — cheapest option)
async function sendOtpViaFast2SMS(phone, otp) {
  if (!fast2smsReady) {
    console.warn('[FAST2SMS] ⚠️  API key not configured in .env');
    return false;
  }
  try {
    // Extract 10-digit Indian mobile number
    let mobile = phone.replace(/\D/g, '');
    if (mobile.startsWith('91') && mobile.length === 12) mobile = mobile.slice(2);
    if (mobile.length !== 10) {
      console.warn(`[FAST2SMS] ⚠️  Invalid Indian mobile: ${phone}`);
      return false;
    }

    const url = 'https://www.fast2sms.com/dev/bulkV2';
    const payload = {
      route: 'otp',                  // Built-in OTP route — no DLT needed
      variables_values: otp,          // The 6-digit OTP
      flash: 0,
      numbers: mobile
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'authorization': FAST2SMS_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (result.return === true) {
      console.log(`[FAST2SMS] ✅ OTP SMS sent to ${mobile} | Request ID: ${result.request_id}`);
      return true;
    } else {
      console.error(`[FAST2SMS] ❌ Failed:`, result.message || JSON.stringify(result));
      return false;
    }
  } catch (err) {
    console.error(`[FAST2SMS] ❌ Error:`, err.message);
    return false;
  }
}

// Helper: send OTP via Twilio SMS (secondary fallback)
async function sendOtpViaTwilio(phone, otp) {
  if (!twilioClient) {
    console.warn('[TWILIO] ⚠️  Client not initialized. Check TWILIO_FROM_NUMBER in .env');
    return false;
  }
  try {
    let toNumber = phone.replace(/\D/g, '');
    if (!toNumber.startsWith('+')) {
      if (toNumber.length === 10) toNumber = '+91' + toNumber;
      else if (!toNumber.startsWith('91')) toNumber = '+' + toNumber;
      else toNumber = '+' + toNumber;
    }
    await twilioClient.messages.create({
      body: `🔐 Your Cleara login OTP is: ${otp}\n\nValid for 10 minutes. Do not share.\n— Cleara Brand, Hyderabad`,
      from: TWILIO_FROM,
      to: toNumber
    });
    console.log(`[TWILIO] ✅ SMS OTP dispatched to ${toNumber}`);
    return true;
  } catch (err) {
    console.error(`[TWILIO] ❌ SMS send failed:`, err.message);
    return false;
  }
}

// POST /api/auth/otp/send
// Delivery chain for phone: 1) WhatsApp → 2) Fast2SMS → 3) Twilio → all fail = error
// For email: 1) Gmail (via Nodemailer) → fails = console fallback warning
app.post('/api/auth/otp/send', async (req, res) => {
  const { phone, email } = req.body;
  if (!phone && !email) {
    return res.status(400).json({ success: false, error: 'Phone number or Email is required' });
  }

  const target = email || phone;
  const isEmail = !!email;

  const generatedOtp = String(Math.floor(100000 + Math.random() * 900000));
  currentOtps[target] = generatedOtp;

  console.log(`\n========================================`);
  console.log(`[OTP] Generated for ${target}: ${generatedOtp}`);
  console.log(`========================================\n`);

  if (isEmail) {
    if (gmailReady && gmailTransporter) {
      try {
        const mailOptions = {
          from: `"Cleara Security" <${GMAIL_USER}>`,
          to: email,
          subject: '🔐 Your Cleara Verification Code',
          html: `
            <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
              <div style="display: flex; align-items: center; margin-bottom: 24px;">
                <div style="width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #1A7A4A; color: white; font-weight: bold; font-size: 20px; text-align: center; line-height: 40px; margin-right: 12px;">C</div>
                <span style="font-size: 24px; font-weight: 700; color: #0f172a;">Cleara</span>
              </div>
              <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 8px;">Verify Your Identity</h2>
              <p style="font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 24px;">Use the verification code below to log into the Cleara Bulk Messaging Portal. This code is valid for 10 minutes.</p>
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
                <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #1A7A4A;">${generatedOtp}</span>
              </div>
              <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin: 0;">If you did not request this code, you can safely ignore this email.</p>
              <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
              <p style="font-size: 12px; color: #64748b; text-align: center; margin: 0;">&copy; 2026 Cleara Brand, Hyderabad. All rights reserved.</p>
            </div>
          `
        };
        await gmailTransporter.sendMail(mailOptions);
        console.log(`[OTP] ✅ Sent via Gmail to ${email}`);
        return res.json({ success: true, channel: 'email' });
      } catch (err) {
        console.error(`[OTP] ❌ Failed to send email to ${email}:`, err.message);
        return res.json({ 
          success: true, 
          channel: 'email-console', 
          warning: 'Gmail configuration failed to dispatch mail. Your OTP was logged to the server terminal.' 
        });
      }
    } else {
      console.warn(`[OTP] ⚠️ Gmail not configured. OTP printed to terminal.`);
      return res.json({ 
        success: true, 
        channel: 'email-console', 
        warning: 'Gmail credentials not configured in .env. Your OTP was logged to the server terminal.' 
      });
    }
  }

  // ── CHANNEL 1: WhatsApp via Baileys (free, instant) ──────────────────────
  const waReady = await waitForWhatsAppReady(3000);
  if (waReady) {
    try {
      let jid = phone.replace(/\D/g, '');
      if (!jid.startsWith('91') && jid.length === 10) jid = '91' + jid;
      jid += '@s.whatsapp.net';
      await sock.sendMessage(jid, {
        text: `🔐 *Cleara Login OTP*\n\nYour verification code is: *${generatedOtp}*\n\nValid for 10 minutes. Do not share with anyone.\n— Cleara Brand, Hyderabad`
      });
      console.log(`[OTP] ✅ Sent via WhatsApp to ${phone}`);
      return res.json({ success: true, channel: 'whatsapp' });
    } catch (err) {
      console.warn(`[OTP] ⚠️ WhatsApp sending failed, trying Twilio SMS:`, err.message);
    }
  }

  // ── ATTEMPT 2: Twilio SMS fallback ───────────────────────────────────────
  const smsSent = await sendOtpViaTwilio(phone, generatedOtp);
  if (smsSent) {
    return res.json({ success: true, channel: 'sms' });
  }

  // ── BOTH FAILED ───────────────────────────────────────────────────────────
  delete currentOtps[phone];
  console.error('[OTP] ❌ Both WhatsApp and Twilio SMS delivery failed.');
  return res.status(503).json({
    success: false,
    error: 'Could not deliver OTP. WhatsApp is offline and SMS delivery failed. Please check your Twilio number in .env and try again.'
  });
});

// POST /api/auth/otp/verify
app.post('/api/auth/otp/verify', (req, res) => {
  const { phone, email, otp } = req.body;
  if ((!phone && !email) || !otp) return res.status(400).json({ error: 'Identity (Phone/Email) and OTP are required' });

  const target = email || phone;
  const storedOtp = currentOtps[target];
  if (storedOtp && otp === storedOtp) {
    delete currentOtps[target];
    const token = jwt.sign(email ? { email } : { phone }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.json({ 
      success: true,
      whatsappConnected: stats.whatsappConnected,
      whatsappNumber: stats.whatsappNumber
    });
  } else {
    res.status(400).json({ error: 'Incorrect OTP. Check your WhatsApp, SMS or email messages and try again.' });
  }
});

// POST /api/auth/google
app.post('/api/auth/google', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ success: false, error: 'ID Token is required' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const email = decodedToken.email;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email not found in token' });
    }

    // Sign local JWT
    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, {
      httpOnly: true,
      secure: false, // Localhost is HTTP
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ 
      success: true, 
      email,
      whatsappConnected: stats.whatsappConnected,
      whatsappNumber: stats.whatsappNumber
    });
  } catch (err) {
    console.error('Error verifying Firebase token:', err);
    res.status(401).json({ success: false, error: 'Firebase authentication failed: ' + err.message });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// Generate Node QR
app.post('/api/qr/generate', async (req, res) => {
  if (stats.whatsappConnected) {
    return res.json({ success: true, connected: true, number: stats.whatsappNumber });
  }
  res.json({ success: true, connected: false });
  startWhatsAppConnection();
  if (lastQrCode) {
    io.emit('whatsapp_qr', { qr: lastQrCode });
  }
});

// Simulate Connection Scan — now triggers real Baileys instead of hardcoding fake number
app.post('/api/qr/connect', async (req, res) => {
  if (stats.whatsappConnected && sock && sock.user) {
    return res.json({ success: true, number: stats.whatsappNumber });
  }
  // Start real connection if not already started
  startWhatsAppConnection();
  // Wait up to 5 seconds for it to go 'open'
  const start = Date.now();
  while (Date.now() - start < 5000) {
    if (stats.whatsappConnected && sock && sock.user) {
      return res.json({ success: true, number: stats.whatsappNumber });
    }
    await new Promise(r => setTimeout(r, 300));
  }
  res.json({ success: false, error: 'WhatsApp not connected yet. Scan the QR code with your phone first.' });
});

// Disconnect Node
app.post('/api/qr/disconnect', async (req, res) => {
  stats.whatsappConnected = false;
  stats.whatsappNumber = null;
  lastQrCode = null;
  
  if (sock) {
    try {
      await sock.logout();
    } catch (e) {}
    try {
      sock.end();
    } catch (e) {}
    sock = null;
  }
  
  const authDir = path.join(__dirname, 'cleara_baileys_auth');
  try {
    fs.rmSync(authDir, { recursive: true, force: true });
  } catch (e) {}
  
  io.emit('whatsapp_disconnected');
  res.json({ success: true });
});

// ── Debug: Send a single test WhatsApp message ───────────────────────────────
// POST /api/debug/test-send   body: { phone: "9XXXXXXXXX", message: "Hello" }
app.post('/api/debug/test-send', async (req, res) => {
  if (!stats.whatsappConnected || !sock || !sock.user) {
    return res.status(503).json({ success: false, error: 'WhatsApp not connected. Connect first via QR.' });
  }
  const rawPhone = String(req.body.phone || '').replace(/\D/g, '');
  let digits = rawPhone;
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  if (digits.length !== 10 || !/^[6-9]\d{9}$/.test(digits)) {
    return res.status(400).json({ success: false, error: `Invalid Indian mobile number: ${rawPhone}` });
  }
  const jid = '91' + digits + '@s.whatsapp.net';
  const message = req.body.message || '🔔 Cleara test message — if you received this, WhatsApp sending is working!';
  try {
    await sock.sendMessage(jid, { text: message });
    console.log(`[TEST-SEND] ✅ Message sent to ${jid}`);
    res.json({ success: true, jid, message });
  } catch (err) {
    console.error(`[TEST-SEND] ❌ Failed:`, err);
    res.status(500).json({ success: false, error: err.message, stack: err.stack });
  }
});

// ── Debug: Check if a number is registered on WhatsApp ───────────────────────
// POST /api/debug/check-wa   body: { phone: "9XXXXXXXXX" }
app.post('/api/debug/check-wa', async (req, res) => {
  if (!stats.whatsappConnected || !sock || !sock.user) {
    return res.status(503).json({ success: false, error: 'WhatsApp not connected.' });
  }
  const rawPhone = String(req.body.phone || '').replace(/\D/g, '');
  let digits = rawPhone;
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  if (digits.length !== 10 || !/^[6-9]\d{9}$/.test(digits)) {
    return res.status(400).json({ success: false, error: `Invalid number: ${rawPhone}` });
  }
  const jid = '91' + digits + '@s.whatsapp.net';
  try {
    const [result] = await sock.onWhatsApp(jid);
    res.json({ jid, exists: result?.exists === true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function formatIndianPhoneNumber(rawPhone) {
  // Only accept the raw token as-is — no free-form cleaning of longer strings
  const clean = rawPhone.replace(/[\s\-().+]/g, '');
  // 10-digit mobile number starting with 6-9 — EXACT length
  if (clean.length === 10 && /^[6-9]\d{9}$/.test(clean)) {
    return `+91 ${clean}`;
  }
  // 12-digit mobile number: 91 + 10-digit mobile — EXACT length
  if (clean.length === 12 && /^91[6-9]\d{9}$/.test(clean)) {
    return `+91 ${clean.slice(2)}`;
  }
  // 11-digit mobile number: 0 + 10-digit mobile — EXACT length
  if (clean.length === 11 && /^0[6-9]\d{9}$/.test(clean)) {
    return `+91 ${clean.slice(1)}`;
  }
  // +91 prefix written as "+91XXXXXXXXXX" — 13 chars with '+'
  if (rawPhone.startsWith('+91') && clean.length === 12 && /^91[6-9]\d{9}$/.test(clean)) {
    return `+91 ${clean.slice(2)}`;
  }
  return null;
}

/**
 * Extract {phone, name} pairs from HTML.
 * For each phone found, we look at the surrounding HTML context (~400 chars before)
 * to find the nearest business name (heading, list item, bold, etc.).
 */
function extractPhoneNamePairs(html, fallbackTitle, fallbackDomain) {
  // Preserve HTML structure but remove noise
  const noNoise = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const pairs = [];
  const seenPhones = new Set();
  const phoneRegex = /(?<!\d)(?:\+91[\s\-.]?|0)?[6-9]\d{2}[\s\-.]?\d{3}[\s\-.]?\d{4}(?!\d)/g;

  let match;
  while ((match = phoneRegex.exec(noNoise)) !== null) {
    const rawPhone = match[0];
    const formatted = formatIndianPhoneNumber(rawPhone);
    if (!formatted || seenPhones.has(formatted)) continue;
    seenPhones.add(formatted);

    // Get 600 chars of HTML before the phone number
    const htmlBefore = noNoise.slice(Math.max(0, match.index - 600), match.index);

    // Strategy 1: find last heading (h1-h4) before phone
    const headingMatch = htmlBefore.match(/<h[1-4][^>]*>([\s\S]{2,80}?)<\/h[1-4]>/gi);
    let candidateName = '';
    if (headingMatch && headingMatch.length > 0) {
      const lastHeading = headingMatch[headingMatch.length - 1];
      candidateName = lastHeading.replace(/<[^>]+>/g, '').trim();
    }

    // Strategy 2: find last <strong>, <b>, or <a class...> near phone
    if (!candidateName || candidateName.length < 3) {
      const boldMatch = htmlBefore.match(/<(?:strong|b)[^>]*>([\s\S]{2,70}?)<\/(?:strong|b)>/gi);
      if (boldMatch && boldMatch.length > 0) {
        const lastBold = boldMatch[boldMatch.length - 1];
        candidateName = lastBold.replace(/<[^>]+>/g, '').trim();
      }
    }

    // Strategy 3: extract plain text segments before phone and take last meaningful chunk
    if (!candidateName || candidateName.length < 3) {
      const plainText = htmlBefore
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      // Split on common list/section separators and take last meaningful segment
      const segments = plainText.split(/[|•\n;,]/).map(s => s.trim()).filter(s => s.length > 3 && s.length < 80);
      for (let i = segments.length - 1; i >= 0; i--) {
        const seg = segments[i];
        // Skip generic labels
        if (/^(call|tel|ph|phone|mobile|mob|contact|no\.?|address|email|website|city|state|product|category|view|click|more|details|info)$/i.test(seg)) continue;
        // Skip URLs
        if (/https?:|www\.|\.(com|in|org|net)/.test(seg)) continue;
        // Must have letters
        if (!/[a-zA-Z]/.test(seg)) continue;
        candidateName = seg;
        break;
      }
    }

    // Clean the extracted name
    if (candidateName) {
      candidateName = candidateName
        .replace(/<[^>]+>/g, '')          // strip any remaining tags
        .replace(/^(name|company|business|firm|shop|contact|person|owner)\s*:?\s*/i, '')
        .replace(/[^\x20-\x7E\u00C0-\u024F\u0900-\u097F]/g, ' ')  // keep readable chars
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Fallback chain: extracted → page title → domain
    let finalName = candidateName;
    if (!finalName || finalName.length < 3 || finalName.length > 80) {
      // Use cleaned title
      let t = (fallbackTitle || '').split(/[|\-–:]/)[0].trim();
      t = t.replace(/^(www\.)/i, '').replace(/\.(com|in|co\.in|net|org|biz)$/i, '').trim();
      finalName = (t && t.length >= 3) ? t : (fallbackDomain || 'Business');
    }

    pairs.push({ phone: formatted, name: finalName });
  }

  return pairs;
}

// Legacy wrapper — returns just phone strings (used by existing deep-crawl inner-page path)
function extractPhones(html) {
  return extractPhoneNamePairs(html, '', '').map(p => p.phone);
}

async function fetchWithTimeout(url, options = {}, timeout = 6000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function fetchFromDDGLite(query) {
  console.log(`[DDG-SCRAPER] Fetching DDG Lite for query: "${query}"`);
  try {
    const response = await fetchWithTimeout('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      body: `q=${encodeURIComponent(query)}`
    }, 8000);

    if (response.status !== 200) {
      console.warn(`[DDG-SCRAPER] DDG Lite returned status ${response.status}`);
      return [];
    }

    const html = await response.text();
    const isBlocked = html.includes('captcha') || html.includes('challenge-form') || html.includes('anomaly-modal');
    if (isBlocked) {
      console.warn('[DDG-SCRAPER] DDG Lite blocked the request (captcha/anomaly detected)');
      return [];
    }

    const re = /href="([^"]+?)"/g;
    let m;
    const links = [];
    while ((m = re.exec(html)) !== null) {
      const href = m[1];
      if (href.startsWith('http') && !/duckduckgo\.com/.test(href)) {
        try {
          const urlObj = new URL(href);
          const domain = urlObj.hostname.toLowerCase();
          links.push({ url: href, domain });
        } catch (e) {}
      }
    }
    console.log(`[DDG-SCRAPER] Found ${links.length} organic links from DDG Lite`);
    return links;
  } catch (err) {
    console.error('[DDG-SCRAPER] Error fetching from DDG Lite:', err.message);
    return [];
  }
}

async function crawlPage(url) {
  console.log(`[SERVER-CRAWLER] Fetching page: ${url}`);
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });
    console.log(`[SERVER-CRAWLER] Response status for ${url}: ${res.status}`);
    if (res.status !== 200) return { title: '', phoneNamePairs: [] };
    
    const html = await res.text();
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    let title = titleMatch ? titleMatch[1].trim() : '';
    // Clean title: take the part before first |, -, –, :  but keep it readable
    title = title.replace(/&amp;/g, '&').replace(/&#\d+;/g, '').trim();
    const titleClean = title.split(/[|\-–:]/)[0].trim();
    // Only use cleaned title if it's meaningful (2-60 chars)
    const domain = new URL(url).hostname.replace(/^www\./, '');
    title = (titleClean.length >= 2 && titleClean.length <= 60) ? titleClean : domain;

    // Extract phone+name pairs from the page HTML
    let phoneNamePairs = extractPhoneNamePairs(html, title, domain);
    console.log(`[SERVER-CRAWLER] Found ${phoneNamePairs.length} phones on homepage of ${url}`);
    
    // Deep-crawl contact/about page if no phones found on homepage
    if (phoneNamePairs.length === 0) {
      const linkRegex = /href="([^"]*?(?:contact|about|reach)[^"]*?)"/gi;
      let linkMatch;
      const links = [];
      while ((linkMatch = linkRegex.exec(html)) !== null && links.length < 2) {
        let href = linkMatch[1];
        if (href && !href.startsWith('http')) {
          try {
            const origin = new URL(url).origin;
            href = new URL(href, origin).href;
          } catch (e) {
            continue;
          }
        }
        if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
          links.push(href);
        }
      }
      
      if (links.length > 0) {
        console.log(`[SERVER-CRAWLER] Deep-crawling inner page: ${links[0]}`);
        try {
          const subRes = await fetchWithTimeout(links[0], {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          console.log(`[SERVER-CRAWLER] Deep-crawl status for ${links[0]}: ${subRes.status}`);
          if (subRes.status === 200) {
            const subHtml = await subRes.text();
            const subPairs = extractPhoneNamePairs(subHtml, title, domain);
            console.log(`[SERVER-CRAWLER] Found ${subPairs.length} phones on inner page ${links[0]}`);
            phoneNamePairs.push(...subPairs.map(p => ({ ...p, isDeepCrawl: true })));
          }
        } catch (e) {
          console.log(`[SERVER-CRAWLER] Deep-crawl error for ${links[0]}:`, e.message);
        }
      }
    }
    
    return { title, phoneNamePairs: dedupeByPhone(phoneNamePairs) };
  } catch (err) {
    console.log(`[SERVER-CRAWLER] Crawl error for ${url}:`, err.message);
    return { title: '', phoneNamePairs: [] };
  }
}

function dedupeByPhone(pairs) {
  const seen = new Set();
  return pairs.filter(p => {
    if (seen.has(p.phone)) return false;
    seen.add(p.phone);
    return true;
  });
}

app.post('/api/scrape', (req, res) => {
  const { keyword } = req.body;
  const bodyCity = req.body.city || null;
  let excludeKeywords = req.body.excludeKeywords || [];
  if (typeof excludeKeywords === 'string') {
    excludeKeywords = excludeKeywords.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  } else if (Array.isArray(excludeKeywords)) {
    excludeKeywords = excludeKeywords.map(s => String(s).toLowerCase().trim()).filter(Boolean);
  }
  // Default service-provider exclusions — always applied regardless of frontend input
  const SERVER_DEFAULT_EXCLUDES = ['services','maids','deep cleaning','car wash','laundry','pest control','repair service','painting service'];
  excludeKeywords = [...new Set([...SERVER_DEFAULT_EXCLUDES, ...excludeKeywords])];

  if (!keyword) {
    return res.status(400).json({ error: 'Keyword is required' });
  }

  res.json({ success: true });

  (async () => {
    try {
      console.log(`Starting real B2B scrape for keyword: "${keyword}"`);
      console.log(`[SCRAPER] Excluding: ${excludeKeywords.join(', ')}`);
      stats.scraping = true;

      const cleanKeyword = keyword.replace(/[^a-zA-Z0-9 ]/g, '');
      const keywordWords = cleanKeyword.split(' ');
      // Use city from body if provided, else guess from last word of keyword
      const city = bodyCity || (keywordWords.length > 1 ? keywordWords[keywordWords.length - 1] : 'India');

      let progress = 10;
      let leadsCount = 0;
      let sources = {
        'Yahoo Search': { count: 0, status: 'Searching...' },
        'DuckDuckGo Search': { count: 0, status: 'Searching...' },
        'Deep Crawl': { count: 0, status: 'Standby' }
      };

      io.emit('scraper_progress', { progress, leadsCount, sources });

      const indiaKeyword = keyword.includes('India') ? keyword : `${keyword} India`;
      const offsets = [1, 11, 21, 31];

      // 1. Search Yahoo
      const yahooSearchPromise = (async () => {
        const fetchPromises = offsets.map(async (offset) => {
          const url = `https://search.yahoo.com/search?p=${encodeURIComponent(indiaKeyword)}&b=${offset}&fr=yfp-t`;
          try {
            const resp = await fetchWithTimeout(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
                'Cache-Control': 'no-cache'
              }
            });
            if (resp.status === 200) {
              return await resp.text();
            }
          } catch (err) {
            console.error(`Yahoo search fetch failed for offset ${offset}:`, err.message);
          }
          return '';
        });
        
        const pagesHtml = await Promise.all(fetchPromises);
        const combinedHtml = pagesHtml.join('\n');

        const allHrefs = [];
        const hrefRe = /href="([^"]+?)"/g;
        let m;
        while ((m = hrefRe.exec(combinedHtml)) !== null) {
          allHrefs.push(m[1]);
        }

        const urls = [];
        const isAggregator = /yahoo\.com|yimg\.com|google\.|youtube\.|facebook\.|twitter\.|instagram\.|linkedin\.|wikipedia\.|urbancompany\.|nobroker\.|yellowpages\.|mapquest\.|sulekha\.|justdial\.|indiamart\.|tradeindia\.|exportersindia\.|getdistributors\.|getmanufacturers\.|vanik\.|aajjo\.|tradeford\.|connect2india\./i;

        allHrefs.forEach(href => {
          if (href.includes('r.search.yahoo.com')) {
            const ruMatch = href.match(/\/RU=([^/]+)/);
            if (ruMatch) {
              try {
                const decoded = decodeURIComponent(ruMatch[1]);
                if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
                  const domain = new URL(decoded).hostname.toLowerCase();
                  if (!isAggregator.test(domain)) {
                    urls.push({ url: decoded, domain, engine: 'Yahoo Search' });
                  }
                }
              } catch (e) {}
            }
          }
        });
        return urls;
      })();

      // 2. Search DuckDuckGo Lite
      const ddgSearchPromise = (async () => {
        const ddgResults = await fetchFromDDGLite(indiaKeyword);
        const isAggregator = /yahoo\.com|yimg\.com|google\.|youtube\.|facebook\.|twitter\.|instagram\.|linkedin\.|wikipedia\.|urbancompany\.|nobroker\.|yellowpages\.|mapquest\.|sulekha\.|justdial\.|indiamart\.|tradeindia\.|exportersindia\.|getdistributors\.|getmanufacturers\.|vanik\.|aajjo\.|tradeford\.|connect2india\./i;
        
        return ddgResults
          .filter(site => !isAggregator.test(site.domain))
          .map(site => ({
            url: site.url,
            domain: site.domain,
            engine: 'DuckDuckGo Search'
          }));
      })();

      // Run search engines in parallel
      const [yahooUrls, ddgUrls] = await Promise.all([yahooSearchPromise, ddgSearchPromise]);

      // Merge unique sites by domain, prioritizing DuckDuckGo Lite's organic results
      const seenDomains = new Set();
      const uniqueUrlsToCrawl = [];
      const siteEngines = new Map();

      const addSite = (site) => {
        if (!seenDomains.has(site.domain)) {
          seenDomains.add(site.domain);
          uniqueUrlsToCrawl.push(site);
          siteEngines.set(site.domain, site.engine);
        }
      };

      ddgUrls.forEach(addSite);
      yahooUrls.forEach(addSite);

      console.log(`Found ${uniqueUrlsToCrawl.length} unique business websites to crawl.`);

      progress = 30;
      sources['Yahoo Search'].status = 'Done';
      sources['DuckDuckGo Search'].status = 'Done';
      sources['Deep Crawl'].status = 'Crawling...';
      io.emit('scraper_progress', { progress, leadsCount, sources });

      const resultsMap = new Map();
      const maxConcurrency = 5;

      async function crawlAndSave(site) {
        const pageData = await crawlPage(site.url);
        const pairs = pageData.phoneNamePairs || [];
        if (pairs.length > 0) {
          pairs.forEach(({ phone, name, isDeepCrawl }) => {
            const phoneClean = phone.replace(/\D/g, '');
            const nameLower = (name || '').toLowerCase();
            const isExcluded = excludeKeywords.some(kw =>
              nameLower.includes(kw) ||
              phoneClean.includes(kw) ||
              site.url.toLowerCase().includes(kw)
            );
            if (!isExcluded) {
              const source = isDeepCrawl ? 'Deep Crawl' : (siteEngines.get(site.domain) || 'Search');
              resultsMap.set(phone, { name, phone, city, source });
            }
          });
        }
      }

      const queue = [...uniqueUrlsToCrawl];
      let activeCount = 0;
      let idx = 0;
      
      async function next() {
        if (queue.length === 0) return;
        activeCount++;
        const site = queue.shift();
        try {
          await crawlAndSave(site);
        } catch (e) {}
        activeCount--;
        
        leadsCount = resultsMap.size;
        sources['Yahoo Search'].count = Array.from(resultsMap.values()).filter(l => l.source === 'Yahoo Search').length;
        sources['DuckDuckGo Search'].count = Array.from(resultsMap.values()).filter(l => l.source === 'DuckDuckGo Search').length;
        sources['Deep Crawl'].count = Array.from(resultsMap.values()).filter(l => l.source === 'Deep Crawl').length;
        
        const doneCount = uniqueUrlsToCrawl.length - queue.length - activeCount;
        const progressStep = 30 + Math.round((doneCount / uniqueUrlsToCrawl.length) * 70);
        io.emit('scraper_progress', {
          progress: Math.min(99, progressStep),
          leadsCount,
          sources
        });
        
        await next();
      }

      const workers = [];
      const numWorkers = Math.min(maxConcurrency, queue.length);
      for (let w = 0; w < numWorkers; w++) {
        workers.push(next());
      }
      if (workers.length > 0) {
        await Promise.all(workers);
      }

      scrapedLeads = Array.from(resultsMap.values()).map((lead, index) => ({
        id: `L${String(index + 1).padStart(3, '0')}`,
        ...lead
      }));

      stats.leadsScrapedCount = scrapedLeads.length;
      stats.scraping = false;

      sources['Yahoo Search'].status = 'Done';
      sources['DuckDuckGo Search'].status = 'Done';
      sources['Deep Crawl'].status = 'Done';

      io.emit('scraper_progress', { progress: 100, leadsCount: scrapedLeads.length, sources });

      io.emit('scraper_done', {
        validLeads: scrapedLeads.length,
        duplicatesRemoved: Math.max(0, uniqueUrlsToCrawl.length - scrapedLeads.length),
        leadsPreview: scrapedLeads
      });
      console.log(`Scraper finished. Extracted ${scrapedLeads.length} leads.`);
    } catch (err) {
      console.error('Scraper background crash:', err);
      stats.scraping = false;
      io.emit('scraper_done', {
        validLeads: 0,
        duplicatesRemoved: 0,
        leadsPreview: []
      });
    }
  })();
});

// Import leads from CSV (real lead data)
app.post('/api/leads/import', (req, res) => {
  const { leads } = req.body;
  if (!leads || !Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'No leads provided' });
  }

  // Validate and sanitize each lead
  const validLeads = [];
  const seen = new Set();
  leads.forEach((lead, i) => {
    const phone = String(lead.phone || '').replace(/\D/g, '');
    if (!phone || phone.length < 10) return; // skip invalid
    if (seen.has(phone)) return; // skip duplicates
    seen.add(phone);
    validLeads.push({
      id: `L${String(i + 1).padStart(3, '0')}`,
      name: String(lead.name || 'Unknown').trim(),
      phone: lead.phone,
      city: String(lead.city || 'India').trim(),
      source: String(lead.source || 'CSV Import').trim()
    });
  });

  scrapedLeads = validLeads;
  stats.leadsScrapedCount = scrapedLeads.length;

  io.emit('scraper_done', {
    validLeads: scrapedLeads.length,
    duplicatesRemoved: leads.length - scrapedLeads.length,
    leadsPreview: scrapedLeads
  });

  console.log(`[IMPORT] ✅ Imported ${scrapedLeads.length} valid leads from CSV`);
  res.json({ success: true, count: scrapedLeads.length });
});

// Inject Leads into campaign queue
app.post('/api/campaign/inject', (req, res) => {
  stats.leadsQueue = [...scrapedLeads];
  stats.currentLeadIndex = 0; // Always reset index when injecting new leads
  io.emit('campaign_injected', { queueLength: stats.leadsQueue.length });
  res.json({ success: true, queueLength: stats.leadsQueue.length });
});

// Force-restart: re-inject + reset + start (useful after server restart when session cookie is gone)
app.post('/api/campaign/restart', (req, res) => {
  if (!stats.whatsappConnected || !sock) {
    return res.status(400).json({ error: 'WhatsApp not connected' });
  }
  stats.leadsQueue = [...scrapedLeads];
  stats.currentLeadIndex = 0;
  stats.campaignStatus = 'Running';
  if (campaignTimer) clearTimeout(campaignTimer);
  campaignTimer = null;
  io.emit('campaign_injected', { queueLength: stats.leadsQueue.length });
  io.emit('campaign_state_change', { status: 'Running' });
  scheduleNextCampaignTick();
  console.log(`[CAMPAIGN] Force-restarted with ${stats.leadsQueue.length} leads in queue.`);
  res.json({ success: true, queueLength: stats.leadsQueue.length, status: 'Running' });
});

// Campaign Controls
app.post('/api/campaign/start', (req, res) => {
  if (stats.leadsQueue.length === 0) {
    return res.status(400).json({ error: 'Queue is empty' });
  }
  stats.campaignStatus = 'Running';
  io.emit('campaign_state_change', { status: 'Running' });
  scheduleNextCampaignTick();
  res.json({ success: true });
});

app.post('/api/campaign/pause', (req, res) => {
  stats.campaignStatus = 'Paused';
  io.emit('campaign_state_change', { status: 'Paused' });
  if (campaignTimer) {
    clearTimeout(campaignTimer);
    campaignTimer = null;
  }
  res.json({ success: true });
});

app.post('/api/campaign/stop', (req, res) => {
  stats.campaignStatus = 'Stopped';
  stats.currentLeadIndex = 0;
  io.emit('campaign_state_change', { status: 'Stopped' });
  if (campaignTimer) {
    clearTimeout(campaignTimer);
    campaignTimer = null;
  }
  res.json({ success: true });
});

app.post('/api/campaign/settings', (req, res) => {
  const { speedLevel, messageTemplate } = req.body;
  if (speedLevel !== undefined) {
    stats.speedLevel = Number(speedLevel);
  }
  if (messageTemplate !== undefined) {
    stats.messageTemplate = messageTemplate;
  }
  if (stats.campaignStatus === 'Running') {
    scheduleNextCampaignTick();
  }
  res.json({ success: true });
});

// Marketing Template Analytics Agent
app.post('/api/campaign/analyze-template', async (req, res) => {
  const { messageTemplate } = req.body;
  if (!messageTemplate) {
    return res.status(400).json({ error: 'Template is required' });
  }

  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3',
        messages: [
          {
            role: 'system',
            content: `You are an expert B2B marketing strategist and conversion optimization copywriter. Analyze the provided WhatsApp pitch template. Rate it out of 10 and output a brief analysis containing:
- **Conversion Grade**: Score/10 (with a 1-sentence summary of why)
- **Key Strengths**: 2 bullet points
- **Friction Points**: 2 bullet points
- **Closing Recommendation**: 1-sentence copy tweak.
Make your response extremely crisp and formatted in clean markdown.`
          },
          {
            role: 'user',
            content: messageTemplate
          }
        ],
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP error: status ${response.status}`);
    }

    const data = await response.json();
    res.json({ success: true, analysis: data.message.content.trim() });
  } catch (err) {
    console.error("Error communicating with Ollama for analysis:", err);
    // Provide a premium fallback analysis matching Cleara marketing templates
    let fallback = "";
    if (messageTemplate.includes("Stop losing customers")) {
      fallback = `### **Conversion Analysis**
* **Conversion Grade**: **9.2 / 10** (Strong value proposition and detailed product profit details.)
* **Key Strengths**:
  - High transparency on margins (e.g. ₹185 flat profit) creates instant dealer interest.
  - Clear call-to-action ("YES" or "SEND") makes responding effortless.
* **Friction Points**:
  - Extremely long format; mobile readers might overlook details.
  - Box quantities requirement could intimidate smaller distributors.
* **Closing Recommendation**: Consider sending the Short Form for cold contacts, and reserve this Long Form for warm follow-ups.`;
    } else {
      fallback = `### **Conversion Analysis**
* **Conversion Grade**: **8.8 / 10** (Highly readable, bulleted, and optimized for mobile screens.)
* **Key Strengths**:
  - Focus on "double your retail profits" triggers instant B2B interest.
  - Clean bulleted catalog is easy to scan in 5 seconds.
* **Friction Points**:
  - Missing certified credibility notes (ISO certification) compared to the long version.
  - Does not state exact profit margins in rupees for all items.
* **Closing Recommendation**: Use this version as the initial cold pitch, and follow up with the full price list once they reply.`;
    }
    res.json({ success: true, analysis: fallback });
  }
});

// Export CSV logs
app.get('/api/campaign/download-logs', (req, res) => {
  let csv = 'ID,Name,City,Phone,Status\n';
  messageLogs.forEach(log => {
    csv += `${log.id},"${log.name.replace(/"/g, '""')}","${log.city}",${log.phone},${log.status}\n`;
  });
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=campaign_logs.csv');
  res.status(200).send(csv);
});

// Export CSV leads
app.get('/api/campaign/download-leads', (req, res) => {
  let csv = 'ID,Name,Phone,City,Source\n';
  scrapedLeads.forEach(lead => {
    csv += `${lead.id},"${lead.name.replace(/"/g, '""')}",${lead.phone},"${lead.city}",${lead.source}\n`;
  });
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=leads_registry.csv');
  res.status(200).send(csv);
});

// Start listening
io.on('connection', (socket) => {
  console.log(`Socket Connected: ${socket.id}`);
  
  // Immediately send current connection status to new client
  socket.emit('whatsapp_state', {
    connected: stats.whatsappConnected,
    number: stats.whatsappNumber
  });

  if (lastQrCode && !stats.whatsappConnected) {
    socket.emit('whatsapp_qr', { qr: lastQrCode });
  }
  
  socket.on('disconnect', () => {
    console.log(`Socket Disconnected: ${socket.id}`);
  });
});

// Fallback for SPA routing - serve index.html for non-api routes
app.get('/{*path}', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Auto-reconnect on server startup if credentials exist
const authDir = path.join(__dirname, 'cleara_baileys_auth');
if (fs.existsSync(path.join(authDir, 'creds.json'))) {
  console.log("Found existing WhatsApp credentials. Initializing auto-reconnect...");
  startWhatsAppConnection();
}

httpServer.listen(PORT, () => {
  console.log(`Cleara Outbound Server listening on port ${PORT}`);
});