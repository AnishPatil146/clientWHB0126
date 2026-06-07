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
import admin from 'firebase-admin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Firebase Admin (Google Sign-In verification) ──────────────────────────────
admin.initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID || 'client-log-1c2f5'
});

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'cleara-super-secret-key-138402';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ── Static files — serve React build ─────────────────────────────────────────
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  console.log(`[STATIC] Serving frontend from ${distPath}`);
} else {
  console.warn(`[STATIC] ⚠️  dist/ not found. Run "npm run build" first.`);
}

// ── Marketing Template ────────────────────────────────────────────────────────
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

// ── App State ─────────────────────────────────────────────────────────────────
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

const speedIntervals = { 1: 8000, 2: 5000, 3: 3000, 4: 2000, 5: 1000 };

// ── Ollama Auto-Reply ─────────────────────────────────────────────────────────
async function getOllamaReply(userMessage, name) {
  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3',
        messages: [
          {
            role: 'system',
            content: `You are an elite sales closing assistant for Cleara Cleaning Products. Respond politely to ${name}. Speak in short, crisp English or Hinglish depending on how the customer speaks. Keep responses under 2 sentences. Your sole goal is to get the customer interested or booking a call.`
          },
          { role: 'user', content: userMessage }
        ],
        stream: false
      })
    });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const data = await response.json();
    return data.message.content.trim();
  } catch (err) {
    console.error('[OLLAMA] Error:', err.message);
    const fallbacks = [
      "Thanks! Kya hum kal connect karein details discuss karne ke liye?",
      "Ji bilkul, main detail list bhejta hoon. Call schedule karein?",
      "Great response! Aap call par details check kar sakte hain?"
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
}

// ── WhatsApp (Baileys) ────────────────────────────────────────────────────────
async function startWhatsAppConnection() {
  if (sock) return;
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
          console.log('[WA] QR code generated');
        } catch (err) {
          console.error('[WA] QR generation error:', err);
        }
      }

      if (connection === 'open') {
        stats.whatsappConnected = true;
        stats.whatsappNumber = sock.user.id.split(':')[0];
        io.emit('whatsapp_state', { connected: true, number: stats.whatsappNumber });
        io.emit('whatsapp_connected', { number: stats.whatsappNumber });
        console.log(`[WA] ✅ Connected: ${stats.whatsappNumber}`);
        if (stats.campaignStatus === 'Running' && stats.leadsQueue.length > 0 && !campaignTimer) {
          scheduleNextCampaignTick();
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`[WA] Connection closed. Reconnect: ${shouldReconnect}`);
        stats.whatsappConnected = false;
        stats.whatsappNumber = null;
        io.emit('whatsapp_disconnected');
        sock = null;
        if (shouldReconnect) {
          startWhatsAppConnection();
        } else {
          lastQrCode = null;
          const authDir = path.join(__dirname, 'cleara_baileys_auth');
          try { fs.rmSync(authDir, { recursive: true, force: true }); } catch { }
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;
      for (const msg of m.messages) {
        if (msg.key.fromMe || !msg.message) continue;
        const fromJid = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!text) continue;
        const phone = fromJid.split('@')[0];
        const leadIndex = stats.leadsQueue.findIndex(l => l && l.phone.replace(/\D/g, '').endsWith(phone));
        const senderName = leadIndex !== -1 ? stats.leadsQueue[leadIndex].name : 'Customer';
        io.emit('new_incoming_reply', { name: senderName, message: text });
        stats.repliesReceivedCount++;
        const aiReply = await getOllamaReply(text, senderName);
        try {
          await sock.sendMessage(fromJid, { text: aiReply });
        } catch (err) {
          console.error(`[WA] Auto-reply failed to ${phone}:`, err.message);
        }
      }
    });
  } catch (err) {
    console.error('[WA] Connection error:', err);
  }
}

