# ======================= tools/brand/make-logo-assets.py =======================
# 🔷 2026-11-15 로고 색 2차(프로그램 남색에 맞춰 톤 다운) — 로고가 들어가는 모든 그림을 여기서 다시 만든다
#  실행: python3 tools/brand/make-logo-assets.py   (Pillow · numpy · node + Playwright 필요)
#  · LW 마크는 원본(logisweb-logo-source.png)에서 좌표를 딴 벡터로 그린다 → 색을 바탕마다 바꿔 낄 수 있다
#  · 글자 로고(LOGISWEB)는 원본 글자 모양을 투명 PNG 로 뽑아 색만 입힌다
#  · 색은 3벌 — 바탕에 맞춰 고른다(시안: 2026-11-15 사용자 승인 "추천대로")
#      A 어두운 바탕용(상단바 · 사이드 메뉴 · 첫 화면 · 관리자센터 · 기사 앱) — 투명 바탕
#      B 밝은 바탕용(로그인 폼 · 모바일 밝은 모드 · 작은 태그) — 투명 바탕 · 남색 칩을 따로 깔지 않는다
#      C 앱 아이콘용(홈 화면 · 파비콘 · 알림) — 밝은 남색 타일(#2B4880 → #16264A) 위 마크
#  로고 색을 또 바꾸면 아래 PALETTE 만 고치고 이 스크립트를 다시 돌린다
import base64, glob, io, json, os, subprocess, tempfile
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
def P(*p): return os.path.join(ROOT, *p)
SRC = P("tools", "brand", "logisweb-logo-source.png")

# ── 색 3벌 ──
PALETTE = {
    "A": dict(L=("#FFFFFF", "#CBD6EB"), W=("#3E5C9C", "#2A4378"), st="#7F98C8", gold="#F6C76A", logis=(255, 255, 255), web=(122, 147, 196)),   # WEB #7A93C4
    "B": dict(L=("#22396A", "#14213D"), W=("#4C6BAE", "#33508C"), st="#253F6E", gold="#D0951F", logis=(20, 33, 61), web=(58, 85, 144)),      # #14213D · #3A5590
    "C": dict(L=("#FFFFFF", "#D4DDEE"), W=("#4E6FB4", "#34528F"), st="#9DB2DA", gold="#FFD27A", logis=(255, 255, 255), web=(122, 147, 196)),
}
TILE = ("#2B4880", "#16264A")          # 앱 아이콘 바탕(C-1 밝은 남색)
TILE_GLOW = "rgba(143,176,240,.22)"
TILE_MID = "#213A6A"                   # 안드로이드 적응형 아이콘 바탕(단색만 된다)
DARK_BG = "#0F1A30"                    # 프로그램 남색(시작 화면 · 기사앱 시작 화면)

# ── LW 마크 모양(원본 2048 그림의 마크 영역(325,149)~(1765,1589)을 1440 칸으로 본 좌표) ──
VB = 1440
L_PATH = "M216 270 L367 186 L367 797 L552 902 L552 1076 L216 884 Z"
W_PATH = "M552 440 L709 350 L709 988 L789 1030 L789 302 L945 212 L945 1025 L1024 983 L1024 168 L1182 77 L1182 1078 L867 1258 L552 1076 Z"
GOLD = "190,982 867,1358 1240,1145"
DOT = (1240, 1145)

_uid = [0]
def mark_g(v, silhouette=False):
    """마크 한 벌(<g>) — v = A/B/C · silhouette 면 전부 흰색(안드로이드 알림 배지)"""
    _uid[0] += 1; i = f"m{_uid[0]}"
    if silhouette:
        return (f'<g><polyline points="{GOLD}" fill="none" stroke="#fff" stroke-width="22"/><circle cx="{DOT[0]}" cy="{DOT[1]}" r="34" fill="#fff"/>'
                f'<path d="{L_PATH}" fill="#fff"/><path d="{W_PATH}" fill="#fff"/></g>')
    c = PALETTE[v]
    return f'''<defs>
<linearGradient id="{i}l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{c['L'][0]}"/><stop offset="1" stop-color="{c['L'][1]}"/></linearGradient>
<linearGradient id="{i}w" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="{c['W'][0]}"/><stop offset="1" stop-color="{c['W'][1]}"/></linearGradient>
<linearGradient id="{i}g" gradientUnits="userSpaceOnUse" x1="190" y1="0" x2="1240" y2="0"><stop offset="0" stop-color="{c['gold']}" stop-opacity="0"/><stop offset=".45" stop-color="{c['gold']}"/><stop offset="1" stop-color="{c['gold']}"/></linearGradient>
<radialGradient id="{i}d"><stop offset="0" stop-color="{c['gold']}" stop-opacity=".7"/><stop offset="1" stop-color="{c['gold']}" stop-opacity="0"/></radialGradient>
</defs><g>
<polyline points="{GOLD}" fill="none" stroke="url(#{i}g)" stroke-width="8"/>
<circle cx="{DOT[0]}" cy="{DOT[1]}" r="60" fill="url(#{i}d)"/><circle cx="{DOT[0]}" cy="{DOT[1]}" r="17" fill="{c['gold']}"/>
<path d="{L_PATH}" fill="url(#{i}l)"/>
<path d="{W_PATH}" fill="url(#{i}w)" stroke="{c['st']}" stroke-width="7" stroke-linejoin="miter"/>
</g>'''

