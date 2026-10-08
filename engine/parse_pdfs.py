"""Decode your course's 5 Bhogar bird PDFs (legacy Tamil font) into pakshi-data.js.

Usage:  python engine/parse_pdfs.py "<folder with VALLURU.pdf AANTHAI.pdf KAKAM.pdf KOLZHI.pdf MAYIL.pdf>"
Writes engine/pakshi_tables.json (full) and engine/pakshi-data.js (compact, used by the apps).
Both outputs are git-ignored: they contain your course material. Never commit them.


Pages 4-17 = Shukla (valarpirai), pages 18-31 = Krishna (theipirai);
within each: Sun day, Sun night, Mon day, Mon night ... Sat night.
Printed times are on the PDFs' 06:00-based dial (yama 1 starts 06:00 AM/PM),
stored here as minutes after the start of the half-day (0..720).
"""
import collections
import json
import os
import re

import sys

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("PAKSHI_PDF_DIR", "")
FILES = {"vulture": "VALLURU", "owl": "AANTHAI", "crow": "KAKAM", "cock": "KOLZHI", "peacock": "MAYIL"}

# Legacy-font glyph strings -> meaning (verified against the rendered page images)
BIRD = {"Yp\xed\xdf": "vulture", "Bk\xfbR": "owl", "L\xf4Lm": "crow", "\xfaL\xf4\xaf": "cock", "U\xabp": "peacock"}
ACT = {"AW\xd1": "rule", "\xd5\xabp": "sleep", "N\xf4\xdc": "death", "Fi": "eat", "S\xfbP": "walk"}
REL = {"\xd1Vm": "self", "\xaaj\xd5\xda": "friend", "Nj\xd5\xda": "enemy"}
PALAN = {"\xaaL Su\xdf": "very_good", "Su\xdf": "good", "Uj\xa7Um": "medium",
         "\xbe\xd5": "bad", "A\xa7 \xbe\xd5": "very_bad"}
HDR = re.compile("T\xd3Th\xa3 : (\\S+) A\xa7L\xf4W Th\xa3 : (\\S+)")
DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
TIME = re.compile(r"^\d\d:\d\d$")


def lines_of(page):
    words = sorted(page.get_text("words"), key=lambda w: (w[1], w[0]))
    out, cur, cy = [], [], None
    for w in words:
        if cy is None or abs(w[1] - cy) > 3:
            if cur:
                out.append(sorted(cur, key=lambda w: w[0]))
            cur, cy = [w], w[1]
        else:
            cur.append(w)
    if cur:
        out.append(sorted(cur, key=lambda w: w[0]))
    return out


def to_min(hhmm, prev):
    h, m = map(int, hhmm.split(":"))
    off = ((h % 12) * 60 + m - 360) % 720
    if prev is not None and off < prev:
        off += 720
    return off


