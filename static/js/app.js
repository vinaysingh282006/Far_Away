/* ================================================================
   GUARDIAN MESH — Premium App Logic v2
   Onboarding · Tooltips · 3D Canvases · AI · WebSocket · Charts
   ================================================================ */
'use strict';

// ── State ─────────────────────────────────────────────────────────
const GM = {
  currentPage: 1,
  charts: {},
  historyData: [],
  ws: null, wsRetries: 0, maxWsRetries: 12,
  lastTelemetry: {},
  nodes: [], alerts: [], packets: [],
  aiReports: [],
  caps: {},
  storyIdx: 0, storyTotal: 7,
  onbStep: 0, onbTotal: 4,
  meshAF: null, heroAF: null, storyAF: null, bgAF: null,
  meshPackets: [], meshPulse: 0,
  chartsInited: false, histChartsInited: false,
  weather: null,
};

// ── Helpers ───────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
const setText = (id, v) => { const e = $( id ); if (e) e.textContent = v; };
const setHTML = (id, v) => { const e = $( id ); if (e) e.innerHTML = v; };

// ── Clock ─────────────────────────────────────────────────────────
function startClock() {
  const el = $('nav-clock');
  if (!el) return;
  const tick = () => el.textContent = new Date().toLocaleTimeString('en-GB',{hour12:false});
  tick(); setInterval(tick, 1000);
}

/* ══════════════════════════════════════════════════════════════════
   BACKGROUND PARTICLE CANVAS
══════════════════════════════════════════════════════════════════ */
function initBgCanvas() {
  const canvas = $('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W = canvas.width = window.innerWidth;
  let H = canvas.height = window.innerHeight;
  window.addEventListener('resize', () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; });

  const pts = Array.from({length: 55}, () => ({
    x: Math.random() * W, y: Math.random() * H,
    r: Math.random() * 1.3 + 0.3,
    vx: (Math.random() - 0.5) * 0.22,
    vy: -Math.random() * 0.3 - 0.05,
    a: Math.random() * 0.3 + 0.05,
  }));

  function draw() {
    ctx.clearRect(0,0,W,H);
    pts.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,255,255,${p.a})`; ctx.fill();
      p.x += p.vx; p.y += p.vy;
      if (p.y < -10) { p.y = H+10; p.x = Math.random()*W; }
      if (p.x < -10) p.x = W+10;
      if (p.x > W+10) p.x = -10;
    });
    GM.bgAF = requestAnimationFrame(draw);
  }
  draw();
}

/* ══════════════════════════════════════════════════════════════════
   TOOLTIP SYSTEM
══════════════════════════════════════════════════════════════════ */
const tip = $('tooltip') || document.createElement('div');
function initTooltips() {
  let timer;
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-tooltip]');
    if (!el) return;
    clearTimeout(timer);
    timer = setTimeout(() => showTip(el, el.dataset.tooltip), 400);
  });
  document.addEventListener('mouseout', e => {
    if (!e.target.closest('[data-tooltip]')) return;
    clearTimeout(timer);
    hideTip();
  });
  document.addEventListener('mousemove', moveTip);
}

let tipX = 0, tipY = 0;
function showTip(el, text) {
  tip.textContent = text;
  tip.classList.add('visible');
  tip.setAttribute('aria-hidden','false');
}
function hideTip() {
  tip.classList.remove('visible');
  tip.setAttribute('aria-hidden','true');
}
function moveTip(e) {
  tipX = e.clientX; tipY = e.clientY;
  const pad = 12;
  let x = tipX + pad, y = tipY - tip.offsetHeight - pad;
  if (x + tip.offsetWidth > window.innerWidth) x = tipX - tip.offsetWidth - pad;
  if (y < 0) y = tipY + pad;
  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
}

/* ══════════════════════════════════════════════════════════════════
   CARD TILT
══════════════════════════════════════════════════════════════════ */
function initCardTilt() {
  document.addEventListener('mousemove', e => {
    $$('.card-tilt').forEach(card => {
      const r  = card.getBoundingClientRect();
      if (e.clientX < r.left-60 || e.clientX > r.right+60 || e.clientY < r.top-60 || e.clientY > r.bottom+60) {
        card.style.transform = '';
        return;
      }
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      const dx = (e.clientX - cx) / (r.width/2);
      const dy = (e.clientY - cy) / (r.height/2);
      card.style.transform = `perspective(800px) rotateY(${dx*5}deg) rotateX(${-dy*5}deg) translateZ(4px)`;
    });
  });
  document.addEventListener('mouseleave', () => {
    $$('.card-tilt').forEach(c => c.style.transform = '');
  });
}

/* ══════════════════════════════════════════════════════════════════
   PARALLAX HERO
══════════════════════════════════════════════════════════════════ */
function initParallax() {
  const hero = $('hero-parallax');
  if (!hero) return;
  document.addEventListener('mousemove', e => {
    if (GM.currentPage !== 1) return;
    const cx = window.innerWidth/2, cy = window.innerHeight/2;
    const dx = (e.clientX - cx) / cx;
    const dy = (e.clientY - cy) / cy;
    hero.querySelectorAll('[data-depth]').forEach(el => {
      const d = parseFloat(el.dataset.depth);
      el.style.transform = `translate(${dx * d * 28}px, ${dy * d * 18}px)`;
    });
  });
}

/* ══════════════════════════════════════════════════════════════════
   ONBOARDING
══════════════════════════════════════════════════════════════════ */
function initOnboarding() {
  if (localStorage.getItem('gm-onb-done')) { closeOnboarding(); return; }
  renderOnbDots();
  showOnbStep(0);
}

function renderOnbDots() {
  const c = $('onb-dots');
  if (!c) return;
  c.innerHTML = Array.from({length: GM.onbTotal}, (_,i) => {
    const cls = i === GM.onbStep ? 'active' : i < GM.onbStep ? 'done' : '';
    return `<div class="onb-dot ${cls}"></div>`;
  }).join('');
}

function showOnbStep(idx) {
  GM.onbStep = idx;
  $$('.onb-step').forEach((s,i) => s.classList.toggle('active', i === idx));
  renderOnbDots();
  const nextBtn = $('onb-next');
  if (nextBtn) nextBtn.textContent = idx === GM.onbTotal-1 ? 'Start Exploring →' : 'Next →';
}

function onboardingNext() {
  if (GM.onbStep >= GM.onbTotal-1) { closeOnboarding(); return; }
  showOnbStep(GM.onbStep + 1);
}

function closeOnboarding() {
  const el = $('onboarding-overlay');
  if (el) el.classList.add('hidden');
  localStorage.setItem('gm-onb-done', '1');
}

/* ══════════════════════════════════════════════════════════════════
   PAGE NAVIGATION
══════════════════════════════════════════════════════════════════ */
function switchPage(num) {
  if (GM.currentPage === num) return;
  GM.currentPage = num;

  $$('.page').forEach(s => s.classList.remove('active'));
  $$('.nav-link[data-page]').forEach(b => {
    const active = parseInt(b.dataset.page) === num;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active);
  });

  const target = $(`page-${num}`);
  if (target) requestAnimationFrame(() => target.classList.add('active'));

  if (num === 3) initSensorCharts();
  if (num === 4) initMeshCanvas();
  if (num === 6) loadHistoryPage();
  if (num === 2) updateRoadmapBadges();
}

function updateRoadmapBadges() {
  const gems = $('rm-gemini-badge'), cla = $('rm-claude-badge');
  if (gems) { gems.className = 'badge ' + (GM.caps.ai_gemini ? 'badge-maroon' : 'badge-muted'); gems.textContent = 'Gemini' + (GM.caps.ai_gemini ? ' ✓' : ' —'); }
  if (cla)  { cla.className  = 'badge ' + (GM.caps.ai_claude ? 'badge-maroon' : 'badge-muted'); cla.textContent  = 'Claude'  + (GM.caps.ai_claude  ? ' ✓' : ' —'); }
}

/* ══════════════════════════════════════════════════════════════════
   WEBSOCKET
══════════════════════════════════════════════════════════════════ */
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  GM.ws = new WebSocket(`${proto}://${location.host}/ws`);
  GM.ws.onopen = () => { GM.wsRetries = 0; setText('ws-label', 'LIVE'); };
  GM.ws.onmessage = ({data}) => { try { handleWS(JSON.parse(data)); } catch {} };
  GM.ws.onclose = () => {
    setText('ws-label', 'RECONNECT');
    if (GM.wsRetries++ < GM.maxWsRetries)
      setTimeout(connectWS, Math.min(8000, GM.wsRetries * 800));
  };
}

