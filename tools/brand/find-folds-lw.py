# 🔷 새 LW 로고 안쪽 접힌 선(명암 경계) 좌표 찾기 — vectorize-lw.py 의 FOLDS 값
import numpy as np
from PIL import Image
from scipy import ndimage as nd
a=np.asarray(Image.open('logisweb-lw-source.png').convert('RGB')).astype(float)
L=a.mean(2); m=nd.binary_erosion(L<200,iterations=6)
g=nd.gaussian_filter(a,(1.5,1.5,0))
mag=sum(np.hypot(nd.sobel(g[...,k],0),nd.sobel(g[...,k],1)) for k in range(3)); mag[~m]=0
lab,n=nd.label(mag>25)
for i in range(1,n+1):
    ys,xs=np.where(lab==i)
    if len(xs)<80: continue
    P=np.c_[xs,ys].astype(float);c=P.mean(0);u,s,vt=np.linalg.svd(P-c);d=vt[0]
    pr=(P-c)@d; p0=c+d*pr.min(); p1=c+d*pr.max()
    res=np.abs((P-c)@vt[1]).max()
    # curvature check: residual by thirds
    print(len(xs), p0.round(1), p1.round(1), 'maxres',round(res,1))
