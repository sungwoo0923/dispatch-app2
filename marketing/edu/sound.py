#!/usr/bin/env python3
"""안전교육 영상 배경음악 · 효과음 합성(저작권 걱정 없음) — build.mjs 가 부른다
python3 sound.py <events.json> <bed.wav> <sfx.wav>
events.json = {"duration": 초, "events": [{"t": 초, "k": "pop|whoosh|tick|swell"}]}
- 배경음악: 잔잔한 패드 + 부드러운 피아노 아르페지오(76bpm, I–V–vi–IV) — 나레이션 밑에 깔리게 작게
- 효과음: pop(요점 등장) · whoosh(장 넘김) · tick(체크) · swell(표지 · 마무리)
"""
import json, sys, wave
import numpy as np

SR = 48000
ev = json.load(open(sys.argv[1]))
DUR = float(ev["duration"]) + 1.0
N = int(SR * DUR)
rng = np.random.default_rng(11)


def note(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env(n, a, r):
    e = np.ones(n)
    a = min(n, int(a * SR)); r = min(n, int(r * SR))
    if a: e[:a] = np.linspace(0, 1, a) ** 1.5
    if r: e[-r:] *= np.linspace(1, 0, r) ** 1.5
    return e


def lowpass(x, cut):
    # 부드럽게(주파수 영역에서 높은 소리를 천천히 줄인다 — 파이썬 반복 없이 빠르게)
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / np.sqrt(1 + (f / cut) ** 4)
    return np.fft.irfft(X, n=len(x))


# ── 배경음악
bed = np.zeros((N, 2))
bpm = 76.0; beat = 60 / bpm; bar = beat * 4
prog = [[48, 55, 60, 64, 67], [43, 50, 55, 59, 62], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60]]  # C · G · Am · F
t_all = np.arange(N) / SR
lfo = 0.85 + 0.15 * np.sin(2 * np.pi * t_all / 9.0)
i = 0; t0 = 0.0
while t0 < DUR:
    ch = prog[i % 4]; n = int(bar * SR) + int(0.8 * SR); s = int(t0 * SR); e = min(N, s + n)
    tt = np.arange(e - s) / SR
    pad = np.zeros(e - s)
    for m in ch[:3]:
        f = note(m)
        for det, g in ((-0.06, 0.5), (0.0, 1.0), (0.06, 0.5)):
            ff = f * 2 ** (det / 12); pad += g * (np.sin(2 * np.pi * ff * tt) + 0.18 * np.sin(4 * np.pi * ff * tt))
    pad *= env(e - s, 0.9, 1.1) / 6.0
    bed[s:e, 0] += pad * 0.9; bed[s:e, 1] += pad * 1.0
    # 아르페지오(8분음표, 위 화음)
    arp = [ch[2] + 12, ch[3] + 12, ch[4] + 12, ch[3] + 12, ch[2] + 24, ch[4] + 12, ch[3] + 12, ch[4] + 12]
    for k, m in enumerate(arp):
        st = int((t0 + k * beat / 2) * SR); ln = int(1.2 * SR); en = min(N, st + ln)
        if st >= N: break
        tt2 = np.arange(en - st) / SR; f = note(m)
        pl = (np.sin(2 * np.pi * f * tt2) + 0.25 * np.sin(4 * np.pi * f * tt2) + 0.06 * np.sin(6 * np.pi * f * tt2)) * np.exp(-tt2 * 3.2) * 0.11
        pan = 0.35 if k % 2 else -0.35
        bed[st:en, 0] += pl * (1 - pan) / 2 * 2; bed[st:en, 1] += pl * (1 + pan) / 2 * 2
    # 부드러운 베이스
    bs = int(t0 * SR); bl = min(N, bs + int(bar * SR)); tt3 = np.arange(bl - bs) / SR
    bass = np.sin(2 * np.pi * note(ch[0] - 12) * tt3) * env(bl - bs, 0.05, 0.6) * 0.16
    bed[bs:bl, 0] += bass; bed[bs:bl, 1] += bass
    t0 += bar; i += 1
bed *= lfo[:, None]
bed[:, 0] = lowpass(bed[:, 0], 5200); bed[:, 1] = lowpass(bed[:, 1], 5200)
fade = min(N, int(2.5 * SR)); bed[:fade] *= np.linspace(0, 1, fade)[:, None]; bed[-fade:] *= np.linspace(1, 0, fade)[:, None]
bed /= max(1e-9, np.abs(bed).max()); bed *= 0.55

# ── 효과음
def pop():
    n = int(0.14 * SR); tt = np.arange(n) / SR
    f = 1250 * np.exp(-tt * 9) + 620
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 34) * 0.5


def tick():
    n = int(0.5 * SR); tt = np.arange(n) / SR; s = np.zeros(n)
    for f, d in ((1318.5, 0.0), (1975.5, 0.07)):
        k = int(d * SR); t2 = tt[: n - k]
        s[k:] += np.sin(2 * np.pi * f * t2) * np.exp(-t2 * 11)
    return s * 0.28


def whoosh():
    n = int(0.9 * SR); x = rng.standard_normal(n)
    tt = np.arange(n) / SR; cut = 300 + 3800 * np.sin(np.pi * tt / 0.9) ** 2
    y = np.empty(n); st = 0.0
    for i2 in range(n):
        a = np.exp(-2 * np.pi * cut[i2] / SR); st = (1 - a) * x[i2] + a * st; y[i2] = st
    return y * np.sin(np.pi * tt / 0.9) ** 1.5 * 0.9


def swell():
    n = int(2.6 * SR); tt = np.arange(n) / SR; s = np.zeros(n)
    for m in (60, 64, 67, 72):
        f = note(m); s += np.sin(2 * np.pi * f * tt) + 0.2 * np.sin(4 * np.pi * f * tt)
    shimmer = sum(np.sin(2 * np.pi * note(m) * tt) * 0.15 for m in (84, 88, 91))
    e = np.minimum(1, tt / 0.9) * np.exp(-np.maximum(0, tt - 0.9) * 1.6)
    return (s / 4 + shimmer) * e * 0.35


def norm(x, peak):
    return x / max(1e-9, np.abs(x).max()) * peak


SFX = {"pop": norm(pop(), 0.42), "tick": norm(tick(), 0.32), "whoosh": norm(whoosh(), 0.38), "swell": norm(swell(), 0.42)}
sfx = np.zeros((N, 2))
for e2 in ev["events"]:
    sig = SFX.get(e2["k"]);
    if sig is None: continue
    s = int(max(0, e2["t"]) * SR); en = min(N, s + len(sig))
    if s >= N: continue
    sfx[s:en, 0] += sig[: en - s]; sfx[s:en, 1] += sig[: en - s]


def save(path, x):
    x = np.clip(x, -1, 1); d = (x * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(d.tobytes())


save(sys.argv[2], bed); save(sys.argv[3], sfx)
print("ok", round(DUR, 1), len(ev["events"]))