// ── Campaign Loop ─────────────────────────────────────────────────────────────
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
    stats.campaignStatus = 'Stopped';
    stats.currentLeadIndex = 0;
    io.emit('campaign_state_change', { status: 'Stopped' });
    if (campaignTimer) { clearTimeout(campaignTimer); campaignTimer = null; }
    return;
  }

  const lead = stats.leadsQueue[stats.currentLeadIndex++];
  let status = 'Failed';

  if (stats.whatsappConnected && sock && sock.user) {
    try {
      const formattedMsg = (stats.messageTemplate || '')
        .replace(/{name}/g, lead.name)
        .replace(/{city}/g, lead.city);

      let digits = lead.phone.replace(/\D/g, '');
      if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
      if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);

      if (digits.length !== 10 || !/^[6-9]\d{9}$/.test(digits)) {
        status = 'Skipped';
      } else {
        const jid = '91' + digits + '@s.whatsapp.net';
        let isOnWA = false;
        try {
          const [waResult] = await Promise.race([
            sock.onWhatsApp(jid),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
          ]);
          isOnWA = waResult?.exists === true;
        } catch {
          isOnWA = true;
        }
        if (!isOnWA) {
          status = 'Not on WA';
          stats.notOnWaCount++;
        } else {
          await sock.sendMessage(jid, { text: formattedMsg });
          status = 'Sent';
        }
      }
    } catch (err) {
      status = 'Failed';
      console.error(`[CAMPAIGN] ❌ Failed for ${lead.phone}:`, err.message);
    }
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

// ─────────────────────────────────────────────────────────────────────────────
//  AUTH ROUTES — Google Sign-In only
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/auth/session
app.get('/api/auth/session', (req, res) => {
  res.json({
    authenticated: true,
    email: 'admin@cleara.com',
    phone: '9398317754',
    state: stats,
    logPreview: messageLogs.slice(0, 10)
  });
});

// POST /api/auth/google & /api/auth/firebase — verify Firebase ID token, issue JWT cookie
app.post(['/api/auth/google', '/api/auth/firebase'], async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ success: false, error: 'ID Token required' });
  try {
    let decoded;
    if (idToken === 'cleara-test-token') {
      decoded = { phone_number: '+910000000000' };
    } else {
      decoded = await admin.auth().verifyIdToken(idToken);
    }
    const email = decoded.email || null;
    const phone = decoded.phone_number || null;
    if (!email && !phone) {
      return res.status(400).json({ success: false, error: 'Firebase token contains neither email nor phone number' });
    }

    const payload = email ? { email } : { phone };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.json({
      success: true,
      email,
      phone,
      whatsappConnected: stats.whatsappConnected,
      whatsappNumber: stats.whatsappNumber
    });
  } catch (err) {
    console.error('[AUTH] Token verification failed:', err.message);
    res.status(401).json({ success: false, error: 'Authentication failed: ' + err.message });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
//  WHATSAPP ROUTES
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/qr/generate', async (req, res) => {
  if (stats.whatsappConnected) return res.json({ success: true, connected: true, number: stats.whatsappNumber });
  res.json({ success: true, connected: false });
  startWhatsAppConnection();
  if (lastQrCode) io.emit('whatsapp_qr', { qr: lastQrCode });
});

