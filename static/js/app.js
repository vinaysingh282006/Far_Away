/* ================================================================
   GUARDIAN MESH OS — App Engine v3.0
   7 pages · Boot · Sound · Canvas · Charts · Twin Sense · Demo
================================================================ */
'use strict';

// ── GLOBAL STATE ──────────────────────────────────────────────────
const GM = {
  page:1, ws:null, wsRetries:0,
  lastTelemetry:{}, nodeData:{}, packets:[], alerts:[], aiReports:[],
  history:[], events:[],
  weather:null, aqiData:null, firmsData:[],
  caps:{},
  chartsInited:{wd:false,twin:false,hist:false},
  histTabActive:'logs',
  termOpen:false, termUnread:0,
  pktCount:0, demoRunning:false,
  selectedSensorNode:'NODE_A',
  sparklines:{},
};

// ── HELPERS ───────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const $$ = s  => document.querySelectorAll(s);
const setText = (id,v) => { const e=$(id); if(e) e.textContent=v; };
const setHTML = (id,v) => { const e=$(id); if(e) e.innerHTML=v; };
const fmt = (v,d=1) => (v!=null && !isNaN(v)) ? (+v).toFixed(d) : '--';
const now = () => new Date().toLocaleTimeString('en-GB',{hour12:false});

// ── SOUND ENGINE ──────────────────────────────────────────────────
const AC = new (window.AudioContext||window.webkitAudioContext)();
function _tone(freq,type='sine',dur=0.3,gain=0.07){
  try{
    const o=AC.createOscillator(),g=AC.createGain();
    o.connect(g); g.connect(AC.destination);
    o.type=type; o.frequency.value=freq;
    g.gain.setValueAtTime(gain,AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+dur);
    o.start(); o.stop(AC.currentTime+dur);
  }catch{}
}
const SFX={
  boot:   ()=>{ _tone(220,'sine',.2,.06); setTimeout(()=>_tone(440,'sine',.3,.08),220); setTimeout(()=>_tone(880,'sine',.4,.06),500); },
  bootOk: ()=>{ _tone(523,'sine',.15,.08); setTimeout(()=>_tone(659,'sine',.15,.08),150); setTimeout(()=>_tone(784,'sine',.3,.1),300); },
  packet: ()=>_tone(1400,'sine',.04,.02),
  alert:  ()=>{ for(let i=0;i<3;i++) setTimeout(()=>{ _tone(880,'square',.15,.1); setTimeout(()=>_tone(660,'square',.15,.1),160); },i*400); },
  hover:  ()=>_tone(900,'sine',.03,.015),
  aiDone: ()=>{ _tone(523,'triangle',.18,.07); setTimeout(()=>_tone(659,'triangle',.18,.07),190); },
  nodeOn: ()=>_tone(440,'sine',.2,.06),
  success:()=>{ _tone(659,'sine',.14,.08); setTimeout(()=>_tone(784,'sine',.2,.1),170); },
  chime:  ()=>{ try{ _tone(523.25,'sine',.1,.04); setTimeout(()=>_tone(659.25,'sine',.12,.04),90); setTimeout(()=>_tone(783.99,'sine',.22,.05),180); }catch{} }
};

// ── TERMINAL ──────────────────────────────────────────────────────
function tlog(msg,type='',time=null){
  const log=$('term-log'); if(!log) return;
  const ts=time||now();
  const d=document.createElement('div'); d.className='term-line';
  d.innerHTML=`<span class="term-ts">[${ts}]</span><span class="term-msg ${type}">${msg}</span>`;
  log.appendChild(d); log.scrollTop=log.scrollHeight;
  setText('term-ts',ts);
  if(!GM.termOpen){ GM.termUnread++; const b=$('term-unread'); if(b){b.style.display='block';b.textContent=GM.termUnread;} }
}
function toggleTerminal(){
  GM.termOpen=!GM.termOpen;
  $('terminal-panel').classList.toggle('open',GM.termOpen);
  if(GM.termOpen){ GM.termUnread=0; const b=$('term-unread'); if(b) b.style.display='none'; }
}

// ════════════════════════════════════════════════════════════════
// BOOT SEQUENCE
// ════════════════════════════════════════════════════════════════
const BOOT_IDS=['bi-nodes','bi-sensors','bi-net','bi-ai','bi-db','bi-sat'];
async function runBootSequence(){
  SFX.boot();
  await sleep(400);
  for(let i=0;i<BOOT_IDS.length;i++){
    const el=$(BOOT_IDS[i]); if(!el) continue;
    el.classList.add('active');
    await sleep(500);
    el.classList.remove('active'); el.classList.add('done');
    $('boot-bar').style.width=((i+1)/BOOT_IDS.length*100)+'%';
    SFX.nodeOn();
  }
  await sleep(600); SFX.bootOk();
  setText('boot-title','ALL SYSTEMS OPERATIONAL');
  await sleep(900);
  $('boot-overlay').classList.add('fade-out');
  await sleep(800);
  $('boot-overlay').style.display='none';
  showBrief();
}

const BRIEF_TEXT=`Imagine a dense forest where communication has <em>completely failed.</em>\n\nSix ESP32 nodes have been deployed across the terrain.\n\nYour mission: <em>detect danger before it reaches human settlements.</em>`;

async function showBrief(){
  $('brief-overlay').classList.add('visible');
  const el=$('brief-text'); el.innerHTML='';
  for(const line of BRIEF_TEXT.split('\n')){
    const p=document.createElement('p'); p.style.marginBottom='10px'; el.appendChild(p);
    if(!line.trim()){continue;}
    p.innerHTML=line; p.style.opacity='0';
    await sleep(100);
    p.style.transition='opacity .5s ease'; p.style.opacity='1';
    await sleep(300);
  }
}

