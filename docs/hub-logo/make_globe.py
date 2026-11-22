# 로지스웹 허브 디지털 지구 로고 시안 만들기 — python3 make_globe.py
import math
TILE='''<defs><linearGradient id="bg" x1="0" y1="0" x2=".55" y2="1"><stop offset="0" stop-color="#2B4880"/><stop offset="1" stop-color="#0F1A30"/></linearGradient><radialGradient id="gl" cx=".3" cy=".1" r=".85"><stop offset="0" stop-color="#8FB0F0" stop-opacity=".25"/><stop offset="1" stop-color="#8FB0F0" stop-opacity="0"/></radialGradient><radialGradient id="gd"><stop offset="0" stop-color="#FFD27A" stop-opacity=".85"/><stop offset="1" stop-color="#FFD27A" stop-opacity="0"/></radialGradient><radialGradient id="atm" cx=".5" cy=".5" r=".5"><stop offset=".86" stop-color="#8FB0F0" stop-opacity="0"/><stop offset=".94" stop-color="#8FB0F0" stop-opacity=".35"/><stop offset="1" stop-color="#8FB0F0" stop-opacity="0"/></radialGradient><radialGradient id="sph" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#4A72C0" stop-opacity=".75"/><stop offset=".7" stop-color="#1B2B4B" stop-opacity=".6"/><stop offset="1" stop-color="#0B1428" stop-opacity=".5"/></radialGradient></defs><rect width="1440" height="1440" rx="300" fill="url(#bg)"/><rect width="1440" height="1440" rx="300" fill="url(#gl)"/>'''
CX,CY,R=720,720,520
tilt=math.radians(32); CENTER_LON=118
def proj(lat,lon):
    la,lo=math.radians(lat),math.radians(lon-CENTER_LON)
    x=math.cos(la)*math.sin(lo); y=math.sin(la); z=math.cos(la)*math.cos(lo)
    y2=y*math.cos(tilt)-z*math.sin(tilt); z2=y*math.sin(tilt)+z*math.cos(tilt)
    return CX+R*x, CY-R*y2, z2
LAND=[(55,40,22),(50,10,14),(62,95,28),(48,120,18),(35,105,18),(28,115,12),(37,127,4.5),(36,138,5),(22,80,12),(15,102,10),(0,112,9),(-5,120,7),(25,48,12),(15,20,22),(-5,25,18),(-25,134,15),(-42,172,4),(66,150,18),(10,-5,15),(-20,46,5),(60,-100,25),(40,-100,18)]
def dist(a,b,c,d):
    return math.degrees(math.acos(max(-1,min(1,math.sin(math.radians(a))*math.sin(math.radians(c))+math.cos(math.radians(a))*math.cos(math.radians(c))*math.cos(math.radians(b-d))))))
def land(lat,lon): return any(dist(lat,lon,a,b)<r for a,b,r in LAND)
def dots(sea=True, step=4.2):
    out=[]; lat=-84.0
    while lat<=84:
        n=max(6,int(86*math.cos(math.radians(lat))))
        for i in range(n):
            lon=-180+360*i/n
            x,y,z=proj(lat,lon)
            if z<=0.03: continue
            L=land(lat,lon)
            if not L and not sea: continue
            r=(9 if L else 4)*(0.5+0.5*z); op=(1 if L else .3)*(0.35+0.65*z)
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{"#FFFFFF" if L else "#8FB0F0"}" fill-opacity="{op:.2f}"/>')
        lat+=step
    return "".join(out)
SEOUL=(37.5,127)
CITIES=[(35.7,139.7),(31.2,121.5),(39.9,116.4),(1.3,103.8),(13.7,100.5),(19,72.8),(25.2,55.3),(-33.9,151.2),(55.7,37.6),(22.3,114.2),(-6.2,106.8),(61,-150),(64,90)]
hub=proj(*SEOUL)
def arc_path(p):
    mx,my=(hub[0]+p[0])/2,(hub[1]+p[1])/2
    dx,dy=mx-CX,my-CY; d=math.hypot(dx,dy)
    L=math.hypot(hub[0]-p[0],hub[1]-p[1]); lift=0.2*L+20
    ux,uy=(dx/d,dy/d) if d>1 else (0,-1)
    return f'M{hub[0]:.0f} {hub[1]:.0f} Q{mx+ux*lift:.0f} {my+uy*lift:.0f} {p[0]:.0f} {p[1]:.0f}'