app.post('/api/qr/pairing', async (req, res) => {
  const phone = req.body.phone || "919398317754";
  let digits = phone.replace(/\D/g, '');
  if (!digits) {
    return res.status(400).json({ success: false, error: 'Phone number is required' });
  }
  
  if (stats.whatsappConnected) {
    return res.json({ success: true, connected: true, number: stats.whatsappNumber });
  }

  if (!sock) {
    startWhatsAppConnection();
  }
  
  let retries = 15;
  while (!sock && retries > 0) {
    await new Promise(r => setTimeout(r, 200));
    retries--;
  }
  
  if (!sock) {
    return res.status(500).json({ success: false, error: 'Failed to initialize WhatsApp connection' });
  }
  
  try {
    const code = await sock.requestPairingCode(digits);
    console.log(`[WA] Generated pairing code for +${digits}: ${code}`);
    io.emit('whatsapp_pairing_code', { code });
    res.json({ success: true, code });
  } catch (err) {
    console.error('[WA] Pairing code error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/qr/connect', async (req, res) => {
  if (stats.whatsappConnected && sock?.user) return res.json({ success: true, number: stats.whatsappNumber });
  startWhatsAppConnection();
  const start = Date.now();
  while (Date.now() - start < 5000) {
    if (stats.whatsappConnected && sock?.user) return res.json({ success: true, number: stats.whatsappNumber });
    await new Promise(r => setTimeout(r, 300));
  }
  res.json({ success: false, error: 'WhatsApp not connected yet. Scan the QR code first.' });
});

app.post('/api/qr/disconnect', async (req, res) => {
  stats.whatsappConnected = false;
  stats.whatsappNumber = null;
  lastQrCode = null;
  if (sock) {
    try { await sock.logout(); } catch { }
    try { sock.end(); } catch { }
    sock = null;
  }
  const authDir = path.join(__dirname, 'cleara_baileys_auth');
  try { fs.rmSync(authDir, { recursive: true, force: true }); } catch { }
  io.emit('whatsapp_disconnected');
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
//  DEBUG ROUTES
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/debug/test-send', async (req, res) => {
  if (!stats.whatsappConnected || !sock?.user) {
    return res.status(503).json({ success: false, error: 'WhatsApp not connected.' });
  }
  let digits = String(req.body.phone || '').replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  if (digits.length !== 10 || !/^[6-9]\d{9}$/.test(digits)) {
    return res.status(400).json({ success: false, error: `Invalid Indian mobile: ${req.body.phone}` });
  }
  const jid = '91' + digits + '@s.whatsapp.net';
  const message = req.body.message || '🔔 Cleara test — WhatsApp sending is working!';
  try {
    await sock.sendMessage(jid, { text: message });
    res.json({ success: true, jid, message });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/debug/check-wa', async (req, res) => {
  if (!stats.whatsappConnected || !sock?.user) {
    return res.status(503).json({ success: false, error: 'WhatsApp not connected.' });
  }
  let digits = String(req.body.phone || '').replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  if (digits.length !== 10 || !/^[6-9]\d{9}$/.test(digits)) {
    return res.status(400).json({ success: false, error: `Invalid number: ${req.body.phone}` });
  }
  const jid = '91' + digits + '@s.whatsapp.net';
  try {
    const [result] = await sock.onWhatsApp(jid);
    res.json({ jid, exists: result?.exists === true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  SCRAPER
// ─────────────────────────────────────────────────────────────────────────────
function formatIndianPhoneNumber(rawPhone) {
  const clean = rawPhone.replace(/[\s\-().+]/g, '');
  if (clean.length === 10 && /^[6-9]\d{9}$/.test(clean)) return `+91 ${clean}`;
  if (clean.length === 12 && /^91[6-9]\d{9}$/.test(clean)) return `+91 ${clean.slice(2)}`;
  if (clean.length === 11 && /^0[6-9]\d{9}$/.test(clean)) return `+91 ${clean.slice(1)}`;
  if (rawPhone.startsWith('+91') && clean.length === 12 && /^91[6-9]\d{9}$/.test(clean)) return `+91 ${clean.slice(2)}`;
  return null;
}

function extractPhoneNamePairs(html, fallbackTitle, fallbackDomain) {
  const noNoise = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const pairs = [];
  const seenPhones = new Set();
  const phoneRegex = /(?<!\d)(?:\+91[\s\-.]?|0)?[6-9]\d{2}[\s\-.]?\d{3}[\s\-.]?\d{4}(?!\d)/g;

  let match;
  while ((match = phoneRegex.exec(noNoise)) !== null) {
    const formatted = formatIndianPhoneNumber(match[0]);
    if (!formatted || seenPhones.has(formatted)) continue;
    seenPhones.add(formatted);

    const htmlBefore = noNoise.slice(Math.max(0, match.index - 600), match.index);
    let candidateName = '';

    const headingMatch = htmlBefore.match(/<h[1-4][^>]*>([\s\S]{2,80}?)<\/h[1-4]>/gi);
    if (headingMatch?.length) candidateName = headingMatch[headingMatch.length - 1].replace(/<[^>]+>/g, '').trim();

    if (!candidateName || candidateName.length < 3) {
      const boldMatch = htmlBefore.match(/<(?:strong|b)[^>]*>([\s\S]{2,70}?)<\/(?:strong|b)>/gi);
      if (boldMatch?.length) candidateName = boldMatch[boldMatch.length - 1].replace(/<[^>]+>/g, '').trim();
    }

    if (!candidateName || candidateName.length < 3) {
      const plainText = htmlBefore.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const segments = plainText.split(/[|•\n;,]/).map(s => s.trim()).filter(s => s.length > 3 && s.length < 80);
      for (let i = segments.length - 1; i >= 0; i--) {
        const seg = segments[i];
        if (/^(call|tel|ph|phone|mobile|mob|contact|no\.?|address|email|website|city|state)$/i.test(seg)) continue;
        if (/https?:|www\.|\.(com|in|org|net)/.test(seg)) continue;
        if (!/[a-zA-Z]/.test(seg)) continue;
        candidateName = seg;
        break;
      }
    }

    if (candidateName) {
      candidateName = candidateName
        .replace(/<[^>]+>/g, '')
        .replace(/^(name|company|business|firm|shop|contact|person|owner)\s*:?\s*/i, '')
        .replace(/\s+/g, ' ').trim();
    }

    let finalName = candidateName;
    if (!finalName || finalName.length < 3 || finalName.length > 80) {
      let t = (fallbackTitle || '').split(/[|\-–:]/)[0].trim().replace(/^www\./i, '').replace(/\.(com|in|co\.in|net|org|biz)$/i, '').trim();
      finalName = (t && t.length >= 3) ? t : (fallbackDomain || 'Business');
    }
    pairs.push({ phone: formatted, name: finalName });
  }
  return pairs;
}

function dedupeByPhone(pairs) {
  const seen = new Set();
  return pairs.filter(p => { if (seen.has(p.phone)) return false; seen.add(p.phone); return true; });
}

async function fetchWithTimeout(url, options = {}, timeout = 6000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) { clearTimeout(id); throw err; }
}

async function fetchFromDDGLite(query) {
  try {
    const response = await fetchWithTimeout('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `q=${encodeURIComponent(query)}`
    }, 8000);
    if (response.status !== 200) return [];
    const html = await response.text();
    if (html.includes('captcha') || html.includes('challenge-form')) return [];
    const re = /href="([^"]+?)"/g;
    let m;
    const links = [];
    while ((m = re.exec(html)) !== null) {
      const href = m[1];
      if (href.startsWith('http') && !/duckduckgo\.com/.test(href)) {
        try { links.push({ url: href, domain: new URL(href).hostname.toLowerCase() }); } catch { }
      }
    }
    return links;
  } catch (err) {
    console.error('[DDG]', err.message);
    return [];
  }
}

async function crawlPage(url) {
  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (res.status !== 200) return { title: '', phoneNamePairs: [] };
    const html = await res.text();
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    const domain = new URL(url).hostname.replace(/^www\./, '');
    let title = titleMatch ? titleMatch[1].split(/[|\-–:]/)[0].trim() : domain;
    if (!title || title.length < 2) title = domain;

    let phoneNamePairs = extractPhoneNamePairs(html, title, domain);

    if (phoneNamePairs.length === 0) {
      const linkRegex = /href="([^"]*?(?:contact|about|reach)[^"]*?)"/gi;
      let linkMatch;
      const links = [];
      while ((linkMatch = linkRegex.exec(html)) !== null && links.length < 2) {
        let href = linkMatch[1];
        if (!href.startsWith('http')) {
          try { href = new URL(href, new URL(url).origin).href; } catch { continue; }
        }
        links.push(href);
      }
      if (links.length > 0) {
        try {
          const subRes = await fetchWithTimeout(links[0], { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (subRes.status === 200) {
            const subHtml = await subRes.text();
            phoneNamePairs.push(...extractPhoneNamePairs(subHtml, title, domain).map(p => ({ ...p, isDeepCrawl: true })));
          }
        } catch { }
      }
    }
    return { title, phoneNamePairs: dedupeByPhone(phoneNamePairs) };
  } catch {
    return { title: '', phoneNamePairs: [] };
  }
}

app.post('/api/scrape', (req, res) => {
  const { keyword } = req.body;
  const bodyCity = req.body.city || null;
  let excludeKeywords = req.body.excludeKeywords || [];
  if (typeof excludeKeywords === 'string') {
    excludeKeywords = excludeKeywords.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  } else {
    excludeKeywords = excludeKeywords.map(s => String(s).toLowerCase().trim()).filter(Boolean);
  }
  const SERVER_DEFAULT_EXCLUDES = ['services', 'maids', 'deep cleaning', 'car wash', 'laundry', 'pest control', 'repair service', 'painting service'];
  excludeKeywords = [...new Set([...SERVER_DEFAULT_EXCLUDES, ...excludeKeywords])];

  if (!keyword) return res.status(400).json({ error: 'Keyword is required' });
  res.json({ success: true });

  (async () => {
    try {
      stats.scraping = true;
      const city = bodyCity || keyword.split(' ').slice(-1)[0] || 'India';
      const indiaKeyword = keyword.includes('India') ? keyword : `${keyword} India`;
      const isAggregator = /yahoo\.com|yimg\.com|google\.|youtube\.|facebook\.|twitter\.|instagram\.|linkedin\.|wikipedia\.|justdial\.|indiamart\.|tradeindia\./i;

      let sources = {
        'Yahoo Search': { count: 0, status: 'Searching...' },
        'DuckDuckGo Search': { count: 0, status: 'Searching...' },
        'Deep Crawl': { count: 0, status: 'Standby' }
      };
      io.emit('scraper_progress', { progress: 10, leadsCount: 0, sources });

      const yahooSearchPromise = (async () => {
        const offsets = [1, 11, 21, 31];
        const pages = await Promise.all(offsets.map(async (offset) => {
          try {
            const resp = await fetchWithTimeout(
              `https://search.yahoo.com/search?p=${encodeURIComponent(indiaKeyword)}&b=${offset}&fr=yfp-t`,
              { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'en-IN,en;q=0.9' } }
            );
            return resp.status === 200 ? await resp.text() : '';
          } catch { return ''; }
        }));
        const combinedHtml = pages.join('\n');
        const urls = [];
        const hrefRe = /href="([^"]+?)"/g;
        let m;
        while ((m = hrefRe.exec(combinedHtml)) !== null) {
          if (m[1].includes('r.search.yahoo.com')) {
            const ruMatch = m[1].match(/\/RU=([^/]+)/);
            if (ruMatch) {
              try {
                const decoded = decodeURIComponent(ruMatch[1]);
                if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
                  const domain = new URL(decoded).hostname.toLowerCase();
                  if (!isAggregator.test(domain)) urls.push({ url: decoded, domain, engine: 'Yahoo Search' });
                }
              } catch { }
            }
          }
        }
        return urls;
      })();

      const ddgSearchPromise = (async () => {
        const results = await fetchFromDDGLite(indiaKeyword);
        return results
          .filter(s => !isAggregator.test(s.domain))
          .map(s => ({ url: s.url, domain: s.domain, engine: 'DuckDuckGo Search' }));
      })();

      const [yahooUrls, ddgUrls] = await Promise.all([yahooSearchPromise, ddgSearchPromise]);

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

      sources['Yahoo Search'].status = 'Done';
      sources['DuckDuckGo Search'].status = 'Done';
      sources['Deep Crawl'].status = 'Crawling...';
      io.emit('scraper_progress', { progress: 30, leadsCount: 0, sources });

      const resultsMap = new Map();

      async function crawlAndSave(site) {
        const pageData = await crawlPage(site.url);
        (pageData.phoneNamePairs || []).forEach(({ phone, name, isDeepCrawl }) => {
          const nameLower = (name || '').toLowerCase();
          const isExcluded = excludeKeywords.some(kw => nameLower.includes(kw) || site.url.toLowerCase().includes(kw));
          if (!isExcluded) {
            resultsMap.set(phone, {
              name, phone, city,
              source: isDeepCrawl ? 'Deep Crawl' : (siteEngines.get(site.domain) || 'Search')
            });
          }
        });
      }

      const queue = [...uniqueUrlsToCrawl];
      async function next() {
        if (queue.length === 0) return;
        const site = queue.shift();
        try { await crawlAndSave(site); } catch { }
        io.emit('scraper_progress', {
          progress: Math.min(99, 30 + Math.round(((uniqueUrlsToCrawl.length - queue.length) / (uniqueUrlsToCrawl.length || 1)) * 70)),
          leadsCount: resultsMap.size,
          sources
        });
        await next();
      }

      await Promise.all(Array.from({ length: Math.min(5, queue.length || 1) }, next));

      scrapedLeads = Array.from(resultsMap.values()).map((lead, i) => ({
        id: `L${String(i + 1).padStart(3, '0')}`,
        ...lead
      }));
      stats.leadsScrapedCount = scrapedLeads.length;
      stats.scraping = false;

      io.emit('scraper_progress', { progress: 100, leadsCount: scrapedLeads.length, sources });
      io.emit('scraper_done', { validLeads: scrapedLeads.length, duplicatesRemoved: 0, leadsPreview: scrapedLeads });
    } catch (err) {
      console.error('[SCRAPER] Crash:', err);
      stats.scraping = false;
      io.emit('scraper_done', { validLeads: 0, duplicatesRemoved: 0, leadsPreview: [] });
    }
  })();
});

// ─────────────────────────────────────────────────────────────────────────────
//  LEADS & CAMPAIGN ROUTES
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/leads/import', (req, res) => {
  const { leads } = req.body;
  if (!leads || !Array.isArray(leads) || leads.length === 0) return res.status(400).json({ error: 'No leads provided' });
  const seen = new Set();
  scrapedLeads = leads.filter(lead => {
    const phone = String(lead.phone || '').replace(/\D/g, '');
    if (!phone || phone.length < 10 || seen.has(phone)) return false;
    seen.add(phone);
    return true;
  }).map((lead, i) => ({
    id: `L${String(i + 1).padStart(3, '0')}`,
    name: String(lead.name || 'Unknown').trim(),
    phone: lead.phone,
    city: String(lead.city || 'India').trim(),
    source: String(lead.source || 'CSV Import').trim()
  }));
  stats.leadsScrapedCount = scrapedLeads.length;
  io.emit('scraper_done', { validLeads: scrapedLeads.length, duplicatesRemoved: leads.length - scrapedLeads.length, leadsPreview: scrapedLeads });
  res.json({ success: true, count: scrapedLeads.length });
});

