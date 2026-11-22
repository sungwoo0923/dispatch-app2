# 로지스웹 허브 로고 — 와이어 지구 고급 버전(점 대신 네트워크) · python3 make_wire2.py
import math
DEFS='''<defs>
<linearGradient id="bg" x1="0" y1="0" x2=".55" y2="1"><stop offset="0" stop-color="#22396A"/><stop offset=".55" stop-color="#0F1A30"/><stop offset="1" stop-color="#070D1C"/></linearGradient>
<radialGradient id="gl" cx=".28" cy=".08" r=".9"><stop offset="0" stop-color="#8FB0F0" stop-opacity=".22"/><stop offset="1" stop-color="#8FB0F0" stop-opacity="0"/></radialGradient>
<radialGradient id="sph" cx=".38" cy=".3" r=".78"><stop offset="0" stop-color="#2F5199" stop-opacity=".85"/><stop offset=".65" stop-color="#132447" stop-opacity=".9"/><stop offset="1" stop-color="#091224" stop-opacity=".95"/></radialGradient>
<radialGradient id="rim" cx=".5" cy=".5" r=".5"><stop offset=".88" stop-color="#8FB0F0" stop-opacity="0"/><stop offset=".965" stop-color="#8FB0F0" stop-opacity=".55"/><stop offset="1" stop-color="#8FB0F0" stop-opacity="0"/></radialGradient>
<radialGradient id="gd"><stop offset="0" stop-color="#FFD27A" stop-opacity=".9"/><stop offset=".35" stop-color="#FFD27A" stop-opacity=".25"/><stop offset="1" stop-color="#FFD27A" stop-opacity="0"/></radialGradient>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>'''
TILE='<rect width="1440" height="1440" rx="300" fill="url(#bg)"/><rect width="1440" height="1440" rx="300" fill="url(#gl)"/>'
CX,CY,R=720,720,500
tilt=math.radians(30); CL=118
def P(lat,lon):
    la,lo=math.radians(lat),math.radians(lon-CL)
    x=math.cos(la)*math.sin(lo); y=math.sin(la); z=math.cos(la)*math.cos(lo)
    y2=y*math.cos(tilt)-z*math.sin(tilt); z2=y*math.sin(tilt)+z*math.cos(tilt)
    return CX+R*x, CY-R*y2, z2
def seg_lines(pts, w, col="#8FB0F0", base=.06, amp=.42):
    s=""
    for (x1,y1,z1),(x2,y2,z2) in zip(pts,pts[1:]):
        z=(z1+z2)/2
        if z<=0: continue
        s+=f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{col}" stroke-opacity="{base+amp*z:.2f}" stroke-width="{w}" stroke-linecap="round"/>'
    return s
def wire(step=20, w=2.6):
    s=""
    for lat in range(-80,81,step): s+=seg_lines([P(lat,l) for l in range(-180,181,3)], w)
    for lon in range(-180,180,step): s+=seg_lines([P(la,lon) for la in range(-88,89,3)], w)
    return s
# 대륙 위 네트워크 노드(듬성듬성) — 대략 주요 물류 거점
NODES=[(37.5,127),(35.7,139.7),(34.7,135.5),(43,141),(31.2,121.5),(39.9,116.4),(30.6,114.3),(23.1,113.3),(22.3,114.2),(29.6,106.5),(34.3,108.9),(41.8,123.4),(45.8,126.6),(25,121.5),(14.6,121),(10.8,106.7),(13.7,100.5),(21,105.8),(1.3,103.8),(3.1,101.7),(-6.2,106.8),(-7.3,112.7),(16.8,96.2),(23.8,90.4),(19,72.8),(28.6,77.2),(13,80.2),(25.2,55.3),(24.7,46.7),(43.2,76.9),(55,82.9),(56,92.9),(52.3,104.3),(48.5,135),(43.1,131.9),(62,129.7),(-33.9,151.2),(-37.8,145),(-27.5,153),(-31.9,115.9),(-12.5,130.8),(47.9,106.9),(39,125.7),(51.1,71.4)]
def network():
    pts=[(P(a,b),(a,b)) for a,b in NODES]
    vis=[(p,c) for p,c in pts if p[2]>0.08]
    s=""; seen=set()
    for i,(p,c) in enumerate(vis):
        d=sorted(((math.hypot(p[0]-q[0],p[1]-q[1]),j) for j,(q,_) in enumerate(vis) if j!=i))[:3]
        for dist,j in d:
            if dist>230: continue
            k=tuple(sorted((i,j)))
            if k in seen: continue
            seen.add(k); q=vis[j][0]; z=(p[2]+q[2])/2
            s+=f'<line x1="{p[0]:.1f}" y1="{p[1]:.1f}" x2="{q[0]:.1f}" y2="{q[1]:.1f}" stroke="#CFE0FF" stroke-opacity="{.18+.42*z:.2f}" stroke-width="3"/>'
    for p,c in vis:
        r=5+5*p[2]
        s+=f'<circle cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="{r:.1f}" fill="#FFFFFF" fill-opacity="{.45+.5*p[2]:.2f}"/>'
    return s