def parse():
    data, problems = {}, []
    for bird, fn in FILES.items():
        doc = pymupdf.open(os.path.join(SRC, fn + ".pdf"))
        for pi in range(3, 31):
            k = pi - 3
            paksha = "shukla" if k < 14 else "krishna"
            day = DAYS[(k % 14) // 2]
            half = "day" if k % 2 == 0 else "night"
            lines = lines_of(doc[pi])
            flat = " ".join(w[4] for l in lines[:5] for w in l)
            m = HDR.search(flat)
            padu, adhi = (BIRD.get(m.group(1)), BIRD.get(m.group(2))) if m else (None, None)
            if not (padu and adhi):
                problems.append((bird, paksha, day, half, "header"))
            yamas, prev, n = [], None, 0
            for l in lines:
                toks = [w[4] for w in l]
                idx = [i for i in range(2, len(toks) - 2)
                       if TIME.match(toks[i]) and toks[i + 1] == "-" and TIME.match(toks[i + 2])]
                if not idx:
                    continue
                i = idx[0]
                if n % 5 == 0:
                    yamas.append({"main": ACT.get(toks[i - 3]), "main_bird": BIRD.get(toks[i - 4]), "subs": []})
                s = to_min(toks[i], prev)
                e = to_min(toks[i + 2], s)
                prev = e
                row = {"bird": BIRD.get(toks[i - 2]), "act": ACT.get(toks[i - 1]), "start": s, "end": e,
                       "rel": REL.get(toks[i + 3]), "palan": PALAN.get(" ".join(toks[i + 4:]))}
                if None in row.values():
                    problems.append((bird, paksha, day, half, [ascii(t) for t in toks]))
                yamas[-1]["subs"].append(row)
                n += 1
            if n != 25:
                problems.append((bird, paksha, day, half, f"rows={n}"))
            data.setdefault(bird, {}).setdefault(paksha, {}).setdefault(day, {})[half] = {
                "padu": padu, "adhikara": adhi, "yamas": yamas}
    return data, problems


def validate(data, problems):
    durs = collections.defaultdict(set)
    for bird, bp in data.items():
        for pk, pkp in bp.items():
            for d, dp in pkp.items():
                for half, pg in dp.items():
                    for yi, y in enumerate(pg["yamas"]):
                        subs = y["subs"]
                        if y["main_bird"] != bird:
                            problems.append((bird, pk, d, half, yi, "main_bird", y["main_bird"]))
                        if subs[0]["act"] != y["main"] or subs[0]["bird"] != bird or subs[0]["rel"] != "self":
                            problems.append((bird, pk, d, half, yi, "first sub mismatch"))
                        if subs[0]["start"] != yi * 144 or subs[-1]["end"] != (yi + 1) * 144:
                            problems.append((bird, pk, d, half, yi, "bounds", subs[0]["start"], subs[-1]["end"]))
                        for a, b in zip(subs, subs[1:]):
                            if a["end"] != b["start"]:
                                problems.append((bird, pk, d, half, yi, "gap"))
                        if len({s["bird"] for s in subs}) != 5 or len({s["act"] for s in subs}) != 5:
                            problems.append((bird, pk, d, half, yi, "not 5 distinct"))
                        for s in subs:
                            durs[(pk, half, s["act"])].add(s["end"] - s["start"])
    return durs


if __name__ == "__main__":
    if not SRC or not os.path.isdir(SRC):
        sys.exit("Give the folder that holds your 5 bird PDFs (see the docstring).")
    data, problems = parse()
    durs = validate(data, problems)
    print("problems:", len(problems))
    for p in problems[:15]:
        print("  ", p)
    for k in sorted(durs):
        print(k, sorted(durs[k]))
    with open(os.path.join(HERE, "pakshi_tables.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    print("saved", os.path.getsize(os.path.join(HERE, "pakshi_tables.json")), "bytes")
    # compact form for the apps: per page padu, adhikara, then 25 subs x [bird, act, palan 5..1, rel]
    B = {"vulture": "V", "owl": "O", "crow": "C", "cock": "K", "peacock": "P"}
    A = {"rule": "R", "eat": "E", "walk": "W", "sleep": "S", "death": "D"}
    P = {"very_good": "5", "good": "4", "medium": "3", "bad": "2", "very_bad": "1"}
    Rl = {"self": "s", "friend": "f", "enemy": "e"}
    out = {}
    for bird, bp in data.items():
        for pk, pkp in bp.items():
            for day, dp in pkp.items():
                for half, pg in dp.items():
                    subs = "".join(B[x["bird"]] + A[x["act"]] + P[x["palan"]] + Rl[x["rel"]] for y in pg["yamas"] for x in y["subs"])
                    out.setdefault(B[bird], {}).setdefault(pk[0], {}).setdefault(day, {})[half[0]] = B[pg["padu"]] + B[pg["adhikara"]] + subs
    js = ("/* Bhogar Pancha Pakshi timetables decoded from YOUR course PDFs. Private: do not commit or share. */\n"
          "var PAKSHI_TABLES = " + json.dumps(out, separators=(",", ":")) + ";\n"
          "if (typeof module !== 'undefined') module.exports = PAKSHI_TABLES;\n")
    with open(os.path.join(HERE, "pakshi-data.js"), "w", encoding="utf-8") as f:
        f.write(js)
    print("wrote pakshi-data.js; copy it to web/ and pc/, then run: python sync.py")
