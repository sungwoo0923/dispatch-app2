# U3 hub 글자 로고 — 아래 선을 로지스웹 마크의 금색 노선(왼쪽에서 흐리게 시작 → 아래로 꺾였다 → 오른쪽 위 빛나는 점)처럼 · python3 make_u3.py
NAVY, WHITE, GOLD, SKY = "#0F1A30", "#FFFFFF", "#FFD27A", "#8FB0F0"
LETTERS = (f'<g fill="none" stroke="{WHITE}" stroke-width="92" stroke-linecap="round" stroke-linejoin="round">'
           '<path d="M250 420 V960"/><path d="M250 760 Q250 620 380 620 Q500 620 500 760 V960"/>'
           '<path d="M620 620 V820 Q620 960 750 960 Q870 960 870 820 V620"/>'
           '<path d="M990 420 V960"/><path d="M990 800 Q990 620 1110 620 Q1230 620 1230 790 Q1230 960 1110 960 Q990 960 990 800"/></g>')
def make(name, pts, w=9, bg=NAVY, letters=WHITE, glow=True):
    x0, x1 = pts[0][0], pts[-1][0]; ex, ey = pts[-1]
    poly = " ".join(f"{x},{y}" for x, y in pts)
    defs = (f'<defs><linearGradient id="rt" gradientUnits="userSpaceOnUse" x1="{x0}" y1="0" x2="{x1}" y2="0">'
            f'<stop offset="0" stop-color="{GOLD}" stop-opacity="0"/><stop offset=".45" stop-color="{GOLD}"/><stop offset="1" stop-color="{GOLD}"/></linearGradient>'
            f'<radialGradient id="dot"><stop offset="0" stop-color="{GOLD}" stop-opacity=".75"/><stop offset="1" stop-color="{GOLD}" stop-opacity="0"/></radialGradient></defs>')
    body = (f'<g transform="translate(58 10) scale(.92)">{LETTERS.replace(WHITE, letters)}'
            f'<polyline points="{poly}" fill="none" stroke="url(#rt)" stroke-width="{w}" stroke-linejoin="miter"/>'
            + (f'<circle cx="{ex}" cy="{ey}" r="70" fill="url(#dot)"/>' if glow else "") +
            f'<circle cx="{ex}" cy="{ey}" r="22" fill="{GOLD}"/></g>')
    open(name, "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 1440">{defs}<rect width="1440" height="1440" rx="300" fill="{bg}"/>{body}</svg>')
# A 로지스웹 마크와 같은 꺾임(왼쪽 → 가운데 아래 → 오른쪽 위로)
make("U3a_route_v.svg", [(170, 1020), (800, 1230), (1290, 1060)])
# B 완만한 꺾임(글자 아래를 길게 받치고 끝에서 살짝 올라감)
make("U3b_route_soft.svg", [(170, 1070), (1060, 1170), (1290, 1040)])
# C b 글자 끝에서 출발해 아래로 돌아 나가는 노선(한 붓 느낌)
make("U3c_route_from_b.svg", [(170, 1000), (720, 1210), (1290, 1000), (1330, 760)])
# D 밝은 바탕 버전(A와 같은 선, 네이비 글자)
make("U3d_light.svg", [(170, 1020), (800, 1230), (1290, 1060)], bg="#F2F5FA", letters=NAVY)
print("ok")

# ── 2026-11-22 일자 선 + 약한 그라데이션
def straight(name, y=1100, x0=200, x1=1270, w=12, c0=GOLD, o0=.25, c1=GOLD, bg=NAVY, letters=WHITE):
    defs = (f'<defs><linearGradient id="st" gradientUnits="userSpaceOnUse" x1="{x0}" y1="0" x2="{x1}" y2="0">'
            f'<stop offset="0" stop-color="{c0}" stop-opacity="{o0}"/><stop offset="1" stop-color="{c1}"/></linearGradient>'
            f'<radialGradient id="dot"><stop offset="0" stop-color="{GOLD}" stop-opacity=".7"/><stop offset="1" stop-color="{GOLD}" stop-opacity="0"/></radialGradient></defs>')
    body = (f'<g transform="translate(58 30) scale(.92)">{LETTERS.replace(WHITE, letters)}'
            f'<line x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" stroke="url(#st)" stroke-width="{w}" stroke-linecap="round"/>'
            f'<circle cx="{x1}" cy="{y}" r="66" fill="url(#dot)"/><circle cx="{x1}" cy="{y}" r="24" fill="{GOLD}"/></g>')
    open(name, "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 1440">{defs}<rect width="1440" height="1440" rx="300" fill="{bg}"/>{body}</svg>')
straight("U3e_line_gold.svg")                                   # 금색 · 왼쪽이 옅게
straight("U3f_line_sky_gold.svg", w=16, c0=SKY, o0=.35)        # 하늘색 → 금색
straight("U3g_line_light.svg", bg="#F2F5FA", letters=NAVY, c0="#C9A24A", o0=.2)  # 밝은 바탕
print("ok2")