def tile_bg(rx=0):
    _uid[0] += 1; i = f"t{_uid[0]}"
    return (f'<defs><linearGradient id="{i}a" x1="0" y1="0" x2=".55" y2="1"><stop offset="0" stop-color="{TILE[0]}"/><stop offset="1" stop-color="{TILE[1]}"/></linearGradient>'
            f'<radialGradient id="{i}b" cx=".3" cy=".1" r=".8"><stop offset="0" stop-color="{TILE_GLOW}"/><stop offset="1" stop-color="{TILE_GLOW}" stop-opacity="0"/></radialGradient></defs>'
            f'<rect width="{VB}" height="{VB}" rx="{rx}" fill="url(#{i}a)"/><rect width="{VB}" height="{VB}" rx="{rx}" fill="url(#{i}b)"/>')

def scaled(inner, s):
    return inner if s == 1 else f'<g transform="translate({VB/2} {VB/2}) scale({s}) translate({-VB/2} {-VB/2})">{inner}</g>'

def svg(inner, w=VB, h=VB, vb=f"0 0 {VB} {VB}", px=None):
    size = f' width="{px[0]}" height="{px[1]}"' if px else f' width="{w}" height="{h}"'
    return f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="{vb}"{size}>{inner}</svg>'

def mark_svg(v, px=None, s=1.0):                 # 투명 바탕 마크(A · B)
    return svg(scaled(mark_g(v), s), px=px)
def icon_svg(px=None, s=1.0, rx=0):              # 앱 아이콘(C) — 타일 + 마크
    return svg(tile_bg(rx) + scaled(mark_g("C"), s), px=px)

# ── 글자 로고 — 원본 글자 모양을 투명 PNG 로 뽑고 색만 입힌다 ──
src = Image.open(SRC).convert("RGB")
A = np.asarray(src).astype(int)
S = src.size[0] / 2048.0
TEXT_BOX = tuple(int(round(v * S)) for v in (243, 1604, 1808, 1799))
t = A[TEXT_BOX[1]:TEXT_BOX[3], TEXT_BOX[0]:TEXT_BOX[2]]
tl = t.mean(axis=2)
bgl = float(np.median(tl[tl < 60])) + 10
cols = np.where((tl > 90).any(axis=0))[0]
blue = [x for x in cols if (t[:, x][tl[:, x] > 90][:, 2] - t[:, x][tl[:, x] > 90][:, 0]).mean() > 30]
split = blue[0] if blue else t.shape[1] // 2
SRC_LOGIS = np.array([198, 201, 207]); SRC_WEB = np.array([109, 126, 163])
alpha = np.clip((tl - bgl) / (np.where(np.arange(t.shape[1]) < split, SRC_LOGIS.mean(), SRC_WEB.mean()) - bgl) * 255, 0, 255).astype(np.uint8)
box = Image.fromarray(alpha).getbbox()
alpha = alpha[box[1]:box[3], box[0]:box[2]]; split -= box[0]
def word(v):
    c = PALETTE[v]
    rgb = np.zeros(alpha.shape + (3,), dtype=np.uint8); rgb[:, :split] = c["logis"]; rgb[:, split:] = c["web"]
    return Image.fromarray(np.dstack([rgb, alpha]), "RGBA")
wordA, wordB = word("A"), word("B")
WORD_RATIO = wordA.size[0] / wordA.size[1]

def save(img, *p):
    path = P(*p); os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True); print("✓", os.path.relpath(path, ROOT), img.size)
def write(body, *p):
    path = P(*p); os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w").write(body); print("✓", os.path.relpath(path, ROOT))
def b64(img, size=None):
    im = img if size is None else img.resize(size, Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, "PNG", optimize=True); return base64.b64encode(buf.getvalue()).decode()

for d in ("public", "landing-site"):
    save(wordA, d, "brand", "logisweb-wordmark.png")
