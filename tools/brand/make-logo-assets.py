# ======================= tools/brand/make-logo-assets.py =======================
# 🔷 2026-11-14 새 로고(LW 마크 + LOGISWEB) — 원본 한 장(logisweb-logo-source.png)에서 로고가 들어가는 모든 그림을 다시 만든다
#  실행: python3 tools/brand/make-logo-assets.py   (Pillow · numpy 필요)
#  · 앱 아이콘(PWA · 아이폰 홈 화면 · 안드로이드 런처)은 원본 그대로, 흰 여백 없이 원본 남색으로 꽉 채운다
#  · 화면 안 작은 마크(LogisMark) · 파비콘은 LW 마크만 잘라 쓴다(작아도 알아보게) — 바탕은 원본 남색
#  · 글자 로고(LOGISWEB)는 원본 글자를 투명 바탕 PNG 로 뽑는다(LOGIS #C6C9CF · WEB #6D7EA3 — 원본 색 그대로)
#  · 알림 아이콘(안드로이드 작은 아이콘 · 배지)은 흰색 실루엣(안드로이드 규칙)
#  로고가 또 바뀌면 원본 파일만 바꾸고 이 스크립트를 다시 돌린다
import base64, io, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "tools", "brand", "logisweb-logo-source.png")
src = Image.open(SRC).convert("RGB")
W, H = src.size
A = np.asarray(src).astype(int)
BG = tuple(int(v) for v in A[8, 8])            # 모서리 남색(#080C15 근처)
BG_HEX = "#%02X%02X%02X" % BG
LUM = A.mean(axis=2)

def P(*p): return os.path.join(ROOT, *p)
def save(img, *p, **kw):
    path = P(*p); os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True, **kw); print("✓", os.path.relpath(path, ROOT), img.size)

def scale_box(box, s):
    return tuple(int(round(v * s)) for v in box)
S = W / 2048.0  # 측정은 2048 기준

# ── 영역(2048 기준 측정값) ──
MARK_BOX = scale_box((325, 149, 1765, 1589), S)          # LW 마크 + 금색 선(정사각)
TEXT_BOX = scale_box((243, 1604, 1808, 1799), S)          # LOGISWEB 글자

full = src
mark = src.crop(MARK_BOX)

def fit(img, size):
    return img.resize((size, size), Image.LANCZOS)

def feather(s, edge=0.22):
    """가장자리로 갈수록 투명해지는 가림막 — 원본 바탕(가운데가 살짝 밝다)이 둘레 남색에 경계 없이 녹아들게"""
    r = np.linspace(-1, 1, s)
    d = np.maximum(np.abs(r)[None, :], np.abs(r)[:, None])
    a = np.clip((1 - d) / edge, 0, 1)
    return Image.fromarray((a * a * (3 - 2 * a) * 255).astype(np.uint8))