HUBC=(37.5,127); hub=P(*HUBC)
ROUTES=[(35.7,139.7),(1.3,103.8),(-33.9,151.2),(25.2,55.3),(55.7,37.6),(19,72.8),(61.2,-149.9),(64.2,-51.7)]
def routes(w=7):
    s=""
    for c in ROUTES:
        p=P(*c)
        if p[2]<0.06: continue
        mx,my=(hub[0]+p[0])/2,(hub[1]+p[1])/2
        dx,dy=mx-CX,my-CY; d=math.hypot(dx,dy) or 1
        L=math.hypot(hub[0]-p[0],hub[1]-p[1]); lift=.28*L+30
        q=(mx+dx/d*lift, my+dy/d*lift)
        path=f'M{hub[0]:.0f} {hub[1]:.0f} Q{q[0]:.0f} {q[1]:.0f} {p[0]:.0f} {p[1]:.0f}'
        s+=f'<path d="{path}" fill="none" stroke="#8FB0F0" stroke-opacity=".35" stroke-width="{w+10}" stroke-linecap="round"/>'
        s+=f'<path d="{path}" fill="none" stroke="#FFFFFF" stroke-width="{w}" stroke-linecap="round" filter="url(#glow)"/>'
        s+=f'<circle cx="{p[0]:.0f}" cy="{p[1]:.0f}" r="13" fill="#FFFFFF"/><circle cx="{p[0]:.0f}" cy="{p[1]:.0f}" r="28" fill="none" stroke="#FFFFFF" stroke-opacity=".4" stroke-width="4"/>'
    return s
HUB=(f'<circle cx="{hub[0]:.0f}" cy="{hub[1]:.0f}" r="150" fill="url(#gd)"/>'
     f'<circle cx="{hub[0]:.0f}" cy="{hub[1]:.0f}" r="74" fill="none" stroke="#FFD27A" stroke-opacity=".45" stroke-width="4"/>'
     f'<circle cx="{hub[0]:.0f}" cy="{hub[1]:.0f}" r="42" fill="#0B1428" stroke="#FFD27A" stroke-width="13" filter="url(#glow)"/>'
     f'<circle cx="{hub[0]:.0f}" cy="{hub[1]:.0f}" r="17" fill="#FFD27A"/>')
SPHERE=f'<circle cx="{CX}" cy="{CY}" r="{R+50}" fill="url(#rim)"/><circle cx="{CX}" cy="{CY}" r="{R}" fill="url(#sph)"/>'
EDGE=f'<circle cx="{CX}" cy="{CY}" r="{R}" fill="none" stroke="#DCE7FF" stroke-opacity=".85" stroke-width="6"/>'
def orbit(back):
    # 궤도: 지구 뒤쪽 반은 흐리게, 앞쪽 반은 또렷하게
    rx,ry,rot=R+150,140,-18
    pts=[(CX+rx*math.cos(t),CY+ry*math.sin(t)) for t in [i*math.pi/90 for i in range(181)]]
    def rotp(x,y):
        a=math.radians(rot); x-=CX; y-=CY
        return CX+x*math.cos(a)-y*math.sin(a), CY+x*math.sin(a)+y*math.cos(a)
    pts=[rotp(*p) for p in pts]
    half=pts[90:] if back else pts[:91]
    d="M"+" L".join(f"{x:.0f} {y:.0f}" for x,y in half)
    if back: return f'<path d="{d}" fill="none" stroke="#8FB0F0" stroke-opacity=".35" stroke-width="5"/>'
    sat=pts[22]
    return (f'<path d="{d}" fill="none" stroke="#FFFFFF" stroke-opacity=".9" stroke-width="7" stroke-linecap="round"/>'
            f'<circle cx="{sat[0]:.0f}" cy="{sat[1]:.0f}" r="30" fill="url(#gd)"/><circle cx="{sat[0]:.0f}" cy="{sat[1]:.0f}" r="13" fill="#FFFFFF"/>')
def W(name,body): open(name,'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 1440">{DEFS}{TILE}{body}</svg>')
W('F2_wirenet.svg', SPHERE+wire()+network()+EDGE+routes()+HUB)
W('F3_wirenet_orbit.svg', orbit(True)+SPHERE+wire()+network()+EDGE+routes()+orbit(False)+HUB)
print("ok")
