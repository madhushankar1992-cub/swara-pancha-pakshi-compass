"""Vedic (sidereal, Lahiri/Chitrapaksha) ephemeris helpers on top of astronomy-engine.

Positions are apparent geocentric longitudes of date; ayanamsa is Lahiri
(mean, IAU-2006 precession, anchored to 23.85709 deg at J2000) plus nutation,
which reproduces Swiss Ephemeris SE_SIDM_LAHIRI to within a few arc-seconds.
"""
import math
from datetime import datetime, timedelta, timezone

import astronomy as ae

IST = timezone(timedelta(hours=5, minutes=30))

RASI = ["Mesham", "Rishabam", "Mithunam", "Kadagam", "Simmam", "Kanni",
        "Thulam", "Viruchigam", "Dhanusu", "Magaram", "Kumbam", "Meenam"]
RASI_TA = ["மேஷம்", "ரிஷபம்", "மிதுனம்", "கடகம்", "சிம்மம்", "கன்னி",
           "துலாம்", "விருச்சிகம்", "தனுசு", "மகரம்", "கும்பம்", "மீனம்"]
NAKSHATRA = ["Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashirsha", "Ardra",
             "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni",
             "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
             "Moola", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha",
             "Purva Bhadrapada", "Uttara Bhadrapada", "Revati"]
NAKSHATRA_TA = ["அசுவினி", "பரணி", "கிருத்திகை", "ரோகிணி", "மிருகசீரிடம்", "திருவாதிரை",
                "புனர்பூசம்", "பூசம்", "ஆயில்யம்", "மகம்", "பூரம்", "உத்திரம்",
                "அஸ்தம்", "சித்திரை", "சுவாதி", "விசாகம்", "அனுஷம்", "கேட்டை",
                "மூலம்", "பூராடம்", "உத்திராடம்", "திருவோணம்", "அவிட்டம்", "சதயம்",
                "பூரட்டாதி", "உத்திரட்டாதி", "ரேவதி"]
TITHI = ["Prathamai", "Dvitiyai", "Tritiyai", "Chaturthi", "Panchami", "Shashti", "Saptami",
         "Ashtami", "Navami", "Dasami", "Ekadasi", "Dvadasi", "Trayodasi", "Chaturdasi"]
TITHI_TA = ["பிரதமை", "துவிதியை", "திருதியை", "சதுர்த்தி", "பஞ்சமி", "சஷ்டி", "சப்தமி",
            "அஷ்டமி", "நவமி", "தசமி", "ஏகாதசி", "துவாதசி", "திரயோதசி", "சதுர்த்தசி"]
WEEKDAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]


def to_time(dt):
    return ae.Time.Make(*dt.astimezone(timezone.utc).timetuple()[:5],
                        dt.astimezone(timezone.utc).second + dt.microsecond / 1e6)


def to_dt(t):
    return t.Utc().replace(tzinfo=timezone.utc)


def _centuries(t):
    return t.tt / 36525.0


def nutation_lon_deg(t):
    return t._etilt().dpsi / 3600.0  # arcsec -> deg


def true_obliquity_deg(t):
    return t._etilt().tobl


def ayanamsa(t):
    """Lahiri (Chitrapaksha) true ayanamsa in degrees."""
    T = _centuries(t)
    mean = 23.85709 + (5028.796195 * T + 1.1054348 * T * T) / 3600.0
    return mean + nutation_lon_deg(t)


def sun_tropical(t):
    return ae.SunPosition(t).elon % 360.0


def moon_tropical(t):
    return ae.EclipticGeoMoon(t).lon % 360.0


def sidereal(lon, t):
    return (lon - ayanamsa(t)) % 360.0


def sun_sid(t):
    return sidereal(sun_tropical(t), t)


def moon_sid(t):
    return sidereal(moon_tropical(t), t)


def ascendant_sid(t, lat, lon):
    gast = ae.SiderealTime(t)  # hours
    ramc = math.radians((gast * 15.0 + lon) % 360.0)
    eps = math.radians(true_obliquity_deg(t))
    phi = math.radians(lat)
    asc = math.degrees(math.atan2(math.cos(ramc),
                                  -(math.sin(ramc) * math.cos(eps) + math.tan(phi) * math.sin(eps))))
    return sidereal(asc % 360.0, t)


def tithi_index(t):
    """0..29 (0 = Shukla Prathamai, 14 = Pournami, 29 = Amavasai)."""
    return int(((moon_tropical(t) - sun_tropical(t)) % 360.0) // 12.0)


def tithi_name(idx):
    if idx == 14:
        return "Pournami", "பௌர்ணமி"
    if idx == 29:
        return "Amavasai", "அமாவாசை"
    return TITHI[idx % 15], TITHI_TA[idx % 15]


def paksha(idx):
    return "shukla" if idx < 15 else "krishna"


def nakshatra_index(t):
    return int(moon_sid(t) // (360.0 / 27.0))


def rasi_index(lon_sid):
    return int(lon_sid // 30.0)


def _find_change(fn, t0, t1, step_min=20):
    """Return first time in (t0, t1] where fn changes value (bisection to ~5 s)."""
    v0 = fn(t0)
    a = t0
    while a.ut < t1.ut:
        b = a.AddDays(step_min / 1440.0)
        if fn(b) != v0:
            lo, hi = a, b
            while (hi.ut - lo.ut) * 86400 > 5:
                mid = lo.AddDays((hi.ut - lo.ut) / 2)
                if fn(mid) == v0:
                    lo = mid
                else:
                    hi = mid
            return hi
        a = b
    return None


def next_change(fn, t, max_days=2.0):
    return _find_change(fn, t, t.AddDays(max_days))


def sunrise_sunset(date_local, lat, lon, tz=IST):
    """Sunrise/sunset (upper limb + refraction) for a local civil date; also next sunrise."""
    obs = ae.Observer(lat, lon, 0)
    midnight = datetime(date_local.year, date_local.month, date_local.day, tzinfo=tz)
    t0 = to_time(midnight)
    rise = ae.SearchRiseSet(ae.Body.Sun, obs, ae.Direction.Rise, t0, 1.0)
    sset = ae.SearchRiseSet(ae.Body.Sun, obs, ae.Direction.Set, rise, 1.0)
    nrise = ae.SearchRiseSet(ae.Body.Sun, obs, ae.Direction.Rise, sset, 1.0)
    return to_dt(rise).astimezone(tz), to_dt(sset).astimezone(tz), to_dt(nrise).astimezone(tz)


def lagna_changes(start_dt, end_dt, lat, lon):
    """List of (start, end, rasi_index) lagna spans between two datetimes."""
    out = []
    t = to_time(start_dt)
    tend = to_time(end_dt)
    fn = lambda x: rasi_index(ascendant_sid(x, lat, lon))
    cur = fn(t)
    s = t
    while True:
        nxt = _find_change(fn, s, tend, step_min=10)
        if nxt is None:
            out.append((to_dt(s).astimezone(start_dt.tzinfo), end_dt, cur))
            break
        out.append((to_dt(s).astimezone(start_dt.tzinfo), to_dt(nxt).astimezone(start_dt.tzinfo), cur))
        s, cur = nxt, fn(nxt)
    return out


def fmt_dms(deg):
    d = int(deg)
    m = int((deg - d) * 60)
    s = int(round(((deg - d) * 60 - m) * 60))
    return f"{d}°{m:02d}'{s:02d}\""