function handleWS(msg) {
  switch (msg.type) {
    case 'sensor_update':  updateSensors(msg.data); break;
    case 'panic':          handleAlert(msg.data); break;
    case 'packet_update':  addPacket(msg.packet); break;
    case 'network_status_toggle': updateNetBtn(msg.online); break;
    case 'ai_report':      handleAIReport(msg.data); break;
    case 'queue_update':   break; // future badge
  }
}

/* ══════════════════════════════════════════════════════════════════
   SENSOR DISPLAY
══════════════════════════════════════════════════════════════════ */
function updateSensors(d) {
  GM.lastTelemetry = d;
  const ts = new Date().toLocaleTimeString('en-GB',{hour12:false});
  setText('p3-update', `Updated ${ts}`);

  const flash = id => {
    const e = $(id); if (!e) return;
    e.classList.remove('value-flash'); void e.offsetWidth; e.classList.add('value-flash');
  };

  function setBar(id, pct, clamp=100) {
    const el = $(id); if (el) el.style.setProperty('--pct', Math.min(clamp, Math.max(0, pct)) + '%');
  }

  if (d.temperature != null) {
    setText('sv-temp', d.temperature.toFixed(1)); flash('sc-temp');
    setBar('sb-temp', (d.temperature/50)*100);
    const t = $('st-temp');
    if (t) { t.textContent = d.temperature > 40 ? '↑ Alert: Above Threshold' : d.temperature > 32 ? '↑ Elevated' : '● Normal'; t.style.color = d.temperature > 40 ? '#EF4444' : '#666'; }
  }
  if (d.humidity != null) { setText('sv-hum', d.humidity.toFixed(0)); setBar('sb-hum', d.humidity); }
  if (d.pressure != null) { setText('sv-pres', d.pressure.toFixed(1)); setBar('sb-pres', ((d.pressure-990)/40)*100); }
  if (d.aqi != null) {
    setText('sv-aqi', Math.round(d.aqi)); flash('sc-aqi');
    setBar('sb-aqi', (d.aqi/200)*100);
    const a = $('st-aqi');
    if (a) { a.textContent = d.aqi > 200 ? '⚠ Hazardous' : d.aqi > 100 ? '↑ Moderate' : '● Good'; a.style.color = d.aqi > 200 ? '#EF4444' : d.aqi > 100 ? '#FFA500' : '#666'; }
  }
  if (d.rainfall != null)   setText('sv-rain', d.rainfall.toFixed(1));
  if (d.wind_speed != null)  setText('sv-wind', d.wind_speed.toFixed(1));
  if (d.battery != null)     setText('sv-bat', d.battery);
  if (d.rssi != null)        setText('sv-rssi', d.rssi);

  // Update hero weather strip from sensor data (fallback to sensor if weather API unavailable)
  if (!GM.weather) {
    if (d.temperature != null) setText('ws-temp', d.temperature.toFixed(1));
    if (d.humidity != null)    setText('ws-hum',  d.humidity.toFixed(0));
    if (d.aqi != null)         setText('ws-aqi',  Math.round(d.aqi));
    if (d.wind_speed != null)  setText('ws-wind', d.wind_speed.toFixed(1));
  }

  pushLiveToCharts(d);
}

