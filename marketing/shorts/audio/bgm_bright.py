#!/usr/bin/env python3
# marketing/shorts/audio/bgm_bright.py — 숏츠용 밝은 배경음악(저작권 걱정 없는 직접 합성)
#   python3 bgm_bright.py out.wav [길이초=40.4] [드롭초=4.8]
# 120 BPM · C – G/B – Am – F(한 마디 2초) · 띵띵거리는 플럭/마림바 없이 패드 · 코드 스탭 · 베이스 · 드럼
# 드롭(첫 장면 전환)에 맞춰 비트가 들어오고, 드롭 + 16마디(=32초)에 마무리 코드가 친다.
import sys
import wave
import numpy as np
from scipy import signal as ss

OUT = sys.argv[1] if len(sys.argv) > 1 else "bgm.wav"
DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 40.4
DROP = float(sys.argv[3]) if len(sys.argv) > 3 else 4.8
SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
END = DROP + 16 * BAR            # 마무리 코드 치는 시점(36.8초)
N = int(DUR * SR)
rng = np.random.default_rng(7)
t_all = np.arange(N) / SR

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def env_adsr(n, a, d, s, r, sus_len):
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    sus = max(0, int(sus_len * SR) - a - d)
    e = np.concatenate([np.linspace(0, 1, max(a, 1)), np.linspace(1, s, max(d, 1)), np.full(sus, s), np.linspace(s, 0, max(r, 1))])
    return np.pad(e, (0, max(0, n - len(e))))[:n]
def saw(f, n, ph=0.0, maxh=9000):
    t = np.arange(n) / SR
    y = np.zeros(n)
    for k in range(1, int(maxh / f) + 1):
        y += np.sin(2 * np.pi * k * f * t + ph * k) / k
    return y * 0.6
def lp(x, fc, o=2): b, a = ss.butter(o, fc / (SR / 2), "low"); return ss.lfilter(b, a, x)
def hp(x, fc, o=2): b, a = ss.butter(o, fc / (SR / 2), "high"); return ss.lfilter(b, a, x)
def bp(x, f1, f2, o=2): b, a = ss.butter(o, [f1 / (SR / 2), f2 / (SR / 2)], "band"); return ss.lfilter(b, a, x)
def add(buf, x, at):
    i = int(at * SR)
    if i >= len(buf) or i + len(x) <= 0: return
    if i < 0: x = x[-i:]; i = 0
    x = x[: len(buf) - i]; buf[i:i + len(x)] += x

# 코드: C · G/B · Am · F  (패드 음, 스탭 음, 베이스 루트)
CHORDS = [
    dict(pad=[60, 64, 67, 72], stab=[72, 76, 79], bass=36),   # C
    dict(pad=[59, 62, 67, 71], stab=[71, 74, 79], bass=35),   # G/B
    dict(pad=[57, 60, 64, 69], stab=[69, 72, 76], bass=33),   # Am
    dict(pad=[53, 57, 60, 65], stab=[69, 72, 77], bass=29),   # F
]
# 음악 박자 원점 — 드롭이 마디 첫 박이 되도록
ORIGIN = DROP - 2 * BAR   # 0.8초: 인트로 2마디
def bar_t(i): return ORIGIN + i * BAR
NBARS = int((END - ORIGIN) / BAR)  # 18마디 (0.8 ~ 36.8)

L = np.zeros(N); R = np.zeros(N)
pad_bus_L = np.zeros(N); pad_bus_R = np.zeros(N)
verb_send = np.zeros(N)

# ── 패드: 디튠 소우 3겹, 좌우로 벌림 ─────────────────
for i in range(-1, NBARS):
    c = CHORDS[i % 4]
    st = bar_t(i); ln = BAR + 0.35
    n = int(ln * SR)
    e = env_adsr(n, 0.35 if i < 2 else 0.12, 0.4, 0.8, 0.35, ln - 0.35)
    for m in c["pad"]:
        f = hz(m)
        for dt, pan in ((-9, 0.15), (0, 0.5), (9, 0.85)):
            v = saw(f * 2 ** (dt / 1200), n, ph=rng.uniform(0, 6)) * e * 0.05
            add(pad_bus_L, v * np.sqrt(1 - pan), st); add(pad_bus_R, v * np.sqrt(pan), st)
