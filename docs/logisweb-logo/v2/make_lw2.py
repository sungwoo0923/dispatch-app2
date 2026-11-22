# 로지스웹 새 로고 — 처음부터 새 아이디어 X1~X8 · python3 make_lw2.py
import math
NAVY, NAVY2, BLUE, BLUE2, SKY, PALE, GOLD, WHITE = "#0F1A30", "#1B2B4B", "#2D4C82", "#4E6FB4", "#8FB0F0", "#EAF1FF", "#FFC24B", "#FFFFFF"
def svg(name, bg, body):
    fill = {"navy": NAVY, "white": WHITE, "sky": "url(#skyg)", "blue": "url(#blueg)"}[bg]
    d = ('<defs><linearGradient id="skyg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EEF4FF"/><stop offset="1" stop-color="#CFDDF7"/></linearGradient>'
         '<linearGradient id="blueg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3D63AE"/><stop offset="1" stop-color="#1B2B4B"/></linearGradient>'
         '<radialGradient id="dot"><stop offset="0" stop-color="#FFC24B" stop-opacity=".7"/><stop offset="1" stop-color="#FFC24B" stop-opacity="0"/></radialGradient></defs>')
    edge = '<rect x="4" y="4" width="1432" height="1432" rx="300" fill="none" stroke="#DCE3EE" stroke-width="8"/>' if bg == "white" else ""
    open(name, "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 1440">{d}<rect width="1440" height="1440" rx="300" fill="{fill}"/>{edge}{body}</svg>')
def node(x, y, r=38, c=WHITE, ring=None):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{c}"/>' + (f'<circle cx="{x}" cy="{y}" r="{r+26}" fill="none" stroke="{ring}" stroke-width="12"/>' if ring else "")

# X1 노선 L — 출발 · 경유 · 도착 거점을 잇는 노선이 L 모양(로지스 = 길), 모퉁이 금색 = 배차 허브
x1 = (f'<path d="M420 300 V1000 H1060" fill="none" stroke="{WHITE}" stroke-width="110" stroke-linecap="round" stroke-linejoin="round"/>'
      + node(420, 300, 62, WHITE) + node(420, 650, 34, NAVY) + node(740, 1000, 34, NAVY) + node(1060, 1000, 62, WHITE)
      + f'<circle cx="420" cy="1000" r="150" fill="url(#dot)"/>' + node(420, 1000, 92, GOLD))
svg("X1_route_L.svg", "navy", x1)

# X2 배차판 타일 — 2×2 둥근 칸(프로그램 화면) 중 한 칸이 금색 화살표(배차 완료)로 움직인다
x2 = ""
for i, (x, y) in enumerate([(330, 330), (760, 330), (330, 760), (760, 760)]):
    if i == 3: x2 += f'<rect x="{x}" y="{y}" width="350" height="350" rx="90" fill="{GOLD}"/><path d="M{x+90} {y+175} H{x+250} M{x+185} {y+100} L{x+260} {y+175} L{x+185} {y+250}" fill="none" stroke="{NAVY}" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>'
    else: x2 += f'<rect x="{x}" y="{y}" width="350" height="350" rx="90" fill="{[WHITE, SKY, BLUE2][i]}"/>'
svg("X2_board_tiles.svg", "navy", x2)

# X3 도로 W — W 자를 고속도로로(가운데 차선 점선), 끝에 금색 도착점
wpath = "M260 420 L470 1020 L720 560 L970 1020 L1180 420"
x3 = (f'<path d="{wpath}" fill="none" stroke="{NAVY}" stroke-width="190" stroke-linecap="round" stroke-linejoin="round"/>'
      f'<path d="{wpath}" fill="none" stroke="{WHITE}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="46 40"/>'
      + node(1180, 420, 70, GOLD))
svg("X3_road_W.svg", "sky", x3)

# X4 방패 L — 믿을 수 있는 데이터 · 정산(보안), 방패 안에 L 체크
x4 = (f'<path d="M720 220 L1130 370 V720 C1130 960 950 1140 720 1230 C490 1140 310 960 310 720 V370 Z" fill="{WHITE}"/>'
      f'<path d="M560 470 V880 H900" fill="none" stroke="{NAVY}" stroke-width="110" stroke-linecap="round" stroke-linejoin="round"/>'
      + node(900, 880, 56, GOLD))
svg("X4_shield_L.svg", "blue", x4)

# X5 웹 사분원 — 거미줄(Web)처럼 퍼지는 동심 호와 방사선, 모서리 L이 중심 · 금색 거점
x5 = ""
cx, cy = 330, 1110
for r in (260, 470, 680):
    x5 += f'<path d="M{cx} {cy-r} A{r} {r} 0 0 1 {cx+r} {cy}" fill="none" stroke="{SKY}" stroke-opacity=".75" stroke-width="22" stroke-linecap="round"/>'
for a in (0, 30, 60, 90):
    ra = math.radians(-a); x5 += f'<line x1="{cx}" y1="{cy}" x2="{cx + 760*math.cos(ra):.0f}" y2="{cy + 760*math.sin(ra):.0f}" stroke="{SKY}" stroke-opacity=".45" stroke-width="14" stroke-linecap="round"/>'
x5 += f'<path d="M{cx} {cy-760} V{cy} H{cx+760}" fill="none" stroke="{WHITE}" stroke-width="96" stroke-linecap="round" stroke-linejoin="round"/>'
gx, gy = cx + 470*math.cos(math.radians(-45)), cy + 470*math.sin(math.radians(-45))
x5 += f'<circle cx="{gx:.0f}" cy="{gy:.0f}" r="130" fill="url(#dot)"/>' + node(int(gx), int(gy), 56, GOLD)
svg("X5_web_quadrant.svg", "navy", x5)

# X6 화물 박스 — 평면 아이소메트릭 상자, 앞면에 L · W가 새겨진 테이프
c, s = (720, 760), 430
top = [(c[0], c[1]-s), (c[0]+s*.866, c[1]-s/2), c, (c[0]-s*.866, c[1]-s/2)]
left = [(c[0]-s*.866, c[1]-s/2), c, (c[0], c[1]+s), (c[0]-s*.866, c[1]+s/2)]
right = [c, (c[0]+s*.866, c[1]-s/2), (c[0]+s*.866, c[1]+s/2), (c[0], c[1]+s)]
P = lambda pts: " ".join(f"{x:.0f},{y:.0f}" for x, y in pts)
x6 = f'<polygon points="{P(top)}" fill="{GOLD}"/><polygon points="{P(left)}" fill="{WHITE}"/><polygon points="{P(right)}" fill="{SKY}"/>'
x6 += f'<polygon points="{P([(c[0]-s*.433, c[1]-s*.75), (c[0]+s*.433, c[1]-s*.25), (c[0]+s*.433-60, c[1]-s*.25+35), (c[0]-s*.433-60, c[1]-s*.75+35)])}" fill="{NAVY}" fill-opacity=".25"/>'
# 왼쪽 면 L, 오른쪽 면 W(면 기울기 따라)
x6 += f'<path d="M{c[0]-s*.62:.0f} {c[1]-s*.02:.0f} L{c[0]-s*.62:.0f} {c[1]+s*.48:.0f} L{c[0]-s*.2:.0f} {c[1]+s*.72:.0f}" fill="none" stroke="{NAVY}" stroke-width="62" stroke-linecap="round" stroke-linejoin="round"/>'
x6 += f'<path d="M{c[0]+s*.18:.0f} {c[1]+s*.2:.0f} L{c[0]+s*.3:.0f} {c[1]+s*.62:.0f} L{c[0]+s*.45:.0f} {c[1]+s*.28:.0f} L{c[0]+s*.58:.0f} {c[1]+s*.5:.0f} L{c[0]+s*.7:.0f} {c[1]-s*.02:.0f}" fill="none" stroke="{NAVY}" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"/>'
svg("X6_box_LW.svg", "navy", x6)

# X7 갈고리 화살표 L — l 자가 아래에서 오른쪽으로 꺾여 달리는 화살표(출발 → 도착)
x7 = (f'<path d="M500 280 V820 Q500 1020 700 1020 H1000" fill="none" stroke="{NAVY}" stroke-width="150" stroke-linecap="round"/>'
      f'<path d="M930 860 L1140 1020 L930 1180 Z" fill="{NAVY}" stroke="{NAVY}" stroke-width="34" stroke-linejoin="round"/>'
      + node(500, 280, 74, GOLD))
svg("X7_hook_arrow.svg", "white", x7)

# X8 성장 막대 L — 세 막대가 오르며 L 윤곽을 이루고, 꼭대기에 금색 점(매출 · 성장)
x8 = ""
for i, (x, h, col) in enumerate([(330, 360, SKY), (590, 560, BLUE2), (850, 790, WHITE)]):
    x8 += f'<rect x="{x}" y="{1120-h}" width="200" height="{h}" rx="60" fill="{col}"/>'
x8 += f'<path d="M260 1200 H1180" stroke="{WHITE}" stroke-opacity=".35" stroke-width="20" stroke-linecap="round"/>' + f'<circle cx="950" cy="250" r="120" fill="url(#dot)"/>' + node(950, 250, 64, GOLD)
svg("X8_growth_bars.svg", "blue", x8)
print("ok")
