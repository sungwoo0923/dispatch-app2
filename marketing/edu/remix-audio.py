# 사용법: python3 marketing/edu/remix-audio.py <교육id> — 영상 화면은 그대로 두고 소리만 다시 깐다(깨끗한 나레이션 + 끊김 없는 배경음악, 효과음 없음)
# S 폴더의 lines.json(교육별 문장) · ovr/(교육별 대체 음성)을 쓴다 — 2026-11-24 '지직 · 틱 · 끊김' 고칠 때 쓴 도구
# 영상은 그대로 두고 소리만 다시 깐다 — 깨끗한 나레이션(지직 없음)을 지금 영상의 같은 자리에 + 끊김 없는 배경음악, 효과음 없음
import sys,json,hashlib,subprocess,wave,numpy as np,os
S='/tmp/claude-0/-home-user-dispatch-app2/4a55aefa-fa5c-56f1-9c02-3a1cd27eaabd/scratchpad'
course=sys.argv[1]; mp4=f'public/edu/{course}.mp4'; R=24000
L=json.load(open(S+'/lines.json'))[course]
raw=subprocess.run(["ffmpeg","-v","error","-i",mp4,"-ac","1","-ar",str(R),"-f","s16le","-"],capture_output=True).stdout
y=np.frombuffer(raw,dtype='<i2').astype(np.float32)/32768
dur=len(y)/R
def pcm(t):
    h=hashlib.sha1(('Kore|'+t).encode()).hexdigest()[:16]
    o=f'{S}/ovr/{course}/{h}.pcm'  # 이 영상 목소리에 맞춰 따로 만든 줄(같은 문장을 다른 영상이 다른 모델로 바꿔 놓은 경우)
    if os.path.exists(o): return np.frombuffer(open(o,'rb').read(),dtype='<i2').astype(np.float32)/32768
    return np.frombuffer(open(f'marketing/edu/.cache/{h}.pcm','rb').read(),dtype='<i2').astype(np.float32)/32768
def xcorr(a,b):  # b 가 a 안 어디에 있는지
    if len(a)<=len(b): return np.zeros(1)
    n=1<<int(np.ceil(np.log2(len(a)+len(b))))
    c=np.fft.irfft(np.fft.rfft(a,n)*np.conj(np.fft.rfft(b,n)),n)[:len(a)-len(b)+1]
    e=np.sqrt(np.convolve(a*a,np.ones(len(b)),'valid'))+1e-6
    return c/(e*np.linalg.norm(b))
narr=np.zeros(len(y),np.float32); pos=0; pend=0; low=[]
for i,t in enumerate(L):
    p=pcm(t); probe=p[:min(len(p),R*2)]
    w=y[pos:pos+len(probe)+R*25]
    c=xcorr(w,probe); k=int(np.argmax(c)); t0=pos+k
    if c[k]<0.5:
        # 같은 녹음이 아니라 모양으로 못 찾음 → 말이 시작되는 곳(소리가 커지는 첫 지점)을 찾는다
        seg=y[pend:pend+R*12]; B=480; n=(len(seg)-1)//B
        hp=np.diff(seg[:n*B+1]); rr=np.sqrt((hp[:n*B].reshape(n,B)**2).mean(1))
        base=np.median(rr[:max(4,int(0.3*R/B))])
        X=seg[:n*B].reshape(n,B); zc=(np.abs(np.diff(np.sign(X),axis=1))>0).mean(1); pk=np.abs(X).max(1)
        glitch=(pk>0.6)&(zc>0.08)  # 예전 '지직'은 말 시작으로 보지 않는다
        on=np.where((rr>max(base*6,0.004))&~glitch&(zc<0.2))[0]
        t0=pend+(int(on[0])*B-600 if len(on) else 0)
        low.append((i,round(float(c[k]),2),round(t0/R,2)))
    F=min(480,len(p)//4); g=np.ones(len(p),np.float32); g[:F]=np.linspace(0,1,F); g[-F:]=np.linspace(1,0,F); p=p*g  # 앞뒤 20ms 부드럽게(틱 없음)
    e=min(len(narr),t0+len(p)); narr[t0:e]+=p[:e-t0]
    pos=t0+int(len(p)*0.6); pend=t0+len(p)
print(course,'줄',len(L),'맞춤 약한 줄',low)
wav=S+f'/{course}-narr.wav'
with wave.open(wav,'wb') as f: f.setnchannels(1); f.setsampwidth(2); f.setframerate(R); f.writeframes((np.clip(narr,-1,1)*32767).astype('<i2').tobytes())
ev=S+f'/{course}-ev.json'; json.dump({"duration":dur,"events":[]},open(ev,'w'))
bed=S+f'/{course}-bed.wav'; sfx=S+f'/{course}-sfx.wav'
subprocess.run(['python3','marketing/edu/sound.py',ev,bed,sfx],check=True,capture_output=True)
out=S+f'/{course}.mp4'
fc="[1:a]aresample=48000,aformat=channel_layouts=stereo[v];[2:a]volume=0.2[b];[v][b]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]"
r=subprocess.run(['ffmpeg','-y','-v','error','-i',mp4,'-i',wav,'-i',bed,'-filter_complex',fc,'-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-b:a','128k','-movflags','+faststart','-shortest',out],capture_output=True,text=True)
print('ok' if r.returncode==0 else r.stderr[-400:])