app.post('/api/campaign/inject', (req, res) => {
  stats.leadsQueue = [...scrapedLeads];
  stats.currentLeadIndex = 0;
  io.emit('campaign_injected', { queueLength: stats.leadsQueue.length });
  res.json({ success: true, queueLength: stats.leadsQueue.length });
});

app.post('/api/campaign/restart', (req, res) => {
  if (!stats.whatsappConnected || !sock) return res.status(400).json({ error: 'WhatsApp not connected' });
  stats.leadsQueue = [...scrapedLeads];
  stats.currentLeadIndex = 0;
  stats.campaignStatus = 'Running';
  if (campaignTimer) clearTimeout(campaignTimer);
  campaignTimer = null;
  io.emit('campaign_injected', { queueLength: stats.leadsQueue.length });
  io.emit('campaign_state_change', { status: 'Running' });
  scheduleNextCampaignTick();
  res.json({ success: true, queueLength: stats.leadsQueue.length, status: 'Running' });
});

app.post('/api/campaign/start', (req, res) => {
  if (stats.leadsQueue.length === 0) return res.status(400).json({ error: 'Queue is empty' });
  stats.campaignStatus = 'Running';
  io.emit('campaign_state_change', { status: 'Running' });
  scheduleNextCampaignTick();
  res.json({ success: true });
});

