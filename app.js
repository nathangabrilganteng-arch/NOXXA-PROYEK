/* ============================================================
   NAELGHUB v14.0 — Shared Logic
   ============================================================ */

/* FIREBASE CONFIG */
const firebaseConfig = {
  apiKey: "AIzaSyCwS8KdOWkXGrswFA3n76wVOEN-WRxvtsE",
  authDomain: "naelghub.firebaseapp.com",
  databaseURL: "https://naelghub-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "naelghub",
  storageBucket: "naelghub.firebasestorage.app",
  messagingSenderId: "282511346516",
  appId: "1:282511346516:web:88ff9b587cfa6a956756c1"
};

/* ROLES */
const ROLES = {
  member:    { level:1, label:'MEMBER',    color:'#00d4ff', emoji:'🔵', icon:'fa-user' },
  vip:       { level:2, label:'VIP',       color:'#ff0040', emoji:'🔴', icon:'fa-crown' },
  reseller:  { level:3, label:'RESELLER',  color:'#ffd700', emoji:'🟡', icon:'fa-handshake' },
  owner:     { level:4, label:'OWNER',     color:'#ff00ff', emoji:'🌸', icon:'fa-star' },
  developer: { level:5, label:'DEVELOPER', color:'#00e676', emoji:'🟢', icon:'fa-code' }
};
const CREATE_ACCESS_MATRIX = {
  member:[], vip:[],
  reseller:['member','vip'],
  owner:['member','vip','reseller','owner'],
  developer:['member','vip','reseller','owner']
};
const DEFAULT_ACCOUNTS = {
  'dev':       { password:'dev123',      role:'developer', expiry:'2030-01-01' },
  'nael12':    { password:'nael12345q',  role:'owner',     expiry:'2029-01-06' },
  'reseller1': { password:'reseller123', role:'reseller',  expiry:'2028-06-01' },
  'vip1':      { password:'vip123',      role:'vip',       expiry:'2027-12-01' }
};
const ACCOUNTS = {
  'dev':       { pw:'dev123',      role:'developer' },
  'nael12':    { pw:'nael12345q',  role:'owner' },
  'reseller1': { pw:'reseller123', role:'reseller' },
  'vip1':      { pw:'vip123',      role:'vip' }
};

/* SESSION */
function getUsers(){try{return JSON.parse(localStorage.getItem('naelghub_users'))||{};}catch{return{};}}
function saveUsers(u){localStorage.setItem('naelghub_users',JSON.stringify(u));}
function getSession(){try{return JSON.parse(localStorage.getItem('naelghub_session'));}catch{return null;}}
function setSession(data){localStorage.setItem('naelghub_session',JSON.stringify(data));}
function clearSession(){localStorage.removeItem('naelghub_session');}
function getHistory(){try{return JSON.parse(localStorage.getItem('naelghub_history'))||[];}catch{return[];}}
function saveHistory(d){localStorage.setItem('naelghub_history',JSON.stringify(d));}
function getNumverifyKey(){try{return localStorage.getItem('naelghub_numverify_key')||'5a26c4fb4499f4f8e49464750c76d84a';}catch{return'5a26c4fb4499f4f8e49464750c76d84a';}}
function getBackendUrl(){try{return localStorage.getItem('naelghub_backend_url')||String(window.NAELGHUB_API_BASE||'').replace(/\/$/,'')||(location.protocol==='http:'||location.protocol==='https:'?location.origin:'');}catch{return String(window.NAELGHUB_API_BASE||'').replace(/\/$/);}}
function getGroqKey(){try{return localStorage.getItem('naelghub_groq_key')||'';}catch{return'';}}

function ensureDefaultAccounts(){
  const u = getUsers();
  let c = false;
  for(const k in DEFAULT_ACCOUNTS){
    if(!u[k]){ u[k] = {...DEFAULT_ACCOUNTS[k]}; c = true; }
  }
  if(c) saveUsers(u);
}

/* HELPERS */
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function showToast(msg){
  const e=document.querySelector('.toast');if(e)e.remove();
  const t=document.createElement('div');t.className='toast';t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(()=>t.remove(),300);},2500);
}

