#!/usr/bin/env python3
"""저작권 걱정 없는 배경음악을 직접 합성해요. python3 tools/music.py <이름> <초> <bpm> <분위기:upbeat|cinematic>"""
import numpy as np, sys, subprocess, os
SR = 48000
name, secs, bpm, mood = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
N = int(SR * secs); t = np.arange(N) / SR; out = np.zeros((N, 2))
beat = 60 / bpm
def note(m): return 440 * 2 ** ((m - 69) / 12)
def env(n, a, r):
    e = np.ones(n); a = int(a * SR); r = int(r * SR)
    if a: e[:a] = np.linspace(0, 1, a)
    if r: e[-r:] *= np.linspace(1, 0, r)
    return e
def add(sig, start, gain=1.0, pan=0.0):
    s = int(start * SR); e = min(N, s + len(sig))
    if s >= N: return
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    out[s:e, 0] += sig[: e - s] * gain * l; out[s:e, 1] += sig[: e - s] * gain * r
def pad(midis, dur, bright=1.0):
    n = int(dur * SR); tt = np.arange(n) / SR; sig = np.zeros(n)
    for m in midis:
        f = note(m)
        for det in (-0.08, 0.0, 0.08):
            ff = f * 2 ** (det / 12)
            sig += np.sin(2*np.pi*ff*tt) + bright*0.35*np.sin(4*np.pi*ff*tt) + bright*0.12*np.sin(6*np.pi*ff*tt)
    return sig / (len(midis) * 3) * env(n, min(0.6, dur/3), min(0.8, dur/3))
def kick():
    n = int(0.35*SR); tt = np.arange(n)/SR
    f = 50 + 110*np.exp(-tt*28); ph = 2*np.pi*np.cumsum(f)/SR
    return np.sin(ph) * np.exp(-tt*9)
def hat():
    n = int(0.06*SR); return np.random.randn(n) * np.exp(-np.arange(n)/SR*70) * 0.5
def pluck(m, dur=0.3):
    n = int(dur*SR); tt = np.arange(n)/SR; f = note(m)
    return (np.sin(2*np.pi*f*tt) + 0.3*np.sin(4*np.pi*f*tt)) * np.exp(-tt*9)
def boom():
    n = int(2.5*SR); tt = np.arange(n)/SR
    f = 32 + 60*np.exp(-tt*6); ph = 2*np.pi*np.cumsum(f)/SR
    return (np.sin(ph) + 0.4*np.random.randn(n)*np.exp(-tt*12)) * np.exp(-tt*1.6)
np.random.seed(7)
# 진행: Am - F - C - G (upbeat 는 한 단계 밝게)
prog = [[57,60,64],[53,57,60],[48,52,55,60],[55,59,62]]
bar = beat * 4
if mood == "upbeat":
    nb = int(secs / bar) + 1
    for b in range(nb):
        ch = prog[b % 4]; add(pad([m+12 for m in ch], bar, 0.8), b*bar, 0.22)
        add(pad([ch[0]-12], bar, 0.3), b*bar, 0.35)
        for q in range(4):
            tq = b*bar + q*beat
            if b > 0 or q >= 2: add(kick(), tq, 0.55)
            add(hat(), tq + beat/2, 0.18, 0.3)
            arp = ch + [ch[0]+12]
            add(pluck(arp[q % len(arp)] + 12), tq, 0.10, -0.3)
            add(pluck(arp[(q+2) % len(arp)] + 12), tq + beat/2, 0.07, 0.3)
else:  # cinematic: 어둡게 시작 → 중간(drop 초)부터 리듬
    drop = float(os.environ.get("DROP", secs*0.35))
    nb = int(secs / bar) + 1
    for b in range(nb):
        tb = b*bar; ch = prog[b % 4]
        add(pad([m for m in ch] + [ch[0]-12], bar, 0.4 if tb < drop else 0.9), tb, 0.30)
        if tb >= drop:
            for q in range(4):
                add(kick(), tb + q*beat, 0.5)
                add(hat(), tb + q*beat + beat/2, 0.14, 0.2)
                add(pluck(ch[q % len(ch)] + 12), tb + q*beat, 0.08)
        elif b % 2 == 0:
            add(kick(), tb, 0.35)
    add(boom(), drop - 0.05, 0.9)
    for h in os.environ.get("HITS", "").split(","):
        if h: add(boom(), float(h), 0.6)
# 끝 부분 페이드
fade = int(2.5*SR); out[-fade:] *= np.linspace(1, 0, fade)[:, None]
out /= np.max(np.abs(out)) + 1e-9; out *= 0.8
pcm = (out * 32767).astype("<i2").tobytes()
dst = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "audio", f"music-{name}.wav")
subprocess.run(["ffmpeg","-y","-loglevel","error","-f","s16le","-ar",str(SR),"-ac","2","-i","-",
                "-af","lowpass=f=9000,aecho=0.8:0.5:60:0.15", dst], input=pcm, check=True)
print("ok", dst)