def arcs(w=8):
    s=""
    for c in CITIES:
        p=proj(*c)
        if p[2]<0.12 or math.hypot(p[0]-hub[0],p[1]-hub[1])<60: continue
        s+=f'<path d="{arc_path(p)}" fill="none" stroke="#FFFFFF" stroke-opacity=".85" stroke-width="{w}" stroke-linecap="round"/>'
        s+=f'<circle cx="{p[0]:.0f}" cy="{p[1]:.0f}" r="15" fill="#FFFFFF"/><circle cx="{p[0]:.0f}" cy="{p[1]:.0f}" r="30" fill="none" stroke="#FFFFFF" stroke-opacity=".35" stroke-width="5"/>'
    return s
HUB=f'<circle cx="{hub[0]:.0f}" cy="{hub[1]:.0f}" r="140" fill="url(#gd)"/><circle cx="{hub[0]:.0f}" cy="{hub[1]:.0f}" r="46" fill="#0F1A30" stroke="#FFD27A" stroke-width="16"/><circle cx="{hub[0]:.0f}" cy="{hub[1]:.0f}" r="19" fill="#FFD27A"/>'
SPH=f'<circle cx="{CX}" cy="{CY}" r="{R+44}" fill="url(#atm)"/><circle cx="{CX}" cy="{CY}" r="{R}" fill="url(#sph)"/>'
RIM=f'<circle cx="{CX}" cy="{CY}" r="{R}" fill="none" stroke="#8FB0F0" stroke-opacity=".55" stroke-width="7"/>'
def W(name,body): open(name,'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 1440">{TILE}{body}</svg>')
W('E_dotglobe.svg', SPH+RIM+dots(True)+arcs()+HUB)
def line(pts): return f'<polyline points="{" ".join(pts)}" fill="none" stroke="#8FB0F0" stroke-opacity=".5" stroke-width="4.5"/>'
wire=""
for lat in range(-60,61,30):
    run=[]
    for l in range(-180,181,3):
        x,y,z=proj(lat,l)
        if z>0: run.append(f"{x:.0f},{y:.0f}")
        elif run: wire+=line(run); run=[]
    if run: wire+=line(run)
for lon in range(-180,180,30):
    run=[]
    for la in range(-90,91,3):
        x,y,z=proj(la,lon)
        if z>0: run.append(f"{x:.0f},{y:.0f}")
        elif run: wire+=line(run); run=[]
    if run: wire+=line(run)
ring=f'<g transform="rotate(-20 {CX} {CY})"><ellipse cx="{CX}" cy="{CY}" rx="{R+140}" ry="150" fill="none" stroke="#FFFFFF" stroke-opacity=".75" stroke-width="10" stroke-dasharray="1250 110"/><circle cx="{CX+R+140}" cy="{CY}" r="20" fill="#FFFFFF"/></g>'
W('F_wireglobe.svg', SPH+f'<circle cx="{CX}" cy="{CY}" r="{R}" fill="none" stroke="#FFFFFF" stroke-opacity=".9" stroke-width="11"/>'+wire+dots(False)+arcs()+ring+HUB)
waves="".join(f'<circle cx="{hub[0]:.0f}" cy="{hub[1]:.0f}" r="{r}" fill="none" stroke="#FFD27A" stroke-opacity="{o}" stroke-width="7"/>' for r,o in [(130,.6),(240,.36),(360,.18),(490,.08)])
W('G_pulseglobe.svg', f'<defs><clipPath id="cp"><circle cx="{CX}" cy="{CY}" r="{R}"/></clipPath></defs>'+SPH+RIM+f'<g clip-path="url(#cp)">{dots(False)}{waves}</g>'+arcs(6)+HUB)
print("hub", [round(v) for v in hub[:2]])
