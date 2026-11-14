# 트럭 짐칸용 글자 로고 — 원본 글자 로고(투명)의 모양은 그대로, 색만 바꿔 두 장
#  light: 어두운 판 위(LOGIS 흰색 · WEB 하늘색) / dark: 밝은 판 위(LOGIS 남색 · WEB 파랑)
from PIL import Image
src = Image.open("public/brand/logisweb-wordmark.png").convert("RGBA")
A = (198, 201, 207); B = (109, 126, 163)
def recolor(ca, cb, out):
    im = src.copy(); px = im.load(); w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0: continue
            da = sum((p - q) ** 2 for p, q in zip((r, g, b), A)); db = sum((p - q) ** 2 for p, q in zip((r, g, b), B))
            px[x, y] = (*(ca if da <= db else cb), a)
    im.save(out, optimize=True)
recolor((255, 255, 255), (143, 176, 240), "public/brand/logisweb-wordmark-light.png")
recolor((22, 33, 58), (75, 108, 183), "public/brand/logisweb-wordmark-dark.png")
print("ok")
