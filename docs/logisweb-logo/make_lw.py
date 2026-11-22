# 로지스웹 새 로고 시안 — 허브 로고(hub 글자 + 금색 일자 선)와 한 가족 · python3 make_lw.py
NAVY, WHITE, GOLD, BLUE, SKY = "#0F1A30", "#FFFFFF", "#FFD27A", "#4E6FB4", "#8FB0F0"
def tile(name, inner, bg=NAVY, line_y=1100, x0=200, x1=1270, w=12, scale=True):
    defs = (f'<defs><linearGradient id="st" gradientUnits="userSpaceOnUse" x1="{x0}" y1="0" x2="{x1}" y2="0"><stop offset="0" stop-color="{GOLD}" stop-opacity=".25"/><stop offset="1" stop-color="{GOLD}"/></linearGradient>'
            f'<radialGradient id="dot"><stop offset="0" stop-color="{GOLD}" stop-opacity=".7"/><stop offset="1" stop-color="{GOLD}" stop-opacity="0"/></radialGradient></defs>')
    line = (f'<line x1="{x0}" y1="{line_y}" x2="{x1}" y2="{line_y}" stroke="url(#st)" stroke-width="{w}" stroke-linecap="round"/>'
            f'<circle cx="{x1}" cy="{line_y}" r="66" fill="url(#dot)"/><circle cx="{x1}" cy="{line_y}" r="24" fill="{GOLD}"/>')
    g = f'<g transform="translate(58 30) scale(.92)">{inner}{line}</g>' if scale else inner + line
    open(name, "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 1440">{defs}<rect width="1440" height="1440" rx="300" fill="{bg}"/>{g}</svg>')
STROKE = f'fill="none" stroke="{WHITE}" stroke-width="92" stroke-linecap="round" stroke-linejoin="round"'
# W1 소문자 lw — 허브 로고(hub)와 같은 글자 굵기 · 둥근 끝 · 금색 일자 선
tile("W1_lw.svg", f'<g {STROKE}><path d="M430 420 V960"/><path d="M590 620 L700 960 L810 700 L920 960 L1030 620"/></g>')
# W2 대문자 LW — 더 단단한 기업 느낌
tile("W2_LW.svg", f'<g {STROKE}><path d="M300 430 V960 H600"/><path d="M710 430 L820 960 L930 650 L1040 960 L1150 430"/></g>')
# W3 지금 마크(기울어진 L · W)를 평면으로 단순하게 + V 대신 금색 일자 선
mark = (f'<g transform="translate(170 150) scale(.74)"><path d="M216 270 L367 186 L367 797 L552 902 L552 1076 L216 884 Z" fill="{WHITE}"/>'
        f'<path d="M552 440 L709 350 L709 988 L789 1030 L789 302 L945 212 L945 1025 L1024 983 L1024 168 L1182 77 L1182 1078 L867 1258 L552 1076 Z" fill="{BLUE}"/></g>')
tile("W3_mark_flat.svg", mark, line_y=1210, x0=200, x1=1250, scale=False)
# 함께 보기용: 지금 쓰는 마크
import shutil; shutil.copy("../../public/brand/logisweb-mark-square.svg", "W0_current.svg")
print("ok")
