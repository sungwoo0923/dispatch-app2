# 로지스웹 허브 로고 — 레이더 관제 × F3(와이어 지구 + 궤도) 합친 시안 R1 · R2 · R3 · python3 make_radar.py
import math
import make_wire2 as M
DEFS, TILE, CX, CY, R = M.DEFS, M.TILE, M.CX, M.CY, M.R
SW = '''<defs><linearGradient id="swp" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#8FB0F0" stop-opacity="0"/><stop offset=".55" stop-color="#8FB0F0" stop-opacity=".28"/><stop offset="1" stop-color="#DCE7FF" stop-opacity=".7"/></linearGradient>
<radialGradient id="swr" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#8FB0F0" stop-opacity=".0"/><stop offset="1" stop-color="#8FB0F0" stop-opacity=".35"/></radialGradient>
<clipPath id="globeClip"><circle cx="720" cy="720" r="500"/></clipPath></defs>'''
def W(name, body): open(name, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 1440">{DEFS}{SW}{TILE}{body}</svg>')
def pol(r, deg): a = math.radians(deg); return CX + r * math.cos(a), CY + r * math.sin(a)
def sweep(r, a0, a1, clip=False):
    x0, y0 = pol(r, a0); x1, y1 = pol(r, a1)
    big = 1 if (a1 - a0) % 360 > 180 else 0
    g = f'<path d="M{CX} {CY} L{x0:.0f} {y0:.0f} A{r} {r} 0 {big} 1 {x1:.0f} {y1:.0f} Z" fill="url(#swp)"/>'
    g += f'<line x1="{CX}" y1="{CY}" x2="{x1:.0f}" y2="{y1:.0f}" stroke="#FFFFFF" stroke-opacity=".9" stroke-width="5" filter="url(#glow)"/>'
    return f'<g clip-path="url(#globeClip)">{g}</g>' if clip else g
def ticks(r, n=72, long_every=6, l1=14, l2=34, o=.55, w=3):
    s = ""
    for i in range(n):
        a = i * 360 / n; L = l2 if i % long_every == 0 else l1
        x1, y1 = pol(r, a); x2, y2 = pol(r + L, a)
        s += f'<line x1="{x1:.0f}" y1="{y1:.0f}" x2="{x2:.0f}" y2="{y2:.0f}" stroke="#CFE0FF" stroke-opacity="{o if i % long_every == 0 else o*.55:.2f}" stroke-width="{w}"/>'
    return s
def ring(r, o=.35, w=3, dash=None):
    return f'<circle cx="{CX}" cy="{CY}" r="{r}" fill="none" stroke="#8FB0F0" stroke-opacity="{o}" stroke-width="{w}"' + (f' stroke-dasharray="{dash}"' if dash else '') + '/>'
def blip(r, deg, s=1.0):
    x, y = pol(r, deg)
    return f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{26*s:.0f}" fill="url(#gd)"/><circle cx="{x:.0f}" cy="{y:.0f}" r="{11*s:.0f}" fill="#FFFFFF"/>'
GLOBE = M.SPHERE + M.wire() + M.network() + M.EDGE

# R1 레이더 지구: F3 + 지구 위를 훑는 레이더 + 바깥 레이더 고리
r1 = M.orbit(True) + GLOBE + sweep(R, -95, -35, clip=True) + ring(R + 70, .4, 3, "4 14") + ring(R + 118, .22, 2) + M.routes() + M.orbit(False) + M.HUB
W('R1_radar_globe.svg', r1)

# R2 관제 HUD: 지구를 조금 작게 + 레이더 스코프(눈금 · 모서리 꺾쇠 · 바깥 블립)
SC = .78
inner = f'<g transform="translate({CX*(1-SC):.0f} {CY*(1-SC):.0f}) scale({SC})">{GLOBE}{M.routes()}{M.HUB}</g>'
scopeR = R * SC + 62
hud = ring(scopeR, .55, 4) + ticks(scopeR + 8, 72, 6, 12, 30, .6, 3) + ring(scopeR + 70, .18, 2)
for cx_, cy_, dx, dy in ((150, 150, 1, 1), (1290, 150, -1, 1), (150, 1290, 1, -1), (1290, 1290, -1, -1)):
    hud += f'<path d="M{cx_} {cy_ + 90*dy} L{cx_} {cy_} L{cx_ + 90*dx} {cy_}" fill="none" stroke="#CFE0FF" stroke-opacity=".7" stroke-width="6" stroke-linecap="round"/>'
hud += blip(scopeR, -52, 1.1) + blip(scopeR, 28, .8) + blip(scopeR, 142, .8)
W('R2_hud_scope.svg', hud + inner + sweep(scopeR, -100, -40))

# R3 미니멀: 와이어 지구(노드 없이) + 레이더 + 궤도 하나 + 노선 5개
r3 = M.orbit(True) + M.SPHERE + M.wire(24, 2.4) + M.EDGE + sweep(R, -95, -30, clip=True)
keep = M.ROUTES; M.ROUTES = [(35.7, 139.7), (1.3, 103.8), (-33.9, 151.2), (25.2, 55.3), (55.7, 37.6)]
r3 += M.routes(8) + M.orbit(False) + M.HUB; M.ROUTES = keep
W('R3_minimal_radar.svg', r3)
print("ok")
