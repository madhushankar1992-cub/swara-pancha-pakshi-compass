/*
 * Swara Pancha Pakshi Compass — PC pop-up service.
 * Shows a pop-up at every Pancha Pakshi sub-period change (about every 12-48 minutes),
 * skips quiet hours, honours "Snooze 1 hour", and follows Windows location when available.
 * Single instance: it holds 127.0.0.1:47121 while running.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');
const os = require('os');
const { spawn, execFile } = require('child_process');
const E = require('./pakshi-engine.js');

const DIR = __dirname;
const CONFIG = path.join(DIR, 'config.json');
const STATE = path.join(DIR, 'state.json');
const LOG = path.join(DIR, 'pakshi.log');
const MIN = 60000;

const CITIES = [
  ['Chennai', 13.0827, 80.2707], ['Kanchipuram', 12.8342, 79.7036], ['Vellore', 12.9165, 79.1325],
  ['Puducherry', 11.9416, 79.8083], ['Salem', 11.6643, 78.146], ['Coimbatore', 11.0168, 76.9558],
  ['Tiruchirappalli', 10.7905, 78.7047], ['Thanjavur', 10.787, 79.1378], ['Dindigul', 10.3673, 77.9803],
  ['Kodai Road', 10.221, 77.884], ['Madurai', 9.9252, 78.1198], ['Tirunelveli', 8.7139, 77.7567],
  ['Nagercoil', 8.1833, 77.4119], ['Bengaluru', 12.9716, 77.5946], ['Hyderabad', 17.385, 78.4867],
  ['Mumbai', 19.076, 72.8777], ['Delhi', 28.6139, 77.209], ['Kolkata', 22.5726, 88.3639], ['Kochi', 9.9312, 76.2673],
  ['Colombo', 6.9271, 79.8612], ['Dubai', 25.2048, 55.2708], ['Doha', 25.2854, 51.531], ['Singapore', 1.3521, 103.8198],
  ['Kuala Lumpur', 3.139, 101.6869], ['London', 51.5074, -0.1278], ['New York', 40.7128, -74.006], ['Sydney', -33.8688, 151.2093],
];

function log(msg) {
  try {
    const line = `${new Date().toISOString()} ${msg}\n`;
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 512 * 1024) fs.renameSync(LOG, LOG + '.old');
    fs.appendFileSync(LOG, line);
  } catch (e) { /* logging must never stop the service */ }
}
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const writeJson = (f, v) => { try { fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 2)); fs.renameSync(f + '.tmp', f); } catch (e) { log('write failed ' + f); } };

let config = readJson(CONFIG, {});
config = {
  place: { name: 'Chennai', lat: 13.0827, lon: 80.2707, tz: 330 },
  bird: 'V', natal: null, quietFrom: '22:30', quietTo: '05:00', useWindowsLocation: true,
  ...config,
};
let place = { ...config.place };
let popupProc = null;
let timer = null;
let lastShownStart = 0;
const cache = new Map();

function nearestCity(lat, lon) {
  let best = null, bd = Infinity;
  for (const c of CITIES) { const d = Math.hypot(c[1] - lat, (c[2] - lon) * Math.cos((lat * Math.PI) / 180)); if (d < bd) { bd = d; best = c[0]; } }
  return bd * 111 < 25 ? best : `Near ${lat.toFixed(2)}, ${lon.toFixed(2)}`;
}

function refreshLocation() {
  if (!config.useWindowsLocation) return;
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(DIR, 'location.ps1')],
    { windowsHide: true, timeout: 30000 }, (err, out) => {
      const m = /(-?\d+\.\d+),(-?\d+\.\d+)/.exec(String(out || ''));
      if (err || !m) { log('Windows location unavailable; using ' + place.name); return; }
      const lat = +m[1], lon = +m[2];
      if (Math.hypot(lat - place.lat, lon - place.lon) * 111 > 3) {
        place = { name: nearestCity(lat, lon), lat, lon };
        cache.clear();
        log(`Location updated: ${place.name} (${lat.toFixed(3)}, ${lon.toFixed(3)})`);
        writeJson(STATE, { ...readJson(STATE, {}), place: { name: place.name, lat: +lat.toFixed(4), lon: +lon.toFixed(4) } });
        schedule();
      }
    });
}