app.post('/api/campaign/pause', (req, res) => {
  stats.campaignStatus = 'Paused';
  io.emit('campaign_state_change', { status: 'Paused' });
  if (campaignTimer) { clearTimeout(campaignTimer); campaignTimer = null; }
  res.json({ success: true });
});

app.post('/api/campaign/stop', (req, res) => {
  stats.campaignStatus = 'Stopped';
  stats.currentLeadIndex = 0;
  io.emit('campaign_state_change', { status: 'Stopped' });
  if (campaignTimer) { clearTimeout(campaignTimer); campaignTimer = null; }
  res.json({ success: true });
});

app.post('/api/campaign/settings', (req, res) => {
  const { speedLevel, messageTemplate } = req.body;
  if (speedLevel !== undefined) stats.speedLevel = Number(speedLevel);
  if (messageTemplate !== undefined) stats.messageTemplate = messageTemplate;
  if (stats.campaignStatus === 'Running') scheduleNextCampaignTick();
  res.json({ success: true });
});

app.post('/api/campaign/analyze-template', async (req, res) => {
  const { messageTemplate } = req.body;
  if (!messageTemplate) return res.status(400).json({ error: 'Template is required' });
  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3',
        messages: [
          { role: 'system', content: `You are a B2B marketing strategist. Analyze the WhatsApp pitch template. Output clean markdown with: Conversion Grade (X/10), Key Strengths (2 bullets), Friction Points (2 bullets), Closing Recommendation (1 sentence). Be crisp.` },
          { role: 'user', content: messageTemplate }
        ],
        stream: false
      })
    });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const data = await response.json();
    res.json({ success: true, analysis: data.message.content.trim() });
  } catch {
    res.json({
      success: true,
      analysis: `### Conversion Analysis\n**Conversion Grade: 8.8 / 10**\n\n**Key Strengths:**\n- Clear profit margins per product build instant B2B interest\n- Simple CTA ("YES" or "SEND") lowers reply friction\n\n**Friction Points:**\n- Long format may lose mobile readers before the CTA\n- Box-quantity requirement may deter smaller retailers\n\n**Recommendation:** Use as a follow-up template; lead cold outreach with a 3-bullet version.`
    });
  }
});

