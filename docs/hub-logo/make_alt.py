# 로지스웹 허브 로고 — 지구가 아닌 시안(L 한반도 네트워크 · M H 모노그램 · N 순환 노선 · O 화물 큐브 · P 레이더 관제 · Q 모든 길이 허브로)
# 실행: python3 make_alt.py  (한반도 좌표: /tmp/claude-0/kr_c.json · kr.json — @svg-maps/south-korea 에서 뽑음)
import math, json
import make_wire2 as M
DEFS, TILE = M.DEFS, M.TILE
def W(name, body): open(name, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 1440">{DEFS}{TILE}{body}</svg>')
def hub(x, y, s=1.0):
    return (f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{150*s:.0f}" fill="url(#gd)"/><circle cx="{x:.0f}" cy="{y:.0f}" r="{74*s:.0f}" fill="none" stroke="#FFD27A" stroke-opacity=".45" stroke-width="4"/>'
            f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{42*s:.0f}" fill="#0B1428" stroke="#FFD27A" stroke-width="{13*s:.0f}" filter="url(#glow)"/><circle cx="{x:.0f}" cy="{y:.0f}" r="{17*s:.0f}" fill="#FFD27A"/>')
def node(x, y, r=13, ring=True):
    return f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r}" fill="#FFFFFF"/>' + (f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r*2.1:.0f}" fill="none" stroke="#FFFFFF" stroke-opacity=".38" stroke-width="4"/>' if ring else "")
def glow_path(d, w=7):
    return f'<path d="{d}" fill="none" stroke="#8FB0F0" stroke-opacity=".32" stroke-width="{w+11}" stroke-linecap="round" stroke-linejoin="round"/><path d="{d}" fill="none" stroke="#FFFFFF" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>'
def thin(x1, y1, x2, y2, o=.35, w=3):
    return f'<line x1="{x1:.0f}" y1="{y1:.0f}" x2="{x2:.0f}" y2="{y2:.0f}" stroke="#CFE0FF" stroke-opacity="{o}" stroke-width="{w}"/>'

# ── L 한반도 네트워크: 시 · 도 거점을 잇는 그물 + 대전 금색 허브에서 전국으로
kr = json.load(open('/tmp/claude-0/kr.json')); cen = {c['id']: c for c in json.load(open('/tmp/claude-0/kr_c.json'))}
S = 1.92; OX = 720 - 262 * S; OY = 720 - 335 * S  # 본토 가운데(약 262, 335)를 타일 한가운데로
T = lambda x, y: (OX + x * S, OY + y * S)
fix = {"gyeonggi": (165, 150), "gangwon": (285, 120), "north-gyeongsang": (355, 250), "south-gyeongsang": (290, 385), "jeju": (120, 600)}
pts = {k: T(*fix.get(k, (c['cx'], c['cy']))) for k, c in cen.items()}
L = f'<g transform="translate({OX:.1f} {OY:.1f}) scale({S})">' + "".join(f'<path d="{l["path"]}" fill="#8FB0F0" fill-opacity=".07" stroke="#8FB0F0" stroke-opacity=".38" stroke-width="{1.6/S*1.6:.2f}"/>' for l in kr['locations']) + '</g>'
keys = list(pts); seen = set()
for a in keys:
    for _, b in sorted((math.dist(pts[a], pts[b]), b) for b in keys if b != a)[:3]:
        k = tuple(sorted((a, b)))
        if k in seen or math.dist(pts[a], pts[b]) > 330: continue
        seen.add(k); L += thin(*pts[a], *pts[b], .32, 3)
hx, hy = pts['daejeon']
for k in ['seoul', 'busan', 'gwangju', 'gangwon', 'incheon', 'ulsan', 'jeju', 'north-gyeongsang']:
    x, y = pts[k]; mx, my = (hx + x) / 2, (hy + y) / 2; dx, dy = x - hx, y - hy; d = math.hypot(dx, dy) or 1
    L += glow_path(f'M{hx:.0f} {hy:.0f} Q{mx - dy/d*70:.0f} {my + dx/d*70:.0f} {x:.0f} {y:.0f}', 6)
for k, (x, y) in pts.items():
    if k not in ('daejeon', 'sejong'): L += node(x, y, 11 if k in ('seoul', 'busan') else 9, k in ('seoul', 'busan', 'gwangju', 'jeju', 'gangwon'))
W('L_korea_net.svg', L + hub(hx, hy, .9))

# ── M H 모노그램: 두 기둥(노드 4개씩) + 가운데 다리, 대각선 연결은 흐리게 · 가운데 금색 허브
lx, rx, ys = 470, 970, [360, 600, 840, 1080]
m = ""
for i, a in enumerate(ys):
    for b in ys:
        if a != b: m += thin(lx, a, rx, b, .12, 2.5)
m += glow_path(f'M{lx} {ys[0]} L{lx} {ys[-1]}', 9) + glow_path(f'M{rx} {ys[0]} L{rx} {ys[-1]}', 9) + glow_path(f'M{lx} 720 L{rx} 720', 9)
for y in ys: m += node(lx, y, 15) + node(rx, y, 15)
W('M_h_monogram.svg', m + hub(720, 720))

# ── N 순환 노선(∞): 끊기지 않는 물류 흐름, 교차점이 허브
pts8 = [(720 + 430 * math.cos(t) / (1 + math.sin(t) ** 2), 720 + 430 * math.sin(t) * math.cos(t) / (1 + math.sin(t) ** 2) * 1.25) for t in [i * 2 * math.pi / 240 for i in range(241)]]
d = "M" + " L".join(f"{x:.0f} {y:.0f}" for x, y in pts8)
n = f'<path d="{d}" fill="none" stroke="#8FB0F0" stroke-opacity=".18" stroke-width="60"/>' + glow_path(d, 12)
for i in (20, 55, 100, 140, 185, 220):
    x, y = pts8[i]; n += node(x, y, 15)
x1, y1 = pts8[34]; x2, y2 = pts8[38]; ang = math.degrees(math.atan2(y2 - y1, x2 - x1))
n += f'<g transform="translate({x2:.0f} {y2:.0f}) rotate({ang:.0f})"><path d="M-26 -22 L14 0 L-26 22" fill="none" stroke="#FFFFFF" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></g>'
W('N_loop.svg', n + hub(720, 720, .95))

# ── O 화물 큐브: 아이소메트릭 박스를 네트워크 선으로(면마다 격자), 앞 꼭짓점이 허브
c, s = (720, 760), 400
top = (c[0], c[1] - s); tr = (c[0] + s * .866, c[1] - s / 2); br = (c[0] + s * .866, c[1] + s / 2); bot = (c[0], c[1] + s); bl = (c[0] - s * .866, c[1] + s / 2); tl = (c[0] - s * .866, c[1] - s / 2)
def lerp(a, b, t): return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
o = ""
for face in [(tl, top, tr, c), (tl, c, bot, bl), (c, tr, br, bot)]:
    p0, p1, p2, p3 = face
    for t in (1/3, 2/3):
        a, b = lerp(p0, p1, t), lerp(p3, p2, t); o += thin(*a, *b, .3, 3)
        a, b = lerp(p0, p3, t), lerp(p1, p2, t); o += thin(*a, *b, .3, 3)
o += f'<path d="M{tl[0]:.0f} {tl[1]:.0f} L{c[0]} {c[1]} L{tr[0]:.0f} {tr[1]:.0f} L{top[0]} {top[1]} Z" fill="#8FB0F0" fill-opacity=".10"/>'
o += glow_path(f'M{top[0]} {top[1]} L{tr[0]:.0f} {tr[1]:.0f} L{br[0]:.0f} {br[1]:.0f} L{bot[0]} {bot[1]} L{bl[0]:.0f} {bl[1]:.0f} L{tl[0]:.0f} {tl[1]:.0f} Z', 9)
o += glow_path(f'M{tl[0]:.0f} {tl[1]:.0f} L{c[0]} {c[1]} L{tr[0]:.0f} {tr[1]:.0f} M{c[0]} {c[1]} L{bot[0]} {bot[1]}', 8)
for p in (top, tr, br, bot, bl, tl): o += node(*p, 14)
W('O_cargo_cube.svg', o + hub(*c, .95))

# ── P 레이더 관제: 동심원 + 회전하는 빛 + 거점(실시간 관제 · 매칭)
p = ""
for r, op in ((180, .5), (330, .38), (480, .28)): p += f'<circle cx="720" cy="720" r="{r}" fill="none" stroke="#8FB0F0" stroke-opacity="{op}" stroke-width="4"/>'
p += thin(720, 220, 720, 1220, .22, 3) + thin(220, 720, 1220, 720, .22, 3)
p += '<defs><linearGradient id="sw" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#8FB0F0" stop-opacity="0"/><stop offset="1" stop-color="#8FB0F0" stop-opacity=".55"/></linearGradient></defs>'
a0, a1 = math.radians(-80), math.radians(-25)
p += f'<path d="M720 720 L{720 + 480*math.cos(a0):.0f} {720 + 480*math.sin(a0):.0f} A480 480 0 0 1 {720 + 480*math.cos(a1):.0f} {720 + 480*math.sin(a1):.0f} Z" fill="url(#sw)"/>'
p += glow_path(f'M720 720 L{720 + 480*math.cos(a1):.0f} {720 + 480*math.sin(a1):.0f}', 6)
for ang, r in ((-60, 330), (-15, 480), (20, 180), (75, 330), (140, 480), (200, 330), (245, 180)):
    x, y = 720 + r * math.cos(math.radians(ang)), 720 + r * math.sin(math.radians(ang))
    p += thin(720, 720, x, y, .4, 3) + node(x, y, 12, r != 180)
W('P_radar.svg', p + hub(720, 720))

# ── Q 모든 길이 허브로: 아래에서 뻗은 길(차선)이 한 점(허브)으로 모이는 원근
vx, vy = 720, 560
q = ""
for bx in (-200, 140, 470, 720, 970, 1300, 1640):
    q += f'<line x1="{bx}" y1="1440" x2="{vx}" y2="{vy}" stroke="#8FB0F0" stroke-opacity=".28" stroke-width="5"/>'
for bx, w in ((300, 9), (1140, 9)):
    q += glow_path(f'M{bx} 1440 L{vx} {vy}', w)
for sx, sy, cx2, cy2 in ((-40, 900, 380, 760), (1480, 900, 1060, 760), (-40, 560, 360, 520), (1480, 560, 1080, 520)):
    q += glow_path(f'M{sx} {sy} Q{cx2} {cy2} {vx} {vy}', 6)
for i, y in enumerate((1300, 1080, 910, 780)):
    t = (y - vy) / (1440 - vy); w = 16 * t + 4; q += f'<line x1="{vx}" y1="{y}" x2="{vx}" y2="{y - 80*t - 10:.0f}" stroke="#FFFFFF" stroke-opacity=".75" stroke-width="{w:.0f}" stroke-linecap="round"/>'
q += f'<line x1="140" y1="{vy}" x2="1300" y2="{vy}" stroke="#8FB0F0" stroke-opacity=".35" stroke-width="3"/>'
W('Q_all_roads.svg', f'<defs><clipPath id="qc"><rect width="1440" height="1440" rx="300"/></clipPath></defs><g clip-path="url(#qc)">{q}</g>' + hub(vx, vy))
print("ok")