def on_bg(img, canvas, scale, bg=BG):
    """bg 색 캔버스 가운데에 img 를 canvas 짧은 변 × scale 크기로(둘레는 부드럽게 녹인다)"""
    cw, ch = canvas
    out = Image.new("RGB", canvas, bg)
    s = int(min(cw, ch) * scale)
    out.paste(img.resize((s, s), Image.LANCZOS), ((cw - s) // 2, (ch - s) // 2), feather(s))
    return out

# ── 1) 앱 아이콘 — 원본 그대로 꽉(흰 여백 없음, 투명 없음) ──
for size, name in [(192, "pwa-192.png"), (512, "pwa-512.png"), (180, "apple-touch-icon.png"), (512, "apple-touch-icon-512.png"),
                   (192, "icon-192x192.png"), (512, "icon-512x512.png"), (96, "icon-96x96.png")]:
    save(fit(full, size), "public", "icons", name)
save(fit(full, 180), "landing-site", "icons", "apple-touch-icon.png")
# 🛠 안드로이드에 '앱으로 설치'(PWA)하면 maskable 아이콘은 가운데 약 2/3 만 보이게 잘린다(동그라미 · 둥근 네모)
#  → 원본을 꽉 채우면 LOGISWEB 글자 양끝이 잘렸다. maskable 은 원본을 64% 로 줄여 가운데에 두고 둘레는 원본 남색
for size in (192, 512):
    save(on_bg(full, (size, size), 0.64), "public", "icons", f"pwa-maskable-{size}.png")

# 파비콘 · 작은 아이콘 — 마크만(32px 에서도 알아보게)
save(fit(mark, 512), "public", "icons", "sflow-icon.png")
save(fit(mark, 512), "landing-site", "icons", "sflow-icon.png")
save(fit(mark, 32), "public", "icons", "icon-32x32.png")

# 알림 큰 아이콘(색) — 마크
for size, name in [(96, "icon-96x96-notif.png"), (192, "icon-192x192-notif.png"), (512, "icon-512x512-notif.png")]:
    save(fit(mark, size), "public", "icons", name)

# ── 2) 알림 작은 아이콘 · 배지 — 흰색 실루엣(투명 바탕) ──
ma = np.asarray(mark).astype(int)
diff = np.abs(ma - np.array(BG)).sum(axis=2)
alpha = np.clip((diff - 40) * 4, 0, 255).astype(np.uint8)
sil = Image.new("RGBA", mark.size, (255, 255, 255, 0)); sil.putalpha(Image.fromarray(alpha))
sil_rgba = Image.merge("RGBA", (Image.new("L", mark.size, 255),) * 3 + (sil.getchannel("A"),))
for size, name in [(96, "badge-kp-96.png")]:
    save(sil_rgba.resize((size, size), Image.LANCZOS), "public", "icons", name)
# 안드로이드 알림 아이콘(이름은 예전 그대로 · 색 있는 판) — 마크
for size, name in [(192, "icon-192x192-notif-android.png"), (512, "icon-512x512-notif-android.png")]:
    save(fit(mark, size), "public", "icons", name)

# ── 3) 글자 로고 — 투명 바탕(원본 색) ──
t = A[TEXT_BOX[1]:TEXT_BOX[3], TEXT_BOX[0]:TEXT_BOX[2]]
tl = t.mean(axis=2)
bgl = float(np.median(tl[tl < 60])) + 10  # 글자 둘레 바탕 밝기(가운데가 모서리보다 밝다) + 여유 — 투명 바탕에 옅은 상자가 남지 않게
cols = np.where((tl > 90).any(axis=0))[0]
# LOGIS 와 WEB 사이 — 글자 색이 파랗게 바뀌는 첫 칸
blue = [x for x in cols if (t[:, x][tl[:, x] > 90][:, 2] - t[:, x][tl[:, x] > 90][:, 0]).mean() > 30]
split = blue[0] if blue else t.shape[1] // 2
LOGIS = np.array([198, 201, 207]); WEBC = np.array([109, 126, 163])
a = np.clip((tl - bgl) / (np.where(np.arange(t.shape[1]) < split, LOGIS.mean(), WEBC.mean()) - bgl) * 255, 0, 255).astype(np.uint8)
rgb = np.zeros(t.shape, dtype=np.uint8); rgb[:, :split] = LOGIS; rgb[:, split:] = WEBC
word = Image.fromarray(np.dstack([rgb, a]), "RGBA")
word = word.crop(word.getbbox())
save(word, "public", "brand", "logisweb-wordmark.png")
save(word, "landing-site", "brand", "logisweb-wordmark.png")
WORD_RATIO = word.size[0] / word.size[1]

# 화면 안 마크(LogisMark) · 전체 로고
save(fit(mark, 512), "public", "brand", "logisweb-mark.png")
save(fit(full, 1024), "public", "brand", "logisweb-logo.png")
save(fit(mark, 512), "landing-site", "brand", "logisweb-mark.png")
save(fit(full, 1024), "landing-site", "brand", "logisweb-logo.png")

# ── 4) SVG 파일(예전 이름 그대로 — <img src="…svg"> 로 쓰는 곳이 많다) — 안에 PNG 를 담는다 ──
def b64(img, size=None, fmt="PNG"):
    im = img if size is None else img.resize(size, Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, fmt, optimize=True); return base64.b64encode(buf.getvalue()).decode()
def svg_img(w, h, data, extra=""):
    return f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><image width="{w}" height="{h}" href="data:image/png;base64,{data}" xlink:href="data:image/png;base64,{data}"/>{extra}</svg>'
mark256 = b64(mark, (256, 256))
WH = 60; WW = int(round(WH * WORD_RATIO))
word_b = b64(word, (WW * 2, WH * 2))
tag = '<text x="{x}" y="{y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="{fs}" font-weight="700" letter-spacing="{ls}" fill="rgba(207,214,228,.6)">LOGISTICS DISPATCH NETWORK</text>'
files = {
    "logisweb-mark.svg": svg_img(256, 256, mark256),
    "logisweb-mark-square.svg": svg_img(256, 256, mark256),
    "logisweb-appicon-text.svg": svg_img(512, 512, b64(full, (512, 512))),
    "logisweb-wordmark.svg": f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {WW} {WH}" width="{WW}" height="{WH}"><image width="{WW}" height="{WH}" href="data:image/png;base64,{word_b}" xlink:href="data:image/png;base64,{word_b}"/></svg>',
    "logisweb-wordmark-tag.svg": f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {WW} {WH + 34}" width="{WW}" height="{WH + 34}"><image width="{WW}" height="{WH}" href="data:image/png;base64,{word_b}" xlink:href="data:image/png;base64,{word_b}"/>' + tag.format(x=WW // 2, y=WH + 28, fs=20, ls=4) + "</svg>",
    "logisweb-lockup.svg": f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {96 + 24 + WW // 2} 96" width="{96 + 24 + WW // 2}" height="96"><image width="96" height="96" href="data:image/png;base64,{mark256}" xlink:href="data:image/png;base64,{mark256}"/><image x="120" y="{48 - WH // 4}" width="{WW // 2}" height="{WH // 2}" href="data:image/png;base64,{word_b}" xlink:href="data:image/png;base64,{word_b}"/></svg>',
}
for name, body in files.items():
    for d in (("public", "brand"), ("landing-site", "brand")):
        if d[0] == "landing-site" and name in ("logisweb-mark-square.svg", "logisweb-appicon-text.svg"): continue
        path = P(*d, name); open(path, "w").write(body); print("✓", os.path.relpath(path, ROOT))

# ── 5) 링크 미리보기(og-image 1200×630) — 원본 남색 바탕 가운데 로고 ──
og = on_bg(full, (1200, 630), 0.92)
save(og, "public", "brand", "og-image.png"); save(og, "landing-site", "og-image.png")

# ── 6) 안드로이드(기사앱 APK) 런처 · 둥근 아이콘 · 적응형 앞그림 · 시작 화면 ──
RES = ("android", "app", "src", "main", "res")
for d, s in [("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)]:
    save(fit(full, s), *RES, f"mipmap-{d}", "ic_launcher.png")
    rnd = on_bg(full, (s, s), 0.84).convert("RGBA")  # 둥글게 잘리니 글자가 안 잘리게 조금 작게
    m = Image.new("L", (s * 4, s * 4), 0); ImageDraw.Draw(m).ellipse((0, 0, s * 4 - 1, s * 4 - 1), fill=255)
    rnd.putalpha(m.resize((s, s), Image.LANCZOS)); save(rnd, *RES, f"mipmap-{d}", "ic_launcher_round.png")
    fg = s * 108 // 48  # 적응형 아이콘 앞그림 108dp 캔버스 — 보이는 곳(72dp)에 원본이 꽉 차게, 바깥은 원본 남색
    save(on_bg(full, (fg, fg), 72 / 108), *RES, f"mipmap-{d}", "ic_launcher_foreground.png")
import glob
for f in glob.glob(P(*RES, "drawable*", "splash.png")):
    w0, h0 = Image.open(f).size
    img = on_bg(full, (w0, h0), 0.62); img.save(f, optimize=True); print("✓", os.path.relpath(f, ROOT), img.size)
bgx = P(*RES, "values", "ic_launcher_background.xml")
open(bgx, "w").write(f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">{BG_HEX}</color>\n</resources>\n')
print("✓ 안드로이드 아이콘 바탕색", BG_HEX)
print("WORD_RATIO", round(WORD_RATIO, 4), "BG", BG_HEX)

# ── 7) 허브(cafe-site) — 같은 로고 파일 · 파비콘 · 링크 미리보기 ──
for name in ("logisweb-mark.svg", "logisweb-mark-square.svg", "logisweb-wordmark.svg"):
    path = P("cafe-site", "public", "brand", name); open(path, "w").write(files[name]); print("✓", os.path.relpath(path, ROOT))
open(P("cafe-site", "public", "favicon.svg"), "w").write(files["logisweb-mark.svg"]); print("✓ cafe-site/public/favicon.svg")
save(fit(full, 180), "cafe-site", "public", "og-icon.png")
save(og, "cafe-site", "public", "og-image.png")