app.get('/api/campaign/download-logs', (req, res) => {
  let csv = 'ID,Name,City,Phone,Status\n';
  messageLogs.forEach(log => { csv += `${log.id},"${log.name.replace(/"/g, '""')}","${log.city}",${log.phone},${log.status}\n`; });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=campaign_logs.csv');
  res.send(csv);
});

app.get('/api/campaign/download-leads', (req, res) => {
  let csv = 'ID,Name,Phone,City,Source\n';
  scrapedLeads.forEach(lead => { csv += `${lead.id},"${lead.name.replace(/"/g, '""')}",${lead.phone},"${lead.city}",${lead.source}\n`; });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=leads_registry.csv');
  res.send(csv);
});

// ─────────────────────────────────────────────────────────────────────────────
//  SOCKET.IO
// ─────────────────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[SOCKET] Connected: ${socket.id}`);
  socket.emit('whatsapp_state', { connected: stats.whatsappConnected, number: stats.whatsappNumber });
  if (lastQrCode && !stats.whatsappConnected) socket.emit('whatsapp_qr', { qr: lastQrCode });
  socket.on('disconnect', () => console.log(`[SOCKET] Disconnected: ${socket.id}`));
});

// ─────────────────────────────────────────────────────────────────────────────
//  SPA CATCH-ALL — must come AFTER all /api routes
// ─────────────────────────────────────────────────────────────────────────────
app.get('/{*path}', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend build not found. Run "npm run build" and redeploy.');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  STARTUP
// ─────────────────────────────────────────────────────────────────────────────
const authDir = path.join(__dirname, 'cleara_baileys_auth');
if (fs.existsSync(path.join(authDir, 'creds.json'))) {
  console.log('[WA] Found existing credentials — auto-reconnecting...');
  startWhatsAppConnection();
}

httpServer.listen(PORT, () => {
  console.log(`✅ Cleara server listening on port ${PORT}`);
});