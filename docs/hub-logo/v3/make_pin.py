# 로지스웹 허브 로고 — S6 핀 안에 디지털 지구(경위선 · 거점 네트워크 · 금색 한국 허브) T1 · T2 · T3 · python3 make_pin.py
import math
NAVY, NAVY2, BLUE, SKY, GOLD, WHITE = "#0F1A30", "#1B2B4B", "#2D4C82", "#8FB0F0", "#FFC24B", "#FFFFFF"
DEFS = ('<defs><linearGradient id="skyg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EAF1FF"/><stop offset="1" stop-color="#C9DAF8"/></linearGradient>'
        '<linearGradient id="blueg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3D63AE"/><stop offset="1" stop-color="#1B2B4B"/></linearGradient>'
        '<radialGradient id="globeg" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#2F5199"/><stop offset=".7" stop-color="#142650"/><stop offset="1" stop-color="#0B1428"/></radialGradient>'
        '<radialGradient id="gd"><stop offset="0" stop-color="#FFC24B" stop-opacity=".9"/><stop offset="1" stop-color="#FFC24B" stop-opacity="0"/></radialGradient></defs>')
def svg(name, bg, body):
    fill = {"navy": NAVY, "sky": "url(#skyg)", "blue": "url(#blueg)"}[bg]
    open(name, "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 1440">{DEFS}<rect width="1440" height="1440" rx="300" fill="{fill}"/>{body}</svg>')

def globe(cx, cy, R, line="#8FB0F0", node="#FFFFFF", fill="url(#globeg)", tilt=30, cl=122, step=30):
    t = math.radians(tilt)
    def P(lat, lon):
        la, lo = math.radians(lat), math.radians(lon - cl)
        x = math.cos(la) * math.sin(lo); y = math.sin(la); z = math.cos(la) * math.cos(lo)
        return cx + R * x, cy - R * (y * math.cos(t) - z * math.sin(t)), y * math.sin(t) + z * math.cos(t)
    s = f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="{fill}"/>'
    def seg(pts):
        out = ""
        for (x1, y1, z1), (x2, y2, z2) in zip(pts, pts[1:]):
            z = (z1 + z2) / 2
            if z > 0: out += f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{line}" stroke-opacity="{.12 + .5*z:.2f}" stroke-width="{R/95:.1f}" stroke-linecap="round"/>'
        return out
    for lat in range(-60, 61, step): s += seg([P(lat, l) for l in range(-180, 181, 4)])
    for lon in range(-180, 180, step): s += seg([P(la, lon) for la in range(-88, 89, 4)])
    hub = P(37.5, 127)
    # 전국 → 세계 거점(한국 주변이 촘촘하게)
    cities = [(35.1, 129), (35.2, 126.8), (37.9, 128.6), (33.5, 126.5), (35.7, 139.7), (31.2, 121.5), (39.9, 116.4), (22.3, 114.2), (1.3, 103.8), (13.7, 100.5), (55.7, 37.6), (-33.9, 151.2), (19, 72.8), (61, -150)]
    pts = [P(*c) for c in cities]
    vis = [p for p in pts if p[2] > .1]
    for i, p in enumerate(vis):  # 거점끼리 그물(가까운 2곳)
        for _, q in sorted(((math.dist(p[:2], q[:2]), q) for q in vis if q is not p), key=lambda x: x[0])[:2]:
            s += f'<line x1="{p[0]:.0f}" y1="{p[1]:.0f}" x2="{q[0]:.0f}" y2="{q[1]:.0f}" stroke="{node}" stroke-opacity=".28" stroke-width="{R/120:.1f}"/>'
    for p in vis:  # 허브에서 거점으로 노선(살짝 휘게)
        mx, my = (hub[0] + p[0]) / 2, (hub[1] + p[1]) / 2; dx, dy = mx - cx, my - cy; d = math.hypot(dx, dy) or 1
        L = math.dist(hub[:2], p[:2]); lift = .22 * L + R * .03
        s += f'<path d="M{hub[0]:.0f} {hub[1]:.0f} Q{mx + dx/d*lift:.0f} {my + dy/d*lift:.0f} {p[0]:.0f} {p[1]:.0f}" fill="none" stroke="{node}" stroke-width="{R/62:.1f}" stroke-linecap="round"/>'
        s += f'<circle cx="{p[0]:.0f}" cy="{p[1]:.0f}" r="{R/30:.1f}" fill="{node}"/>'
    s += f'<circle cx="{hub[0]:.0f}" cy="{hub[1]:.0f}" r="{R*.26:.0f}" fill="url(#gd)"/><circle cx="{hub[0]:.0f}" cy="{hub[1]:.0f}" r="{R*.085:.0f}" fill="{GOLD}" stroke="{NAVY}" stroke-width="{R/55:.1f}"/>'
    return s

PIN = "M720 1250 C 560 1035 330 865 330 625 A390 390 0 1 1 1110 625 C 1110 865 880 1035 720 1250 Z"
# T1 흰 핀 + 네이비 디지털 지구(파란 바탕) — S6 그대로, 박스 자리에 지구
t1 = f'<path d="{PIN}" fill="{WHITE}"/>' + globe(720, 625, 285)
svg("T1_pin_globe.svg", "blue", t1)
# T2 네이비 핀 + 흰 선 지구(밝은 하늘 바탕) — 밝은 화면 · 인쇄용
t2 = f'<path d="{PIN}" fill="{NAVY}"/>' + globe(720, 625, 285, line="#CFE0FF", node=WHITE, fill="#1B2B4B")
svg("T2_navy_pin.svg", "sky", t2)
# T3 지구가 곧 핀 머리 — 지구 아래로 핀 꼬리, 바닥에 위치 고리(네이비 바탕)
t3 = (f'<ellipse cx="720" cy="1230" rx="190" ry="44" fill="none" stroke="{SKY}" stroke-opacity=".55" stroke-width="12"/>'
      f'<ellipse cx="720" cy="1230" rx="90" ry="20" fill="{SKY}" fill-opacity=".45"/>'
      f'<path d="M470 820 Q 600 1060 720 1225 Q 840 1060 970 820 Z" fill="{WHITE}"/>'
      f'<circle cx="720" cy="610" r="400" fill="{WHITE}"/>' + globe(720, 610, 365))
svg("T3_globe_head.svg", "navy", t3)
print("ok")
