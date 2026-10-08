"""Copy the shared engine where it is needed and build mobile/www (run after any change).

engine/pakshi-engine.js -> web/, pc/   and   web page + engine -> mobile/www

Copies the page (wrapped as a full document with native.js), the engine, the astronomy
library and — if present on this PC — your private pakshi-data.js and personal.js.
"""
import os
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB, WWW = os.path.join(ROOT, "web"), os.path.join(ROOT, "mobile", "www")

for target in ("web", "pc"):
    shutil.copy(os.path.join(ROOT, "engine", "pakshi-engine.js"), os.path.join(ROOT, target))

page = open(os.path.join(WEB, "pakshi-compass.html"), encoding="utf-8").read().replace('<meta charset="utf-8">\n', "", 1)
i = page.index('<div id="shell">')
doc = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
       + page[:i]
       + "\n<style>body{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style>\n"
       + "</head>\n<body>\n" + page[i:] + '\n<script src="native.js"></script>\n</body>\n</html>\n')
open(os.path.join(WWW, "index.html"), "w", encoding="utf-8").write(doc)
shutil.copy(os.path.join(WEB, "astronomy.browser.min.js"), WWW)
shutil.copy(os.path.join(ROOT, "engine", "pakshi-engine.js"), WWW)
for private in ("pakshi-data.js", "personal.js"):
    src = os.path.join(WEB, private)
    if os.path.exists(src):
        shutil.copy(src, WWW)
    else:
        print(f"note: web/{private} not found; the app will show its setup screen")
print("engine copied to web/ and pc/; mobile/www is ready")