save(wordB, "public", "brand", "logisweb-wordmark-onlight.png")
save(wordA, "public", "brand", "logisweb-wordmark-light.png")   # 트럭 짐칸(어두운 판) — 예전 이름 그대로
save(wordB, "public", "brand", "logisweb-wordmark-dark.png")    # 트럭 짐칸(밝은 판)

WH = 60; WW = int(round(WH * WORD_RATIO))
wordA_b = b64(wordA, (WW * 2, WH * 2))
def word_img(x, y, w, data=wordA_b):
    h = w / WORD_RATIO
    return f'<image x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" href="data:image/png;base64,{data}" xlink:href="data:image/png;base64,{data}"/>'
TAG = "LOGISTICS DISPATCH NETWORK"
def tag_text(x, y, fs, ls, fill="rgba(207,214,228,.6)"):
    return f'<text x="{x}" y="{y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="{fs}" font-weight="700" letter-spacing="{ls}" fill="{fill}">{TAG}</text>'

# ── PNG 그리기 목록 ──
jobs = []
def png(svgtext, w, h, *p):
    jobs.append({"svg": svgtext, "out": P(*p), "w": w, "h": h})

# 1) 화면 안 마크(LogisMark) — 투명 A · B
for d in ("public", "landing-site"):
    png(mark_svg("A", (512, 512)), 512, 512, d, "brand", "logisweb-mark.png")
png(mark_svg("B", (512, 512)), 512, 512, "public", "brand", "logisweb-mark-onlight.png")

# 2) 앱 아이콘(PWA · 아이폰 홈 화면) — C 타일 꽉(투명 없음 · 모서리는 휴대폰이 깎는다)
for size, name in [(192, "pwa-192.png"), (512, "pwa-512.png"), (180, "apple-touch-icon.png"), (512, "apple-touch-icon-512.png"),
                   (192, "icon-192x192.png"), (512, "icon-512x512.png"), (96, "icon-96x96.png")]:
    png(icon_svg((size, size)), size, size, "public", "icons", name)
png(icon_svg((180, 180)), 180, 180, "landing-site", "icons", "apple-touch-icon.png")
# 안드로이드 '앱으로 설치'(maskable) — 가운데 약 2/3 만 보이니 마크를 줄여 둔다
for size in (192, 512):
    png(icon_svg((size, size), s=0.74), size, size, "public", "icons", f"pwa-maskable-{size}.png")

# 3) 파비콘 · 알림 아이콘 — C 타일(파비콘은 둥근 모서리)
for d in ("public", "landing-site"):
    png(icon_svg((512, 512), rx=300), 512, 512, d, "icons", "sflow-icon.png")
png(icon_svg((32, 32), rx=300), 32, 32, "public", "icons", "icon-32x32.png")
for size, name in [(96, "icon-96x96-notif.png"), (192, "icon-192x192-notif.png"), (512, "icon-512x512-notif.png"),
                   (192, "icon-192x192-notif-android.png"), (512, "icon-512x512-notif-android.png")]:
    png(icon_svg((size, size)), size, size, "public", "icons", name)
# 안드로이드 상단바 배지 — 흰색 실루엣(안드로이드 규칙)
png(svg(mark_g(None, silhouette=True), px=(96, 96)), 96, 96, "public", "icons", "badge-kp-96.png")

# 4) 전체 로고(타일 + 마크 + 글자) — logisweb-logo.png · 허브 og-icon
def full_logo(px):
    inner = tile_bg() + f'<g transform="translate(205 70) scale(.72)">{mark_g("C")}</g>' + word_img(250, 1150, 940)
    return svg(inner, px=(px, px))
for d in ("public", "landing-site"):
    png(full_logo(1024), 1024, 1024, d, "brand", "logisweb-logo.png")
png(full_logo(180), 180, 180, "cafe-site", "public", "og-icon.png")

# 5) 링크 미리보기(og-image 1200×630) — 프로그램 상단바 남색 위 A 로고
def og():
    inner = ('<defs><linearGradient id="ogb" x1="0" y1="0" x2="1" y2=".55"><stop offset="0" stop-color="#0F1A30"/><stop offset=".45" stop-color="#16243F"/><stop offset="1" stop-color="#1F3560"/></linearGradient>'
             '<radialGradient id="ogr" cx=".5" cy="0" r=".7"><stop offset="0" stop-color="rgba(110,149,232,.28)"/><stop offset="1" stop-color="rgba(110,149,232,0)"/></radialGradient></defs>'
             '<rect width="1200" height="630" fill="url(#ogb)"/><rect width="1200" height="630" fill="url(#ogr)"/>'
             f'<svg x="470" y="70" width="260" height="260" viewBox="0 0 {VB} {VB}">{mark_g("A")}</svg>'
             + word_img(330, 380, 540) + tag_text(600, 480, 22, 6))
    return svg(inner, vb="0 0 1200 630", px=(1200, 630))
