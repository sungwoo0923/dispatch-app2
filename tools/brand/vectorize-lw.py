# ======================= tools/brand/vectorize-lw.py =======================
# 🔷 2026-11-24 새 LW 로고(사용자가 준 그림 logisweb-lw-source.png)를 벡터(logisweb-lw-mark.svg)로 바꾼 도구 — 다시 돌릴 일은 거의 없다
#  준비: pip install scipy scikit-image shapely · 접힌 선 좌표는 find-folds-lw.py 로 땄다(FOLDS)
#  돌리는 법: python3 vectorize-lw.py → (vec-full.png 로 한 번 그려 본 뒤) SHADE=1 python3 vectorize-lw.py 로 접힌 곳 그림자까지
#  원본과 색 차이 평균 약 4/255
import numpy as np, json
from PIL import Image
from scipy import ndimage as nd
from skimage import measure
from shapely.geometry import Polygon, LineString
from shapely.ops import split
a=np.asarray(Image.open('logisweb-lw-source.png').convert('RGB')).astype(float)
BG=254.0; L=a.mean(2)
core=nd.binary_erosion(L<120,iterations=2)
_,(iy,ix)=nd.distance_transform_edt(~core,return_indices=True)
c=a[iy,ix]
alpha=np.clip(((BG-a)/np.maximum(BG-c,1)).mean(2),0,1); alpha[core]=1; alpha[L>252]=0
alpha=nd.gaussian_filter(alpha,0.6)
cs=[cc for cc in measure.find_contours(alpha,0.5) if len(cc)>200]
print('contours',len(cs))
pieces=[]
for cc in cs:
    ap=measure.approximate_polygon(cc,0.3)
    poly=Polygon([(x,y) for y,x in ap]).buffer(0)
    pieces.append(poly)
pieces.sort(key=lambda p:p.centroid.x)
FOLDS={0:[((515.8,458.1),(218.7,627.8)),((386.4,654.6),(299.4,781.7))],2:[((859.1,407.5),(904.7,618.2))],3:[((1142.7,578.7),(905.9,691.7))]}
def ext(p0,p1,k=3):
    p0,p1=np.array(p0),np.array(p1);d=p1-p0;return LineString([p0-d*k,p1+d*k])
regions=[]
for i,p in enumerate(pieces):
    parts=[p]
    for f in FOLDS.get(i,[]):
        nxt=[]
        for q in parts:
            r=split(q,ext(*f)); nxt+= [g for g in r.geoms if g.area>50]
        parts=nxt
    for q in parts: regions.append((i,q))
print('regions',len(regions))
H,W=L.shape
yy,xx=np.mgrid[0:H,0:W]
from skimage.draw import polygon as dpoly
def fit(q):
    m=np.zeros((H,W),bool);x,y=q.exterior.xy;rr,cc_=dpoly(np.array(y),np.array(x),(H,W));m[rr,cc_]=True
    m=nd.binary_erosion(m,iterations=4)&core
    X=xx[m].astype(float);Y=yy[m].astype(float);C=a[m]
    lum=C@[.2126,.7152,.0722]
    A=np.c_[np.ones_like(X),X,Y];co,*_=np.linalg.lstsq(A,lum,rcond=None)
    d=np.array(co[1:]);
    if np.linalg.norm(d)<1e-4: d=np.array([0,1.])
    d=d/np.linalg.norm(d);t=X*d[0]+Y*d[1]
    t0,t1=np.percentile(t,[0.5,99.5]);stops=[]
    N=6
    for k in range(N):
        lo=t0+(t1-t0)*k/N;hi=t0+(t1-t0)*(k+1)/N;mm=(t>=lo)&(t<hi)
        if mm.sum()<20: continue
        stops.append(((lo+hi)/2-t0, C[mm].mean(0)))
    # region spans
    tq=np.array(q.exterior.coords)@d; a0,a1=tq.min(),tq.max()
    p0=d*a0; p1=d*a1  # gradient endpoints along d through origin projection
    return dict(x1=p0[0],y1=p0[1],x2=p1[0],y2=p1[1],stops=[((t0+s-a0)/(a1-a0),col) for s,col in stops])
hexs=lambda c:'#%02X%02X%02X'%tuple(int(round(v)) for v in np.clip(c,0,255))
def path(q,smooth=True):
    P=np.array(q.exterior.coords)[:-1]
    if not smooth: return 'M'+' L'.join(f'{x:.1f} {y:.1f}' for x,y in P)+'Z'
    n=len(P);o=[f'M{P[0][0]:.1f} {P[0][1]:.1f}']
    for i in range(n):
        p0,p1,p2,p3=P[i-1],P[i],P[(i+1)%n],P[(i+2)%n]
        seg=np.linalg.norm(p2-p1)
        if seg>25: o.append(f'L{p2[0]:.1f} {p2[1]:.1f}');continue
        # clamp tangents to neighbouring segment length so long straights don't bow
        t1=(p2-p0)/6; t2=(p3-p1)/6
        for t in (t1,t2):
            l=np.linalg.norm(t)
            if l>seg/2.5: t*= (seg/2.5)/l
        c1=p1+t1;c2=p2-t2;o.append(f'C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}')
    return ''.join(o)+'Z'
