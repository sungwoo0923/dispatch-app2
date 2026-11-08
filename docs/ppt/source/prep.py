"""Prepare assets: backgrounds, framed screenshots (browser / phone), trimmed logo."""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = "/home/user/dispatch-app2/landing-site/img"
OUT = os.path.join(HERE, "assets")
os.makedirs(OUT, exist_ok=True)
FONT = os.path.join(HERE, "node_modules/pretendard/dist/public/static/Pretendard-SemiBold.otf")


def hexrgb(h, a=255):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


# ---------- backgrounds (2560x1440) ----------
def background(name, glow_xy, glow2_xy=None, grid=True):
    W, H = 2560, 1440
    base = Image.new("RGBA", (W, H), hexrgb("#0B1428"))
    # vertical gradient
    grad = Image.new("RGBA", (W, H))
    gd = ImageDraw.Draw(grad)
    top, bot = hexrgb("#08101F"), hexrgb("#13213D")
    for y in range(H):
        t = y / H
        gd.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,))
    base = Image.alpha_composite(base, grad)
    # glows
    for xy, col, r, a in [(glow_xy, "#2D5BD8", 900, 120), (glow2_xy, "#4F8BFF", 700, 70)]:
        if not xy:
            continue
        g = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(g).ellipse([xy[0] - r, xy[1] - r, xy[0] + r, xy[1] + r], fill=hexrgb(col, a))
        g = g.filter(ImageFilter.GaussianBlur(260))
        base = Image.alpha_composite(base, g)
    if grid:
        gl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(gl)
        step = 80
        for x in range(0, W, step):
            d.line([(x, 0), (x, H)], fill=(143, 176, 240, 10), width=1)
        for y in range(0, H, step):
            d.line([(0, y), (W, y)], fill=(143, 176, 240, 10), width=1)
        # fade grid toward bottom-left
        mask = Image.new("L", (W, H))
        md = ImageDraw.Draw(mask)
        for y in range(H):
            md.line([(0, y), (W, y)], fill=int(255 * (1 - y / H) ** 1.4))
        gl.putalpha(Image.composite(gl.getchannel("A"), Image.new("L", (W, H), 0), mask))
        base = Image.alpha_composite(base, gl)
    base.convert("RGB").save(os.path.join(OUT, name), quality=92)


background("bg-cover.jpg", (2200, 300), (300, 1300))
background("bg-a.jpg", (2300, 1200), (200, 100))
background("bg-b.jpg", (1280, 1500), None)


# ---------- helpers ----------
def rounded_mask(size, r):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], r, fill=255)
    return m


def with_shadow(card, pad=90, blur=50, color=(0, 0, 0, 170), glow=(79, 139, 255, 60)):
    W, H = card.size
    canvas = Image.new("RGBA", (W + pad * 2, H + pad * 2), (0, 0, 0, 0))
    sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    a = card.getchannel("A")
    s1 = Image.new("RGBA", card.size, color)
    s1.putalpha(a.point(lambda v: v * color[3] // 255))
    sh.paste(s1, (pad, pad + 30), s1)
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    g = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    s2 = Image.new("RGBA", card.size, glow)
    s2.putalpha(a.point(lambda v: v * glow[3] // 255))
    g.paste(s2, (pad, pad), s2)
    g = g.filter(ImageFilter.GaussianBlur(blur * 1.4))
    canvas = Image.alpha_composite(canvas, g)
    canvas = Image.alpha_composite(canvas, sh)
    canvas.alpha_composite(card, (pad, pad))
    return canvas


def browser(src, out, crop_top=0, url="app.logisweb.co.kr", width=2000):
    im = Image.open(os.path.join(IMG, src)).convert("RGB")
    if crop_top:
        im = im.crop((0, crop_top, im.width, im.height))
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    bar = 64
    W, H = im.width, im.height + bar
    card = Image.new("RGBA", (W, H), hexrgb("#0F1A30"))
    d = ImageDraw.Draw(card)
    for i, c in enumerate(["#FF5F57", "#FEBC2E", "#28C840"]):
        x = 36 + i * 34
        d.ellipse([x - 10, bar / 2 - 10, x + 10, bar / 2 + 10], fill=hexrgb(c))
    # url pill
    d.rounded_rectangle([160, 14, 760, bar - 14], 12, fill=hexrgb("#16223D"))
    f = ImageFont.truetype(FONT, 24)
    d.text((186, bar / 2), "\U0001F512  " if False else url, font=f, fill=hexrgb("#8FB0F0"), anchor="lm")
    card.paste(im, (0, bar))
    # border
    d.rounded_rectangle([0, 0, W - 1, H - 1], 26, outline=hexrgb("#8FB0F0", 70), width=3)
    card.putalpha(rounded_mask((W, H), 26))
    with_shadow(card).save(os.path.join(OUT, out))


def phone(src, out, crop_top=0, width=780):
    im = Image.open(os.path.join(IMG, src)).convert("RGB")
    if crop_top:
        im = im.crop((0, crop_top, im.width, im.height))
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    bez = 22
    W, H = im.width + bez * 2, im.height + bez * 2
    card = Image.new("RGBA", (W, H), hexrgb("#05090F"))
    inner = Image.new("RGBA", im.size)
    inner.paste(im)
    inner.putalpha(rounded_mask(im.size, 70))
    card.alpha_composite(inner, (bez, bez))
    d = ImageDraw.Draw(card)
    d.rounded_rectangle([0, 0, W - 1, H - 1], 92, outline=hexrgb("#8FB0F0", 90), width=4)
    card.putalpha(Image.composite(card.getchannel("A"), Image.new("L", (W, H), 0), rounded_mask((W, H), 92)))
    with_shadow(card, pad=80, blur=40).save(os.path.join(OUT, out))


# screenshots with the current LOGISWEB brand
browser("real-home.jpg", "f-home.png")
browser("real-dispatch.jpg", "f-dispatch.png")
browser("real-board.jpg", "f-board.png")
browser("real-livemap.jpg", "f-livemap.png")
browser("real-control.jpg", "f-control.png")
browser("real-settle.jpg", "f-settle.png")
browser("real-revenue.jpg", "f-revenue.png")
browser("real-revenue2.jpg", "f-revenue2.png")
browser("real-fare.jpg", "f-fare.png")
# older captures still show the previous product name in the top bar -> drop that bar
browser("real-approval.jpg", "f-approval.png", crop_top=75)
browser("real-scan.jpg", "f-scan.png", crop_top=75)

phone("m-control.jpg", "p-control.png")
phone("m-approval.jpg", "p-approval.png")
# driver screens: drop the small old-name caption line at the very top
phone("m-driver-order.jpg", "p-driver-order.png", crop_top=66)
phone("m-driver-log.jpg", "p-driver-log.png", crop_top=66)
phone("m-board.jpg", "p-board.png", crop_top=0)

# trimmed logos
for n in ["logisweb-lockup", "logisweb-mark"]:
    im = Image.open(os.path.join(HERE, n + ".png"))
    im.crop(im.getbbox()).save(os.path.join(OUT, n + ".png"))

for f in sorted(os.listdir(OUT)):
    print(f, Image.open(os.path.join(OUT, f)).size)