/* ══════════════════════════════════════════════════════════════════
   DATA FETCH
══════════════════════════════════════════════════════════════════ */
async function fetchInitial() {
  // Config & capabilities
  try {
    const r = await fetch('/config.json'); const j = await r.json();
    GM.caps = j.data?.capabilities || {};
    const badge = $('ai-provider-badge');
    if (badge) {
      if (GM.caps.ai_gemini)   { badge.textContent = 'Gemini AI ✓'; badge.className = 'badge badge-maroon'; }
      else if (GM.caps.ai_claude) { badge.textContent = 'Claude AI ✓'; badge.className = 'badge badge-maroon'; }
      else                     { badge.textContent = 'Smart Fallback'; badge.className = 'badge badge-muted'; }
    }
    const introBadge = $('intro-ai-badge');
    if (introBadge) introBadge.textContent = GM.caps.ai_gemini ? 'Gemini' : GM.caps.ai_claude ? 'Claude' : 'AI';
  } catch {}

  // Latest telemetry
  try {
    const r = await fetch('/latest'); const j = await r.json();
    if (j.success && j.data) updateSensors(j.data);
  } catch {}

  // Nodes
  try {
    const r = await fetch('/nodes'); const j = await r.json();
    if (j.success) { GM.nodes = j.data; renderNodes(); }
  } catch {}

  // Packets
  try {
    const r = await fetch('/packets'); const j = await r.json();
    if (j.success) { GM.packets = j.data.slice(0,15); renderPackets(); }
  } catch {}

  // Alerts
  try {
    const r = await fetch('/alerts'); const j = await r.json();
    if (j.success) { GM.alerts = j.data.filter(a => a.status === 'INCOMING'); renderAlerts(); }
  } catch {}

  // History count
  try {
    const r = await fetch('/history/json'); const j = await r.json();
    if (j.success && j.data) {
      GM.historyData = j.data;
      setText('intro-records', j.data.length.toLocaleString());
    }
  } catch {}

  // AI reports
  try {
    const r = await fetch('/ai/reports'); const j = await r.json();
    if (j.success) GM.aiReports = j.data;
    renderSavedReports();
  } catch {}

  // Weather
  fetchWeather();
}

async function fetchWeather() {
  try {
    const r = await fetch('/weather'); const j = await r.json();
    if (j.success && j.data) {
      GM.weather = j.data;
      const d = j.data;
      setText('ws-temp', d.temperature?.toFixed(1));
      setText('ws-hum',  d.humidity?.toFixed(0));
      setText('ws-wind', d.wind_speed?.toFixed(1));

      const src = $('ws-source-badge');
      if (src) {
        const isLive = d.data_source !== 'mock_fallback';
        src.innerHTML = `<span class="ws-val" style="font-size:10px;color:${isLive ? '#4ADE80' : '#555'};">${isLive ? '● Live Weather' : '◌ Mock Data'}</span>`;
      }
    }
  } catch {}

  try {
    const r = await fetch('/aqi'); const j = await r.json();
    if (j.success && j.data) setText('ws-aqi', j.data.aqi);
  } catch {}
}

/* ══════════════════════════════════════════════════════════════════
   NODE REGISTRY
══════════════════════════════════════════════════════════════════ */
function renderNodes() {
  const c = $('node-registry'); if (!c) return;
  if (!GM.nodes.length) { c.innerHTML = '<div class="mp-empty">No nodes registered</div>'; return; }
  c.innerHTML = GM.nodes.map(n => {
    const offline = !n.battery || n.battery === 0;
    const dotCls  = offline ? 'node-dot-gray' : n.battery < 20 ? 'node-dot-red' : n.battery < 50 ? 'node-dot-amber' : 'node-dot-green';
    const name    = n.config?.custom_name || n.node_id;
    const ts      = n.last_seen ? new Date(n.last_seen*1000).toLocaleTimeString('en-GB',{hour12:false}) : 'Never';
    return `<div class="node-row" onclick="focusNode('${n.node_id}')" data-tooltip="Click to highlight on mesh map" tabindex="0">
      <div style="display:flex;align-items:center;gap:10px;flex:1;">
        <div class="node-dot ${dotCls}"></div>
        <div><div style="font-size:12px;font-weight:500;color:#E8E2DA;">${name}</div><div style="font-size:10px;color:#444;margin-top:1px;">${n.node_id} · ${ts}</div></div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:11px;color:${offline?'#333':n.battery<20?'#EF4444':'#4ADE80'};">${n.battery}%</div>
        <div style="font-size:10px;color:#333;margin-top:1px;">${n.rssi} dBm</div>
      </div>
    </div>`;
  }).join('');
}

function focusNode(id) { console.log('Focus node:', id); }

/* ══════════════════════════════════════════════════════════════════
   PACKET LOG
══════════════════════════════════════════════════════════════════ */
function addPacket(pkt) { GM.packets.unshift(pkt); if (GM.packets.length > 20) GM.packets.pop(); renderPackets(); }

