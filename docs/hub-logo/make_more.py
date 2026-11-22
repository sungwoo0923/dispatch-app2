# 로지스웹 허브 로고 — F3 계열 다른 시안(H 지오데식 · I 이중 궤도 · J 지평선 · K 육각 회로) · python3 make_more.py
import math, itertools
import make_wire2 as M   # 같은 색 · 같은 투영 · 같은 노선을 쓴다(F2 · F3도 다시 만들어진다)
DEFS, TILE = M.DEFS, M.TILE
def W(name, body): open(name, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 1440">{DEFS}{TILE}{body}</svg>')

# ── H 지오데식 지구: 정이십면체를 2번 쪼갠 삼각형 그물
t=(1+5**.5)/2
V=[(-1,t,0),(1,t,0),(-1,-t,0),(1,-t,0),(0,-1,t),(0,1,t),(0,-1,-t),(0,1,-t),(t,0,-1),(t,0,1),(-t,0,-1),(-t,0,1)]
F=[(0,11,5),(0,5,1),(0,1,7),(0,7,10),(0,10,11),(1,5,9),(5,11,4),(11,10,2),(10,7,6),(7,1,8),(3,9,4),(3,4,2),(3,2,6),(3,6,8),(3,8,9),(4,9,5),(2,4,11),(6,2,10),(8,6,7),(9,8,1)]
def norm(v): l=math.sqrt(sum(c*c for c in v)); return tuple(c/l for c in v)
V=[norm(v) for v in V]
for _ in range(2):
    cache={}; NF=[]
    def mid(a,b):
        k=tuple(sorted((a,b)))
        if k not in cache: V.append(norm(tuple((V[a][i]+V[b][i])/2 for i in range(3)))); cache[k]=len(V)-1
        return cache[k]
    for a,b,c in F:
        ab,bc,ca=mid(a,b),mid(b,c),mid(c,a); NF+= [(a,ab,ca),(b,bc,ab),(c,ca,bc),(ab,bc,ca)]
    F=NF
def ll(v): x,y,z=v; return math.degrees(math.asin(y)), math.degrees(math.atan2(x,z))+M.CL+7
PV=[M.P(*ll(v)) for v in V]
edges=set()
for a,b,c in F:
    for e in ((a,b),(b,c),(c,a)): edges.add(tuple(sorted(e)))
geo=""
for a,b in edges:
    p,q=PV[a],PV[b]; z=(p[2]+q[2])/2
    if z<=0: continue
    geo+=f'<line x1="{p[0]:.1f}" y1="{p[1]:.1f}" x2="{q[0]:.1f}" y2="{q[1]:.1f}" stroke="#8FB0F0" stroke-opacity="{.08+.5*z:.2f}" stroke-width="2.6"/>'
for p in PV:
    if p[2]>0.05: geo+=f'<circle cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="{2+3.5*p[2]:.1f}" fill="#CFE0FF" fill-opacity="{.25+.6*p[2]:.2f}"/>'
W('H_geodesic.svg', M.SPHERE+geo+M.EDGE+M.routes()+M.orbit(False).replace('stroke-opacity=".9"','stroke-opacity=".0"').split('<circle')[0]+M.HUB)

# ── I 이중 궤도: 와이어 지구 + 서로 엇갈린 궤도 두 개(위성 노드)
def ring(rot, rx, ry, back, sat_t, col="#FFFFFF"):
    pts=[(M.CX+rx*math.cos(a), M.CY+ry*math.sin(a)) for a in [i*math.pi/90 for i in range(181)]]
    r=math.radians(rot)
    pts=[(M.CX+(x-M.CX)*math.cos(r)-(y-M.CY)*math.sin(r), M.CY+(x-M.CX)*math.sin(r)+(y-M.CY)*math.cos(r)) for x,y in pts]
    half=pts[90:] if back else pts[:91]
    d="M"+" L".join(f"{x:.0f} {y:.0f}" for x,y in half)
    if back: return f'<path d="{d}" fill="none" stroke="#8FB0F0" stroke-opacity=".3" stroke-width="5"/>'
    s=pts[sat_t]
    return f'<path d="{d}" fill="none" stroke="{col}" stroke-opacity=".9" stroke-width="6" stroke-linecap="round"/><circle cx="{s[0]:.0f}" cy="{s[1]:.0f}" r="28" fill="url(#gd)"/><circle cx="{s[0]:.0f}" cy="{s[1]:.0f}" r="12" fill="#FFFFFF"/>'
W('I_double_orbit.svg', ring(-28,M.R+150,130,True,0)+ring(32,M.R+120,110,True,0)+M.SPHERE+M.wire()+M.network()+M.EDGE+M.routes()+ring(-28,M.R+150,130,False,25)+ring(32,M.R+120,110,False,70)+M.HUB)

# ── J 지평선: 큰 지구의 윗부분(지평선) + 위로 솟는 노선 + 떠오르는 금색 허브
HX,HY,HR=720,1660,1080
def hp(lat,lon):  # 지평선 지구 위 점(앞면만)
    la,lo=math.radians(lat),math.radians(lon)
    x=math.cos(la)*math.sin(lo); y=math.sin(la); z=math.cos(la)*math.cos(lo)
    tl=math.radians(52); y2=y*math.cos(tl)-z*math.sin(tl); z2=y*math.sin(tl)+z*math.cos(tl)
    return HX+HR*x, HY-HR*y2, z2
hor=f'<defs><clipPath id="tc"><rect width="1440" height="1440" rx="300"/></clipPath><radialGradient id="hz" cx=".5" cy=".5" r=".5"><stop offset=".9" stop-color="#8FB0F0" stop-opacity="0"/><stop offset=".975" stop-color="#8FB0F0" stop-opacity=".6"/><stop offset="1" stop-color="#8FB0F0" stop-opacity="0"/></radialGradient></defs><g clip-path="url(#tc)">'
hor+=f'<circle cx="{HX}" cy="{HY}" r="{HR+60}" fill="url(#hz)"/><circle cx="{HX}" cy="{HY}" r="{HR}" fill="url(#sph)"/>'
for lat in range(-80,81,12): hor+=M.seg_lines([hp(lat,l) for l in range(-180,181,3)],2.6)
for lon in range(-180,180,15): hor+=M.seg_lines([hp(la,lon) for la in range(-88,89,3)],2.6)
hor+=f'<circle cx="{HX}" cy="{HY}" r="{HR}" fill="none" stroke="#DCE7FF" stroke-opacity=".9" stroke-width="6"/>'
sun=(720,HY-HR+8)  # 지평선 바로 위에 걸친 금색 허브
ends=[]
# 화면에 보이는 지구 표면 위 점을 고른다(가로로 고르게 · 지평선에서 조금 아래)
cand=[]
for lat in range(50,90,2):
    for lon in range(-180,180,4):
        x,y,z=hp(lat,lon)
        if z>0.1 and 150<x<1290 and 760<y<1150: cand.append((x,y))
for tx,ty in [(250,900),(430,820),(600,1060),(840,1060),(1010,820),(1190,900)]:
    best=min(cand,key=lambda p:(p[0]-tx)**2+(p[1]-ty)**2)
    ends.append((round(best[0]),round(best[1])))
for ex,ey in ends:
    cx=(sun[0]+ex)/2; cy=min(sun[1],ey)-110-0.18*abs(ex-sun[0])
    hor+=f'<path d="M{sun[0]} {sun[1]} Q{cx:.0f} {cy:.0f} {ex} {ey}" fill="none" stroke="#8FB0F0" stroke-opacity=".35" stroke-width="16" stroke-linecap="round"/>'
    hor+=f'<path d="M{sun[0]} {sun[1]} Q{cx:.0f} {cy:.0f} {ex} {ey}" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" filter="url(#glow)"/>'
    hor+=f'<circle cx="{ex}" cy="{ey}" r="13" fill="#FFFFFF"/><circle cx="{ex}" cy="{ey}" r="28" fill="none" stroke="#FFFFFF" stroke-opacity=".4" stroke-width="4"/>'
hor+=f'<circle cx="{sun[0]}" cy="{sun[1]}" r="200" fill="url(#gd)"/><circle cx="{sun[0]}" cy="{sun[1]}" r="96" fill="none" stroke="#FFD27A" stroke-opacity=".4" stroke-width="4"/><circle cx="{sun[0]}" cy="{sun[1]}" r="54" fill="#0B1428" stroke="#FFD27A" stroke-width="15" filter="url(#glow)"/><circle cx="{sun[0]}" cy="{sun[1]}" r="21" fill="#FFD27A"/></g>'
W('J_horizon.svg', hor)

# ── K 육각 회로: 육각 테두리 안 와이어 지구 + 테두리에서 들어오는 회로 선
SC=0.74
def scaled(body): return f'<g transform="translate({720*(1-SC):.0f} {720*(1-SC):.0f}) scale({SC})">{body}</g>'
hexr=600
hx=[(720+hexr*math.cos(math.radians(60*i-90)), 720+hexr*math.sin(math.radians(60*i-90))) for i in range(6)]
hexd="M"+" L".join(f"{x:.0f} {y:.0f}" for x,y in hx)+"Z"
k=f'<path d="{hexd}" fill="none" stroke="#8FB0F0" stroke-opacity=".55" stroke-width="7" stroke-linejoin="round"/>'
k+=f'<path d="{hexd}" fill="none" stroke="#FFFFFF" stroke-opacity=".9" stroke-width="7" stroke-linejoin="round" stroke-dasharray="320 2000" stroke-dashoffset="-120"/>'
traces=[((720,120),(720,230)),((1240,420),(1110,420),(1060,470)),((1240,1020),(1120,1020),(1070,970)),((720,1320),(720,1210)),((200,1020),(320,1020),(370,970)),((200,420),(330,420),(380,470))]
for tr in traces:
    d="M"+" L".join(f"{x} {y}" for x,y in tr)
    k+=f'<path d="{d}" fill="none" stroke="#CFE0FF" stroke-opacity=".7" stroke-width="5" stroke-linejoin="round"/><circle cx="{tr[0][0]}" cy="{tr[0][1]}" r="12" fill="#FFFFFF"/><circle cx="{tr[-1][0]}" cy="{tr[-1][1]}" r="8" fill="#8FB0F0"/>'
W('K_hex_circuit.svg', k+scaled(M.SPHERE+M.wire()+M.network()+M.EDGE+M.routes()+M.HUB))
print("ok")