/* ROLE HELPERS (butuh currentUser global) */
function getMyRole(){return (window.currentUser && window.currentUser.role) || 'member';}
function getMyLevel(){return ROLES[getMyRole()]?.level || 1;}
function hasRole(minRole){return getMyLevel() >= (ROLES[minRole]?.level || 1);}
function hasVIP(){return hasRole('vip');}
function hasReseller(){return hasRole('reseller');}
function hasOwner(){return hasRole('owner');}
function isDeveloper(){return getMyRole() === 'developer';}
function canManageUsers(){return hasOwner() || isDeveloper();}
function canCreateAccess(){return (CREATE_ACCESS_MATRIX[getMyRole()] || []).length > 0;}

/* BUG LIBRARY */
const srvBugs = {
  personal: [
    { id:'CSPAM', name:'CSPAM', vipOnly:false }, { id:'CSPAMXX', name:'CSPAMXX', vipOnly:false },
    { id:'CLICK', name:'CLICK', vipOnly:false }, { id:'SPAM_CALL', name:'SPAM CALL', vipOnly:true },
    { id:'ANDROID', name:'ANDROID', vipOnly:true }, { id:'SPAM_MBOKEP', name:'SPAM MBOKEP', vipOnly:false },
    { id:'CXINV', name:'CXINV', vipOnly:true }, { id:'FC_ANDROID_V2', name:'FC ANDROID V2', vipOnly:true }
  ],
  group: [
    { id:'BLANK_GROUP', name:'BLANK GROUP', vipOnly:false }, { id:'DELAY_MEMB', name:'DELAY MEMB', vipOnly:true },
    { id:'MIX_COMBO', name:'MIX COMBO', vipOnly:true }, { id:'SPAM_BOKEP', name:'SPAM BOKEP', vipOnly:true },
    { id:'BANZ_GB_V1', name:'BANZ GB V1', vipOnly:true }, { id:'BANZ_GB_V2', name:'BANZ GB V2', vipOnly:true }
  ],
  v2: [
    { id:'DELAYHARD', name:'DELAYHARD', vipOnly:false }, { id:'DELAYMS', name:'DELAYMS', vipOnly:false },
    { id:'DELAYMAX', name:'DELAYMAX', vipOnly:true }, { id:'DELAYPRO', name:'DELAYPRO', vipOnly:true },
    { id:'CRASHHARD', name:'CRASHHARD', vipOnly:true }, { id:'CRASHMS', name:'CRASHMS', vipOnly:true },
    { id:'CRASHMAX', name:'CRASHMAX', vipOnly:true }, { id:'CRASHPRO', name:'CRASHPRO', vipOnly:true },
    { id:'FREEZEHARD', name:'FREEZEHARD', vipOnly:true }, { id:'FREEZEMS', name:'FREEZEMS', vipOnly:true },
    { id:'FREEZEMAX', name:'FREEZEMAX', vipOnly:true }, { id:'FREEZEPRO', name:'FREEZEPRO', vipOnly:true },
    { id:'BLANKHARD', name:'BLANKHARD', vipOnly:false }, { id:'BLANKMS', name:'BLANKMS', vipOnly:false },
    { id:'BLANKMAX', name:'BLANKMAX', vipOnly:false }, { id:'BLANKPRO', name:'BLANKPRO', vipOnly:true },
    { id:'LOCKiOS', name:'LOCK iOS', vipOnly:true }, { id:'LOCKMAX', name:'LOCKMAX', vipOnly:true },
    { id:'LOCKPRO', name:'LOCKPRO', vipOnly:true }, { id:'LOCKHARD', name:'LOCKHARD', vipOnly:true }
  ]
};
const SRV_CAT_META = { personal:{label:'📱 Personal',count:8}, group:{label:'👥 Grup',count:6}, v2:{label:'⚡ V2',count:20} };
const BUG_ICONS = {
  'CSPAM':'fa-hourglass-half','CSPAMXX':'fa-bomb','CLICK':'fa-mouse-pointer','SPAM_CALL':'fa-phone-slash',
  'ANDROID':'fa-android','SPAM_MBOKEP':'fa-exclamation-triangle','CXINV':'fa-envelope-open-text','FC_ANDROID_V2':'fa-redo',
  'BLANK_GROUP':'fa-ghost','DELAY_MEMB':'fa-users-slash','MIX_COMBO':'fa-layer-group','SPAM_BOKEP':'fa-fire',
  'BANZ_GB_V1':'fa-ban','BANZ_GB_V2':'fa-hammer','DELAYHARD':'fa-hourglass-half','DELAYMS':'fa-clock',
  'DELAYMAX':'fa-stopwatch','DELAYPRO':'fa-skull','CRASHHARD':'fa-bomb','CRASHMS':'fa-bomb','CRASHMAX':'fa-skull',
  'CRASHPRO':'fa-skull-crossbones','FREEZEHARD':'fa-snowflake','FREEZEMS':'fa-snowflake','FREEZEMAX':'fa-icicles',
  'FREEZEPRO':'fa-snowflake','BLANKHARD':'fa-square','BLANKMS':'fa-square','BLANKMAX':'fa-square','BLANKPRO':'fa-square',
  'LOCKiOS':'fa-lock','LOCKMAX':'fa-lock','LOCKPRO':'fa-lock','LOCKHARD':'fa-lock'
};

