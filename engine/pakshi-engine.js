/*
 * Pancha Pakshi engine — Bhogar system + Swara + Vedic timings.
 * The Bhogar timetables are NOT part of this file: they load from pakshi-data.js (git-ignored),
 * which you generate from your own course PDFs with engine/parse_pdfs.py.
 * Sidereal positions: astronomy-engine + Lahiri (Chitrapaksha) ayanamsa, validated
 * against published Chennai panchang (sunrise, tithi, nakshatra, Rahu, Yamagandam).
 * Works in the browser (globals Astronomy, PAKSHI_TABLES) and in Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('astronomy-engine'), require('./pakshi-data.js'));
  } else {
    root.PakshiEngine = factory(root.Astronomy, root.PAKSHI_TABLES);
  }
})(typeof self !== 'undefined' ? self : this, function (A, TABLES) {
  'use strict';

  const MIN = 60000;
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const RASI = ['Mesham (Aries)', 'Rishabam (Taurus)', 'Mithunam (Gemini)', 'Kadagam (Cancer)',
    'Simmam (Leo)', 'Kanni (Virgo)', 'Thulam (Libra)', 'Viruchigam (Scorpio)',
    'Dhanusu (Sagittarius)', 'Magaram (Capricorn)', 'Kumbam (Aquarius)', 'Meenam (Pisces)'];
  const NAKSHATRA = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashirsha', 'Thiruvathirai (Ardra)',
    'Punarpoosam', 'Poosam', 'Ayilyam', 'Magam', 'Pooram', 'Uthiram', 'Hastham', 'Chithirai',
    'Swathi', 'Visakam', 'Anusham', 'Kettai', 'Moolam', 'Pooradam', 'Uthiradam', 'Thiruvonam',
    'Avittam', 'Sathayam', 'Poorattathi', 'Uthirattathi', 'Revathi'];
  const TITHI = ['Prathamai', 'Dvitiyai', 'Tritiyai', 'Chaturthi', 'Panchami', 'Shashti', 'Saptami',
    'Ashtami', 'Navami', 'Dasami', 'Ekadasi', 'Dvadasi', 'Trayodasi', 'Chaturdasi'];

  const BIRD = { V: 'Vulture', O: 'Owl', C: 'Crow', K: 'Cock', P: 'Peacock' };
  const ACT = { R: 'Ruling', E: 'Eating', W: 'Walking', S: 'Sleeping', D: 'Dying' };
  const PALAN = { 5: 'Very good', 4: 'Good', 3: 'Medium', 2: 'Bad', 1: 'Very bad' };
  const REL = { s: 'Self', f: 'Friend', e: 'Enemy' };
  // Sub-period minutes inside each 144-minute yama (traditional Bhogar durations)
  const DUR = {
    s: { d: { E: 30, W: 36, R: 48, S: 18, D: 12 }, n: { E: 30, W: 30, R: 24, S: 24, D: 36 } },
    k: { d: { E: 48, W: 36, R: 18, S: 12, D: 30 }, n: { E: 42, W: 42, R: 18, S: 18, D: 24 } },
  };

  // Bird attributes per paksha (traditional Bhogar directions, colours, friends, enemies, body parts)
  const META = {
    V: {
      s: { dir: 'East', colour: 'Yellow', friends: 'PO', enemies: 'CK', body: 'neck, upper belly, back of abdomen, back of legs' },
      k: { dir: 'East', colour: 'Black', friends: 'PC', enemies: 'OK', body: 'head, neck, eyes, ears' },
    },
    O: {
      s: { dir: 'South', colour: 'White', friends: 'VC', enemies: 'KP', body: 'mouth, lower belly, calves' },
      k: { dir: 'North', colour: 'Red', friends: 'KC', enemies: 'VP', body: 'shoulders, both arms' },
    },
    C: {
      s: { dir: 'West', colour: 'Red', friends: 'KO', enemies: 'VP', body: 'nose, belly, feet, buttocks' },
      k: { dir: 'South', colour: 'Yellow', friends: 'VO', enemies: 'KP', body: 'ribs' },
    },
    K: {
      s: { dir: 'North', colour: 'Green', friends: 'PC', enemies: 'VO', body: 'forehead, chest, fingers and toes' },
      k: { dir: 'Centre', colour: 'White', friends: 'PO', enemies: 'VC', body: 'middle of the chest' },
    },
    P: {
      s: { dir: 'Centre', colour: 'Black', friends: 'VK', enemies: 'OC', body: 'hair, skin, private parts' },
      k: { dir: 'West', colour: 'Green', friends: 'VK', enemies: 'OC', body: 'back, back of neck, below the waist' },
    },
  };

  // Rising sign (lagna) -> bird, per paksha (traditional five-way method)
  const LAGNA_BIRD = {
    s: ['V', 'O', 'C', 'K', 'P', 'V', 'O', 'C', 'K', 'P', 'V', 'K'],
    k: ['P', 'K', 'C', 'O', 'V', 'P', 'K', 'C', 'O', 'V', 'P', 'O'],
  };
  const LAGNA_NATURE = ['Movable', 'Fixed', 'Dual'];
  const TITHI_CLASS = ['Nanda', 'Bhadra', 'Jaya', 'Rikta', 'Purna'];

  const RAHU = { sun: 8, mon: 2, tue: 7, wed: 5, thu: 6, fri: 4, sat: 3 };
  const YAMA = { sun: 5, mon: 4, tue: 3, wed: 2, thu: 1, fri: 7, sat: 6 };
  const KULI = { sun: 7, mon: 6, tue: 5, wed: 4, thu: 3, fri: 2, sat: 1 };
  const SOOLAM = {
    sun: ['West', 'jaggery'], mon: ['East', 'curd'], tue: ['North', 'milk'], wed: ['North', 'milk'],
    thu: ['South', 'sesame oil'], fri: ['West', 'jaggery'], sat: ['East', 'sesame oil'],
  };
  const HORA_SEQ = ['Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars'];
  const DAY_LORD = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  const TARA = [
    ['Janma', -0.25], ['Sampat', 0.25], ['Vipat', -0.25], ['Kshema', 0.25], ['Pratyak', -0.25],
    ['Sadhana', 0.25], ['Naidhana', -0.25], ['Mitra', 0.25], ['Parama Mitra', 0.25],
  ];

  // Traditional Ashtakarma windows (paksha, day or night, facing direction)
  const ASHTAKARMA = [
    { name: 'Vasiyam (influence, goodwill)', paksha: 's', half: 'd', face: 'East', lagna: 1 },
    { name: 'Akarshanam (attraction)', paksha: 's', half: 'd', face: 'East', lagna: 0 },
    { name: 'Mohanam (charm)', paksha: 's', half: 'n', face: 'North', lagna: 1 },
    { name: 'Stambhanam (stopping illness, obstacles)', paksha: '*', half: 'n', face: 'North', lagna: 1 },
    { name: 'Uchadanam (removing evil, disease)', paksha: 'k', half: 'd', face: 'West', lagna: 0 },
    { name: 'Vidveshanam (separating from harm)', paksha: 'k', half: 'd', face: 'East', lagna: 0 },
    { name: 'Bhedanam (breaking bad influence)', paksha: '*', half: 'n', face: 'South', lagna: 2 },
    { name: 'Maranam (ending karmic and black-magic effects)', paksha: 's', half: 'n', face: 'South', lagna: 2 },
  ];

  const OPP = { East: 'West', West: 'East', North: 'South', South: 'North', Centre: 'Centre' };
  // Shiva Swarodaya: Mon/Wed/Thu/Fri favour the left (Moon) breath, Sun/Tue/Sat the right (Sun) breath;
  // even signs (Taurus, Cancer, Virgo, Scorpio, Capricorn, Pisces) rise with the left breath, odd signs with the right.
  const SWARA_DAY = { sun: 'R', mon: 'L', tue: 'R', wed: 'L', thu: 'L', fri: 'L', sat: 'R' };
  const SWARA_ACTS = {
    L: { name: 'Left · Moon (Ida)', good: ['Lasting and gentle work', 'Buying jewellery, clothes, property', 'Starting long journeys', 'Learning, mantra, meeting elders and superiors', 'Healing, cooling food and medicine'], avoid: ['Fights, hard physical work', 'Travelling East or North'] },
    R: { name: 'Right · Sun (Pingala)', good: ['Hard and active work', 'Exercise, sports, competition', 'Debates, negotiations that need force', 'Eating a full meal, bathing', 'Technical or mechanical work'], avoid: ['Gentle, long-term beginnings', 'Travelling West or South'] },
    B: { name: 'Both · Sushumna', good: ['Meditation and prayer only'], avoid: ['Starting any worldly work'] },
  };

  // ---------- astronomy ----------
  const T = (ms) => A.MakeTime(new Date(ms));
  function ayanamsa(t) {
    const c = t.tt / 36525;
    return 23.85709 + (5028.796195 * c + 1.1054348 * c * c) / 3600 + A.e_tilt(t).dpsi / 3600;
  }
  const norm = (x) => ((x % 360) + 360) % 360;
  const sunTrop = (t) => norm(A.SunPosition(t).elon);
  const moonTrop = (t) => norm(A.EclipticGeoMoon(t).lon);
  const moonSid = (t) => norm(moonTrop(t) - ayanamsa(t));
  function ascSid(t, lat, lon) {
    const ramc = (norm(A.SiderealTime(t) * 15 + lon) * Math.PI) / 180;
    const eps = (A.e_tilt(t).tobl * Math.PI) / 180;
    const phi = (lat * Math.PI) / 180;
    const asc = (Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) * 180) / Math.PI;
    return norm(asc - ayanamsa(t));
  }
  const elong = (ms) => { const t = T(ms); return norm(moonTrop(t) - sunTrop(t)); };
  const tithiAt = (ms) => Math.floor(elong(ms) / 12);
  const nakAt = (ms) => Math.floor(moonSid(T(ms)) / (360 / 27));
  const moonRasiAt = (ms) => Math.floor(moonSid(T(ms)) / 30);
  const lagnaAt = (ms, lat, lon) => Math.floor(ascSid(T(ms), lat, lon) / 30);

  // first instant after `ms` at which fn changes (searched up to `maxMin`), to ~10 s
  function nextChange(fn, ms, maxMin, stepMin) {
    const v0 = fn(ms);
    let a = ms;
    const end = ms + maxMin * MIN;
    while (a < end) {
      const b = Math.min(a + stepMin * MIN, end);
      if (fn(b) !== v0) {
        let lo = a, hi = b;
        while (hi - lo > 10000) { const mid = (lo + hi) / 2; if (fn(mid) === v0) lo = mid; else hi = mid; }
        return hi;
      }
      a = b;
    }
    return null;
  }
  function prevChange(fn, ms, maxMin, stepMin) {
    const v0 = fn(ms);
    let b = ms;
    const end = ms - maxMin * MIN;
    while (b > end) {
      const a = Math.max(b - stepMin * MIN, end);
      if (fn(a) !== v0) {
        let lo = a, hi = b;
        while (hi - lo > 10000) { const mid = (lo + hi) / 2; if (fn(mid) === v0) hi = mid; else lo = mid; }
        return hi;
      }
      b = a;
    }
    return null;
  }

  function sunEvents(dateLocalMidnightMs, lat, lon) {
    const obs = new A.Observer(lat, lon, 0);
    const t0 = T(dateLocalMidnightMs);
    const rise = A.SearchRiseSet(A.Body.Sun, obs, +1, t0, 1.2);
    const set = A.SearchRiseSet(A.Body.Sun, obs, -1, rise, 1.2);
    const next = A.SearchRiseSet(A.Body.Sun, obs, +1, set, 1.2);
    return { sunrise: rise.date.getTime(), sunset: set.date.getTime(), nextSunrise: next.date.getTime() };
  }

  // Paksha at an instant; Amavasai/Pournami flip after half the tithi has elapsed
  function pakshaAt(ms) {
    const ti = tithiAt(ms);
    if (ti !== 14 && ti !== 29) return ti < 15 ? 's' : 'k';
    const start = prevChange(tithiAt, ms, 2 * 1440, 60) || ms;
    const end = nextChange(tithiAt, ms, 2 * 1440, 60) || ms;
    const past = (ms - start) / Math.max(1, end - start) >= 0.5;
    if (ti === 14) return past ? 'k' : 's';
    return past ? 's' : 'k';
  }

  function swaraAtSunrise(ti) {
    const block = Math.floor((ti % 15) / 3);
    const shukla = ti < 15;
    const left = shukla ? block % 2 === 0 : block % 2 === 1;
    return left ? 'L' : 'R';
  }

  // ---------- day model ----------
  function decodeHalf(bird, paksha, day, half) {
    const s = TABLES[bird][paksha][day][half];
    const subs = [];
    for (let i = 2; i < s.length; i += 4) subs.push({ bird: s[i], act: s[i + 1], palan: +s[i + 2], rel: s[i + 3] });
    return { padu: s[0], adhikara: s[1], subs };
  }

  function rulingBirdOfYama(paksha, day, half, yi) {
    for (const b of 'VOCKP') {
      if (decodeHalf(b, paksha, day, half).subs[yi * 5].act === 'R') return b;
    }
    return null;
  }

  function overlap(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }

  /**
   * Compute one Vedic day (sunrise -> next sunrise) for a civil date at a location.
   * opts: { y, m, d, lat, lon, tzMin (minutes east of UTC), bird, natal: { moonRasi, nak } }
   */
  function computeDay(opts) {
    const { lat, lon, bird } = opts;
    const tz = opts.tzMin != null ? opts.tzMin : 330;
    const midnight = Date.UTC(opts.y, opts.m - 1, opts.d) - tz * MIN;
    const ev = sunEvents(midnight, lat, lon);
    const dow = new Date(ev.sunrise + tz * MIN).getUTCDay();
    const day = DAYS[dow];
    // birth Moon sign / star (optional): enables Chandrashtamam and Tara bala
    const natal = opts.natal && Number.isFinite(opts.natal.moonRasi) && Number.isFinite(opts.natal.nak) ? opts.natal : null;

    const tiRise = tithiAt(ev.sunrise);
    const nakRise = nakAt(ev.sunrise);
    const moonRasi = moonRasiAt(ev.sunrise);
    const tithiEnd = nextChange(tithiAt, ev.sunrise, 1.5 * 1440, 30);
    const nakEnd = nextChange(nakAt, ev.sunrise, 1.5 * 1440, 30);

    // kalams over daytime eighths
    const eighth = (ev.sunset - ev.sunrise) / 8;
    const kal = (k) => [ev.sunrise + eighth * (k - 1), ev.sunrise + eighth * k];
    const kalams = { rahu: kal(RAHU[day]), yamagandam: kal(YAMA[day]), kuligai: kal(KULI[day]) };
    const [soolamDir, soolamRemedy] = SOOLAM[day];
    const chandrashtama = natal ? (natal.moonRasi + 7) % 12 : -1;
    const taraIdx = natal ? (((nakRise - natal.nak + 27) % 27) % 9) : -1;

    const halves = [];
    const periods = [];
    for (const half of ['d', 'n']) {
      const start = half === 'd' ? ev.sunrise : ev.sunset;
      const stop = half === 'd' ? ev.sunset : ev.nextSunrise;
      const paksha = pakshaAt(start);
      const page = decodeHalf(bird, paksha, day, half);
      const meta = META[bird][paksha];
      const isPadu = page.padu === bird;
      const isAdhikara = page.adhikara === bird;
      halves.push({ half, paksha, padu: page.padu, adhikara: page.adhikara, isPadu, isAdhikara, meta });
      let offset = 0;
      for (let yi = 0; yi < 5; yi++) {
        const mainAct = page.subs[yi * 5].act;
        const ruling = rulingBirdOfYama(paksha, day, half, yi);
        for (let si = 0; si < 5; si++) {
          const sub = page.subs[yi * 5 + si];
          const dur = DUR[paksha][half][sub.act];
          let s = start + offset * MIN;
          let e = start + (offset + dur) * MIN;
          offset += dur;
          if (yi === 4 && si === 4) e = stop; // stretch/trim last sub to the real sunset/sunrise
          if (s >= stop) continue;
          if (e > stop) e = stop;
          periods.push(buildPeriod({
            s, e, half, paksha, yi, si, mainAct, sub, page, meta, isPadu, isAdhikara, ruling,
            bird, day, ev, kalams, soolamDir, chandrashtama, natal, lat, lon,
          }));
        }
      }
    }
    const swaraHours = [];
    const first = swaraAtSunrise(tiRise);
    for (let h = 0, t = ev.sunrise; t < ev.nextSunrise; h++, t += 60 * MIN) {
      swaraHours.push({ start: t, end: Math.min(t + 60 * MIN, ev.nextSunrise), key: h % 2 === 0 ? first : (first === 'L' ? 'R' : 'L') });
    }
    return {
      date: { y: opts.y, m: opts.m, d: opts.d }, lat, lon, bird, day, dayName: DAY_NAMES[dow],
      swaraHours, swaraDay: SWARA_DAY[day],
      sunrise: ev.sunrise, sunset: ev.sunset, nextSunrise: ev.nextSunrise,
      tithi: { index: tiRise, name: tithiName(tiRise), paksha: tiRise < 15 ? 'Valarpirai (waxing)' : 'Theipirai (waning)', endsAt: tithiEnd, class: tithiClass(tiRise) },
      nakshatra: { index: nakRise, name: NAKSHATRA[nakRise], endsAt: nakEnd },
      moonRasi: { index: moonRasi, name: RASI[moonRasi] },
      chandrashtama: moonRasi === chandrashtama,
      tara: taraIdx >= 0 ? { name: TARA[taraIdx][0], good: TARA[taraIdx][1] > 0 } : { name: 'not set (add your birth star)', good: true },
      kalams, soolam: { dir: soolamDir, remedy: soolamRemedy },
      swaraAtSunrise: swaraAtSunrise(tiRise),
      halves, periods,
    };
  }

  function tithiName(ti) {
    if (ti === 14) return 'Pournami (full moon)';
    if (ti === 29) return 'Amavasai (new moon)';
    return TITHI[ti % 15];
  }
  function tithiClass(ti) { return ti === 29 ? 'Purna' : TITHI_CLASS[(ti % 15) % 5]; }

  function swaraAt(ms, ev, tiRise) {
    const first = swaraAtSunrise(tiRise);
    const hours = Math.floor((ms - ev.sunrise) / (60 * MIN));
    return hours % 2 === 0 ? first : (first === 'L' ? 'R' : 'L');
  }

  function horaAt(ms, ev, dow) {
    const h = Math.floor((ms - ev.sunrise) / (60 * MIN));
    const startIdx = HORA_SEQ.indexOf(DAY_LORD[dow]);
    return HORA_SEQ[(startIdx + h) % 7];
  }

  // ---------- interpretation ----------
  const ACT_DO = {
    R: ['Start important work', 'Meet officials, bosses or clients', 'Ask for favours, interviews, negotiations', 'Sign agreements'],
    E: ['Money matters, sales, purchases', 'Business talks and follow-ups', 'Study, learning, eating well', 'Travel toward your bird\'s direction'],
    W: ['Routine work and errands', 'Short trips, calls, emails', 'Planning and preparation', 'Light exercise'],
    S: ['Rest, reflect, plan quietly', 'Finish pending small tasks', 'Prayer or meditation'],
    D: ['Prayer, meditation, rest', 'Cleaning, closing old matters', 'Stay calm and patient'],
  };
  const ACT_DONT = {
    R: ['Avoid arrogance or overconfidence'],
    E: ['Avoid overeating and impulse spending'],
    W: ['Avoid starting big commitments now'],
    S: ['Avoid new beginnings', 'Avoid lending money or signing', 'Avoid arguments and debates'],
    D: ['Avoid new beginnings, signing or money transfers', 'Avoid travel and confrontations', 'Avoid risky activities (be careful with the body parts below)'],
  };

  function ratingOf(score) {
    if (score >= 1.75) return { key: 'excellent', label: 'Excellent', emoji: '🟢' };
    if (score >= 0.75) return { key: 'good', label: 'Good', emoji: '🟢' };
    if (score >= -0.5) return { key: 'average', label: 'Average', emoji: '🟡' };
    if (score >= -1.5) return { key: 'poor', label: 'Weak', emoji: '🟠' };
    return { key: 'avoid', label: 'Avoid', emoji: '🔴' };
  }

  function buildPeriod(c) {
    const { s, e, sub, mainAct, meta, ev, kalams } = c;
    const mid = s + (e - s) / 2;
    const dow = DAYS.indexOf(c.day);
    const tiRise = tithiAt(ev.sunrise);
    let score = { 5: 2, 4: 1, 3: 0, 2: -1, 1: -2 }[sub.palan];
    const notes = [];
    if (c.isPadu) { score -= 1.5; notes.push('Padu Pakshi period for your bird — avoid new beginnings'); }
    if (c.isAdhikara) { score += 0.5; notes.push('Your bird holds authority (Adhikara) now'); }
    const len = e - s;
    const inRahu = overlap(s, e, ...kalams.rahu) > len / 3;
    const inYama = overlap(s, e, ...kalams.yamagandam) > len / 3;
    const inKuli = overlap(s, e, ...kalams.kuligai) > len / 3;
    if (inRahu) { score -= 1.5; notes.push('Rahu Kalam'); }
    if (inYama) { score -= 1.5; notes.push('Yamagandam'); }
    if (inKuli) { score -= 0.5; notes.push('Kuligai (repeats what you start)'); }
    if (c.natal) {
      if (moonRasiAt(mid) === (c.natal.moonRasi + 7) % 12) { score -= 1; notes.push('Chandrashtamam — extra caution today'); }
      const taraIdx = (((nakAt(mid) - c.natal.nak + 27) % 27) % 9);
      score += TARA[taraIdx][1];
    }

    const swara = swaraAt(mid, ev, tiRise);
    const hora = horaAt(mid, ev, dow);
    const lagna = lagnaAt(mid, c.lat, c.lon);
    const lagnaBird = LAGNA_BIRD[c.paksha][lagna];
    const lagnaRel = lagnaBird === c.bird ? 'Self' : META[c.bird][c.paksha].friends.includes(lagnaBird) ? 'Friend'
      : META[c.bird][c.paksha].enemies.includes(lagnaBird) ? 'Enemy' : 'Neutral';
    if (lagnaRel === 'Self' || lagnaRel === 'Friend') score += 0.25;
    if (lagnaRel === 'Enemy') score -= 0.25;
    const lagnaSwara = lagna % 2 === 1 ? 'L' : 'R';
    const harmony = (SWARA_DAY[c.day] === swara ? 1 : 0) + (lagnaSwara === swara ? 1 : 0);
    if (harmony === 2) score += 0.25;
    if (harmony === 0) score -= 0.25;

    // directions
    const strong = sub.palan >= 4 && (sub.act === 'R' || sub.act === 'E' || mainAct === 'R' || mainAct === 'E');
    const ruling = c.ruling;
    const rulingDir = META[ruling][c.paksha].dir;
    const face = strong ? meta.dir : rulingDir;
    const swaraAvoid = swara === 'R' ? ['West', 'South'] : ['East', 'North'];
    const avoidTravel = Array.from(new Set([c.soolamDir, ...swaraAvoid]));
    const travelOk = strong && meta.dir !== 'Centre' && !avoidTravel.includes(meta.dir);

    const rating = ratingOf(score);
    // advice follows the overall verdict first, then the sub-period's activity
    let dos, donts;
    if (rating.key === 'excellent' || rating.key === 'good') {
      dos = ACT_DO[sub.act].slice();
      donts = ACT_DONT[sub.act].slice();
    } else if (rating.key === 'average') {
      dos = ['Routine work, follow-ups and errands', 'Calls, emails, planning and preparation'];
      if (sub.act === 'R' || sub.act === 'E') dos.push('Small, low-risk steps on important matters');
      donts = ['Avoid big launches, signing or large payments'];
      if (sub.act === 'S' || sub.act === 'D') donts.push(...ACT_DONT[sub.act].slice(0, 2));
    } else {
      dos = ACT_DO[sub.act === 'D' ? 'D' : 'S'].slice();
      donts = ACT_DONT[sub.act === 'D' ? 'D' : 'S'].slice();
    }
    if (mainAct === 'D' || mainAct === 'S') donts.push(`Your bird is ${ACT[mainAct]} this yama — keep it low-key`);
    if (rating.key === 'avoid') donts.unshift('Do not start anything important now');
    if (inRahu || inYama) donts.unshift('Avoid new starts (Rahu / Yamagandam)');
    if (sub.act === 'W' && rating.key !== 'avoid') dos.push(`Wear ${meta.colour.toLowerCase()} for success`);
    dos.push(swara === 'L'
      ? 'Left nostril (Moon) hour: calm, lasting work — learning, buying, meeting elders, healing'
      : 'Right nostril (Sun) hour: active work — exercise, hard tasks, debates, eating');

    // Ashtakarma suitability now, with lagna + tithi
    const lagnaNature = LAGNA_NATURE[lagna % 3];
    const tiNow = tithiAt(mid);
    const tClass = tithiClass(tiNow);
    const karmas = ASHTAKARMA.filter((k) => (k.paksha === '*' || k.paksha === c.paksha) && k.half === c.half).map((k) => {
      let strength = (sub.act === 'R' || sub.act === 'E') && sub.palan >= 4 ? 'Strong' : sub.palan >= 3 ? 'Fair' : 'Weak';
      if (lagna % 3 === k.lagna && strength !== 'Weak') strength = strength === 'Fair' ? 'Strong' : 'Very strong';
      if (tClass === 'Rikta' && k.lagna === 1) strength = 'Weak';
      return { name: k.name, face: k.face, strength };
    });

    return {
      start: s, end: e, half: c.half, paksha: c.paksha, yama: c.yi + 1,
      main: { act: mainAct, name: ACT[mainAct] },
      sub: { bird: sub.bird, birdName: BIRD[sub.bird], act: sub.act, actName: ACT[sub.act], palan: PALAN[sub.palan], palanNum: sub.palan, rel: REL[sub.rel] },
      score: Math.round(score * 100) / 100, rating,
      notes, dos: dos.slice(0, 5), donts: donts.slice(0, 4),
      direction: {
        face, why: strong ? `your bird is strong — face its direction (${meta.dir})` : `your bird is weak — face the ruling bird ${BIRD[ruling]} (${rulingDir})`,
        travelOk, ownDir: meta.dir, avoidTravel, soolam: c.soolamDir, rulingBird: BIRD[ruling],
      },
      swara: swara === 'L' ? 'Left (Moon, Ida)' : 'Right (Sun, Pingala)', swaraKey: swara,
      swaraInfo: { key: swara, name: SWARA_ACTS[swara].name, dayFavours: SWARA_DAY[c.day], lagnaSwara, harmony,
        good: SWARA_ACTS[swara].good, avoid: SWARA_ACTS[swara].avoid },
      hora, lagna: { index: lagna, name: RASI[lagna], nature: lagnaNature, bird: BIRD[lagnaBird], rel: lagnaRel },
      tithiNow: { name: tithiName(tiNow), class: tClass },
      ashtakarma: karmas, bodyCare: (sub.act === 'D' || sub.act === 'S' || mainAct === 'D') ? meta.body : null,
      flags: { rahu: inRahu, yamagandam: inYama, kuligai: inKuli, padu: c.isPadu },
    };
  }

  function birthBird(input) {
    // input: { paksha:'s'|'k', nameVowel:'a'|'i'|'u'|'e'|'o', lagna, rasi, nak, tithi }
    const NAME = { s: { a: 'V', i: 'O', u: 'C', e: 'K', o: 'P' }, k: { a: 'K', i: 'V', u: 'O', e: 'P', o: 'C' } };
    const RASI_B = {
      s: ['V', 'K', 'O', 'O', 'V', 'O', 'K', 'V', 'C', 'P', 'P', 'C'],
      k: ['K', 'O', 'P', 'P', 'C', 'C', 'V', 'K', 'O', 'C', 'O', 'V'],
    };
    const nakGroup = (n) => (n < 5 ? 0 : n < 11 ? 1 : n < 16 ? 2 : n < 21 ? 3 : 4);
    const NAK_B = { s: 'VOCKP', k: 'PKCOV' };
    const TITHI_B = { s: 'VOCKP', k: 'PKCOV' };
    const tg = (t) => (t === 14 || t === 29 ? 4 : (t % 15) % 5);
    const p = input.paksha;
    const votes = {
      name: NAME[p][input.nameVowel], lagna: LAGNA_BIRD[p][input.lagna], rasi: RASI_B[p][input.rasi],
      nakshatra: NAK_B[p][nakGroup(input.nak)],
      tithi: (input.tithi === 14 || input.tithi === 29) ? (p === 's' ? 'P' : 'V') : TITHI_B[p][tg(input.tithi)],
    };
    const count = {};
    Object.values(votes).forEach((b) => { count[b] = (count[b] || 0) + 1; });
    const sorted = Object.entries(count).sort((a, b) => b[1] - a[1]);
    let chosen, rule;
    if (sorted[0][1] >= 3 || (sorted[0][1] === 2 && (!sorted[1] || sorted[1][1] < 2))) { chosen = sorted[0][0]; rule = 'majority'; }
    else if (sorted.length === 3 && sorted[0][1] === 2 && sorted[1][1] === 2) { chosen = sorted[2][0]; rule = 'two pairs tie — the lone bird is chosen (five-way rule)'; }
    else { chosen = votes.name; rule = 'all different — the name bird is chosen (five-way rule)'; }
    return { votes, chosen, rule };
  }

  /** Minutes east of UTC for an IANA time zone at instant ms (DST-aware); null if the zone is unknown. */
  function tzOffsetMin(zone, ms) {
    try {
      const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit',
        day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const p = {};
      for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
      const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
      return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / MIN);
    } catch (e) { return null; }
  }

  // ---------- calendar export (phone alerts) ----------
  const pad2 = (n) => String(n).padStart(2, '0');
  function icsStamp(ms) {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
  }
  function localHHMM(ms, tz) {
    const d = new Date(ms + tz * MIN);
    return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  }
  const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  function icsFold(line) {
    // fold at 73 UTF-8 octets, never splitting a code point
    const out = [];
    let cur = '', bytes = 0;
    for (const ch of line) {
      const cp = ch.codePointAt(0);
      const n = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      if (bytes + n > 73) { out.push(cur); cur = ' '; bytes = 1; }
      cur += ch; bytes += n;
    }
    out.push(cur);
    return out.join('\r\n');
  }

  /** A short spoken summary of a period, for text-to-speech. birdName is the user's bird (optional). */
  function speakTime(ms, tz) {
    const d = new Date(ms + tz * MIN);
    const h = d.getUTCHours(), m = d.getUTCMinutes();
    if (h === 0 && m === 0) return 'midnight';
    if (h === 12 && m === 0) return 'noon';
    return `${h % 12 || 12}${m ? ':' + pad2(m) : ''} ${h < 12 ? 'a.m.' : 'p.m.'}`;
  }
  function periodSpeech(p, tz, now, birdName) {
    const left = Math.max(0, Math.round((p.end - (now || Date.now())) / MIN));
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    const tidy = (t) => cap(t.replace(/\s*—\s*/g, ', ').replace(/\s*\/\s*/g, ' or ').replace(/\s*\(([^)]*)\)/g, ', $1'));
    const dos = p.dos.filter((x) => !/nostril/i.test(x)).slice(0, 3).map(tidy);
    const avoid = p.donts.slice(0, 2).map((x) => tidy(x.replace(/^Avoid\s+/i, '').replace(/^Do not start/i, 'starting').replace(/^Do not\s+/i, '')));
    const breathGood = (p.swaraInfo && p.swaraInfo.good[0] || '').toLowerCase();
    const parts = [
      `${p.rating.label} period until ${speakTime(p.end, tz)}, ${left} minute${left === 1 ? '' : 's'} left.`,
      `Your ${birdName || 'bird'} is ${p.main.name.toLowerCase()} this yama. The sub-period is ${p.sub.birdName} ${p.sub.actName.toLowerCase()}, ${p.sub.palan.toLowerCase()}.`,
      dos.length ? `Do: ${dos.join('. ')}.` : '',
      avoid.length ? `Avoid: ${avoid.join('. ')}.` : '',
      p.direction.face === 'Centre' ? 'Stay at your base, no special direction.' : `Face ${p.direction.face}.`,
      `Breath: ${p.swaraKey === 'L' ? 'left, the moon breath' : 'right, the sun breath'}${breathGood ? ', good for ' + breathGood : ''}.`,
      p.notes.length ? `Note: ${tidy(p.notes[0])}.` : '',
    ];
    return parts.filter(Boolean).join(' ');
  }

  /** Summary line used by phone notifications and PC popups. */
  function periodTitle(p, tz) {
    return `${p.rating.emoji} ${p.rating.label} till ${localHHMM(p.end, tz)} · ${p.sub.birdName} ${p.sub.actName} · Face ${p.direction.face} · ${p.swaraKey === 'L' ? '🌙 Left' : '☀️ Right'} breath`;
  }
  function periodBody(p, tz) {
    const lines = [
      `${localHHMM(p.start, tz)}-${localHHMM(p.end, tz)}  Yama ${p.yama} (${p.half === 'd' ? 'day' : 'night'}): your bird is ${p.main.name}; sub-period ${p.sub.birdName} ${p.sub.actName} = ${p.sub.palan}.`,
      `DO: ${p.dos.join('; ')}.`,
      `DON'T: ${p.donts.join('; ')}.`,
      `Direction: face ${p.direction.face} (${p.direction.why}). Avoid travelling ${p.direction.avoidTravel.join(', ')}.`,
      `Breath (Swara): ${p.swara} — good for ${p.swaraInfo.good.slice(0, 3).join(', ').toLowerCase()}. Day favours ${p.swaraInfo.dayFavours === 'L' ? 'left' : 'right'}, rising sign favours ${p.swaraInfo.lagnaSwara === 'L' ? 'left' : 'right'}. Step out with the ${p.swaraKey === 'L' ? 'left' : 'right'} foot first.`,
      `Hora: ${p.hora}. Lagna: ${p.lagna.name} (${p.lagna.nature}), rising bird ${p.lagna.bird} (${p.lagna.rel}).`,
    ];
    if (p.notes.length) lines.push(`Note: ${p.notes.join('; ')}.`);
    if (p.bodyCare) lines.push(`Take care of: ${p.bodyCare}.`);
    return lines.join('\n');
  }

  /**
   * days: array of computeDay() results. opts: { place, tz, quietFrom: 'HH:MM', quietTo: 'HH:MM' }
   * Periods that START inside quiet hours are left out.
   */
  function buildICS(days, opts) {
    const tz = opts.tz != null ? opts.tz : 330;
    const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
    const qf = toMin(opts.quietFrom || '22:30'), qt = toMin(opts.quietTo || '05:00');
    const quiet = (ms) => {
      const d = new Date(ms + tz * MIN);
      const m = d.getUTCHours() * 60 + d.getUTCMinutes();
      return qf > qt ? (m >= qf || m < qt) : (m >= qf && m < qt);
    };
    const now = icsStamp(Date.now());
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Swara Pancha Pakshi Compass//Bhogar Pancha Pakshi//EN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:Pancha Pakshi (${icsEsc(opts.place || '')})`];
    for (const day of days) {
      for (const p of day.periods) {
        if (quiet(p.start)) continue;
        L.push('BEGIN:VEVENT',
          `UID:pp-${p.start}-${day.bird}@swara-pakshi-compass`,
          `DTSTAMP:${now}`, `DTSTART:${icsStamp(p.start)}`, `DTEND:${icsStamp(p.end)}`,
          icsFold(`SUMMARY:${icsEsc(periodTitle(p, tz))}`),
          icsFold(`DESCRIPTION:${icsEsc(periodBody(p, tz))}`),
          'TRANSP:TRANSPARENT',
          'BEGIN:VALARM', 'ACTION:DISPLAY', icsFold(`DESCRIPTION:${icsEsc(periodTitle(p, tz))}`), 'TRIGGER:PT0S', 'END:VALARM',
          'END:VEVENT');
      }
    }
    L.push('END:VCALENDAR');
    return L.join('\r\n') + '\r\n';
  }

  return {
    computeDay, birthBird, ayanamsa, ascSid, moonSid, tithiAt, nakAt, lagnaAt, sunEvents,
    buildICS, periodTitle, periodBody, periodSpeech, localHHMM, tzOffsetMin, SWARA_ACTS,
    BIRD, ACT, META, RASI, NAKSHATRA, DAYS, DAY_NAMES,
  };
});