// Windows time zone (DST-aware). Node reads it at start-up, so watchTimeZone() restarts the service if it changes.
const sysTz = (ms) => -new Date(ms).getTimezoneOffset();
const localDate = (ms) => { const d = new Date(ms + sysTz(ms) * MIN); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; };
const addDays = (o, n) => { const d = new Date(Date.UTC(o.y, o.m - 1, o.d + n)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; };
function day(dt) {
  const k = `${dt.y}-${dt.m}-${dt.d}|${place.lat.toFixed(3)}|${place.lon.toFixed(3)}|${sysTz(Date.UTC(dt.y, dt.m - 1, dt.d, 6))}|${config.bird}`;
  if (!cache.has(k)) {
    if (cache.size > 6) cache.clear();
    cache.set(k, E.computeDay({ ...dt, lat: place.lat, lon: place.lon, tzMin: sysTz(Date.UTC(dt.y, dt.m - 1, dt.d, 6)), bird: config.bird, natal: config.natal }));
  }
  return cache.get(k);
}
function periodsAround(now) {
  const today = localDate(now);
  return [-1, 0, 1].flatMap((n) => day(addDays(today, n)).periods);
}

function isQuiet(ms) {
  const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const d = new Date(ms + sysTz(ms) * MIN);
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  const qf = toMin(config.quietFrom), qt = toMin(config.quietTo);
  return qf > qt ? (m >= qf || m < qt) : (m >= qf && m < qt);
}

const COLORS = { excellent: '#17804A', good: '#3F9E63', average: '#B38A12', poor: '#CF6F1F', avoid: '#BF2F2F' };

function showPopup(p) {
  const st = readJson(STATE, {});
  if (st.snoozeUntil && Date.now() < st.snoozeUntil) { log('snoozed: skipped ' + E.localHHMM(p.start, sysTz(p.start))); return; }
  if (Math.abs(p.start - lastShownStart) < 2 * MIN) return; // same period already shown (e.g. after a location update)
  lastShownStart = p.start;
  if (popupProc) { try { popupProc.kill(); } catch (e) { /* already closed */ } popupProc = null; }
  const tz = sysTz(p.start);
  const payload = {
    color: COLORS[p.rating.key] || '#5B6577',
    verdict: `${p.rating.label.toUpperCase()}  ·  till ${E.localHHMM(p.end, tz)}`,
    title: `${p.swaraKey === 'L' ? '☾ Left breath' : '☀ Right breath'}  ·  ${p.sub.birdName} ${p.sub.actName} (${p.sub.palan})  ·  face ${p.direction.face}`,
    sub: `${E.localHHMM(p.start, tz)}-${E.localHHMM(p.end, tz)} · Yama ${p.yama} ${p.half === 'd' ? 'day' : 'night'} · your bird ${E.BIRD[config.bird]} is ${p.main.name} · ${place.name}`,
    body: [
      `SWARA: ${p.swara} — good for ${p.swaraInfo.good.slice(0, 3).join(', ').toLowerCase()}. Step out with the ${p.swaraKey === 'L' ? 'left' : 'right'} foot first.`,
      `Day favours ${p.swaraInfo.dayFavours === 'L' ? 'left' : 'right'} breath; rising sign favours ${p.swaraInfo.lagnaSwara === 'L' ? 'left' : 'right'}.`,
      '',
      'DO',
      ...p.dos.map((x) => '  • ' + x),
      '',
      "DON'T",
      ...p.donts.map((x) => '  • ' + x),
      '',
      `Direction: face ${p.direction.face} — ${p.direction.why}.`,
      `Avoid travelling: ${p.direction.avoidTravel.join(', ')}.`,
      `Hora: ${p.hora}.`,
      `Rising sign: ${p.lagna.name} (${p.lagna.nature}), rising bird ${p.lagna.bird} (${p.lagna.rel}).`,
      ...(p.notes.length ? ['', 'Note: ' + p.notes.join('; ') + '.'] : []),
      ...(p.bodyCare ? ['Take care of: ' + p.bodyCare + '.'] : []),
    ].join('\r\n'),
    closeAfterSec: Math.max(60, Math.round((p.end - Date.now()) / 1000)),
  };
  const file = path.join(os.tmpdir(), 'pakshi-popup.json');
  try { fs.writeFileSync(file, JSON.stringify(payload), 'utf8'); } catch (e) { log('popup data write failed: ' + e.message); return; }
  let proc;
  try {
    proc = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-WindowStyle', 'Hidden', '-File', path.join(DIR, 'popup.ps1'), '-DataFile', file],
      { windowsHide: true, stdio: 'ignore' });
  } catch (e) { log('popup launch failed: ' + e.message); return; }
  proc.on('error', (e) => { log('popup error: ' + e.message); if (popupProc === proc) popupProc = null; });
  popupProc = proc;
  proc.on('exit', (code) => {
    if (popupProc === proc) popupProc = null;
    if (code === 10) {
      writeJson(STATE, { ...readJson(STATE, {}), snoozeUntil: Date.now() + 60 * MIN });
      log('Snoozed for 1 hour');
    }
  });
  log(`popup ${E.localHHMM(p.start, tz)} ${p.rating.label} ${p.sub.birdName} ${p.sub.actName}`);
}