function enterDashboard(){
  $('brief-overlay').classList.remove('visible');
  setTimeout(()=>{ $('app').classList.add('visible'); initApp(); },600);
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

// ════════════════════════════════════════════════════════════════
// APP INIT
// ════════════════════════════════════════════════════════════════
async function initApp(){
  tlog('Guardian Mesh OS v3 started','ok');
  startAmbientCanvas();
  startHeroCanvas();
  connectWS();
  fetchAll();
  setInterval(()=>{ const e=$('term-ts'); if(e) e.textContent=now(); },1000);
}

// ── PAGE NAVIGATION ───────────────────────────────────────────────
function switchPage(n){
  GM.page=n;
  $$('.page').forEach(p=>p.classList.remove('active'));
  $$('.nav-tab').forEach((t,i)=>t.classList.toggle('active',i+1===n));
  const p=$(`page-${n}`); if(p) p.classList.add('active');
  if(n===2) initWebData();
  if(n===3) refreshSensorPage();
  if(n===4) initTwinSense();
  if(n===5) {
    loadHistoryPage();
    const ac=$('hist-alerts-card');
    if(ac) ac.classList.remove('highlight-alert');
  }
  SFX.hover();
}

// ════════════════════════════════════════════════════════════════
// AMBIENT CANVAS
// ════════════════════════════════════════════════════════════════
function startAmbientCanvas(){
  const c=$('ambient-canvas'); if(!c) return;
  const ctx=c.getContext('2d');
  let W,H;
  const resize=()=>{ W=c.width=window.innerWidth; H=c.height=window.innerHeight; };
  resize(); window.addEventListener('resize',resize);
  const pts=Array.from({length:55},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.1+.3,vx:(Math.random()-.5)*.15,vy:(Math.random()-.5)*.1,a:Math.random()*.2+.03}));
  (function draw(){
    ctx.clearRect(0,0,W,H);
    const g=ctx.createRadialGradient(W*.15,H*.1,0,W*.15,H*.1,W*.55);
    g.addColorStop(0,'rgba(139,26,46,.04)'); g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    pts.forEach(p=>{
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(180,160,140,${p.a})`; ctx.fill();
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<-5)p.x=W+5; if(p.x>W+5)p.x=-5;
      if(p.y<-5)p.y=H+5; if(p.y>H+5)p.y=-5;
    });
    requestAnimationFrame(draw);
  })();
}

// ════════════════════════════════════════════════════════════════
// HERO CANVAS
// ════════════════════════════════════════════════════════════════
const HN=[
  {id:'GROUND',x:.50,y:.58,r:18,color:'#1DB87A',isGW:true},
  {id:'NODE_A',x:.25,y:.22,r:12,color:'#4888C8'},
  {id:'NODE_B',x:.52,y:.40,r:11,color:'#4888C8'},
  {id:'NODE_C',x:.78,y:.24,r:11,color:'#1DB87A'},
  {id:'NODE_D',x:.14,y:.62,r:10,color:'#44445a',offline:true},
  {id:'HH_01', x:.88,y:.62,r:10,color:'#C98A2C'},
];
const HL=[[0,1],[0,2],[0,3],[1,2],[2,5],[3,2]];

function startHeroCanvas(){
  const canvas=$('hero-canvas'); if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const pkts=[];
  let t=0;
  const resize=()=>{ canvas.width=canvas.offsetWidth; canvas.height=canvas.offsetHeight; };
  resize(); new ResizeObserver(resize).observe(canvas);

  setInterval(()=>{
    const link=HL[Math.floor(Math.random()*HL.length)];
    const rev=Math.random()>.5;
    pkts.push({a:rev?link[1]:link[0],b:rev?link[0]:link[1],p:0,color:Math.random()>.7?'#EF4444':'#1DB87A'});
    SFX.packet();
    GM.pktCount++;
  },1800);

  (function draw(){
    const W=canvas.width,H=canvas.height; t+=.008;
    ctx.clearRect(0,0,W,H);
    // Grid
    ctx.strokeStyle='rgba(255,255,255,.02)'; ctx.lineWidth=1;
    for(let x=0;x<W;x+=42){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=42){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    const nx=n=>n.x*W, ny=n=>n.y*H;
    // Links
    HL.forEach(([ai,bi])=>{
      const na=HN[ai],nb=HN[bi]; if(na.offline||nb.offline) return;
      const g=ctx.createLinearGradient(nx(na),ny(na),nx(nb),ny(nb));
      g.addColorStop(0,'rgba(29,184,122,.22)'); g.addColorStop(1,'rgba(29,184,122,.04)');
      ctx.beginPath();ctx.moveTo(nx(na),ny(na));ctx.lineTo(nx(nb),ny(nb));
      ctx.strokeStyle=g;ctx.lineWidth=1.5;ctx.stroke();
    });
    // Packets
    for(let i=pkts.length-1;i>=0;i--){
      const pk=pkts[i]; pk.p+=.022;
      if(pk.p>=1){pkts.splice(i,1);continue;}
      const na=HN[pk.a],nb=HN[pk.b];
      const px=nx(na)+(nx(nb)-nx(na))*pk.p, py=ny(na)+(ny(nb)-ny(na))*pk.p;
      ctx.beginPath();ctx.arc(px,py,4,0,Math.PI*2);
      ctx.fillStyle=pk.color;ctx.shadowColor=pk.color;ctx.shadowBlur=10;ctx.fill();ctx.shadowBlur=0;
      for(let tr=1;tr<=3;tr++){
        const tp=Math.max(0,pk.p-tr*.014);
        const tx=nx(na)+(nx(nb)-nx(na))*tp,ty=ny(na)+(ny(nb)-ny(na))*tp;
        ctx.beginPath();ctx.arc(tx,ty,4-tr*.8,0,Math.PI*2);
        ctx.fillStyle=`rgba(29,184,122,${.25/tr})`;ctx.fill();
      }
    }
    // Nodes
    HN.forEach(n=>{
      const x=nx(n),y=ny(n),pulse=n.isGW?Math.sin(t*2)*2.5:0,r=n.r+pulse;
      if(!n.offline){
        const h=ctx.createRadialGradient(x,y,r,x,y,r*3.5);
        h.addColorStop(0,n.color+'28');h.addColorStop(1,n.color+'00');
        ctx.beginPath();ctx.arc(x,y,r*3.5,0,Math.PI*2);ctx.fillStyle=h;ctx.fill();
      }
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);
      const bg=ctx.createRadialGradient(x-r*.3,y-r*.35,0,x,y,r);
      bg.addColorStop(0,n.offline?'#222232':n.color+'dd');bg.addColorStop(1,n.offline?'#13131e':n.color+'66');
      ctx.fillStyle=bg;ctx.shadowColor=n.offline?'transparent':n.color;ctx.shadowBlur=n.isGW?22:12;ctx.fill();ctx.shadowBlur=0;
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.strokeStyle='rgba(255,255,255,.2)';ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle=n.offline?'#444':'rgba(235,230,221,.88)';ctx.font=`600 10px 'JetBrains Mono'`;ctx.textAlign='center';
      ctx.fillText(n.id,x,y+r+13);
    });
    requestAnimationFrame(draw);
  })();
}

// ════════════════════════════════════════════════════════════════
// WEBSOCKET
// ════════════════════════════════════════════════════════════════
function connectWS(){
  const proto=location.protocol==='https:'?'wss':'ws';
  GM.ws=new WebSocket(`${proto}://${location.host}/ws`);
  GM.ws.onopen=()=>{
    GM.wsRetries=0;
    const d=$('ws-dot');if(d)d.className='ws-dot live';
    setText('ws-label','LIVE'); tlog('WebSocket connected','ok'); SFX.nodeOn();
  };
  GM.ws.onmessage=({data})=>{ try{handleWS(JSON.parse(data));}catch{} };
  GM.ws.onclose=()=>{
    const d=$('ws-dot');if(d)d.className='ws-dot err';
    setText('ws-label','OFFLINE'); tlog('WS disconnected — retrying…','err');
    if(GM.wsRetries++<15) setTimeout(connectWS,Math.min(10000,GM.wsRetries*800));
  };
}

function handleWS(msg){
  switch(msg.type){
    case 'sensor_update': handleSensorUpdate(msg.data); break;
    case 'panic':         handlePanic(msg.data); break;
    case 'packet_update': handlePacket(msg.packet); break;
    case 'ai_report':     handleAIReport(msg.data); break;
    case 'handheld_message': handleHandheldMessage(msg.data); break;
  }
}

function handleSensorUpdate(d){
  GM.lastTelemetry=d;
  if(!GM.nodeData[d.node_id]) GM.nodeData[d.node_id]={history:{}};
  const nd=GM.nodeData[d.node_id];
  ['temperature','humidity','pressure','aqi','rainfall','wind_speed','battery','rssi'].forEach(k=>{
    if(!nd.history[k]) nd.history[k]=[];
    nd.history[k].push(d[k]??null);
    if(nd.history[k].length>20) nd.history[k].shift();
  });
  // Home
  if(d.temperature!=null) setText('h-temp',fmt(d.temperature));
  if(d.aqi!=null) setText('h-aqi',Math.round(d.aqi));
  if(d.humidity!=null) setText('h-hum',fmt(d.humidity,0));
  // Twin Sense left column
  setText('ts-temp-l',fmt(d.temperature));
  setText('ts-hum-l',fmt(d.humidity,0));
  setText('ts-pres-l',fmt(d.pressure,1));
  setText('ts-aqi-l',Math.round(d.aqi||0));
  setText('ts-wind-l',fmt(d.wind_speed));
  setText('ts-rain-l',fmt(d.rainfall,1));
  // Sensor page (if current node)
  if(d.node_id===GM.selectedSensorNode) refreshSensorDisplay(d);
  if(d.temperature>40||d.aqi>150) tlog(`⚠ ANOMALY: ${d.node_id} T=${fmt(d.temperature)}°C AQI=${Math.round(d.aqi||0)}`,'warn');
  else tlog(`Telemetry: ${d.node_id} T=${fmt(d.temperature)}°C H=${fmt(d.humidity,0)}%`,'ok');
  SFX.packet();
  updateTwinDelta();
}

function handlePanic(data){
  GM.alerts.unshift(data);
  setText('panic-msg',data.message_type);
  const b=$('panic-banner');if(b){b.classList.add('visible');setTimeout(()=>b.classList.remove('visible'),8000);}
  $('alert-overlay').classList.add('active');
  setTimeout(()=>$('alert-overlay').classList.remove('active'),2000);
  SFX.alert(); tlog(`🔥 PANIC: ${data.message_type} · ${data.node_id}`,'err');
}
function ackPanic(){ const b=$('panic-banner');if(b)b.classList.remove('visible'); }

function handlePacket(pkt){
  GM.packets.unshift(pkt);
  if(GM.packets.length>30) GM.packets.pop();
  GM.pktCount++;
  tlog(`PKT: ${pkt.node_id||'—'} → ${pkt.relay_path||'GROUND'} [${pkt.status}]`,pkt.status==='DELIVERED'?'ok':'warn');
}

function handleAIReport(d){
  GM.aiReports.unshift({...d,timestamp:d.timestamp||Math.floor(Date.now()/1000)});
  setText('h-reports',GM.aiReports.length); setText('hs-ai',GM.aiReports.length);
  tlog(`AI report: ${d.incident_title}`,'ok');
}

// ── HANDHELD HANDLERS ──────────────────────────────────────────────
const EVENT_ICONS = {
  'message selected': '👉',
  'message sent': '📤',
  'emergency alert': '🚨',
  'status update': '📊',
  'wifi connected': '📶',
  'wifi disconnected': '📴',
  'backend connected': '🔗',
  'backend error': '❌',
  'handheld online': '🟢',
  'handheld offline': '🔴',
  'system check': '🔧',
  'battery low': '🔋',
  'all clear': '✅',
  'fire': '🔥'
};

function getEventIcon(msg) {
  const lower = (msg || '').toLowerCase().trim();
  for (const [key, icon] of Object.entries(EVENT_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return '📱';
}

const UniversalOverlayManager = {
  queue: [],
  activeToasts: 0,
  maxVisibleToasts: 4,

  show(d) {
    this.queue.push(d);
    this.processQueue();
  },

  processQueue() {
    if (this.queue.length === 0 || this.activeToasts >= this.maxVisibleToasts) return;
    
    const d = this.queue.shift();
    this.activeToasts++;
    
    if (d.priority === 'NORMAL' || d.priority === 'HIGH') {
      this.renderToast(d);
    } else if (d.priority === 'CRITICAL' || d.priority === 'EMERGENCY') {
      this.renderCriticalOverlay(d);
    }
  },

  renderToast(d) {
    const container = $('universal-overlay-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `universal-toast priority-${d.priority.toLowerCase()}`;
    
    const formattedTime = d.timestamp ? new Date(d.timestamp * 1000).toLocaleTimeString('en-GB', {hour12:false}) : now();
    const icon = getEventIcon(d.message);
    
    toast.innerHTML = `
      <div class="toast-top-row">
        <span class="toast-device">${icon} [${d.device_id}]</span>
        <span class="toast-priority-badge ${d.priority.toLowerCase()}">${d.priority}</span>
      </div>
      <div class="toast-message-text">${d.message}</div>
      <div class="toast-details">
        <span>RSSI: ${d.wifi_rssi || -50} dBm</span>
        <span>${formattedTime}</span>
      </div>
    `;

    container.appendChild(toast);
    
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    const dismissMs = d.priority === 'HIGH' ? 8000 : 4000;
    setTimeout(() => {
      toast.classList.remove('visible');
      toast.addEventListener('transitionend', () => {
        toast.remove();
        this.activeToasts--;
        this.processQueue();
      });
    }, dismissMs);
  },

  renderCriticalOverlay(d) {
    const overlay = $('global-emergency-overlay');
    if (!overlay) {
      this.activeToasts--;
      this.processQueue();
      return;
    }

    setText('em-device', `DEVICE: ${d.device_id}`);
    setText('em-msg', d.message);
    
    const formattedTime = d.timestamp ? new Date(d.timestamp * 1000).toLocaleTimeString('en-GB', {hour12:false}) : now();
    const icon = getEventIcon(d.message);
    setText('em-meta', `PRIORITY: ${d.priority} · RSSI: ${d.wifi_rssi || -50} dBm · TIME: ${formattedTime}`);
    
    const iconEl = overlay.querySelector('.emergency-alert-icon');
    if (iconEl) iconEl.textContent = icon === '📱' ? '⚠️' : icon;
    
    overlay.classList.add('active');
    
    const alertOverlay = $('alert-overlay');
    if (alertOverlay) {
      alertOverlay.classList.add('active');
    }
    
    SFX.alert();
    
    const ac = $('hist-alerts-card');
    if (ac) ac.classList.add('highlight-alert');

    window.currentCriticalOverlay = this;
    
    if (window.emergencyTimeout) clearTimeout(window.emergencyTimeout);
    
    window.emergencyTimeout = setTimeout(() => {
      window.ackEmergencyOverlay();
    }, 30000);
  }
};

function ackEmergencyOverlay() {
  const overlay = $('global-emergency-overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
  const alertOverlay = $('alert-overlay');
  if (alertOverlay) {
    alertOverlay.classList.remove('active');
  }
  if (window.emergencyTimeout) {
    clearTimeout(window.emergencyTimeout);
    window.emergencyTimeout = null;
  }
  if (window.currentCriticalOverlay) {
    window.currentCriticalOverlay.activeToasts--;
    window.currentCriticalOverlay.processQueue();
    window.currentCriticalOverlay = null;
  }
}

// Bind to window so global HTML onclick can call it
window.ackEmergencyOverlay = ackEmergencyOverlay;

function handleHandheldMessage(d) {
  if (!d.priority) d.priority = 'NORMAL';
  d.priority = d.priority.toUpperCase();

  // 1. Show overlay
  UniversalOverlayManager.show(d);

  // 2. Sound cues
  if (d.priority === 'HIGH') {
    SFX.chime();
    const ac = $('hist-alerts-card');
    if (ac) ac.classList.add('highlight-alert');
  }
  
  // 3. Update top connection badge & status indicators
  const lowerMsg = (d.message || '').toLowerCase();
  const isOfflineEvent = lowerMsg.includes('offline') || lowerMsg.includes('disconnected') || lowerMsg.includes('error') || lowerMsg.includes('lost');
  
  const hDot = $('sys-handheld-dot');
  const hStatus = $('sys-handheld-status');
  if (hDot && hStatus) {
    hStatus.innerHTML = `<div class="ss-dot" id="sys-handheld-dot" style="background:var(--emerald);box-shadow:0 0 6px var(--emerald)"></div>Handheld: Online`;
  }
  
  // Update node chip on page 3
  const chips = $$('.node-chip');
  chips.forEach(chip => {
    if (chip.textContent.includes(d.device_id) || chip.textContent.includes('HH_01')) {
      const dot = chip.querySelector('.node-chip-dot');
      if (dot) {
        dot.style.background = 'var(--emerald)';
        dot.style.boxShadow = '0 0 5px var(--emerald)';
      }
    }
  });
  
  // 3. Log to system terminal
  const logMsg = `[${d.device_id}] ${d.message} (${d.priority})`;
  tlog(logMsg, d.priority === 'CRITICAL' ? 'err' : d.priority === 'HIGH' ? 'warn' : 'ok');
  
  // 4. Append message to telemetry history & events
  const histItem = {
    id: d.id,
    node_id: d.device_id,
    timestamp: d.timestamp,
    temperature: null,
    humidity: null,
    pressure: null,
    aqi: null,
    wind_speed: null,
    battery: 100,
    rssi: d.wifi_rssi,
    status: d.priority
  };
  
  GM.history.push(histItem);
  setText('h-records', GM.history.length.toLocaleString());
  setText('hs-records', GM.history.length.toLocaleString());
  renderHistTable(GM.history);
  
  const eventItem = {
    timestamp: d.timestamp,
    event_type: (d.priority === 'HIGH' || d.priority === 'CRITICAL') ? 'ANOMALY' : 'TELEMETRY',
    message: `[${d.device_id}] Handheld Event: ${d.message} (${d.priority})`
  };
  GM.events.unshift(eventItem);
  loadEventTimeline();
  
  if (d.priority === 'HIGH' || d.priority === 'CRITICAL') {
    const alertCountElement = $('hs-alerts');
    if (alertCountElement) {
      let currentVal = parseInt(alertCountElement.textContent) || 0;
      setText('hs-alerts', currentVal + 1);
    }
  }
}

// ── HANDHELD SIMULATOR CONTROLLER ──
let simOpen = false;

function toggleHandheldSimulator() {
  const sim = $('handheld-simulator');
  if (!sim) return;
  simOpen = !simOpen;
  if (simOpen) {
    sim.style.display = 'flex';
    void sim.offsetWidth;
    sim.classList.add('open');
    setText('lcd-log-msg', 'READY TO SEND');
  } else {
    sim.classList.remove('open');
    setTimeout(() => {
      if (!simOpen) sim.style.display = 'none';
    }, 300);
  }
}

const PRESETS = {
  'msg-sel': { msg: '👉 Patrol checkpoint alpha selected', priority: 'NORMAL' },
  'msg-sent': { msg: '📤 Patrol log sent to ground station', priority: 'NORMAL' },
  'emergency': { msg: '🚨 SOS Emergency Alert: Wildfire threat near Grid 4', priority: 'CRITICAL' },
  'status-up': { msg: '📊 Periodic checkin: Battery 98%, GPS Lock ok', priority: 'NORMAL' },
  'wifi-on': { msg: '📶 WiFi connected to mesh node AP-12', priority: 'NORMAL' },
  'wifi-off': { msg: '📴 WiFi link lost. Reverted to ESP-NOW direct', priority: 'HIGH' },
  'net-on': { msg: '🔗 Connected to ground station WebSocket', priority: 'NORMAL' },
  'net-err': { msg: '❌ Connection timeout on WS channel 2', priority: 'HIGH' },
  'hh-on': { msg: '🟢 Handheld unit online and initialized', priority: 'NORMAL' },
  'hh-off': { msg: '🔴 Handheld unit power shut down sequence', priority: 'HIGH' },
  'check': { msg: '🔧 Self diagnostics: CPU 80MHz, LDR ok', priority: 'NORMAL' },
  'bat-low': { msg: '🔋 Battery critical: 12% capacity remaining', priority: 'HIGH' },
  'clear': { msg: '✅ All Clear: Emergency alert resolved and stood down', priority: 'NORMAL' }
};

function applySimPreset(presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) return;
  
  const msgInput = $('sim-msg');
  const priSelect = $('sim-priority');
  
  if (msgInput) msgInput.value = preset.msg;
  if (priSelect) priSelect.value = preset.priority;
  
  setText('lcd-log-msg', `LOADED: ${preset.priority}`);
}

async function sendSimulatedHandheldMessage() {
  const device = $('sim-device')?.value || 'HANDHELD_01';
  const message = $('sim-msg')?.value || 'System check';
  const priority = $('sim-priority')?.value || 'NORMAL';
  const rssi = parseInt($('sim-rssi')?.value) || -50;
  
  setText('lcd-sys-status', 'TX...');
  setText('lcd-log-msg', 'SENDING PACKET...');
  
  try {
    const response = await fetch('/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        device_id: device,
        message: message,
        priority: priority,
        wifi_rssi: rssi,
        uptime_ms: Date.now() % 1000000,
        status: 'sent',
        timestamp: 'auto-generated'
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      setText('lcd-sys-status', 'OK');
      setText('lcd-log-msg', 'TX SUCCESSFUL');
      SFX.success();
    } else {
      throw new Error(result.error || 'Server error');
    }
  } catch (error) {
    setText('lcd-sys-status', 'ERR');
    setText('lcd-log-msg', 'TX FAILED');
    tlog(`Simulator TX Error: ${error.message}`, 'err');
  }
  
  setTimeout(() => {
    if (simOpen) {
      setText('lcd-sys-status', 'ACTIVE');
      setText('lcd-log-msg', 'READY TO SEND');
    }
  }, 3000);
}

window.toggleHandheldSimulator = toggleHandheldSimulator;
window.applySimPreset = applySimPreset;
window.sendSimulatedHandheldMessage = sendSimulatedHandheldMessage;

// ════════════════════════════════════════════════════════════════
// DATA FETCHING
// ════════════════════════════════════════════════════════════════
async function fetchAll(){
  // Config
  try{ const r=await fetch('/config.json');const j=await r.json(); GM.caps=j.data?.capabilities||{}; tlog('Config loaded','info'); }catch{}
  // Latest telemetry
  try{ const r=await fetch('/latest');const j=await r.json(); if(j.success&&j.data) handleSensorUpdate(j.data); }catch{}
  // Nodes
  try{
    const r=await fetch('/nodes');const j=await r.json();
    if(j.success){ const active=j.data.filter(n=>n.battery>0).length; setText('h-nodes',active); }
  }catch{}
  // History
  try{
    const r=await fetch('/history/json');const j=await r.json();
    if(j.success&&j.data){ GM.history=j.data; setText('h-records',j.data.length.toLocaleString()); }
  }catch{}
  // AI reports
  try{
    const r=await fetch('/ai/reports');const j=await r.json();
    if(j.success){ GM.aiReports=j.data; setText('h-reports',j.data.length); setText('hs-ai',j.data.length);
      setText('ai-provider-badge',GM.caps.ai_gemini?'GEMINI':GM.caps.ai_claude?'CLAUDE':'FALLBACK'); }
  }catch{}
  // External APIs
  fetchWeather(); fetchAQI(); fetchFIRMS();
  // Events
  try{ const r=await fetch('/events');const j=await r.json(); if(j.success) GM.events=j.data; }catch{}
}

async function fetchWeather(){
  try{
    const r=await fetch('/weather');const j=await r.json();
    if(j.success&&j.data){
      GM.weather=j.data; const d=j.data;
      const live=d.data_source!=='mock_fallback';
      // Web Data page
      setText('w-temp',fmt(d.temperature)); setText('w-temp-sub',d.description||'—');
      setText('w-hum',fmt(d.humidity,0));
      setText('w-wind',fmt(d.wind_speed));
      setText('w-pres',fmt(d.pressure,1));
      setText('w-desc',`${d.description||'—'}`);
      setText('wd-rain',fmt(d.rainfall,1));
      setText('wd-rain-prob',`Rainfall: ${fmt(d.rainfall,1)} mm/h`);
      // Source indicators
      const dot=$('src-meteo-dot'); if(dot) dot.style.background=live?'var(--emerald)':'var(--amber)';
      const st=$('src-meteo-st'); if(st){st.textContent=live?'LIVE':'MOCK';st.className=`badge ${live?'badge-emerald':'badge-amber'}`;}
      // Twin Sense right
      setText('ts-temp-r',fmt(d.temperature));
      setText('ts-hum-r',fmt(d.humidity,0));
      setText('ts-pres-r',fmt(d.pressure,1));
      setText('ts-wind-r',fmt(d.wind_speed));
      updateTwinDelta();
      tlog(`Weather: ${d.temperature}°C [${live?'LIVE':'MOCK'}]`,'ok');
      // Refresh timestamp
      const t=$('wd-refresh'); if(t) t.textContent=`Last: ${now()}`;
    }
  }catch{}
}

async function fetchAQI(){
  try{
    const r=await fetch('/aqi');const j=await r.json();
    if(j.success&&j.data){
      GM.aqiData=j.data;
      const aqi=j.data.aqi||0;
      setText('wd-aqi',aqi); setText('ts-aqi-r',aqi);
      const cat=aqi<50?'Good':aqi<100?'Moderate':aqi<150?'Unhealthy for SG':aqi<200?'Unhealthy':'Hazardous';
      const col=aqi<50?'var(--emerald)':aqi<100?'var(--amber)':'var(--crimson)';
      setText('wd-aqi-cat',cat);
      const badge=$('wd-aqi-badge');if(badge){badge.textContent=cat;badge.style.color=col;}
      const srcBadge=$('wd-aqi-src');if(srcBadge)srcBadge.textContent=`Source: ${j.data.data_source||'AQICN'}`;
      const dot=$('src-aqi-dot');if(dot)dot.style.background='var(--emerald)';
      const st=$('src-aqi-st');if(st){st.textContent='OK';st.className='badge badge-emerald';}
      updateTwinDelta();
      tlog(`AQI: ${aqi} [${j.data.data_source||'mock'}]`,'info');
    }
  }catch{}
}

async function fetchFIRMS(){
  try{
    const r=await fetch('/fire-hotspots');const j=await r.json();
    if(j.success&&Array.isArray(j.data)){
      GM.firmsData=j.data;
      setText('wd-firms',j.data.length);
      setText('ts-firms-r',`${j.data.length}`);
      const risk=j.data.length>5?'EXTREME':j.data.length>2?'HIGH':j.data.length>0?'MODERATE':'LOW';
      const riskCol=j.data.length>2?'var(--crimson)':j.data.length>0?'var(--amber)':'var(--emerald)';
      const rb=$('wd-risk-badge');if(rb){rb.textContent=risk;rb.style.color=riskCol;}
      if(j.data.length>0){
        setText('wd-firms-desc',`⚠ ${j.data.length} thermal anomaly(s) within 50km. Cross-reference with local temperature sensors.`);
        const fdot=$('src-firms-dot');if(fdot)fdot.style.background='var(--crimson)';
      }else{
        const fdot=$('src-firms-dot');if(fdot)fdot.style.background='var(--emerald)';
      }
      const st=$('src-firms-st');if(st){st.textContent=j.data.length?`${j.data.length} HOTSPOTS`:'CLEAR';st.className=`badge ${j.data.length?'badge-crimson':'badge-emerald'}`;}
      tlog(`NASA FIRMS: ${j.data.length} hotspots in area`,j.data.length?'warn':'ok');
    }
  }catch{}
}

// ════════════════════════════════════════════════════════════════
// WEB DATA — CHARTS
// ════════════════════════════════════════════════════════════════
const CHART_BASE={
  responsive:true,maintainAspectRatio:false,
  plugins:{legend:{display:false},tooltip:{backgroundColor:'rgba(8,8,15,.97)',borderColor:'rgba(255,255,255,.08)',borderWidth:1,titleColor:'#8a8a9a',bodyColor:'#EBE6DD',padding:9,cornerRadius:7}},
  scales:{
    x:{grid:{color:'rgba(255,255,255,.025)'},ticks:{color:'#44445a',font:{size:9,family:"'JetBrains Mono'"},maxTicksLimit:6}},
    y:{grid:{color:'rgba(255,255,255,.035)'},ticks:{color:'#44445a',font:{size:9,family:"'JetBrains Mono'"},maxTicksLimit:5}},
  },
  animation:{duration:700,easing:'easeInOutQuart'},
  elements:{point:{radius:0,hoverRadius:4},line:{tension:.45}},
};

function histSeries(field,n=24){
  const data=GM.history.length?GM.history:[];
  if(!data.length){
    const bases={temperature:29,humidity:62,pressure:1011,aqi:48,rainfall:.2,wind_speed:12,battery:75,rssi:-68};
    const base=bases[field]||20,v=base*.15;
    return Array.from({length:n},(_,i)=>(base+Math.sin(i/4)*v+(Math.random()-.5)*v/2));
  }
  const step=Math.max(1,Math.floor(data.length/n));
  return data.filter((_,i)=>i%step===0).slice(-n).map(d=>+(d[field]||0));
}
function makeLabels(n,stepMin=30){
  return Array.from({length:n},(_,i)=>{
    const d=new Date(Date.now()-(n-1-i)*stepMin*60*1000);
    return d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false});
  });
}
function gradFill(ctx,col){
  const g=ctx.chart.ctx.createLinearGradient(0,0,0,ctx.chart.height);
  g.addColorStop(0,col+'55'); g.addColorStop(1,col+'00'); return g;
}

const charts={};

function initWebData(){
  if(GM.chartsInited.wd) return;
  GM.chartsInited.wd=true;
  const n=24,labs=makeLabels(n);
  charts.wdAqi=new Chart($('wd-aqi-chart'),{type:'line',data:{labels:makeLabels(6,60),datasets:[{data:histSeries('aqi',6),borderColor:'#C98A2C',backgroundColor:'rgba(201,138,44,.1)',fill:true,borderWidth:1.5}]},options:{...CHART_BASE,plugins:{...CHART_BASE.plugins},scales:{...CHART_BASE.scales}}});
  charts.wdTemp=new Chart($('wd-temp-chart'),{type:'line',data:{labels:labs,datasets:[{data:histSeries('temperature',n),borderColor:'#c4294a',backgroundColor:ctx=>gradFill(ctx,'#c4294a'),fill:true,borderWidth:2}]},options:{...CHART_BASE}});
  charts.wdHum=new Chart($('wd-hum-chart'),{type:'line',data:{labels:labs,datasets:[{data:histSeries('humidity',n),borderColor:'#4888C8',backgroundColor:ctx=>gradFill(ctx,'#4888C8'),fill:true,borderWidth:2}]},options:{...CHART_BASE}});
}

// ════════════════════════════════════════════════════════════════
// SENSOR DATA — INSTRUMENT PANEL
// ════════════════════════════════════════════════════════════════
const SPARKLINE_OPTS={
  responsive:true,maintainAspectRatio:false,
  plugins:{legend:{display:false},tooltip:{enabled:false}},
  scales:{x:{display:false},y:{display:false}},
  animation:{duration:400},
  elements:{point:{radius:0},line:{tension:.5,borderWidth:1.5}},
};

function initSparkline(id,color){
  const el=$(id); if(!el||charts[id]) return;
  charts[id]=new Chart(el,{type:'line',data:{labels:Array(12).fill(''),datasets:[{data:Array(12).fill(null),borderColor:color,backgroundColor:color+'18',fill:true}]},options:SPARKLINE_OPTS});
}

function initAllSparklines(){
  initSparkline('sp-temp','#c4294a');
  initSparkline('sp-hum','#4888C8');
  initSparkline('sp-pres','#9B72C8');
  initSparkline('sp-aqi','#C98A2C');
  initSparkline('sp-rain','#4888C8');
  initSparkline('sp-wind','#1d9688');
  initSparkline('sp-bat','#1DB87A');
  initSparkline('sp-rssi','#9B72C8');
}

function updateSparkline(chartId,history){
  const c=charts[chartId]; if(!c||!history||!history.length) return;
  const padded=[...Array(Math.max(0,12-history.length)).fill(null),...history.slice(-12)];
  c.data.datasets[0].data=padded; c.update('none');
}

function selectSensorNode(nodeId,el){
  GM.selectedSensorNode=nodeId;
  $$('.node-chip').forEach(c=>c.classList.remove('active'));
  if(el) el.classList.add('active');
  setText('sd-node-badge',nodeId);
  // Show latest for this node from history
  const nodeHistory=GM.history.filter(h=>h.node_id===nodeId);
  if(nodeHistory.length){
    const latest=nodeHistory[nodeHistory.length-1];
    refreshSensorDisplay(latest);
  } else if(GM.lastTelemetry.node_id===nodeId){
    refreshSensorDisplay(GM.lastTelemetry);
  } else {
    // Use mock
    refreshSensorDisplay({temperature:28.5+Math.random()*4,humidity:60+Math.random()*10,pressure:1010+Math.random()*3,aqi:45+Math.random()*20,rainfall:Math.random()*.5,wind_speed:12+Math.random()*5,battery:85-Math.random()*10,rssi:-65-Math.random()*15,node_id:nodeId});
  }
}

function refreshSensorPage(){
  initAllSparklines();
  const nodeId=GM.selectedSensorNode;
  const nodeHistory=GM.history.filter(h=>h.node_id===nodeId);
  if(nodeHistory.length) refreshSensorDisplay(nodeHistory[nodeHistory.length-1]);
  else if(GM.lastTelemetry.node_id===nodeId) refreshSensorDisplay(GM.lastTelemetry);
  else refreshSensorDisplay({temperature:29.1,humidity:62,pressure:1011,aqi:48,rainfall:.2,wind_speed:13,battery:84,rssi:-66});
  // Update sparklines from history
  const nd=GM.nodeData[nodeId];
  if(nd){
    updateSparkline('sp-temp',nd.history.temperature);
    updateSparkline('sp-hum',nd.history.humidity);
    updateSparkline('sp-pres',nd.history.pressure);
    updateSparkline('sp-aqi',nd.history.aqi);
    updateSparkline('sp-rain',nd.history.rainfall);
    updateSparkline('sp-wind',nd.history.wind_speed);
    updateSparkline('sp-bat',nd.history.battery);
    updateSparkline('sp-rssi',nd.history.rssi);
  }
}

function refreshSensorDisplay(d){
  const ts=now();
  setText('sd-last-update',ts);

  // Temperature
  const t=d.temperature;
  if(t!=null){
    const e=$('ic-v-temp'); if(e){e.textContent=fmt(t);e.classList.remove('value-flash');void e.offsetWidth;e.classList.add('value-flash');}
    const led=$('ic-temp')?.querySelector('.ic-led'); if(led) led.className=`ic-led ${t>40?'crit':t>35?'warn':'ok'}`;
    const fill=$('ic-b-temp'); if(fill) fill.style.width=Math.min(100,t/50*100)+'%';
    const trend=$('ic-tr-temp'); if(trend){trend.textContent=t>30?'↑':t<20?'↓':'→';trend.className=`ic-trend ${t>30?'trend-up':t<20?'trend-down':'trend-flat'}`;}
    setText('ic-ts-temp',ts);
    updateSparkline('sp-temp',GM.nodeData[GM.selectedSensorNode]?.history?.temperature||[t]);
  }
  // Humidity
  if(d.humidity!=null){
    const e=$('ic-v-hum'); if(e){e.textContent=fmt(d.humidity,0);e.classList.remove('value-flash');void e.offsetWidth;e.classList.add('value-flash');}
    const fill=$('ic-b-hum'); if(fill) fill.style.width=Math.min(100,d.humidity)+'%';
    setText('ic-ts-hum',ts);
  }
  // Pressure
  if(d.pressure!=null){
    const e=$('ic-v-pres'); if(e){e.textContent=fmt(d.pressure,1);}
    const fill=$('ic-b-pres'); if(fill) fill.style.width=Math.min(100,(d.pressure-970)/60*100)+'%';
    setText('ic-ts-pres',ts);
  }
  // AQI
  if(d.aqi!=null){
    const aqi=Math.round(d.aqi);
    const e=$('ic-v-aqi'); if(e){e.textContent=aqi;e.classList.remove('value-flash');void e.offsetWidth;e.classList.add('value-flash');}
    const fill=$('ic-b-aqi'); if(fill) fill.style.width=Math.min(100,aqi/300*100)+'%';
    const led=$('ic-led-aqi'); if(led) led.className=`ic-led ${aqi>150?'crit':aqi>100?'warn':'ok'}`;
    const cat=$('ic-aqi-cat'); if(cat){cat.textContent=aqi<50?'GOOD':aqi<100?'MODERATE':aqi<150?'POOR':'HAZARDOUS';cat.style.color=aqi<50?'var(--emerald)':aqi<100?'var(--amber)':'var(--crimson)';}
    setText('ic-ts-aqi',ts);
  }
  // Rainfall
  if(d.rainfall!=null){ const e=$('ic-v-rain'); if(e) e.textContent=fmt(d.rainfall,1); const fill=$('ic-b-rain'); if(fill) fill.style.width=Math.min(100,d.rainfall/10*100)+'%'; }
  // Wind
  if(d.wind_speed!=null){ const e=$('ic-v-wind'); if(e) e.textContent=fmt(d.wind_speed); const fill=$('ic-b-wind'); if(fill) fill.style.width=Math.min(100,d.wind_speed/60*100)+'%'; }
  // Battery
  if(d.battery!=null){
    const b=d.battery;
    const e=$('ic-v-bat'); if(e) e.textContent=Math.round(b);
    const fill=$('ic-b-bat'); if(fill) fill.style.width=Math.min(100,b)+'%';
    const led=$('ic-led-bat'); if(led) led.className=`ic-led ${b<20?'crit':b<40?'warn':'ok'}`;
    setText('ic-bat-est',`Runtime: ~${Math.round(b*.8)}h`);
  }
  // RSSI
  if(d.rssi!=null){
    const rs=d.rssi;
    const e=$('ic-v-rssi'); if(e) e.textContent=rs;
    const pct=Math.max(0,Math.min(100,(rs+100)/40*100));
    const fill=$('ic-b-rssi'); if(fill) fill.style.width=pct+'%';
    const led=$('ic-led-rssi'); if(led) led.className=`ic-led ${rs>-70?'ok':rs>-85?'warn':'crit'}`;
    setText('ic-rssi-qual',rs>-70?'Excellent':rs>-80?'Good':rs>-90?'Fair':'Poor');
  }
}

// ════════════════════════════════════════════════════════════════
// TWIN SENSE — COMPARISON ENGINE
// ════════════════════════════════════════════════════════════════
function initTwinSense(){
  if(!GM.chartsInited.twin){
    GM.chartsInited.twin=true;
    charts.twinRadar=new Chart($('twin-radar'),{
      type:'radar',
      data:{labels:['Temperature','Humidity','Pressure','AQI','Wind'],
        datasets:[
          {label:'Local ESP32',data:[0,0,0,0,0],backgroundColor:'rgba(139,26,46,.15)',borderColor:'#8B1A2E',borderWidth:2,pointRadius:4},
          {label:'Web API',   data:[0,0,0,0,0],backgroundColor:'rgba(29,184,122,.1)',borderColor:'#1DB87A',borderWidth:1.5,borderDash:[5,3],pointRadius:3},
        ]},
      options:{...CHART_BASE,scales:{r:{grid:{color:'rgba(255,255,255,.06)'},ticks:{display:false},pointLabels:{color:'#8a8a9a',font:{size:9}}}}}
    });
  }
  updateTwinDelta();
}

function norm(v,min,max){ return max>min?Math.max(0,Math.min(100,(v-min)/(max-min)*100)):50; }

function updateTwinDelta(){
  const t=GM.lastTelemetry, w=GM.weather, a=GM.aqiData;
  if(!t||!Object.keys(t).length) return;
  const localTemp=t.temperature,localHum=t.humidity,localPres=t.pressure,localAqi=t.aqi,localWind=t.wind_speed;
  const apiTemp=w?.temperature,apiHum=w?.humidity,apiPres=w?.pressure,apiAqi=a?.aqi,apiWind=w?.wind_speed;

  // Radar
  if(charts.twinRadar){
    charts.twinRadar.data.datasets[0].data=[
      norm(localTemp||28,15,50), norm(localHum||62,0,100),
      norm(localPres||1011,980,1030), norm(localAqi||48,0,200), norm(localWind||12,0,60)
    ];
    charts.twinRadar.data.datasets[1].data=[
      norm(apiTemp||29,15,50), norm(apiHum||64,0,100),
      norm(apiPres||1012,980,1030), norm(apiAqi||50,0,200), norm(apiWind||14,0,60)
    ];
    charts.twinRadar.update();
  }

  // Delta table
  const rows=[
    {m:'Temperature',l:localTemp,r:apiTemp,unit:'°C',thresh:3},
    {m:'Humidity',   l:localHum,r:apiHum,unit:'%',thresh:10},
    {m:'Pressure',   l:localPres,r:apiPres,unit:'hPa',thresh:5},
    {m:'AQI',        l:localAqi,r:apiAqi,unit:'',thresh:30},
    {m:'Wind',       l:localWind,r:apiWind,unit:'km/h',thresh:10},
  ];
  const body=$('twin-delta-body'); if(!body) return;
  let maxDiff=0,maxRow=null;
  body.innerHTML=rows.map(row=>{
    const l=row.l,r=row.r;
    if(l==null||r==null) return `<tr><td>${row.m}</td><td>${l!=null?fmt(l)+' '+row.unit:'—'}</td><td>${r!=null?fmt(r)+' '+row.unit:'—'}</td><td>—</td><td>—</td><td><span class="delta-pill" style="background:var(--ink-4);color:var(--fog)">PENDING</span></td></tr>`;
    const diff=l-r, absDiff=Math.abs(diff);
    if(absDiff>maxDiff){maxDiff=absDiff;maxRow=row;}
    const conf=Math.max(60,100-absDiff/row.thresh*10).toFixed(0);
    const cls=absDiff<row.thresh?'delta-ok':absDiff<row.thresh*2?'delta-warn':'delta-crit';
    const status=absDiff<row.thresh?'MATCH':absDiff<row.thresh*2?'DEVIATION':'ANOMALY';
    return `<tr><td>${row.m}</td><td>${fmt(l)} ${row.unit}</td><td>${fmt(r)} ${row.unit}</td><td><span class="delta-pill ${cls}">${diff>0?'+':''}${fmt(diff)}</span></td><td>${conf}%</td><td><span class="delta-pill ${cls}">${status}</span></td></tr>`;
  }).join('');

  // Anomaly callout
  const banner=$('twin-anomaly');
  if(banner&&maxRow){
    const bad=maxDiff>maxRow.thresh*2;
    banner.className=`anomaly-banner ${bad?'warn':'ok'}`;
    setHTML('twin-anom-title',bad?`⚠ ${maxRow.m} deviation detected`:' All sensors within normal range');
    setHTML('twin-anom-body',bad?`Local sensor shows ${fmt(maxDiff)} ${maxRow.unit||''} difference from API reference. Cross-validate with neighboring nodes.`:'Local and API data are consistent. No significant anomalies detected.');
  }
}

// ════════════════════════════════════════════════════════════════
// HISTORY PAGE
// ════════════════════════════════════════════════════════════════
async function loadHistoryPage(){
  await loadHistory('24h');
  loadEventTimeline();
  // Stats
  try{ const r=await fetch('/alerts');const j=await r.json(); if(j.success) setText('hs-alerts',j.data.length); }catch{}
  setText('hs-ai',GM.aiReports.length);
}

async function loadHistory(range){
  try{
    const r=await fetch(`/history?range=${range}`);const j=await r.json();
    if(!j.success) return;
    const data=j.data||[];
    GM.history=data;
    setText('hs-records',data.length.toLocaleString());
    const nodes=new Set(data.map(d=>d.node_id)).size;
    setText('hs-nodes',`${nodes}/6`);
    renderHistTable(data);
    buildHistCharts(data);
    tlog(`History: ${data.length} records loaded`,'info');
  }catch(e){tlog('History load failed','err');}
}

function renderHistTable(data){
  const b=$('hist-body'); if(!b) return;
  if(!data.length){b.innerHTML='<tr><td colspan="10" style="text-align:center;color:var(--smoke);padding:20px">No records in range</td></tr>';return;}
  b.innerHTML=data.slice().reverse().slice(0,80).map(r=>{
    const ts=r.timestamp?new Date(r.timestamp*1000).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
    const bad=r.temperature>40||r.aqi>150||r.status==='ANOMALY'||r.status==='CRITICAL'||r.status==='HIGH';
    return `<tr class="${bad?'anomaly':''}"><td>${ts}</td><td style="color:var(--rose-pale)">${r.node_id}</td><td style="color:${r.temperature>40?'var(--crimson)':''}">${fmt(r.temperature)}°</td><td>${fmt(r.humidity,0)}%</td><td>${fmt(r.pressure,1)}</td><td style="color:${r.aqi>150?'var(--amber)':''}">${Math.round(r.aqi)||'—'}</td><td>${fmt(r.wind_speed)}</td><td style="color:${r.battery<20?'var(--crimson)':''}">${r.battery||'—'}%</td><td>${r.rssi||'—'}</td><td><span class="badge ${bad?'badge-crimson':'badge-emerald'}">${bad?'ANOMALY':'OK'}</span></td></tr>`;
  }).join('');
}

async function loadEventTimeline(){
  const events=GM.events.length?GM.events:(()=>{try{return [];}catch{return [];}})();
  const c=$('event-timeline'); if(!c) return;
  const cols={SYSTEM:'var(--fog)',NODE:'var(--teal)',ANOMALY:'var(--crimson)',AI:'var(--rose-pale)',NETWORK:'var(--amber)',TELEMETRY:'var(--emerald)'};
  if(!events.length){c.innerHTML='<div style="font-family:var(--f-mono);font-size:11px;color:var(--smoke);padding:12px 0">No events loaded. Try fetching history first.</div>';return;}
  c.innerHTML=events.map((e,i)=>{
    const ts=e.timestamp?new Date(e.timestamp*1000).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
    const col=cols[e.event_type]||'var(--fog)';
    return `<div class="tl-item"><div class="tl-ts">${ts}</div><div class="tl-nw"><div class="tl-dot" style="background:${col};box-shadow:0 0 5px ${col}"></div>${i<events.length-1?'<div class="tl-line"></div>':''}</div><div class="tl-content"><div class="tl-type" style="color:${col}">${e.event_type}</div><div class="tl-msg">${e.message}</div></div></div>`;
  }).join('');
}

const histCharts={};
function buildHistCharts(data){
  Object.values(histCharts).forEach(c=>c&&c.destroy());
  const n=Math.min(data.length,32),step=Math.max(1,Math.floor(data.length/n));
  const sl=data.filter((_,i)=>i%step===0).slice(-n);
  const labs=sl.map(d=>new Date(d.timestamp*1000).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}));
  const mk=(id,field,color,type='line')=>{
    const el=$(id); if(!el) return null;
    return new Chart(el,{type,data:{labels:labs,datasets:[{data:sl.map(d=>d[field]||0),borderColor:color,backgroundColor:color+'18',borderWidth:type==='line'?2:1,fill:type==='line',tension:.4,borderRadius:type==='bar'?2:0}]},options:{...CHART_BASE,elements:{...CHART_BASE.elements,point:{radius:0}}}});
  };
  histCharts.temp=mk('hist-temp-chart','temperature','#c4294a');
  histCharts.aqi=mk('hist-aqi-chart','aqi','#C98A2C');
  histCharts.bat=mk('hist-bat-chart','battery','#1DB87A','bar');
  histCharts.rain=mk('hist-rain-chart','rainfall','#4888C8','bar');
}

function switchHistTab(tab,el){
  GM.histTabActive=tab;
  $$('.htab').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  ['logs','timeline','charts','reports'].forEach(t=>{
    const e=$(`htab-${t}`); if(e) e.style.display=t===tab?'block':'none';
  });
  if(tab==='reports') renderAIReportCards();
  if(tab==='charts'&&GM.history.length) buildHistCharts(GM.history);
  if(tab==='timeline') loadEventTimeline();
}

function renderAIReportCards(){
  const c=$('ai-reports-list'); if(!c) return;
  const SEV={Critical:'badge-crimson',High:'badge-crimson',Moderate:'badge-amber',Low:'badge-emerald'};
  if(!GM.aiReports.length){c.innerHTML='<div style="padding:24px;text-align:center;color:var(--smoke);font-family:var(--f-mono);font-size:11px">No AI reports yet.</div>';return;}
  c.innerHTML=GM.aiReports.map(r=>`<div class="panel p-4 flex justify-between items-center"><div><div class="flex items-center gap-2 mb-2"><span class="badge ${SEV[r.severity]||'badge-ghost'}">${r.severity||'—'}</span><span class="badge badge-ghost">${r.data_source==='mock_fallback'?'FALLBACK':r.data_source?.toUpperCase()||'AI'}</span></div><div style="font-size:13px;font-weight:600">${r.incident||r.incident_title||'Incident Report'}</div><div style="font-family:var(--f-mono);font-size:9px;color:var(--smoke);margin-top:3px">${new Date((r.timestamp||0)*1000).toLocaleString()}</div></div><div style="text-align:right;flex-shrink:0"><div style="font-family:var(--f-mono);font-size:9px;color:var(--fog)">Confidence</div><div style="font-family:var(--f-mono);font-size:20px;font-weight:600">${r.confidence||'—'}</div></div></div>`).join('');
}

// ════════════════════════════════════════════════════════════════
// AI COMMAND CENTER
// ════════════════════════════════════════════════════════════════
const SCENARIOS={
  fire:'Wildfire detected — NODE_A reports temperature 54°C, AQI 285, humidity 18%, NE wind 34 km/h. Smoke visible from ridge. Battery at 85%.',
  flood:'Flash flood warning — pressure dropped 12 hPa in 90 minutes. Rainfall 48 mm/h at NODE_C. River basin overflow imminent.',
  gas:'Gas anomaly — MQ-135 at NODE_A showing AQI 190 during 03:00–04:00 window. Nighttime thermal inversion suspected. Temperature normal.',
  relay:'Relay failure — NODE_B went offline 20 minutes ago (last battery: 8%). 47 cached packets at downstream nodes.',
  pressure:'Rapid pressure drop — 9 hPa decrease in 25 minutes across all nodes. Wind increasing from NW. Storm system approaching.',
  multi:'Multi-node anomaly — Nodes A, B, and C simultaneously reporting AQI >160 and temperature >38°C. Upwind source suspected.',
};

function setScenario(el,key){
  $$('.sc-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  const inp=$('ai-input'); if(inp) inp.value=SCENARIOS[key]||'';
}

async function runAI(){
  const inp=$('ai-input'); const scenario=inp?.value?.trim();
  if(!scenario){inp?.focus();return;}
  $('ai-idle').style.display='none'; $('ai-thinking').style.display='block'; $('ai-report').style.display='none';
  const src=GM.caps.ai_gemini?'CONTACTING GEMINI AI…':GM.caps.ai_claude?'CONTACTING CLAUDE AI…':'PROCESSING WITH FALLBACK ENGINE…';
  setText('ai-think-label',src);
  const btn=$('btn-ai-run'); if(btn){btn.disabled=true;btn.textContent='⚡ Analyzing…';}
  let full=scenario;
  if($('inject-ctx')?.checked&&Object.keys(GM.lastTelemetry).length){
    const t=GM.lastTelemetry;
    full+=`\n\n[TELEMETRY: T=${fmt(t.temperature)}°C H=${fmt(t.humidity,0)}% P=${fmt(t.pressure,1)}hPa AQI=${Math.round(t.aqi||0)} Wind=${fmt(t.wind_speed)}km/h node=${t.node_id||'—'}]`;
  }
  tlog('AI analysis started…','info');
  try{
    const r=await fetch('/ai/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario:full})});
    const j=await r.json();
    $('ai-thinking').style.display='none'; $('ai-report').style.display='block';
    if(j.success&&j.data) renderAIReport(j.data);
  }catch(err){ $('ai-thinking').style.display='none'; $('ai-report').style.display='block'; setHTML('ai-title','Analysis Failed'); setHTML('ai-cause',`Error: ${err.message}`); tlog('AI analysis failed','err'); }
  finally{ if(btn){btn.disabled=false;btn.textContent='⚡ Analyze Incident';} }
}

function renderAIReport(d){
  SFX.aiDone();
  const SEV={Critical:'badge-crimson',High:'badge-crimson',Moderate:'badge-amber',Low:'badge-emerald'};
  const src=d.data_source==='gemini'?'GEMINI':d.data_source==='claude'?'CLAUDE':'FALLBACK';
  const sevBadge=$('ai-sev-badge'); if(sevBadge){sevBadge.textContent=d.severity||'UNKNOWN';sevBadge.className=`badge ${SEV[d.severity]||'badge-ghost'}`;}
  setText('ai-src-badge',src); setText('ai-resp-badge',d.response_type||'MONITOR');
  setText('ai-title',d.incident_title||'Environmental Incident');
  setText('ai-conf',d.confidence||'—');
  setHTML('ai-cause',d.probable_cause||'—');
  setHTML('ai-action',d.recommended_action||'—');
  const nodes=$('ai-nodes'); if(nodes) nodes.innerHTML=(d.related_sensors||[]).map(n=>`<span class="badge badge-ghost">${n}</span>`).join('')||'<span class="badge badge-ghost">—</span>';
  const t=GM.lastTelemetry;
  setHTML('ai-evidence',`<div>Temp: <span style="color:var(--ivory)">${fmt(t.temperature)}°C</span></div><div>Humidity: <span style="color:var(--ivory)">${fmt(t.humidity,0)}%</span></div><div>AQI: <span style="color:var(--ivory)">${Math.round(t.aqi||0)}</span></div><div>Pressure: <span style="color:var(--ivory)">${fmt(t.pressure,1)} hPa</span></div><div>Wind: <span style="color:var(--ivory)">${fmt(t.wind_speed)} km/h</span></div><div>Node: <span style="color:var(--ivory)">${t.node_id||'—'}</span></div>`);
  GM.aiReports.unshift({...d,timestamp:Math.floor(Date.now()/1000)});
  setText('h-reports',GM.aiReports.length); setText('hs-ai',GM.aiReports.length);
  tlog(`AI report generated: ${d.incident_title} [${src}]`,'ok');
}

function clearAI(){
  $$('.sc-chip').forEach(c=>c.classList.remove('active'));
  const i=$('ai-input'); if(i) i.value='';
  $('ai-idle').style.display='flex'; $('ai-thinking').style.display='none'; $('ai-report').style.display='none';
}

function saveReport(){
  SFX.success(); tlog('Report saved to archive','ok');
  const btn=document.querySelector('[onclick="saveReport()"]');
  if(btn){btn.textContent='✓ Saved'; setTimeout(()=>btn.textContent='Save Report',1600);}
}

// ════════════════════════════════════════════════════════════════
// EXPORT
// ════════════════════════════════════════════════════════════════
async function exportCSV(){
  try{
    const r=await fetch('/history/json'); const j=await r.json();
    const rows=j.data||[]; if(!rows.length){alert('No data.');return;}
    let csv='Timestamp,Node,Temp,Humidity,Pressure,AQI,Rainfall,Wind,Battery,RSSI\n';
    rows.forEach(r=>{csv+=[new Date(r.timestamp*1000).toISOString(),r.node_id,r.temperature,r.humidity,r.pressure,r.aqi,r.rainfall,r.wind_speed,r.battery,r.rssi].join(',')+'\n';});
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    const a=Object.assign(document.createElement('a'),{href:url,download:`guardian_mesh_${Date.now()}.csv`});
    a.click(); URL.revokeObjectURL(url);
    tlog('Telemetry exported as CSV','ok'); SFX.success();
  }catch{tlog('CSV export failed','err');}
}

// ════════════════════════════════════════════════════════════════
// JUDGE DEMO MODE
// ════════════════════════════════════════════════════════════════
async function runJudgeDemo(){
  if(GM.demoRunning) return;
  GM.demoRunning=true;
  const btn=$('btn-judge-demo'); if(btn){btn.textContent='⚡ DEMO RUNNING…';btn.style.opacity='.7';}
  tlog('═══ JUDGE DEMO MODE ACTIVATED ═══','ok');
  switchPage(1); await sleep(2000);
  tlog('→ Switching to Web Data','info'); switchPage(2); await sleep(3000);
  tlog('→ Switching to Sensor Data','info'); switchPage(3); await sleep(2500);
  tlog('→ Switching to Twin Sense','info'); switchPage(4); await sleep(2500);
  tlog('→ Triggering wildfire simulation…','err'); SFX.alert();
  await fetch('/demo/run',{method:'POST'});
  await sleep(3000);
  tlog('→ Opening AI Command Center','info'); switchPage(6);
  const inp=$('ai-input'); if(inp) inp.value=SCENARIOS.fire;
  await sleep(1200); await runAI(); await sleep(4000);
  tlog('→ Opening History Archive','info'); switchPage(5); await sleep(2500);
  tlog('→ Opening Roadmap','info'); switchPage(7); await sleep(2000);
  SFX.success(); tlog('═══ DEMO COMPLETE ═══','ok');
  setTimeout(()=>{ GM.demoRunning=false; if(btn){btn.textContent='⚡ RUN FULL DEMO';btn.style.opacity='1';} },2000);
}

// ════════════════════════════════════════════════════════════════
// STARTUP
// ════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded',()=>{ runBootSequence(); });
