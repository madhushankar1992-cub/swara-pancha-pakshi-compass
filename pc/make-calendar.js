/*
 * Makes the phone-alert calendar files (.ics) for Google Calendar / iPhone Calendar.
 *   node make-calendar.js                  -> 30 days from today (first-time setup)
 *   node make-calendar.js --renew          -> only the days AFTER the current coverage, up to 30 days ahead
 *   node make-calendar.js --confirm        -> after a successful import: record the new coverage
 *   options: --days 30  --city Madurai --lat 9.9252 --lon 78.1198  --tz 330
 * Place: last location detected by the pop-up service (Windows location), else config.json.
 * Time zone: the Windows time zone, unless --tz is given.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('./pakshi-engine.js');

const MIN = 60000;
const DAY = 1440 * MIN;
const STATE = path.join(__dirname, 'state.json');
const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d; };
const flag = (name) => process.argv.includes('--' + name);
const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return {}; } };
const writeState = (patch) => { fs.writeFileSync(STATE + '.tmp', JSON.stringify({ ...readState(), ...patch }, null, 2)); fs.renameSync(STATE + '.tmp', STATE); };
const fmtDate = (ms, tz) => new Date(ms + tz * MIN).toISOString().slice(0, 10);

if (flag('confirm')) {
  const st = readState();
  if (!st.pendingUntil) { console.log('Nothing to confirm.'); process.exit(0); }
  writeState({ calendarUntil: st.pendingUntil, calendarPlace: st.pendingPlace, pendingUntil: null, pendingPlace: null });
  console.log(`Confirmed: phone alerts now run until ${fmtDate(st.pendingUntil, -new Date().getTimezoneOffset())}.`);
  process.exit(0);
}

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const st = readState();
const base = st.place && Number.isFinite(st.place.lat) ? st.place : cfg.place;
const place = {
  name: arg('city', base.name),
  lat: parseFloat(arg('lat', base.lat)),
  lon: parseFloat(arg('lon', base.lon)),
  tz: parseInt(arg('tz', -new Date().getTimezoneOffset()), 10),
};
const days = Math.min(90, Math.max(1, parseInt(arg('days', 30), 10)));
const now = Date.now();
const today = (() => { const d = new Date(now + place.tz * MIN); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); })();
const lastWanted = today + (days - 1) * DAY;

// first civil date to generate (00:00 UTC of that date is used as a date key)
let first = today;
if (flag('renew') && st.calendarUntil) {
  // calendarUntil = the sunrise after the last covered day, so that sunrise's date is the next day to add
  const d = new Date(st.calendarUntil + place.tz * MIN);
  first = Math.max(today, Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
if (first > lastWanted) {
  console.log(`Already covered until ${fmtDate(st.calendarUntil, place.tz)}; nothing to add.`);
  process.exit(0);
}

const out = [];
for (let t = first; t <= lastWanted; t += DAY) {
  const dt = new Date(t);
  out.push(E.computeDay({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(),
    lat: place.lat, lon: place.lon, tzMin: place.tz, bird: cfg.bird, natal: cfg.natal }));
}
out[0].periods = out[0].periods.filter((p) => p.end > now); // drop periods that already ended

// 15-day files keep each import small and reliable; old generated files are replaced
const stamp = new Date(first).toISOString().slice(0, 10);
const safe = place.name.replace(/[^A-Za-z0-9]+/g, '-');
const PART = 15;
const parts = Math.ceil(out.length / PART);
for (const f of fs.readdirSync(__dirname)) if (/^Pancha-Pakshi-.*\.ics$/.test(f)) fs.unlinkSync(path.join(__dirname, f));
for (let k = 0; k < parts; k++) {
  const chunk = out.slice(k * PART, (k + 1) * PART);
  const ics = E.buildICS(chunk, { place: place.name, tz: place.tz, quietFrom: cfg.quietFrom, quietTo: cfg.quietTo });
  const file = path.join(__dirname, `Pancha-Pakshi-${safe}-from-${stamp}${parts > 1 ? `-part${k + 1}` : ''}.ics`);
  fs.writeFileSync(file, ics, 'utf8');
  const n = ics.split('BEGIN:VEVENT').length - 1;
  console.log(`FILE ${file}  (${n} alerts, ${chunk.length} days, FIRST_DAY ${fmtDate(chunk[0].sunrise, place.tz)}, LAST_DAY ${fmtDate(chunk[chunk.length - 1].sunrise, place.tz)})`);
}
const until = out[out.length - 1].nextSunrise;
if (flag('renew')) {
  writeState({ pendingUntil: until, pendingPlace: place.name });
  console.log(`After importing, run: node make-calendar.js --confirm   (coverage will be until ${fmtDate(until, place.tz)})`);
} else {
  writeState({ calendarUntil: until, calendarPlace: place.name, pendingUntil: null, pendingPlace: null });
}
console.log(`LAST_DAY ${fmtDate(out[out.length - 1].sunrise, place.tz)}  PLACE ${place.name}`);