function schedule() {
  clearTimeout(timer);
  const now = Date.now();
  const ps = periodsAround(now);
  const next = ps.find((p) => p.start > now + 1000);
  if (!next) { timer = setTimeout(schedule, 10 * MIN); return; }
  // wake at the boundary, but never sleep more than 10 minutes (handles PC sleep / clock changes)
  const wait = Math.min(next.start - now + 500, 10 * MIN);
  timer = setTimeout(() => {
    if (Date.now() >= next.start && Date.now() < next.end) {
      if (!isQuiet(next.start)) showPopup(next);
    }
    schedule();
  }, wait);
}

function showNotice(verdict, title, body) {
  const file = path.join(os.tmpdir(), 'pakshi-notice.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ color: '#0D7480', verdict, title, sub: 'Swara Pancha Pakshi Compass', body, closeAfterSec: 3600 }), 'utf8');
    const proc = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-WindowStyle', 'Hidden', '-File', path.join(DIR, 'popup.ps1'), '-DataFile', file],
      { windowsHide: true, stdio: 'ignore' });
    proc.on('error', (e) => log('notice error: ' + e.message));
  } catch (e) { log('notice failed: ' + e.message); }
}

// Backup for the renewal agent: warn when phone alerts are within 4 days of running out (once a day).
function checkCalendarExpiry() {
  const st = readJson(STATE, {});
  if (!Number.isFinite(st.calendarUntil)) return;
  const left = st.calendarUntil - Date.now();
  const today = new Date(Date.now() + sysTz(Date.now()) * MIN).toISOString().slice(0, 10);
  if (left > 4 * 24 * 60 * MIN || st.expiryNoticeDay === today) return;
  writeJson(STATE, { ...st, expiryNoticeDay: today });
  const until = new Date(st.calendarUntil + sysTz(st.calendarUntil) * MIN).toISOString().slice(0, 10);
  showNotice('PHONE ALERTS ENDING SOON', `Your phone alerts run until ${until}`,
    ['The automatic renewal has not run yet (it needs the Claude app open and Chrome connected).', '',
      'To renew now: open the Claude app and run the task "Pancha Pakshi Renewal Agent",',
      'or ask Claude: "renew my Pancha Pakshi phone alerts".'].join('\r\n'));
  log('expiry notice shown; alerts until ' + until);
}

let startZone = null;
function watchTimeZone() {
  execFile('tzutil.exe', ['/g'], { windowsHide: true, timeout: 10000 }, (err, out) => {
    if (err) return;
    const zone = String(out || '').trim();
    if (!zone) return;
    if (startZone === null) { startZone = zone; return; }
    if (zone !== startZone) {
      log(`Windows time zone changed (${startZone} -> ${zone}); restarting to apply it`);
      process.exit(0); // the PakshiCompass task starts it again within 10 minutes
    }
  });
}

function main() {
  const lock = net.createServer();
  lock.once('error', (e) => {
    if (e && e.code === 'EADDRINUSE') process.exit(0); // another copy is already running
    log('could not start (port 47121): ' + (e && e.message)); process.exit(1);
  });
  lock.listen(47121, '127.0.0.1', () => {
    log(`Started. Bird ${E.BIRD[config.bird]}, place ${place.name}.`);
    refreshLocation();
    setInterval(refreshLocation, 3 * 60 * MIN);
    watchTimeZone();
    setInterval(watchTimeZone, 10 * MIN);
    setTimeout(checkCalendarExpiry, 60 * 1000);
    setInterval(checkCalendarExpiry, 6 * 60 * MIN);
    const now = Date.now();
    const cur = periodsAround(now).find((p) => now >= p.start && now < p.end);
    if (cur && !isQuiet(now) && !process.argv.includes('--no-initial')) showPopup(cur);
    schedule();
  });
}

process.on('uncaughtException', (e) => { log('error: ' + (e && e.stack || e)); setTimeout(() => process.exit(1), 100); });
main();