# 인트로는 어둡게 열리다가 드롭에서 밝게: 두 필터 버전을 섞는다
dark_L, dark_R = lp(pad_bus_L, 900), lp(pad_bus_R, 900)
brt_L, brt_R = lp(pad_bus_L, 2800), lp(pad_bus_R, 2800)
open_ = np.clip((t_all - 0.5) / (DROP - 0.5), 0, 1) ** 2
open_ = np.where(t_all >= DROP, 1.0, open_ * 0.75)
padL = dark_L * (1 - open_) + brt_L * open_
padR = dark_R * (1 - open_) + brt_R * open_

# 사이드체인 펌프(4분음마다 살짝 눌렸다 올라옴) — 드롭부터
beat_pos = np.mod(t_all - ORIGIN, BEAT)
pump = 1 - 0.45 * np.exp(-beat_pos / 0.11)
pump = np.where((t_all >= DROP) & (t_all < END), pump, 1.0)
padL *= pump; padR *= pump
L += padL; R += padR
verb_send += (padL + padR) * 0.25

# ── 코드 스탭: 부드러운 소우 화음, 8분음 엇박(밝은 느낌) · 드롭부터 ─────
stab_L = np.zeros(N); stab_R = np.zeros(N)
PATTERN = [0.5, 1.5, 2.5, 3.0, 3.5]   # 한 마디 안 박 위치(엇박 위주)
for i in range(2, NBARS):
    c = CHORDS[i % 4]
    lvl = 0.75 if i < 10 else 1.0       # 후반(27초 근처부터) 조금 더 힘 있게
    for p in PATTERN:
        st = bar_t(i) + p * BEAT
        n = int(0.22 * SR)
        e = env_adsr(n, 0.012, 0.12, 0.25, 0.08, 0.14)
        v = sum(saw(hz(m), n, ph=rng.uniform(0, 6), maxh=6000) for m in c["stab"]) * e * 0.045 * lvl
        v = lp(v, 2600)
        add(stab_L, v * 0.8, st); add(stab_R, v * 1.0, st + 0.011)   # 살짝 어긋나게 넓게
L += stab_L; R += stab_R
verb_send += (stab_L + stab_R) * 0.35

# ── 베이스: 사인 + 약한 배음, 8분음 ─────────────────
bass = np.zeros(N)
BASS_PAT = [(0, 0.9), (0.5, 0.35), (1.0, 0.7), (1.5, 0.45), (2.0, 0.8), (2.5, 0.35), (3.0, 0.7), (3.5, 0.5)]
for i in range(2, NBARS):
    f = hz(CHORDS[i % 4]["bass"])
    for p, a in BASS_PAT:
        n = int(0.24 * SR); t = np.arange(n) / SR
        e = env_adsr(n, 0.005, 0.12, 0.55, 0.06, 0.2)
        v = (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)) * e * a
        add(bass, np.tanh(v * 1.6) * 0.24, bar_t(i) + p * BEAT)
bass = lp(bass, 700) * pump
L += bass; R += bass

# ── 드럼 ───────────────────────────────────────
def kick():
    n = int(0.32 * SR); t = np.arange(n) / SR
    f = 46 + 95 * np.exp(-t / 0.035)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.13)
    y[: int(0.003 * SR)] += rng.normal(0, 0.3, int(0.003 * SR))
    return np.tanh(y * 1.4) * 0.55
def clap():
    n = int(0.25 * SR); t = np.arange(n) / SR
    y = np.zeros(n)
    for d in (0, 0.009, 0.018):
        i = int(d * SR); m = n - i
        y[i:] += rng.normal(0, 1, m) * np.exp(-np.arange(m) / SR / (0.012 if d < 0.018 else 0.09))
    return bp(y, 900, 4200) * 0.22
def hat(open_=False):
    n = int((0.16 if open_ else 0.05) * SR); t = np.arange(n) / SR
    return hp(rng.normal(0, 1, n), 7000, 3) * np.exp(-t / (0.06 if open_ else 0.014)) * (0.075 if open_ else 0.05)
def shaker():
    n = int(0.06 * SR); t = np.arange(n) / SR
    return bp(rng.normal(0, 1, n), 5000, 11000) * (np.sin(np.pi * t / t[-1]) ** 2) * 0.025
def crash(len_=1.8):
    n = int(len_ * SR); t = np.arange(n) / SR
    return hp(rng.normal(0, 1, n), 4500, 2) * np.exp(-t / (len_ / 3.2)) * 0.12

