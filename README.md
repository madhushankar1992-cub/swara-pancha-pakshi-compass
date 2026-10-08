# Swara Pancha Pakshi Compass

A personal timing companion that combines **Bhogar Pancha Pakshi** (the Tamil Siddha five-bird system), **Swara** (breath) rules from the *Shiva Swarodaya*, and **Vedic panchang** timings. It tells you, minute by minute, how strong the current period is for your birth bird, what to do and avoid, which way to face, and which nostril should be flowing.

It runs as a web page, an Android app with offline alerts, and Windows pop-ups — all from one shared JavaScript engine. Everything is calculated **on your own device**: there is no server.

> **Data not included.** The Bhogar timetables come from paid course material and personal birth details are private, so neither is in this repository. You generate the timetable file from **your own** course PDFs and fill in your own details (see *Setup*).

## Features

- **Current period card**: verdict (Excellent / Good / Average / Weak / Avoid), countdown ring, your bird's yama activity, the sub-period bird and its result, dos and don'ts.
- **Swara panel**: expected breath for the hour (Moon/Ida left, Sun/Pingala right) by the Swarodaya tithi rule, weekday and rising-sign agreement, a "check my breath" button, and an hourly breath strip.
- **Direction dial**: which way to face (your bird's direction when strong, the ruling bird's when weak), no-travel sectors (Soolam + breath rule), Sun/Moon position for orientation, live compass on phones.
- **Panchang**: sunrise and sunset, tithi, nakshatra, Moon sign, Rahu Kalam, Yamagandam, Kuligai, Soolam with remedy, Padu and Authority birds, Chandrashtamam, Tara bala.
- **Ashtakarma windows** with the current lagna and tithi.
- **Worldwide time zones** (IANA zones, daylight saving) and GPS-based recalculation.
- **Alerts**: Android local notifications at every sub-period (offline), Windows pop-ups with *Snooze 1 hour*, or calendar (.ics) files for Google Calendar.

## How it is built

| Part | Folder | Technology |
|---|---|---|
| Calculation engine | `engine/pakshi-engine.js` | JavaScript (browser + Node). Sidereal positions from [astronomy-engine](https://github.com/cosinekitty/astronomy) with Lahiri (Chitrapaksha) ayanamsa |
| Timetable decoder | `engine/parse_pdfs.py` | Python + PyMuPDF; decodes the legacy-font bird PDFs into `pakshi-data.js` |
| Reference ephemeris | `engine/vedic.py` | Python version of the sidereal helpers, used for cross-checks |
| Web app | `web/pakshi-compass.html` | Plain HTML, CSS and JavaScript (no framework), inline SVG graphics |
| Android app | `mobile/` | Capacitor 8 + Local Notifications + Geolocation plugins; `www/native.js` plans alerts |
| Windows pop-ups | `pc/` | Node.js service (`daemon.js`) + PowerShell Windows Forms pop-up, Task Scheduler |

```
your course PDFs ──parse_pdfs.py──► pakshi-data.js ─┐
astronomy-engine ───────────────────────────────────┼──► pakshi-engine.js ──► web page / Android app / PC pop-ups / .ics alerts
Swarodaya + panchang rules ─────────────────────────┘
personal.js (your birth details) ───────────────────┘
```

## Setup

### 1. Your private files (never committed)
1. Decode your course's five bird PDFs (`VALLURU.pdf`, `AANTHAI.pdf`, `KAKAM.pdf`, `KOLZHI.pdf`, `MAYIL.pdf`):
   ```bash
   pip install pymupdf
   python engine/parse_pdfs.py "C:\path\to\your\pakshi pdfs"
   ```
   This writes `engine/pakshi-data.js`. Copy it to `web/` and `pc/`.
2. Copy `web/personal.example.js` to `web/personal.js` and fill in your birth paksha, name vowel, lagna, Moon sign, star and tithi (the comments explain the numbers).
3. Run `python sync.py` (copies the engine into `web/` and `pc/` and builds `mobile/www`). Run it again after any change.

### 2. Web app
```bash
cd web
python -m http.server 8765
```
Open http://localhost:8765/pakshi-compass.html.

### 3. Android app
Needs JDK 21 and the Android SDK (platform 36, build-tools 35).
```bash
cd mobile
npm install
npx cap sync android
cd android
gradlew assembleDebug
```
The APK is in `mobile/android/app/build/outputs/apk/debug/`. Install it on your own phone only: it contains your private data.

### 4. Windows pop-ups
```bash
cd pc
npm install
copy config.example.json config.json
```
Put your `pakshi-data.js` in `pc/`, edit `config.json`, then run `powershell -ExecutionPolicy Bypass -File install.ps1`. `uninstall.ps1` removes it. `node make-calendar.js` creates .ics alert files; see `pc/HOW-TO.txt`.

## Credits
- [astronomy-engine](https://github.com/cosinekitty/astronomy) by Don Cross (MIT licence).
- Swara rules from the *Shiva Swarodaya*, as translated by Rama Prasad in *Nature's Finer Forces* (1890s, public domain).

## Disclaimer
A traditional timing guide for personal use. It is not medical, legal or financial advice: never delay medical care or urgent decisions because of a timing.