/* WEATHER */
async function loadWeather(){
  try {
    const ipResp = await fetch('https://ipapi.co/json/');
    const ipData = await ipResp.json();
    const lat = ipData.latitude || -6.2;
    const lon = ipData.longitude || 106.8;
    const city = ipData.city || 'Jakarta';
    const wResp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,relative_humidity_2m&timezone=auto`);
    const wData = await wResp.json();
    const temp = Math.round(wData.current?.temperature_2m || 30);
    const humidity = wData.current?.relative_humidity_2m || 0;
    const code = wData.current?.weather_code || 0;
    const icons = {0:'fa-sun',1:'fa-cloud-sun',2:'fa-cloud-sun',3:'fa-cloud',45:'fa-smog',48:'fa-smog',51:'fa-cloud-rain',61:'fa-cloud-showers-heavy',71:'fa-snowflake',80:'fa-cloud-showers-heavy',95:'fa-bolt'};
    const icon = icons[code] || 'fa-cloud-sun';
    const wv = document.getElementById('weatherValue'); if(wv) wv.textContent = temp + '°C';
    const ws = document.getElementById('weatherSub'); if(ws) ws.textContent = `${city} · 💧${humidity}%`;
    const wi = document.getElementById('weatherIcon'); if(wi) wi.className = 'fas ' + icon;
  } catch(e){
    const wv = document.getElementById('weatherValue'); if(wv) wv.textContent = '--°C';
    const ws = document.getElementById('weatherSub'); if(ws) ws.textContent = 'Gagal load';
  }
}

/* IP INFO */
async function loadIPInfo(){
  try {
    const r = await fetch('https://ipapi.co/json/');
    const d = await r.json();
    const loc = document.getElementById('ipLocation');
    const det = document.getElementById('ipDetail');
    if(loc) loc.textContent = `${d.city || '?'}, ${d.country_code || '?'}`;
    if(det) det.textContent = `${d.ip || '?'} · ${d.org || 'ISP'}`;
  } catch(e){
    const loc = document.getElementById('ipLocation'); if(loc) loc.textContent = '--';
    const det = document.getElementById('ipDetail'); if(det) det.textContent = 'Gagal load';
  }
}

/* ============================================================
   MULTI API FUNCTIONS
   ============================================================ */
function genQR(){
  const text = document.getElementById('qrText').value.trim();
  const res = document.getElementById('qrResult');
  if(!text){ res.className='api-result error'; res.textContent='❌ Masukkan teks!'; return; }
  const url = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(text);
  res.className = 'api-result success';
  res.innerHTML = `<div style="text-align:center;"><img src="${url}" style="background:#fff;padding:8px;border-radius:8px;max-width:200px;" /><div style="margin-top:8px;font-size:10px;">✅ QR: ${escapeHtml(text)}</div></div>`;
}

async function shortenUrl(){
  const url = document.getElementById('shortUrl').value.trim();
  const res = document.getElementById('shortResult');
  if(!url){ res.className='api-result error'; res.textContent='❌ Masukkan URL!'; return; }
  res.className = 'api-result'; res.textContent = '⏳ Shortening...';
  try {
    const r = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`);
    const d = await r.json();
    if(d.shorturl){
      res.className = 'api-result success';
      res.innerHTML = `✅ Short URL:\n<a href="${d.shorturl}" target="_blank" style="color:#4a90d9;">${d.shorturl}</a>`;
    } else throw new Error(d.errormessage || 'Failed');
  } catch(e){ res.className='api-result error'; res.textContent = '❌ ' + e.message; }
}