drL = np.zeros(N); drR = np.zeros(N)
K, C = kick(), clap()
for i in range(2, NBARS):
    for b in range(4):
        st = bar_t(i) + b * BEAT
        add(drL, K, st); add(drR, K, st)                        # 4박 킥
        if b in (1, 3): add(drL, C, st); add(drR, C * 0.9, st + 0.004); add(verb_send, C * 1.4, st)
        oh = hat(True); add(drL, oh * 0.7, st + BEAT / 2); add(drR, oh, st + BEAT / 2)   # 엇박 오픈햇
        if i >= 10:                                              # 후반: 16분 셰이커 + 클로즈햇
            for q in (0.25, 0.75):
                s = shaker(); add(drL, s, st + q * BEAT); add(drR, s * 0.8, st + q * BEAT)
        ch = hat(); add(drR, ch * 0.6, st); add(drL, ch * 0.4, st)
# 인트로: 2마디째에 가벼운 하이햇만
for b in range(8):
    add(drL, hat() * 0.5, bar_t(1) + b * BEAT / 2); add(drR, hat() * 0.6, bar_t(1) + b * BEAT / 2)
# 크래시: 드롭 · 후반 시작 · 마무리
for at in (DROP, bar_t(10)):
    c = crash(); add(drL, c, at); add(drR, c * 0.9, at + 0.007)
L += drL; R += drR

# ── 라이저(드롭 직전 · 마무리 직전) ────────────────
def riser(len_):
    n = int(len_ * SR); t = np.arange(n) / SR
    x = rng.normal(0, 1, n); out = np.zeros(n); seg = int(0.05 * SR)
    for s in range(0, n, seg):
        f = 600 + 7000 * (s / n) ** 2
        out[s:s + seg] = bp(x[max(0, s - 2000):s + seg], f * 0.7, min(f * 1.4, 20000))[-len(x[s:s + seg]):]
    return out * (t / len_) ** 2 * 0.09
for at, ln in ((DROP - 1.0, 1.0), (END - 1.0, 1.0)):
    r = riser(ln); add(L, r, at); add(R, r, at)
# 마무리 전 마지막 반 마디 드럼 빼고 스네어 필
for k in range(4):
    add(L, C * (0.5 + 0.15 * k), END - BAR / 2 + k * BEAT / 2); add(R, C * (0.5 + 0.15 * k), END - BAR / 2 + k * BEAT / 2)

# ── 마무리: C 큰 화음 + 크래시, 길게 울리고 사라짐 ────────
ln = DUR - END + 0.2
n = int(ln * SR)
e = env_adsr(n, 0.01, 0.6, 0.55, ln - 0.7, 0.1)
fin = np.zeros(n)
for m in (48, 60, 64, 67, 72, 76):
    fin += saw(hz(m), n, ph=rng.uniform(0, 6), maxh=7000) * 0.045
fin = lp(fin, 3200) * e
add(L, fin, END); add(R, fin, END + 0.008)
add(L, K * 1.2, END); add(R, K * 1.2, END)
c = crash(3.0); add(L, c * 1.3, END); add(R, c * 1.2, END + 0.007)
verb_send[int(END * SR):int(END * SR) + n] += fin[: max(0, min(n, N - int(END * SR)))] * 0.6

# ── 리버브(짧은 홀) ──────────────────────────────
ir_n = int(1.6 * SR); ir_t = np.arange(ir_n) / SR
irL = rng.normal(0, 1, ir_n) * np.exp(-ir_t / 0.38); irR = rng.normal(0, 1, ir_n) * np.exp(-ir_t / 0.38)
irL[: int(0.02 * SR)] = 0; irR[: int(0.025 * SR)] = 0
vs = hp(verb_send, 250)
L += ss.fftconvolve(vs, irL)[:N] * 0.012
R += ss.fftconvolve(vs, irR)[:N] * 0.012

# ── 마스터: 저역 정리 · 살짝 밝게 · 소프트 클립 · 페이드 ─────
L, R = hp(L, 30), hp(R, 30)
air_L, air_R = hp(L, 6000), hp(R, 6000)
L += air_L * 0.25; R += air_R * 0.25
fade = np.clip(np.minimum(t_all / 0.4, (DUR - t_all) / 1.6), 0, 1)
L *= fade; R *= fade
pk = max(np.abs(L).max(), np.abs(R).max())
L = np.tanh(L / pk * 1.3) / np.tanh(1.3) * 0.89
R = np.tanh(R / pk * 1.3) / np.tanh(1.3) * 0.89

st = np.stack([L, R], 1)
w = wave.open(OUT, "wb"); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((st * 32767).astype("<i2").tobytes()); w.close()
print(f"ok {OUT} {DUR}s · 드롭 {DROP}s · 마무리 {END:.1f}s")
