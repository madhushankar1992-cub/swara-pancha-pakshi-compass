/*
 * Swara Pancha Pakshi Compass — Android layer.
 * Schedules a local notification at every Pancha Pakshi sub-period (they ring offline),
 * re-plans whenever the app opens, resumes, or the place / bird changes.
 */
(function () {
  'use strict';
  const C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  const LN = C.Plugins.LocalNotifications;
  const E = window.PakshiEngine;
  const MIN = 60000;
  const DAYS_AHEAD = 4;               // about 140 alerts; re-planned every time the app opens
  const QUIET_FROM = 22 * 60 + 30;    // 22:30
  const QUIET_TO = 5 * 60;            // 05:00
  const NATAL = (window.PAKSHI_PERSONAL && window.PAKSHI_PERSONAL.natal) || null;
  const CHANNEL = 'pakshi-periods';

  const get = (k, d) => { try { const v = localStorage.getItem('pc.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const set = (k, v) => { try { localStorage.setItem('pc.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } };

  function currentPlace() {
    const p = get('place', null);
    if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) return p;
    return { name: 'Chennai', lat: 13.0827, lon: 80.2707, zone: 'Asia/Kolkata' };
  }
  function tzAt(place, ms) {
    const t = place.zone ? E.tzOffsetMin(place.zone, ms) : null;
    return t == null ? (Number.isFinite(place.tz) ? place.tz : -new Date(ms).getTimezoneOffset()) : t;
  }
  function quiet(ms, tz) {
    const d = new Date(ms + tz * MIN);
    const m = d.getUTCHours() * 60 + d.getUTCMinutes();
    return m >= QUIET_FROM || m < QUIET_TO;
  }

  function planAlerts() {
    const place = currentPlace();
    const bird = get('bird', 'V');
    const now = Date.now();
    const list = [];
    const d0 = new Date(now + tzAt(place, now) * MIN);
    for (let i = -1; i <= DAYS_AHEAD; i++) {
      const dt = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate() + i, 6));
      const tz = tzAt(place, dt.getTime());
      const day = E.computeDay({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(),
        lat: place.lat, lon: place.lon, tzMin: tz, bird, natal: NATAL });
      for (const p of day.periods) {
        if (p.start <= now + 30000 || p.start > now + DAYS_AHEAD * 1440 * MIN) continue;
        const ptz = tzAt(place, p.start);
        if (quiet(p.start, ptz)) continue;
        list.push({
          id: 100000 + list.length,
          channelId: CHANNEL,
          title: E.periodTitle(p, ptz),
          body: `Do: ${p.dos.slice(0, 2).join('; ')}. Don't: ${p.donts[0]}. Face ${p.direction.face}. ${p.swara}.`,
          largeBody: E.periodBody(p, ptz),
          schedule: { at: new Date(p.start), allowWhileIdle: true },
          smallIcon: 'ic_stat_pakshi',
          autoCancel: true,
        });
      }
    }
    if (list.length) {
      const last = list[list.length - 1];
      list.push({
        id: 199999, channelId: CHANNEL,
        title: 'Open Swara Pancha Pakshi Compass',
        body: 'Open the app once to plan the next days of alerts.',
        schedule: { at: new Date(last.schedule.at.getTime() + 5 * MIN), allowWhileIdle: true },
        smallIcon: 'ic_stat_pakshi', autoCancel: true,
      });
    }
    return { list, place, bird };
  }

  let busy = false;
  async function reschedule(reason) {
    if (busy) return;
    busy = true;
    try {
      const perm = await LN.checkPermissions();
      if (perm.display !== 'granted') {
        const r = await LN.requestPermissions();
        if (r.display !== 'granted') { showStatus('Allow notifications for this app to get period alerts.'); return; }
      }
      const pending = await LN.getPending();
      if (pending.notifications && pending.notifications.length) {
        await LN.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
      }
      const { list, place, bird } = planAlerts();
      // Android allows about 500 pending alarms per app; stay well below
      const batch = list.slice(0, 400);
      if (batch.length) await LN.schedule({ notifications: batch });
      const until = batch.length > 1 ? batch[batch.length - 2].schedule.at : null;
      set('nativePlan', { sig: signature(), until: until ? until.getTime() : 0, count: batch.length - 1, at: Date.now() });
      showStatus(`${Math.max(0, batch.length - 1)} alerts planned for ${place.name} (${E.BIRD[bird] || bird}) until ${until ? until.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}. They ring even offline.`);
    } catch (e) {
      showStatus('Could not plan alerts: ' + (e && e.message ? e.message : e));
    } finally {
      busy = false;
    }
  }

  function signature() {
    const p = currentPlace();
    return [p.lat.toFixed(2), p.lon.toFixed(2), p.zone || p.tz, get('bird', 'V'), new Date().toDateString()].join('|');
  }

  function showStatus(text) {
    const note = document.getElementById('saveNote');
    if (note) note.textContent = text;
  }

  function adaptAlertsPanel() {
    for (const id of ['icsBtn', 'appBtn']) { const b = document.getElementById(id); if (b) b.hidden = true; }
    const panel = document.getElementById('alertsPanel');
    if (!panel || document.getElementById('nativeRefresh')) return;
    const p = panel.querySelector('p.note');
    if (p) p.textContent = 'This phone rings an alert at every period change, even offline. Alerts are planned 4 days ahead and re-planned each time you open the app.';
    const btn = document.createElement('button');
    btn.className = 'btn'; btn.id = 'nativeRefresh'; btn.type = 'button'; btn.textContent = 'Re-plan alerts now';
    btn.onclick = () => reschedule('button');
    const row = panel.querySelector('.row');
    if (row) row.appendChild(btn);
  }

  async function boot() {
    adaptAlertsPanel();
    try {
      await LN.createChannel({ id: CHANNEL, name: 'Pancha Pakshi periods', description: 'An alert at every Pancha Pakshi sub-period', importance: 4, visibility: 1, vibration: true });
    } catch (e) { /* channel exists */ }
    try { if (C.Plugins.Geolocation) await C.Plugins.Geolocation.requestPermissions(); } catch (e) { /* user may decline */ }
    await reschedule('start');
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      const plan = get('nativePlan', null);
      if (!plan || plan.sig !== signature() || Date.now() - plan.at > 6 * 60 * MIN) reschedule('resume');
    });
    // place or bird changed inside the app (GPS move, town picker, bird switch)
    setInterval(() => {
      const plan = get('nativePlan', null);
      if (!plan || plan.sig !== signature()) reschedule('change');
    }, 60 * 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
