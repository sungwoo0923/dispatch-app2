# 로지스웹 허브 로고 — 완전히 새 방향(평면 · 굵은 · 단순한 브랜드 마크) 8가지 · python3 make_v3.py
import math
NAVY, NAVY2, BLUE, SKY, GOLD, WHITE = "#0F1A30", "#1B2B4B", "#2D4C82", "#8FB0F0", "#FFC24B", "#FFFFFF"
def svg(name, bg, body, defs=""):
    fill = {"navy": NAVY, "white": WHITE, "sky": "url(#skyg)", "blue": "url(#blueg)"}[bg]
    d = ('<defs><linearGradient id="skyg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EAF1FF"/><stop offset="1" stop-color="#C9DAF8"/></linearGradient>'
         '<linearGradient id="blueg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3D63AE"/><stop offset="1" stop-color="#1B2B4B"/></linearGradient>' + defs + '</defs>')
    edge = '<rect x="4" y="4" width="1432" height="1432" rx="300" fill="none" stroke="#DCE3EE" stroke-width="8"/>' if bg == "white" else ""
    open(name, "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 1440">{d}<rect width="1440" height="1440" rx="300" fill="{fill}"/>{edge}{body}</svg>')

# S1 허브 & 스포크 — 가운데 원으로 네 방향 화살표가 모인다(평면 · 흰색)
s1 = f'<circle cx="720" cy="720" r="150" fill="{GOLD}"/>'
for a in (0, 90, 180, 270):
    s1 += (f'<g transform="rotate({a} 720 720)"><rect x="680" y="250" width="80" height="250" rx="40" fill="{WHITE}"/>'
           f'<path d="M600 430 L720 560 L840 430" fill="none" stroke="{WHITE}" stroke-width="80" stroke-linecap="round" stroke-linejoin="round"/></g>')
svg("S1_spokes.svg", "navy", s1)

# S2 LH 리본 — 한 줄로 이어진 굵은 노선이 L과 H를 그리며, 끝에 거점(금색)
s2 = (f'<path d="M330 300 L330 1060 L640 1060 M800 300 L800 1060 M800 680 L1110 680 M1110 300 L1110 1060" fill="none" stroke="{WHITE}" stroke-width="130" stroke-linecap="round" stroke-linejoin="round"/>'
      f'<circle cx="1110" cy="300" r="95" fill="{GOLD}"/><circle cx="330" cy="300" r="40" fill="{NAVY}"/>')
svg("S2_lh_ribbon.svg", "blue", s2)

# S3 도트 매트릭스 — 7×7 점 판에서 몇 점이 이어져 위로 가는 화살표(노선)가 된다(디지털 픽셀)
s3 = ""; G = 7; step = 150; o = 720 - step * 3
path = [(1, 5), (2, 4), (3, 3), (4, 2), (5, 1)]
for i in range(G):
    for j in range(G):
        x, y = o + i * step, o + j * step
        on = (i, j) in path
        s3 += f'<circle cx="{x}" cy="{y}" r="{34 if on else 22}" fill="{GOLD if (i,j)==(5,1) else (WHITE if on else BLUE)}" fill-opacity="{1 if on else .55}"/>'
pts = " ".join(f"{o+i*step},{o+j*step}" for i, j in path)
s3 += f'<polyline points="{pts}" fill="none" stroke="{WHITE}" stroke-width="26" stroke-linecap="round"/><path d="M{o+3*step} {o+1*step} L{o+5*step} {o+1*step} L{o+5*step} {o+3*step}" fill="none" stroke="{WHITE}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>'
svg("S3_dot_matrix.svg", "navy", s3)

# S4 벌집 허브 — 가운데 금색 육각형을 여섯 육각형(운송사)이 둘러싼다
def hexp(cx, cy, r): return " ".join(f"{cx + r*math.cos(math.radians(60*k+30)):.0f},{cy + r*math.sin(math.radians(60*k+30)):.0f}" for k in range(6))
s4 = ""; d = 300
for k in range(6):
    a = math.radians(60 * k)
    s4 += f'<polygon points="{hexp(720 + d*math.cos(a), 720 + d*math.sin(a), 150)}" fill="{NAVY2}" stroke="{WHITE}" stroke-width="26" stroke-linejoin="round"/>'
s4 += f'<polygon points="{hexp(720, 720, 150)}" fill="{GOLD}" stroke="{WHITE}" stroke-width="26" stroke-linejoin="round"/>'
svg("S4_honeycomb.svg", "sky", s4)

# S5 순환 화살표 — 세 개의 굵은 호 화살표가 가운데 점을 돌며 오더를 주고받는다
s5 = f'<circle cx="720" cy="720" r="110" fill="{GOLD}"/>'
Rr = 390
for k in range(3):
    a0, a1 = 120 * k + 20, 120 * k + 92
    x0, y0 = 720 + Rr * math.cos(math.radians(a0)), 720 + Rr * math.sin(math.radians(a0))
    x1, y1 = 720 + Rr * math.cos(math.radians(a1)), 720 + Rr * math.sin(math.radians(a1))
    s5 += f'<path d="M{x0:.0f} {y0:.0f} A{Rr} {Rr} 0 0 1 {x1:.0f} {y1:.0f}" fill="none" stroke="{NAVY}" stroke-width="110" stroke-linecap="round"/>'
    s5 += f'<g transform="translate({x1:.0f} {y1:.0f}) rotate({a1 + 90})"><path d="M-10 -115 L150 0 L-10 115 Z" fill="{NAVY}" stroke="{NAVY}" stroke-width="20" stroke-linejoin="round"/></g>'
svg("S5_cycle.svg", "white", s5)

# S6 핀 + 박스 — 위치 핀 안에 화물 박스(평면 3톤)
s6 = f'<path d="M720 1240 C 560 1030 330 860 330 620 A390 390 0 1 1 1110 620 C 1110 860 880 1030 720 1240 Z" fill="{WHITE}"/>'
cx, cy, s = 720, 610, 190
top = f"{cx},{cy-s} {cx+s*.87:.0f},{cy-s/2:.0f} {cx},{cy} {cx-s*.87:.0f},{cy-s/2:.0f}"
left = f"{cx-s*.87:.0f},{cy-s/2:.0f} {cx},{cy} {cx},{cy+s} {cx-s*.87:.0f},{cy+s/2:.0f}"
right = f"{cx},{cy} {cx+s*.87:.0f},{cy-s/2:.0f} {cx+s*.87:.0f},{cy+s/2:.0f} {cx},{cy+s}"
s6 += f'<polygon points="{top}" fill="{GOLD}"/><polygon points="{left}" fill="{BLUE}"/><polygon points="{right}" fill="{NAVY}"/>'
svg("S6_pin_box.svg", "blue", s6)

# S7 연결 고리 — 두 고리가 맞물린 모양(운송사와 운송사가 연결), 겹친 곳 가운데 금색 점
r7, w7 = 270, 110
s7 = (f'<circle cx="560" cy="720" r="{r7}" fill="none" stroke="{NAVY}" stroke-width="{w7}"/>'
      f'<circle cx="880" cy="720" r="{r7}" fill="none" stroke="{BLUE}" stroke-width="{w7}"/>')
def arcp(cx, cy, r, a0, a1):
    x0, y0 = cx + r*math.cos(math.radians(a0)), cy + r*math.sin(math.radians(a0)); x1, y1 = cx + r*math.cos(math.radians(a1)), cy + r*math.sin(math.radians(a1))
    return f'M{x0:.0f} {y0:.0f} A{r} {r} 0 0 1 {x1:.0f} {y1:.0f}'
s7 += f'<path d="{arcp(560, 720, r7, -80, -30)}" fill="none" stroke="{NAVY}" stroke-width="{w7}"/>'  # 위쪽 교차는 왼쪽 고리가 위로(맞물림)
s7 += f'<circle cx="720" cy="720" r="64" fill="{GOLD}"/>'
svg("S7_link.svg", "sky", s7)

# S8 큰 h 글자 — 소문자 h의 줄기가 도로, 어깨 부분이 노선, 끝 점이 금색 거점
s8 = (f'<path d="M470 260 L470 1180" fill="none" stroke="{WHITE}" stroke-width="150" stroke-linecap="round"/>'
      f'<path d="M470 820 C 470 600 970 560 970 820 L970 1180" fill="none" stroke="{WHITE}" stroke-width="150" stroke-linecap="round"/>'
      f'<circle cx="970" cy="400" r="110" fill="{GOLD}"/>')
svg("S8_h_letter.svg", "navy", s8)
print("ok")