x0,y0,x1,y1=np.array([p.bounds for p in pieces]).T; bx=(x0.min(),y0.min(),x1.max(),y1.max())
pad=6; vb=f'{bx[0]-pad:.0f} {bx[1]-pad:.0f} {bx[2]-bx[0]+2*pad:.0f} {bx[3]-bx[1]+2*pad:.0f}'
defs=[];body=[]
# base: whole piece filled with its first region gradient to avoid seams
fits=[fit(q) for _,q in regions]
for k,((i,q),f) in enumerate(zip(regions,fits)):
    st=''.join(f'<stop offset="{o:.3f}" stop-color="{hexs(c)}"/>' for o,c in f['stops'])
    defs.append(f'<linearGradient id="lw{k}" gradientUnits="userSpaceOnUse" x1="{f["x1"]:.1f}" y1="{f["y1"]:.1f}" x2="{f["x2"]:.1f}" y2="{f["y2"]:.1f}">{st}</linearGradient>')
for i,p in enumerate(pieces):
    k=[j for j,(pi,_) in enumerate(regions) if pi==i][0]
    body.append(f'<path d="{path(p)}" fill="url(#lw{k})"/>')
for i,p in enumerate(pieces):
    if not FOLDS.get(i): continue
    defs.append(f'<clipPath id="cp{i}"><path d="{path(p)}"/></clipPath>')
    g=[f'<path d="{path(q.buffer(0.7,join_style=2),False)}" fill="url(#lw{k})"/>' for k,(pi,q) in enumerate(regions) if pi==i and k!=[j for j,(pj,_) in enumerate(regions) if pj==i][0]]
    body.append(f'<g clip-path="url(#cp{i})" data-p="{i}">'+''.join(g)+'</g>')

def shade(q,f,k,fi):
    p0,p1=np.array(f[0]),np.array(f[1]);u=(p1-p0)/np.linalg.norm(p1-p0);nrm=np.array([-u[1],u[0]])
    cen=np.array(q.centroid.coords[0]);
    if (cen-p0)@nrm<0: nrm=-nrm
    m=np.zeros((H,W),bool);x,y=q.exterior.xy;rr,cc_=dpoly(np.array(y),np.array(x),(H,W));m[rr,cc_]=True
    m=nd.binary_erosion(m,iterations=2)&core
    X=xx[m].astype(float);Y=yy[m].astype(float)
    dist=(np.c_[X,Y]-p0)@nrm
    fv=np.asarray(Image.open('vec-full.png').convert('RGB')).astype(float)
    lo=a[m]@[.2126,.7152,.0722]; lv=fv[m]@[.2126,.7152,.0722]; r=lo-lv
    R=90;bins=np.arange(0,R+1,6);prof=[]
    for b0 in bins[:-1]:
        mm=(dist>=b0)&(dist<b0+6);prof.append(r[mm].mean() if mm.sum()>30 else 0)
    prof=np.array(prof);print('region',k,'fold',fi,np.round(prof[:8],1))
    if np.abs(prof[:4]).mean()<3: return ''
    dark=prof[:4].mean()<0;K=np.array([2,9,30.]) if dark else np.array([140,165,215.])
    base=lv[(dist<R)].mean();kl=K@[.2126,.7152,.0722]
    op=np.clip(prof/(kl-base),0,1)
    gid=f'sh{k}_{fi}';e0=p0;e1=p0+nrm*R
    st=''.join(f'<stop offset="{(b0+3)/R:.3f}" stop-color="{hexs(K)}" stop-opacity="{o:.3f}"/>' for b0,o in zip(bins[:-1],op))
    defs.append(f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{e0[0]:.1f}" y1="{e0[1]:.1f}" x2="{e1[0]:.1f}" y2="{e1[1]:.1f}"><stop offset="0" stop-color="{hexs(K)}" stop-opacity="{op[0]:.3f}"/>{st}<stop offset="1" stop-color="{hexs(K)}" stop-opacity="0"/></linearGradient>')
    return f'<path d="{path(q.buffer(0.7,join_style=2),False)}" fill="url(#{gid})"/>'
import os
if os.path.exists('vec-full.png') and os.environ.get('SHADE'):
    for k,(i,q) in enumerate(regions):
        for fi,f in enumerate(FOLDS.get(i,[])):
            if q.distance(ext(*f,0))<3:
                sh=shade(q,f,k,fi)
                if sh: body.append(f'<g clip-path="url(#cp{i})">'+sh+'</g>')
svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"><defs>{"".join(defs)}</defs>{"".join(body)}</svg>'
open('logisweb-lw-mark.svg','w').write(svg);print(len(svg),'bytes',vb)