for p in (("public", "brand", "og-image.png"), ("landing-site", "og-image.png"), ("cafe-site", "public", "og-image.png")):
    png(og(), 1200, 630, *p)

# 6) 안드로이드(기사앱 APK) — 런처 · 둥근 · 적응형 앞그림 · 시작 화면
RES = ("android", "app", "src", "main", "res")
for d, s in [("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)]:
    png(icon_svg((s, s)), s, s, *RES, f"mipmap-{d}", "ic_launcher.png")
    png(icon_svg((s, s), rx=VB // 2), s, s, *RES, f"mipmap-{d}", "ic_launcher_round.png")
    fg = s * 108 // 48   # 108dp 캔버스 중 보이는 곳은 가운데 72dp → 마크를 그 안에
    png(icon_svg((fg, fg), s=0.6), fg, fg, *RES, f"mipmap-{d}", "ic_launcher_foreground.png")
for f in glob.glob(P(*RES, "drawable*", "splash.png")):
    w0, h0 = Image.open(f).size
    m = min(w0, h0) * 0.42
    inner = (f'<rect width="{w0}" height="{h0}" fill="{DARK_BG}"/>'
             f'<svg x="{(w0 - m) / 2:.1f}" y="{(h0 - m) / 2 - m * 0.18:.1f}" width="{m:.1f}" height="{m:.1f}" viewBox="0 0 {VB} {VB}">{mark_g("A")}</svg>'
             + word_img((w0 - m * 1.1) / 2, (h0 + m) / 2 - m * 0.05, m * 1.1))
    jobs.append({"svg": svg(inner, vb=f"0 0 {w0} {h0}", px=(w0, h0)), "out": f, "w": w0, "h": h0})
write(f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">{TILE_MID}</color>\n</resources>\n', *RES, "values", "ic_launcher_background.xml")

# ── 그리기 ──
with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fp:
    json.dump(jobs, fp); jf = fp.name
subprocess.run(["node", P("tools", "brand", "render-svg.cjs"), jf], check=True)
os.unlink(jf)
for j in jobs:   # 그린 PNG 를 한 번 더 줄여 저장(용량) — 아이콘·시작 화면은 투명 없이 RGB 로
    im = Image.open(j["out"])
    opaque = "brand/logisweb-mark" not in j["out"] and "badge-kp" not in j["out"] and "ic_launcher_round" not in j["out"] and "sflow-icon" not in j["out"] and "icon-32x32" not in j["out"]
    (im.convert("RGB") if opaque else im.convert("RGBA")).save(j["out"], optimize=True)
    print("✓", os.path.relpath(j["out"], ROOT), im.size)

# ── SVG 파일(예전 이름 그대로 — <img src="…svg"> 로 쓰는 곳이 많다) — 마크는 진짜 벡터 ──
lock_w = 96 + 24 + WW // 2
files = {
    "logisweb-mark.svg": mark_svg("A", (256, 256)),                      # 어두운 바탕용 · 투명
    "logisweb-mark-onlight.svg": mark_svg("B", (256, 256)),              # 밝은 바탕용 · 투명
    "logisweb-mark-square.svg": icon_svg((256, 256), rx=300),            # 앱 아이콘 타일(허브 · 파비콘)
    "logisweb-appicon-text.svg": full_logo(512),
    "logisweb-wordmark.svg": svg(word_img(0, 0, WW), vb=f"0 0 {WW} {WH}", px=(WW, WH)),
    "logisweb-wordmark-tag.svg": svg(word_img(0, 0, WW) + tag_text(WW // 2, WH + 28, 20, 4), vb=f"0 0 {WW} {WH + 34}", px=(WW, WH + 34)),
    "logisweb-lockup.svg": svg(f'<svg width="96" height="96" viewBox="0 0 {VB} {VB}">{mark_g("A")}</svg>' + word_img(120, 48 - WH / 4, WW / 2), vb=f"0 0 {lock_w} 96", px=(lock_w, 96)),
}
for name, body in files.items():
    write(body, "public", "brand", name)
    if name not in ("logisweb-mark-square.svg", "logisweb-appicon-text.svg", "logisweb-mark-onlight.svg"):
        write(body, "landing-site", "brand", name)
# 허브(cafe-site)
for name in ("logisweb-mark.svg", "logisweb-mark-square.svg", "logisweb-wordmark.svg"):
    write(files[name], "cafe-site", "public", "brand", name)
write(files["logisweb-mark-square.svg"], "cafe-site", "public", "favicon.svg")
print("WORD_RATIO", round(WORD_RATIO, 4))
