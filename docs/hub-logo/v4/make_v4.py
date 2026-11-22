# 로지스웹 허브 로고 — 새 아이디어(디지털이 아니어도 되는 브랜드 마크) U1~U6 · python3 make_v4.py
import math
NAVY, NAVY2, BLUE, SKY, GOLD, WHITE, PALE = "#0F1A30", "#1B2B4B", "#2D4C82", "#8FB0F0", "#FFC24B", "#FFFFFF", "#EAF1FF"
def svg(name, bg, body):
    fill = {"navy": NAVY, "white": WHITE, "sky": "url(#skyg)", "blue": "url(#blueg)"}[bg]
    d = ('<defs><linearGradient id="skyg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EEF4FF"/><stop offset="1" stop-color="#CFDDF7"/></linearGradient>'
         '<linearGradient id="blueg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3D63AE"/><stop offset="1" stop-color="#1B2B4B"/></linearGradient></defs>')
    edge = '<rect x="4" y="4" width="1432" height="1432" rx="300" fill="none" stroke="#DCE3EE" stroke-width="8"/>' if bg == "white" else ""
    open(name, "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 1440">{d}<rect width="1440" height="1440" rx="300" fill="{fill}"/>{edge}{body}</svg>')
def truck(x, y, s=1.0, body=NAVY, win=WHITE, wheel=NAVY, hub_=WHITE):
    # 오른쪽을 보는 화물차(적재함 + 캐빈 + 바퀴), 기준점 = 적재함 왼쪽 위
    return (f'<g transform="translate({x} {y}) scale({s})">'
            f'<rect x="0" y="0" width="420" height="250" rx="34" fill="{body}"/>'
            f'<path d="M440 70 H560 Q590 70 606 96 L660 180 Q668 194 668 210 V250 H440 Z" fill="{body}"/>'
            f'<path d="M470 100 H555 Q570 100 578 112 L612 166 H470 Z" fill="{win}"/>'
            f'<circle cx="110" cy="270" r="62" fill="{wheel}" stroke="{hub_}" stroke-width="22"/><circle cx="545" cy="270" r="62" fill="{wheel}" stroke="{hub_}" stroke-width="22"/></g>')

# U1 주고받기 — 두 개의 ㄱ자 화살표가 맞물려 네모를 이룬다(운송사 ↔ 운송사, 오더를 주고받는다)
u1 = (f'<path d="M330 560 V380 Q330 330 380 330 H930" fill="none" stroke="{NAVY}" stroke-width="150" stroke-linecap="round" stroke-linejoin="round"/>'
      f'<path d="M880 190 L1110 330 L880 470 Z" fill="{NAVY}" stroke="{NAVY}" stroke-width="30" stroke-linejoin="round"/>'
      f'<path d="M1110 880 V1060 Q1110 1110 1060 1110 H510" fill="none" stroke="{BLUE}" stroke-width="150" stroke-linecap="round" stroke-linejoin="round"/>'
      f'<path d="M560 970 L330 1110 L560 1250 Z" fill="{BLUE}" stroke="{BLUE}" stroke-width="30" stroke-linejoin="round"/>'
      f'<circle cx="720" cy="720" r="120" fill="{GOLD}"/>')
svg("U1_exchange.svg", "white", u1)

# U2 콜 말풍선 + 트럭 — "콜을 올리고, 콜을 잡는다" 허브의 핵심 동작
u2 = (f'<path d="M300 330 H1140 Q1230 330 1230 420 V920 Q1230 1010 1140 1010 H640 L470 1170 L500 1010 H300 Q210 1010 210 920 V420 Q210 330 300 330 Z" fill="{WHITE}"/>'
      + truck(380, 520, .98) +
      f'<g fill="none" stroke="{GOLD}" stroke-width="40" stroke-linecap="round"><path d="M1020 470 A90 90 0 0 1 1110 560"/><path d="M1020 380 A180 180 0 0 1 1200 560" stroke-opacity=".6"/></g>'
      f'<circle cx="1020" cy="560" r="42" fill="{GOLD}"/>')
svg("U2_call_truck.svg", "blue", u2)

# U3 hub 글자 로고 — 소문자 h · u · b가 바닥의 한 도로로 이어지고, b의 끝에 금색 거점
u3 = (f'<g transform="translate(58 30) scale(.92)"><g fill="none" stroke="{WHITE}" stroke-width="92" stroke-linecap="round" stroke-linejoin="round">'
      f'<path d="M250 420 V960"/><path d="M250 760 Q250 620 380 620 Q500 620 500 760 V960"/>'
      f'<path d="M620 620 V820 Q620 960 750 960 Q870 960 870 820 V620"/>'
      f'<path d="M990 420 V960"/><path d="M990 800 Q990 620 1110 620 Q1230 620 1230 790 Q1230 960 1110 960 Q990 960 990 800"/></g>'
      f'<path d="M230 1090 H1250" stroke="{SKY}" stroke-width="22" stroke-linecap="round" stroke-dasharray="70 46"/>'
      f'<circle cx="250" cy="1090" r="34" fill="{WHITE}"/><circle cx="1250" cy="1090" r="46" fill="{GOLD}"/></g>')
svg("U3_hub_word.svg", "navy", u3)

# U4 교차로 — 네 방향 길이 고리(클로버 인터체인지)로 이어지는 마크, 가운데 금색 허브
u4 = f'<g fill="none" stroke="{NAVY}" stroke-width="110" stroke-linecap="round" stroke-linejoin="round">'
for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
    cx, cy = 720 + dx * 230, 720 + dy * 230
    u4 += f'<circle cx="{cx}" cy="{cy}" r="150"/>'
u4 += f'<path d="M720 230 V1210 M230 720 H1210"/></g>'
u4 += f'<rect x="600" y="600" width="240" height="240" rx="60" fill="{GOLD}" stroke="#EEF4FF" stroke-width="40"/>'
svg("U4_interchange.svg", "sky", u4)

# U5 오더 전표 전달 — 뒤 전표(내 오더)에서 앞 전표(다른 운송사)로 넘어가는 화살표
def slip(x, y, fill, line, w=470, h=620, rot=0):
    return (f'<g transform="rotate({rot} {x + w/2} {y + h/2})"><path d="M{x} {y+40} Q{x} {y} {x+40} {y} H{x+w-120} L{x+w} {y+120} V{y+h-40} Q{x+w} {y+h} {x+w-40} {y+h} H{x+40} Q{x} {y+h} {x} {y+h-40} Z" fill="{fill}"/>'
            f'<path d="M{x+w-120} {y} V{y+80} Q{x+w-120} {y+120} {x+w-80} {y+120} H{x+w}" fill="{line}" fill-opacity=".25"/>'
            + "".join(f'<rect x="{x+70}" y="{y+200+i*95}" width="{w-140-(i%2)*90}" height="34" rx="17" fill="{line}" fill-opacity=".55"/>' for i in range(4)) + '</g>')
u5 = slip(260, 330, BLUE, SKY, rot=-8) + slip(700, 480, WHITE, NAVY, rot=6)
u5 += f'<g transform="translate(700 760)"><circle r="130" fill="{GOLD}"/><path d="M-62 0 H50 M10 -48 L58 0 L10 48" fill="none" stroke="{NAVY}" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/></g>'
svg("U5_order_pass.svg", "navy", u5)

# U6 원형 엠블럼 — 둥근 테두리 글자 + 가운데 화물차 + 금색 별(믿을 수 있는 네트워크)
u6 = (f'<defs><path id="arcTop" d="M330 720 A390 390 0 0 1 1110 720"/><path id="arcBot" d="M300 720 A420 420 0 0 0 1140 720"/></defs>'
      f'<circle cx="720" cy="720" r="560" fill="{NAVY2}"/><circle cx="720" cy="720" r="560" fill="none" stroke="{GOLD}" stroke-width="20"/>'
      f'<circle cx="720" cy="720" r="500" fill="none" stroke="{SKY}" stroke-opacity=".5" stroke-width="6"/><circle cx="720" cy="720" r="300" fill="{NAVY}"/>'
      f'<text font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="92" letter-spacing="14" fill="{WHITE}"><textPath href="#arcTop" startOffset="50%" text-anchor="middle">LOGISWEB HUB</textPath></text>'
      f'<text font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="58" letter-spacing="10" fill="{SKY}"><textPath href="#arcBot" startOffset="50%" text-anchor="middle">NATIONWIDE NETWORK</textPath></text>'
      + truck(500, 640, .65, body=WHITE, win=NAVY, wheel=NAVY, hub_=WHITE) +
      f'<path d="M720 470 l22 46 50 6 -37 34 10 50 -45 -25 -45 25 10 -50 -37 -34 50 -6z" fill="{GOLD}"/>'
      f'<circle cx="250" cy="720" r="16" fill="{GOLD}"/><circle cx="1190" cy="720" r="16" fill="{GOLD}"/>')
svg("U6_emblem.svg", "navy", u6)
print("ok")