async function translateText(){
  const text = document.getElementById('translateText').value.trim();
  const to = document.getElementById('translateTo').value;
  const res = document.getElementById('translateResult');
  if(!text){ res.className='api-result error'; res.textContent='❌ Masukkan teks!'; return; }
  res.className = 'api-result'; res.textContent = '⏳ Translating...';
  try {
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=id|${to}`);
    const d = await r.json();
    const translated = d.responseData?.translatedText || 'Gagal';
    res.className = 'api-result success';
    res.innerHTML = `📝 Original: ${escapeHtml(text)}\n🌐 Translated: <b style="color:#00e676;">${escapeHtml(translated)}</b>`;
  } catch(e){ res.className='api-result error'; res.textContent = '❌ ' + e.message; }
}

async function convertCurrency(){
  const amount = parseFloat(document.getElementById('currAmount').value) || 0;
  const from = document.getElementById('currFrom').value;
  const to = document.getElementById('currTo').value;
  const res = document.getElementById('currResult');
  res.className = 'api-result'; res.textContent = '⏳ Converting...';
  try {
    const r = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`);
    const d = await r.json();
    const rate = d.rates?.[to];
    if(!rate) throw new Error('Rate not found');
    const converted = (amount * rate).toFixed(2);
    res.className = 'api-result success';
    res.innerHTML = `💱 ${amount} ${from} = <b style="color:#00e676;">${converted} ${to}</b>`;
  } catch(e){ res.className='api-result error'; res.textContent = '❌ ' + e.message; }
}

async function getGitHub(){
  const u = document.getElementById('ghUser').value.trim();
  const res = document.getElementById('ghResult');
  if(!u){ res.className='api-result error'; res.textContent='❌ Masukkan username!'; return; }
  res.className = 'api-result'; res.textContent = '⏳ Searching...';
  try {
    const r = await fetch(`https://api.github.com/users/${encodeURIComponent(u)}`);
    if(!r.ok) throw new Error('User not found');
    const d = await r.json();
    res.className = 'api-result success';
    res.innerHTML = `👤 <b>${d.login}</b> (${d.name || '-'})\n📝 Bio: ${d.bio || '-'}\n👥 Followers: ${d.followers}\n📦 Repos: ${d.public_repos}\n🔗 ${d.html_url}`;
  } catch(e){ res.className='api-result error'; res.textContent = '❌ ' + e.message; }
}

async function getRandomUser(){
  const res = document.getElementById('userResult');
  res.className = 'api-result'; res.textContent = '⏳ Generating...';
  try {
    const r = await fetch('https://randomuser.me/api/');
    const d = await r.json();
    const u = d.results[0];
    res.className = 'api-result success';
    res.innerHTML = `👤 <b>${u.name.first} ${u.name.last}</b>\n📧 ${u.email}\n📱 ${u.phone}\n🌍 ${u.location.country}`;
  } catch(e){ res.className='api-result error'; res.textContent = '❌ ' + e.message; }
}

async function getJoke(){
  const res = document.getElementById('jokeResult');
  res.className = 'api-result'; res.textContent = '⏳ Loading...';
  try {
    const r = await fetch('https://official-joke-api.appspot.com/random_joke');
    const d = await r.json();
    res.className = 'api-result success';
    res.innerHTML = `😂 <b>${d.setup}</b>\n\n😆 ${d.punchline}`;
  } catch(e){ res.className='api-result error'; res.textContent = '❌ ' + e.message; }
}

console.log('🔥 app.js loaded — NAELGHUB v14.0');