function renderPackets() {
  const c = $('packet-log'); if (!c) return;
  if (!GM.packets.length) { c.innerHTML = '<div class="mp-empty">Awaiting packets…</div>'; return; }
  c.innerHTML = GM.packets.slice(0,7).map(p => {
    const ts = p.timestamp ? new Date(p.timestamp*1000).toLocaleTimeString('en-GB',{hour12:false}) : '--';
    const ok = p.status === 'DELIVERED';
    return `<div style="padding:7px 10px;border-radius:6px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);">
      <div style="display:flex;justify-content:space-between;">
        <span style="font-family:'DM Mono',monospace;font-size:10px;color:#444;">${p.packet_id?.substring(0,14)||'—'}</span>
        <span style="font-size:9px;color:${ok?'#4ADE80':'#FFA500'};">${p.status}</span>
      </div>
      <div style="font-size:10px;color:#333;margin-top:2px;">${p.node_id} · ${p.hop_count||1} hop · ${ts}</div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════════════
   ALERTS
══════════════════════════════════════════════════════════════════ */
function handleAlert(data) {
  GM.alerts.unshift(data); renderAlerts();
  beep(); flashAlert();
  // Auto-switch to monitoring page
  if (GM.currentPage !== 4) switchPage(4);
}

function renderAlerts() {
  const c = $('alert-list'); if (!c) return;
  if (!GM.alerts.length) { c.innerHTML = '<div class="mp-empty">No active alerts</div>'; return; }
  c.innerHTML = GM.alerts.map(a => `
    <div style="padding:12px;border-radius:8px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);margin-bottom:8px;">
      <div style="font-size:11px;font-weight:600;color:#EF4444;margin-bottom:4px;">${a.message_type}</div>
      <div style="font-size:10px;color:#555;">${a.node_id} · ${new Date(a.timestamp*1000).toLocaleTimeString()}</div>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button onclick="ackAlert(${a.id})" style="font-size:10px;padding:4px 10px;border-radius:4px;border:1px solid rgba(239,68,68,0.4);background:transparent;color:#EF4444;cursor:pointer;">ACK</button>
        <button onclick="resolveAlert(${a.id})" style="font-size:10px;padding:4px 10px;border-radius:4px;border:none;background:#4ADE80;color:#000;cursor:pointer;font-weight:600;">Resolve</button>
      </div>
    </div>`).join('');
}

function flashAlert() {
  document.body.style.borderLeft = '3px solid #EF4444';
  setTimeout(() => document.body.style.borderLeft = '', 1200);
}

async function ackAlert(id)     { await fetch(`/alerts/${id}/ack`,     {method:'POST'}); GM.alerts = GM.alerts.filter(a=>a.id!==id); renderAlerts(); }
async function resolveAlert(id) { await fetch(`/alerts/${id}/resolve`, {method:'POST'}); GM.alerts = GM.alerts.filter(a=>a.id!==id); renderAlerts(); }

function beep() {
  try {
    const ac = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.connect(g); g.connect(ac.destination);
    osc.frequency.setValueAtTime(520, ac.currentTime);
    osc.frequency.setValueAtTime(880, ac.currentTime + 0.18);
    g.gain.setValueAtTime(0.15, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5);
    osc.start(); osc.stop(ac.currentTime + 0.5);
  } catch {}
}

/* ══════════════════════════════════════════════════════════════════
   SIMULATION CONTROLS
══════════════════════════════════════════════════════════════════ */
async function triggerFireSim() { await fetch('/simulation/fire', {method:'POST'}); }
async function toggleNetworkLink() {
  const r = await fetch('/simulation/network-toggle', {method:'POST'});
  const j = await r.json();
  updateNetBtn(j.data?.online ?? true);
}
function updateNetBtn(online) {
  const b = $('btn-net-toggle'); if (!b) return;
  b.textContent = online ? '⚡ Toggle Station (Online)' : '⚡ Toggle Station (Offline)';
  b.style.color  = online ? '#4ADE80' : '#EF4444';
}

async function runDemo() {
  const btn = $('btn-demo');
  if (btn) { btn.classList.add('running'); btn.querySelector('span:last-child').textContent = 'Running…'; }
  try {
    await fetch('/demo/run', {method:'POST'});
    switchPage(4); // show monitoring page during demo
    setTimeout(() => switchPage(5), 8000); // then show AI result
  } catch {}
  setTimeout(() => {
    if (btn) { btn.classList.remove('running'); btn.querySelector('span:last-child').textContent = 'Run Demo'; }
  }, 12000);
}

/* ══════════════════════════════════════════════════════════════════
   CHARTS
══════════════════════════════════════════════════════════════════ */
const CHART_DEFAULTS = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: {display: false},
    tooltip: {
      backgroundColor: 'rgba(8,8,8,0.95)', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1,
      titleColor: '#666', bodyColor: '#E8E2DA', padding: 10, cornerRadius: 8,
    },
  },
  scales: {
    x: { grid: {color:'rgba(255,255,255,0.03)'}, ticks: {color:'#333', font:{size:9,family:"'DM Mono',monospace"}, maxTicksLimit:5} },
    y: { grid: {color:'rgba(255,255,255,0.03)'}, ticks: {color:'#333', font:{size:9,family:"'DM Mono',monospace"}, maxTicksLimit:4} },
  },
  animation: {duration: 500, easing: 'easeInOutQuart'},
  elements: {point: {radius:1.5, hoverRadius:4}},
};

function makeLabels(n, stepMin=30) {
  return Array.from({length:n}, (_,i) => {
    const d = new Date(Date.now() - (n-1-i)*stepMin*60*1000);
    return d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false});
  });
}

function histSeries(field, n=24) {
  if (GM.historyData.length > 0) {
    const step = Math.max(1, Math.floor(GM.historyData.length/n));
    return GM.historyData.filter((_,i)=>i%step===0).slice(-n).map(d=>d[field]||0);
  }
  const def = {temperature:29,humidity:62,pressure:1011,aqi:52,rainfall:0.4,wind_speed:13};
  const base = def[field]||20, v = base*0.18;
  return Array.from({length:n}, (_,i)=> parseFloat((base + Math.sin(i/4)*v*0.6 + (Math.random()-0.5)*v).toFixed(1)));
}

function pushChart(chart, val) {
  if (!chart) return;
  chart.data.datasets[0].data.push(val);
  chart.data.datasets[0].data.shift();
  chart.data.labels.push(new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}));
  chart.data.labels.shift();
  chart.update('none');
}

function pushLiveToCharts(d) {
  if (d.temperature) pushChart(GM.charts.temp, d.temperature);
  if (d.humidity)    pushChart(GM.charts.hum,  d.humidity);
  if (d.rainfall)    pushChart(GM.charts.rain, d.rainfall);
  if (d.pressure)    pushChart(GM.charts.pres, d.pressure);
}

function makeGrad(ctx, color) {
  const g = ctx.chart.ctx.createLinearGradient(0,0,0,ctx.chart.height);
  g.addColorStop(0, color+'66'); g.addColorStop(1, color+'00'); return g;
}

function initSensorCharts() {
  if (GM.chartsInited) return;
  GM.chartsInited = true;
  const n = 24, labels = makeLabels(n);

  GM.charts.temp = new Chart($('chart-temp'), {type:'line', data:{labels, datasets:[{data:histSeries('temperature',n), borderColor:'#C8728A', backgroundColor:ctx=>makeGrad(ctx,'#C8728A'), fill:true, tension:0.5, borderWidth:2}]}, options:{...CHART_DEFAULTS}});
  GM.charts.hum  = new Chart($('chart-hum'),  {type:'bar',  data:{labels:makeLabels(12), datasets:[{data:histSeries('humidity',12), backgroundColor:'rgba(72,136,200,0.25)', borderColor:'#4888C8', borderWidth:1, borderRadius:3}]}, options:{...CHART_DEFAULTS}});
  GM.charts.rain = new Chart($('chart-rain'), {type:'line', data:{labels, datasets:[{data:histSeries('rainfall',n), borderColor:'#5B8DEF', backgroundColor:'rgba(91,141,239,0.12)', fill:true, tension:0.6, borderWidth:1.5, pointRadius:0}]}, options:{...CHART_DEFAULTS}});
  GM.charts.pres = new Chart($('chart-pres'), {type:'line', data:{labels, datasets:[{data:histSeries('pressure',n), borderColor:'#9B72C8', backgroundColor:'rgba(155,114,200,0.08)', fill:true, tension:0.4, borderWidth:1.5, pointRadius:0}]}, options:{...CHART_DEFAULTS}});
  GM.charts.donut = new Chart($('chart-donut'), {
    type:'doughnut',
    data: {
      labels: ['Temp','Humidity','AQI','Pressure','Wind'],
      datasets: [{data:[26,22,18,20,14], backgroundColor:['#8B1A2E','#1A4A8B','#2E8B1A','#4A1A8B','#8B6E1A'], borderWidth:0, spacing:2}],
    },
    options: {...CHART_DEFAULTS, scales:{}, cutout:'65%', plugins:{...CHART_DEFAULTS.plugins, legend:{display:true, position:'bottom', labels:{color:'#444', font:{size:9}, boxWidth:8, padding:8}}}},
  });
}

/* ══════════════════════════════════════════════════════════════════
   HISTORY PAGE
══════════════════════════════════════════════════════════════════ */
async function loadHistoryPage() {
  await loadHistory('24h');
  updateHistStats();
}

async function loadHistory(range) {
  try {
    const r = await fetch(`/history?range=${range}`); const j = await r.json();
    if (!j.success) return;
    const data = j.data||[];
    renderHistTable(data);
    buildHistCharts(data);
    setText('hist-count', `${data.length.toLocaleString()} records`);
    setText('hs-db', data.length.toLocaleString());
  } catch {}
}

function renderHistTable(data) {
  const b = $('hist-body'); if (!b) return;
  if (!data.length) { b.innerHTML = '<div style="padding:16px;text-align:center;font-size:11px;color:#333;">No records</div>'; return; }
  b.innerHTML = data.slice(-40).reverse().map(r => {
    const ts = r.timestamp ? new Date(r.timestamp*1000).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
    return `<div class="data-row">
      <span>${ts}</span><span style="color:#C8728A;">${r.node_id}</span>
      <span>${r.temperature?.toFixed(1)||'—'}°</span><span>${r.humidity?.toFixed(0)||'—'}%</span>
      <span>${r.aqi?.toFixed(0)||'—'}</span><span>${r.wind_speed?.toFixed(1)||'—'}</span>
    </div>`;
  }).join('');
}

function buildHistCharts(data) {
  const n = Math.min(data.length, 24);
  const step = Math.max(1, Math.floor(data.length/n));
  const sl = data.filter((_,i)=>i%step===0).slice(-n);
  const labels = sl.map(d => new Date(d.timestamp*1000).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}));
  const opts = {...CHART_DEFAULTS, elements:{...CHART_DEFAULTS.elements, point:{radius:0}}};

  const mk = (id, field, color, type='line') => {
    const el = $(id); if (!el) return;
    if (el._ci) el._ci.destroy();
    el._ci = new Chart(el, {
      type, data:{labels, datasets:[{data:sl.map(d=>d[field]||0), borderColor:color, backgroundColor:color+'18', borderWidth:1.5, fill:type==='line', tension:0.4}]},
      options: opts,
    });
  };
  mk('hist-temp', 'temperature', '#C8728A');
  mk('hist-aqi',  'aqi',        '#8B8B1A');
  mk('hist-rain', 'rainfall',   '#5B8DEF');
}

async function updateHistStats() {
  try {
    const r = await fetch('/nodes'); const j = await r.json();
    if (j.success) { const a = j.data.filter(n=>n.battery>0); setText('hs-nodes', `${a.length}/${j.data.length}`); }
  } catch {}
  setText('hs-ai', GM.aiReports.length);
}

/* ══════════════════════════════════════════════════════════════════
   EXPORT
══════════════════════════════════════════════════════════════════ */
async function exportCSV() {
  try {
    const r = await fetch('/history/json'); const j = await r.json();
    const rows = j.data||[];
    if (!rows.length) { alert('No data to export.'); return; }
    let csv = 'Timestamp,Node,Temperature,Humidity,Pressure,AQI,Rainfall,Wind,Battery,RSSI\n';
    rows.forEach(r => { csv += [new Date(r.timestamp*1000).toISOString(),r.node_id,r.temperature,r.humidity,r.pressure,r.aqi,r.rainfall,r.wind_speed,r.battery,r.rssi].join(',') + '\n'; });
    dlBlob(csv, 'text/csv', `gm_${Date.now()}.csv`);
  } catch {}
}
async function exportJSON() {
  try {
    const r = await fetch('/history/json'); const j = await r.json();
    dlBlob(JSON.stringify(j.data||[],null,2), 'application/json', `gm_${Date.now()}.json`);
  } catch {}
}
function dlBlob(content, type, name) {
  const url = URL.createObjectURL(new Blob([content],{type}));
  const a = Object.assign(document.createElement('a'),{href:url,download:name});
  a.click(); URL.revokeObjectURL(url);
}

/* ══════════════════════════════════════════════════════════════════
   AI SCENARIO
══════════════════════════════════════════════════════════════════ */
function setScenario(btn) {
  const MAP = {
    '🔥 Forest Fire':    'Wildfire detected — Node A reports temperature 54°C, AQI 285, humidity 18%, NE wind 34 km/h. Smoke visible from ridge.',
    '⛈️ Relay Failure':  'Critical relay node NODE_B went offline 15 minutes ago. Downstream nodes accumulating packets. Battery was at 8% on last telemetry.',
    '☁️ Gas Anomaly':    'MQ-135 sensor at NODE_C showing AQI 190 during 3 AM — 4 AM window. Nighttime thermal inversion suspected. Temperature normal.',
    '🌪️ Pressure Drop':  'Atmospheric pressure has dropped 9 hPa over 25 minutes across all nodes simultaneously. Wind increasing. Storm system approaching.',
    '🔋 Node Offline':   'NODE_D has not transmitted in 3 hours. Last known battery: 12%. RSSI was degrading over previous 6 readings. Relay chain broken.',
    '⚠️ Multi-Node Alert': 'Nodes A, B, and C all reporting simultaneous AQI spike above 160 and temperature above 38°C. Wind patterns suggest a common upwind source.',
  };
  $$('.ai-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  const input = $('ai-input');
  if (input) { input.value = MAP[btn.textContent] || btn.textContent; updateCharCount(); }
}

function updateCharCount() {
  const input = $('ai-input'); const el = $('ai-char-count');
  if (input && el) el.textContent = `${input.value.length} chars`;
}

function clearAI() {
  const input = $('ai-input');
  if (input) { input.value = ''; updateCharCount(); }
  $$('.ai-chip').forEach(c => c.classList.remove('active'));
  const out = $('ai-output'); if (out) out.style.display = 'none';
}

async function runAI() {
  const input = $('ai-input');
  const scenario = input?.value?.trim();
  if (!scenario) { input?.focus(); return; }

  const out = $('ai-output'), thinking = $('ai-thinking'), report = $('ai-report');
  out.style.display = 'block';
  thinking.style.display = 'block';
  report.style.display = 'none';

  const srcEl = $('ai-thinking-src');
  if (srcEl) srcEl.textContent = GM.caps.ai_gemini ? 'Contacting Gemini AI…' : GM.caps.ai_claude ? 'Contacting Claude AI…' : 'Generating analysis…';

  const btn = $('btn-ai-analyze');
  if (btn) { btn.disabled = true; btn.textContent = 'Analyzing…'; }

  try {
    const r = await fetch('/ai/analyze', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({scenario}),
    });
    const j = await r.json();

    thinking.style.display = 'none';
    report.style.display = 'block';

    if (j.success && j.data) {
      const d = j.data;
      const SEV_COLOR = {Critical:'#EF4444', High:'#FF6B35', Moderate:'#FFA500', Low:'#4ADE80'};

      const sevEl = $('ai-severity');
      if (sevEl) { sevEl.textContent = d.severity||'—'; sevEl.style.color = SEV_COLOR[d.severity]||'#F0EBE3'; }
      setText('ai-confidence', d.confidence||'—');
      setText('ai-response', d.response_type||'—');
      const srcBadge = $('ai-source');
      if (srcBadge) {
        const src = d.data_source||'unknown';
        srcBadge.textContent = src === 'gemini' ? 'Gemini' : src === 'claude' ? 'Claude' : 'Fallback';
        srcBadge.style.color = src === 'mock_fallback' ? '#555' : '#C8728A';
      }
      setText('ai-title', d.incident_title||'—');
      setHTML('ai-cause', d.probable_cause||'—');
      setHTML('ai-action', d.recommended_action||'—');

      GM.aiReports.unshift({...d, scenario, timestamp: Date.now()});
      renderSavedReports();
      updateHistStats();
    }
  } catch (err) {
    thinking.style.display = 'none';
    report.style.display = 'block';
    setText('ai-title', 'Analysis Failed');
    setHTML('ai-cause', `Error: ${err.message}. Check that the server is running.`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Analyze →'; }
  }
}

function handleAIReport(data) {
  if (GM.currentPage !== 5) return;
  // If report comes in via WS (from demo mode), show it
  GM.aiReports.unshift({...data, timestamp: data.timestamp * 1000});
  renderSavedReports();
}

function saveReport() {
  const btn = document.querySelector('[onclick="saveReport()"]');
  if (btn) { btn.textContent = '✓ Saved'; setTimeout(()=>btn.textContent='Save Report', 1500); }
}

function renderSavedReports() {
  const c = $('saved-reports'); if (!c) return;
  if (!GM.aiReports.length) { c.innerHTML = '<div class="mp-empty" style="padding:20px;border:1px solid rgba(255,255,255,0.04);border-radius:10px;">No saved reports yet.</div>'; return; }
  const SEV = {Critical:'#EF4444',High:'#FF6B35',Moderate:'#FFA500',Low:'#4ADE80'};
  c.innerHTML = GM.aiReports.slice(0,5).map(r => `
    <div style="padding:14px 18px;border:1px solid rgba(255,255,255,0.05);border-radius:10px;background:rgba(255,255,255,0.02);display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div><div style="font-size:12px;font-weight:500;color:#E8E2DA;">${r.incident_title||'Report'}</div><div style="font-size:10px;color:#444;margin-top:3px;">${new Date(r.timestamp).toLocaleString()}</div></div>
      <div style="display:flex;gap:10px;align-items:center;flex-shrink:0;">
        <span style="font-size:10px;color:${SEV[r.severity]||'#888'};">${r.severity||'—'}</span>
        <span style="font-size:10px;color:#333;">${r.confidence||''}</span>
        <span style="font-size:10px;color:#444;">${r.data_source === 'mock_fallback' ? '◌' : '●'}</span>
      </div>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════════════════════
   HERO CANVAS — Mini mesh illustration
══════════════════════════════════════════════════════════════════ */
const HERO_NODES = [
  {x:0.12,y:0.18,r:10,c:'#4ADE80'},{x:0.38,y:0.10,r:10,c:'#4ADE80'},
  {x:0.72,y:0.20,r:9, c:'#FFA500'},{x:0.52,y:0.52,r:14,c:'#4ADE80',gw:true},
  {x:0.20,y:0.70,r:9, c:'#C8728A'},{x:0.80,y:0.72,r:9, c:'#4ADE80'},
  {x:0.88,y:0.40,r:8, c:'#444',   off:true},
];
const HERO_LINKS = [[0,1],[1,2],[2,3],[3,4],[3,5],[0,4],[5,3]];

function initHeroCanvas() {
  const canvas = $('hero-canvas'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  let t = 0;
  const pkts = [];

  setInterval(() => {
    const l = HERO_LINKS[Math.floor(Math.random()*HERO_LINKS.length)];
    pkts.push({a:l[0],b:l[1],t:0,color:Math.random()>0.6?'#8B1A2E':'#4ADE80'});
  }, 1600);

  function draw() {
    ctx.clearRect(0,0,W,H);
    t += 0.012;

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.02)'; ctx.lineWidth = 1;
    for (let x=0;x<W;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for (let y=0;y<H;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

    // Links
    HERO_LINKS.forEach(([ai,bi]) => {
      const a=HERO_NODES[ai],b=HERO_NODES[bi];
      ctx.beginPath(); ctx.moveTo(a.x*W,a.y*H); ctx.lineTo(b.x*W,b.y*H);
      ctx.strokeStyle = (a.off||b.off)?'rgba(255,255,255,0.02)':'rgba(255,255,255,0.07)';
      ctx.setLineDash((a.off||b.off)?[4,8]:[]); ctx.lineWidth=1; ctx.stroke(); ctx.setLineDash([]);
    });

    // Nodes
    HERO_NODES.forEach((n,i) => {
      const nx=n.x*W,ny=n.y*H,pulse=Math.sin(t+i)*0.3+0.7;
      if (!n.off) {
        ctx.beginPath(); ctx.arc(nx,ny,n.r+(n.gw?10:6)+Math.sin(t+i*0.7)*3,0,Math.PI*2);
        ctx.fillStyle=n.c+'18'; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(nx,ny,n.r,0,Math.PI*2);
      ctx.fillStyle=n.off?'#111':n.c+(n.off?'':Math.round(pulse*220).toString(16).padStart(2,'0'));
      ctx.fill(); ctx.strokeStyle=n.off?'#222':n.c; ctx.lineWidth=1.5; ctx.stroke();

      if (n.gw) { ctx.font='9px monospace'; ctx.fillStyle='#4ADE80'; ctx.textAlign='center'; ctx.fillText('GATEWAY',nx,ny+n.r+20); }
    });

    // Packets
    for (let i=pkts.length-1;i>=0;i--) {
      const p=pkts[i]; p.t+=0.02; if(p.t>=1){pkts.splice(i,1);continue;}
      const na=HERO_NODES[p.a],nb=HERO_NODES[p.b];
      const px=na.x*W+(nb.x-na.x)*W*p.t, py=na.y*H+(nb.y-na.y)*H*p.t;
      const alpha=Math.sin(p.t*Math.PI);
      ctx.beginPath(); ctx.arc(px,py,4.5,0,Math.PI*2);
      ctx.fillStyle=p.color+Math.round(alpha*230).toString(16).padStart(2,'0'); ctx.fill();
      ctx.beginPath(); ctx.arc(px,py,10,0,Math.PI*2);
      ctx.fillStyle=p.color+Math.round(alpha*50).toString(16).padStart(2,'0'); ctx.fill();
    }

    GM.heroAF = requestAnimationFrame(draw);
  }
  draw();
}

/* ══════════════════════════════════════════════════════════════════
   MESH CANVAS — Page 4
══════════════════════════════════════════════════════════════════ */
const MESH_NODES = [
  {id:'GROUND',  label:'Ground Station', color:'#4ADE80',x:0.50,y:0.50,r:18,gw:true},
  {id:'NODE_A',  label:'North Ridge',    color:'#4ADE80',x:0.22,y:0.20,r:11},
  {id:'NODE_B',  label:'Forest Edge',    color:'#FFA500',x:0.45,y:0.22,r:11},
  {id:'NODE_C',  label:'Canyon',         color:'#4ADE80',x:0.74,y:0.22,r:11},
  {id:'NODE_D',  label:'West Meadow',    color:'#333',   x:0.16,y:0.68,r:11, off:true},
  {id:'HH_01',   label:'Ranger Unit',    color:'#C8728A',x:0.34,y:0.74,r:10},
];
const MESH_LINKS = [['NODE_A','NODE_B'],['NODE_B','GROUND'],['NODE_C','GROUND'],['HH_01','NODE_A']];

let meshCanvas, meshCtx, meshW, meshH, meshActive=false;
const meshPkts = [];

function initMeshCanvas() {
  if (meshActive) return;
  meshCanvas = $('mesh-canvas'); if (!meshCanvas) return;
  meshCtx = meshCanvas.getContext('2d');
  const parent = meshCanvas.parentElement;
  meshCanvas.width = meshW = parent.clientWidth;
  meshCanvas.height = meshH = parent.clientHeight;
  meshActive = true;

  // Click to show node info
  meshCanvas.addEventListener('click', e => {
    const rect = meshCanvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (meshW / rect.width);
    const my = (e.clientY - rect.top)  * (meshH / rect.height);
    MESH_NODES.forEach(n => {
      const dx = n.x*meshW - mx, dy = n.y*meshH - my;
      if (Math.sqrt(dx*dx+dy*dy) < n.r+14) showNodeTip(n, e.clientX, e.clientY);
    });
  });

  setInterval(() => {
    const l = MESH_LINKS[Math.floor(Math.random()*MESH_LINKS.length)];
    meshPkts.push({from:l[0],to:l[1],t:0,c:l[0]==='HH_01'?'#C8728A':'#8B1A2E'});
  }, 1800);

  animateMesh();
}

function showNodeTip(node, cx, cy) {
  const tip = $('node-tooltip'); if (!tip) return;
  const liveNode = GM.nodes.find(n=>n.node_id===node.id);
  const bat = liveNode?.battery ?? '—'; const rssi = liveNode?.rssi ?? '—';
  tip.innerHTML = `<b style="color:${node.color};">${node.label}</b><br>${node.id}<br>Battery: ${bat}% · RSSI: ${rssi} dBm`;
  tip.style.display = 'block';
  tip.style.left = (cx - meshCanvas.getBoundingClientRect().left) + 'px';
  tip.style.top  = (cy - meshCanvas.getBoundingClientRect().top - 64) + 'px';
  clearTimeout(tip._t);
  tip._t = setTimeout(()=>tip.style.display='none', 3000);
}

function animateMesh() {
  if (!meshCtx) return;
  meshCtx.clearRect(0,0,meshW,meshH);
  GM.meshPulse += 0.016;

  // Grid
  meshCtx.strokeStyle='rgba(255,255,255,0.015)'; meshCtx.lineWidth=1;
  for(let x=0;x<meshW;x+=64){meshCtx.beginPath();meshCtx.moveTo(x,0);meshCtx.lineTo(x,meshH);meshCtx.stroke();}
  for(let y=0;y<meshH;y+=64){meshCtx.beginPath();meshCtx.moveTo(0,y);meshCtx.lineTo(meshW,y);meshCtx.stroke();}

  // Links
  MESH_LINKS.forEach(([ai,bi]) => {
    const a=MESH_NODES.find(n=>n.id===ai), b=MESH_NODES.find(n=>n.id===bi);
    if(!a||!b) return;
    meshCtx.beginPath(); meshCtx.moveTo(a.x*meshW,a.y*meshH); meshCtx.lineTo(b.x*meshW,b.y*meshH);
    meshCtx.strokeStyle=(a.off||b.off)?'rgba(255,255,255,0.03)':'rgba(255,255,255,0.07)';
    meshCtx.setLineDash((a.off||b.off)?[5,10]:[]); meshCtx.lineWidth=1.5; meshCtx.stroke(); meshCtx.setLineDash([]);
  });

  // Nodes
  MESH_NODES.forEach((n,i) => {
    const x=n.x*meshW, y=n.y*meshH, pulse=Math.sin(GM.meshPulse+i)*0.3+0.7;
    if (!n.off) {
      meshCtx.beginPath(); meshCtx.arc(x,y,n.r+(n.gw?14:8)+Math.sin(GM.meshPulse+i*0.8)*5,0,Math.PI*2);
      meshCtx.fillStyle=n.color+'14'; meshCtx.fill();
    }
    meshCtx.beginPath(); meshCtx.arc(x,y,n.r,0,Math.PI*2);
    meshCtx.fillStyle=n.off?'#181818':n.color+(n.off?'':Math.round(pulse*200).toString(16).padStart(2,'0'));
    meshCtx.fill(); meshCtx.strokeStyle=n.off?'#2a2a2a':n.color; meshCtx.lineWidth=2; meshCtx.stroke();

    meshCtx.font=`${n.gw?13:10}px 'Space Grotesk',sans-serif`;
    meshCtx.fillStyle=n.off?'#333':'#D8D2CA'; meshCtx.textAlign='center';
    meshCtx.fillText(n.label,x,y+n.r+18);
    if (n.gw) { meshCtx.font='9px monospace'; meshCtx.fillStyle='#4ADE80'; meshCtx.fillText('ONLINE',x,y+n.r+30); }
  });

  // Packets
  for (let i=meshPkts.length-1;i>=0;i--) {
    const p=meshPkts[i]; p.t+=0.016;
    if (p.t>=1){meshPkts.splice(i,1);continue;}
    const a=MESH_NODES.find(n=>n.id===p.from), b=MESH_NODES.find(n=>n.id===p.to);
    if (!a||!b) continue;
    const px=a.x*meshW+(b.x-a.x)*meshW*p.t, py=a.y*meshH+(b.y-a.y)*meshH*p.t;
    const alpha=Math.sin(p.t*Math.PI);
    meshCtx.beginPath(); meshCtx.arc(px,py,5,0,Math.PI*2);
    meshCtx.fillStyle=p.c+Math.round(alpha*240).toString(16).padStart(2,'0'); meshCtx.fill();
    meshCtx.beginPath(); meshCtx.arc(px,py,10,0,Math.PI*2);
    meshCtx.fillStyle=p.c+Math.round(alpha*60).toString(16).padStart(2,'0'); meshCtx.fill();
  }

  GM.meshAF = requestAnimationFrame(animateMesh);
}

/* ══════════════════════════════════════════════════════════════════
   STORY MODE
══════════════════════════════════════════════════════════════════ */
function startStory() {
  const o = $('story-overlay'); if (!o) return;
  o.classList.add('visible');
  showScene(0);
  initStoryCanvas();
}
function closeStory() { $('story-overlay')?.classList.remove('visible'); cancelAnimationFrame(GM.storyAF); }

function showScene(idx) {
  GM.storyIdx = Math.max(0,Math.min(idx, GM.storyTotal-1));
  $$('.story-scene').forEach((s,i)=>s.classList.toggle('active',i===GM.storyIdx));
  const prog = $('story-progress'); if (!prog) return;
  prog.innerHTML = Array.from({length:GM.storyTotal},(_,i)=>{
    const cls=i===GM.storyIdx?'active':i<GM.storyIdx?'done':'';
    return `<div class="sp-dot ${cls}"></div>`;
  }).join('');
  const prev=$('story-prev-btn'), next=$('story-next-btn');
  if (prev) prev.style.opacity = GM.storyIdx===0?'0.3':'1';
  if (next) next.textContent = GM.storyIdx===GM.storyTotal-1?'Close ✓':'Next →';
}
function storyNext() { if (GM.storyIdx>=GM.storyTotal-1){closeStory();return;} showScene(GM.storyIdx+1); }
function storyPrev() { showScene(GM.storyIdx-1); }

function initStoryCanvas() {
  const c = $('story-canvas'); if (!c) return;
  c.width = window.innerWidth; c.height = window.innerHeight;
  const ctx = c.getContext('2d');
  let t = 0;
  const stars = Array.from({length:80},()=>({x:Math.random()*c.width,y:Math.random()*c.height,r:Math.random()*1.2+0.2,a:Math.random()*0.4+0.1}));

  function draw() {
    ctx.clearRect(0,0,c.width,c.height);
    t += 0.005;
    const grad = ctx.createRadialGradient(c.width/2,c.height/2,0,c.width/2,c.height/2,c.height*0.8);
    grad.addColorStop(0,'rgba(20,6,10,0.3)'); grad.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=grad; ctx.fillRect(0,0,c.width,c.height);
    stars.forEach(s=>{ ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fillStyle=`rgba(255,255,255,${s.a*(0.7+Math.sin(t+s.x)*0.3)})`; ctx.fill(); });
    GM.storyAF = requestAnimationFrame(draw);
  }
  draw();
}

// Keyboard story navigation
document.addEventListener('keydown', e => {
  if (!$('story-overlay')?.classList.contains('visible')) return;
  if (e.key==='ArrowRight'||e.key===' '){e.preventDefault();storyNext();}
  if (e.key==='ArrowLeft'){e.preventDefault();storyPrev();}
  if (e.key==='Escape') closeStory();
});

/* ══════════════════════════════════════════════════════════════════
   GUIDED TOUR
══════════════════════════════════════════════════════════════════ */
function startTour() {
  localStorage.removeItem('gm-onb-done');
  GM.onbStep = 0;
  const o = $('onboarding-overlay'); if (!o) return;
  o.classList.remove('hidden');
  showOnbStep(0);
}

/* ══════════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  // Global init
  startClock();
  initBgCanvas();
  initTooltips();
  initCardTilt();
  initParallax();

  // Char counter on AI input
  const aiInput = $('ai-input');
  if (aiInput) aiInput.addEventListener('input', updateCharCount);

  // Onboarding (after 300ms to let page render)
  setTimeout(initOnboarding, 300);

  // Hero canvas
  initHeroCanvas();

  // Fetch all data
  await fetchInitial();

  // WebSocket
  connectWS();

  // Poll weather every 10 min
  setInterval(fetchWeather, 600000);
});
