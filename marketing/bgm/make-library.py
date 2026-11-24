#!/usr/bin/env python3
"""영상 편집실 · 무료 음악 보관함 — 저작권 걱정 없는 배경음악을 직접 합성해 public/promo/bgm/*.mp3 로 만든다
python3 marketing/bgm/make-library.py            → 10곡 전부
python3 marketing/bgm/make-library.py calm_piano → 한 곡만
· 곡 길이는 마디 단위라 편집실에서 반복(루프)해도 이음새가 자연스럽다
· 악기: 피아노 · 뜯는 현(Karplus-Strong) · 패드 · 베이스 · 킥 · 스네어/박수 · 하이햇 · 셰이커 · 잔향
"""
import os, sys, json, subprocess
import numpy as np

SR = 44100
ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "../../public/promo/bgm")
os.makedirs(OUT, exist_ok=True)


def note(m): return 440.0 * 2 ** ((m - 69) / 12)


def adsr(n, a=0.005, d=0.1, s=0.7, r=0.2):
    e = np.full(n, s, dtype=float)
    A = min(n, int(a * SR)); D = min(n - A, int(d * SR)); R = min(n, int(r * SR))
    if A: e[:A] = np.linspace(0, 1, A)
    if D: e[A:A + D] = np.linspace(1, s, D)
    if R: e[-R:] *= np.linspace(1, 0, R)
    return e


class Track:
    def __init__(self, bpm, bars, seed):
        self.bpm = bpm; self.beat = 60 / bpm; self.bar = self.beat * 4
        self.N = int(round(self.bar * bars * SR)); self.L = np.zeros(self.N); self.R = np.zeros(self.N)
        self.rng = np.random.default_rng(seed); self.bars = bars

    def add(self, sig, t, gain=1.0, pan=0.0, wrap=True):
        s = int(t * SR) % self.N if wrap else int(t * SR)
        l = np.cos((pan + 1) * np.pi / 4) * gain; r = np.sin((pan + 1) * np.pi / 4) * gain
        n = len(sig); e = min(self.N, s + n); k = e - s
        self.L[s:e] += sig[:k] * l; self.R[s:e] += sig[:k] * r
        if wrap and k < n:  # 끝을 넘는 소리는 앞으로 감아 루프 이음새를 없앤다
            rest = sig[k:]; m = min(len(rest), self.N)
            self.L[:m] += rest[:m] * l; self.R[:m] += rest[:m] * r


# ── 악기
def piano(m, dur, vel=1.0):
    n = int((dur + 1.2) * SR); t = np.arange(n) / SR; f = note(m); s = np.zeros(n)
    for k, (a, dec) in enumerate([(1, 2.2), (0.45, 3.0), (0.22, 4.0), (0.12, 5.5), (0.06, 7)]):
        s += a * np.sin(2 * np.pi * f * (k + 1) * t * (1 + 0.0004 * k * k)) * np.exp(-t * dec * (1 + f / 2000))
    s += 0.05 * np.random.default_rng(int(f)).standard_normal(n) * np.exp(-t * 60)  # 해머
    rel = np.ones(n); off = int(dur * SR)
    if off < n: rel[off:] = np.exp(-np.arange(n - off) / SR * 8)
    return s * rel * vel * 0.32


def pluck(m, dur, bright=0.5):
    f = note(m); p = max(2, int(SR / f)); n = int((dur + 0.6) * SR)
    rng = np.random.default_rng(m); buf = rng.uniform(-1, 1, p); out = np.zeros(n)
    blocks = n // p + 1; y = np.zeros(blocks * p); y[:p] = buf
    for b in range(1, blocks):
        prev = y[(b - 1) * p:b * p]; y[b * p:(b + 1) * p] = 0.996 * (bright * prev + (1 - bright) * 0.5 * (prev + np.roll(prev, 1)))
    out = y[:n]
    return out * np.exp(-np.arange(n) / SR * 1.2) * 0.35


def pad(ms, dur, bright=0.35, att=0.8):
    n = int((dur + 1.0) * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for m in ms:
        for det in (-0.07, 0, 0.07):
            f = note(m) * 2 ** (det / 12)
            for k in range(1, 6): s += np.sin(2 * np.pi * f * k * t) * (bright ** (k - 1)) / k
    return s * adsr(n, att, 0.5, 0.85, 1.0) / (len(ms) * 3) * 0.5


def bass(m, dur, soft=True):
    n = int(dur * SR); t = np.arange(n) / SR; f = note(m)
    s = np.sin(2 * np.pi * f * t) + (0.15 if soft else 0.35) * np.sin(4 * np.pi * f * t)
    return s * adsr(n, 0.01, 0.15, 0.75, 0.08) * 0.42


def kick(soft=1.0):
    n = int(0.4 * SR); t = np.arange(n) / SR; ph = 2 * np.pi * np.cumsum(48 + 95 * np.exp(-t * 30)) / SR
    return np.sin(ph) * np.exp(-t * 8) * 0.9 * soft


def snare(rng, clap=False):
    n = int(0.25 * SR); t = np.arange(n) / SR; nz = rng.standard_normal(n)
    if clap:
        e = sum(np.exp(-np.maximum(0, t - d) * 40) * (t >= d) for d in (0, 0.012, 0.024)); return nz * e * 0.18
    return (nz * np.exp(-t * 22) * 0.22 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.25)


def hat(rng, open_=False):
    n = int((0.25 if open_ else 0.05) * SR); t = np.arange(n) / SR; nz = rng.standard_normal(n)
    nz = np.diff(np.concatenate([[0], nz]))  # 높은 소리만
    return nz * np.exp(-t * (14 if open_ else 80)) * 0.08


def shaker(rng):
    n = int(0.09 * SR); t = np.arange(n) / SR
    return np.diff(np.concatenate([[0], rng.standard_normal(n)])) * np.sin(np.pi * t / 0.09) * 0.035


def finish(tr, reverb=0.25, lp=None, vinyl=False, name=""):
    L, R = tr.L, tr.R
    if lp:
        for X in (L, R):
            F = np.fft.rfft(X); f = np.fft.rfftfreq(len(X), 1 / SR); F *= 1 / np.sqrt(1 + (f / lp) ** 4); X[:] = np.fft.irfft(F, n=len(X))
    if reverb:  # 잔향(지수 감쇠 잡음 IR, 순환 합성곱 — 루프 이음새 유지)
        n = len(L); irn = int(2.2 * SR); rng = np.random.default_rng(3)
        for X, sd in ((L, 1), (R, 2)):
            ir = np.zeros(n); ir[:irn] = np.random.default_rng(sd).standard_normal(irn) * np.exp(-np.arange(irn) / SR * 3.2)
            ir /= np.sqrt((ir ** 2).sum()); wet = np.fft.irfft(np.fft.rfft(X) * np.fft.rfft(ir), n=n)
            X[:] = X + wet * reverb
    if vinyl:
        rng = tr.rng; cr = (rng.random(len(L)) > 0.9994) * rng.standard_normal(len(L)) * 0.08
        hiss = rng.standard_normal(len(L)) * 0.004; L += cr + hiss; R += cr + hiss
    peak = max(np.abs(L).max(), np.abs(R).max(), 1e-9); g = 0.89 / peak
    st = np.stack([L * g, R * g], 1)
    st = np.tanh(st * 1.15) / np.tanh(1.15)  # 부드러운 압축
    pcm = (np.clip(st, -1, 1) * 32767).astype("<i2").tobytes()
    out = os.path.join(OUT, f"{name}.mp3")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "2", "-i", "-", "-c:a", "libmp3lame", "-b:a", "128k", out], input=pcm, check=True)
    return out, len(L) / SR


C, G, Am, F, Em, Dm = [48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48], [40, 43, 47], [38, 41, 45]
def up(ch, k): return [m + k for m in ch]


# ── 곡들
def calm_piano(tr):
    prog = [F, C, G, Am] * 6 + [F, G, C, C] * 2
    for b, ch in enumerate(prog):
        t0 = b * tr.bar
        tr.add(pad(up(ch, 12), tr.bar), t0, 0.35)
        for k, m in enumerate([ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[1] + 36, ch[2] + 24, ch[1] + 24]):
            tr.add(piano(m, tr.beat * 0.7, 0.75 + 0.1 * (k == 0)), t0 + k * tr.bar / 6, 1, (-0.3 if k % 2 else 0.3))
        tr.add(piano(ch[0] + 12, tr.bar * 0.9, 0.6), t0, 1)
    return dict(reverb=0.35, lp=7000)


def warm_acoustic(tr):
    prog = [C, Am, F, G] * 8
    pat = [0, 2, 1, 2, 0, 2, 1, 2]
    for b, ch in enumerate(prog):
        t0 = b * tr.bar; tones = [ch[0] + 12, ch[1] + 24, ch[2] + 24]
        for k in range(8): tr.add(pluck(tones[pat[k]] if k else ch[0] + 12, tr.beat), t0 + k * tr.beat / 2, 0.9, (-0.4 if k % 2 else 0.2))
        tr.add(bass(ch[0], tr.beat * 1.8), t0, 0.7); tr.add(bass(ch[2] - 12, tr.beat * 1.8), t0 + tr.beat * 2, 0.6)
        for k in range(8): tr.add(shaker(tr.rng), t0 + k * tr.beat / 2, 1.0 if k % 2 else 0.6, 0.4)
        if b >= 4:
            tr.add(kick(0.5), t0); tr.add(kick(0.5), t0 + tr.beat * 2.5)
    return dict(reverb=0.22, lp=9000)


def corporate(tr):
    prog = [C, G, Am, F] * 8
    for b, ch in enumerate(prog):
        t0 = b * tr.bar
        tr.add(pad(up(ch, 12), tr.bar, 0.3), t0, 0.45)
        for k in range(8): tr.add(piano(ch[k % 3] + 24 + (12 if k == 4 else 0), tr.beat * 0.4, 0.55), t0 + k * tr.beat / 2, 1, (-0.25 if k % 2 else 0.25))
        tr.add(bass(ch[0], tr.bar * 0.95), t0, 0.7)
        if b >= 4:
            for k in range(4): tr.add(kick(0.7), t0 + k * tr.beat)
            for k in (1, 3): tr.add(snare(tr.rng, clap=True), t0 + k * tr.beat, 0.9)
            for k in range(8): tr.add(hat(tr.rng), t0 + k * tr.beat / 2, 0.8, 0.3)
    return dict(reverb=0.2, lp=10000)


# ── 검증된 세 편곡(잔잔한 피아노 8점 · 따뜻한 어쿠스틱 9점 · 기업 홍보 8점)을 바탕으로 빠르기 · 리듬 · 악기 크기만 바꾼 곡들
def acoustic_like(tr, prog, drums_from=4, clap=False, kick_v=0.5, shaker_v=1.0):
    pat = [0, 2, 1, 2, 0, 2, 1, 2]
    for b, ch in enumerate(prog):
        t0 = b * tr.bar; tones = [ch[0] + 12, ch[1] + 24, ch[2] + 24]
        for k in range(8): tr.add(pluck(tones[pat[k]] if k else ch[0] + 12, tr.beat), t0 + k * tr.beat / 2, 0.9, (-0.4 if k % 2 else 0.2))
        tr.add(bass(ch[0], tr.beat * 1.8), t0, 0.7); tr.add(bass(ch[2] - 12, tr.beat * 1.8), t0 + tr.beat * 2, 0.6)
        for k in range(8): tr.add(shaker(tr.rng), t0 + k * tr.beat / 2, (1.0 if k % 2 else 0.6) * shaker_v, 0.4)
        if b >= drums_from:
            tr.add(kick(kick_v), t0); tr.add(kick(kick_v), t0 + tr.beat * 2.5)
            if clap:
                for k in (1, 3): tr.add(snare(tr.rng, clap=True), t0 + k * tr.beat, 0.5)


def corporate_like(tr, prog, drums_from=4, pad_v=0.45, piano_v=0.55, hat_=True, shaker_=False, kick_v=0.7, clap_v=0.9):
    for b, ch in enumerate(prog):
        t0 = b * tr.bar
        if pad_v: tr.add(pad(up(ch, 12), tr.bar, 0.3), t0, pad_v)
        for k in range(8): tr.add(piano(ch[k % 3] + 24 + (12 if k == 4 else 0), tr.beat * 0.4, piano_v), t0 + k * tr.beat / 2, 1, (-0.25 if k % 2 else 0.25))
        tr.add(bass(ch[0], tr.bar * 0.95), t0, 0.7)
        if b >= drums_from:
            for k in range(4): tr.add(kick(kick_v), t0 + k * tr.beat)
            for k in (1, 3): tr.add(snare(tr.rng, clap=True), t0 + k * tr.beat, clap_v)
            for k in range(8):
                if hat_: tr.add(hat(tr.rng), t0 + k * tr.beat / 2, 0.8, 0.3)
                if shaker_: tr.add(shaker(tr.rng), t0 + k * tr.beat / 2, 0.9, 0.35)


def piano_like(tr, prog, pad_v=0.35, drums=False, boom_every=0, swing=0.0):
    for b, ch in enumerate(prog):
        t0 = b * tr.bar
        tr.add(pad(up(ch, 12), tr.bar), t0, pad_v)
        for k, m in enumerate([ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[1] + 36, ch[2] + 24, ch[1] + 24]):
            tr.add(piano(m, tr.beat * 0.7, 0.75 + 0.1 * (k == 0)), t0 + k * tr.bar / 6 + (swing * tr.beat if k % 2 else 0), 1, (-0.3 if k % 2 else 0.3))
        tr.add(piano(ch[0] + 12, tr.bar * 0.9, 0.6), t0, 1)
        if drums:
            tr.add(kick(0.55), t0); tr.add(kick(0.45), t0 + tr.beat * 2.5)
            for k in (1, 3): tr.add(snare(tr.rng), t0 + k * tr.beat, 0.45)
            for k in range(8): tr.add(hat(tr.rng), t0 + k * tr.beat / 2 + (swing * tr.beat if k % 2 else 0), 0.55, 0.25)
        if boom_every and b % boom_every == 0:
            n = int(2.5 * SR); t = np.arange(n) / SR; ph = 2 * np.pi * np.cumsum(32 + 60 * np.exp(-t * 6)) / SR
            tr.add(np.sin(ph) * np.exp(-t * 1.6) * 0.5, t0, 0.6)


def bright_pop(tr):
    acoustic_like(tr, [C, G, Am, F] * 8, drums_from=1, clap=True, kick_v=0.6); return dict(reverb=0.18, lp=10000)


def tech(tr):
    corporate_like(tr, [C, Am, F, G] * 8, drums_from=2, pad_v=0.3, piano_v=0.5, kick_v=0.6, clap_v=0.7); return dict(reverb=0.2, lp=10000)


def lofi(tr):
    piano_like(tr, [F, C, G, Am] * 6, pad_v=0.3, drums=True, swing=0.12); return dict(reverb=0.28, lp=6500)


def cinematic(tr):
    piano_like(tr, [C, G, Am, F] * 4 + [F, G, C, C], pad_v=0.6, boom_every=4); return dict(reverb=0.4, lp=7500)


def hopeful(tr):
    corporate_like(tr, [C, G, Am, F] * 8, drums_from=8, pad_v=0.5, piano_v=0.6, hat_=False, shaker_=True, kick_v=0.6, clap_v=0.6); return dict(reverb=0.25, lp=10000)


def news_pulse(tr):
    corporate_like(tr, [F, C, G, Am] * 8, drums_from=0, pad_v=0.4, piano_v=0.45, hat_=False, shaker_=True, kick_v=0.5, clap_v=0.5); return dict(reverb=0.2, lp=9000)


def ambient(tr):
    acoustic_like(tr, [G, C, Em, C] * 8, drums_from=2, clap=True, kick_v=0.45, shaker_v=1.1); return dict(reverb=0.2, lp=9500)


LIB = [
    ("calm_piano", "잔잔한 피아노", "교육 · 설명", 72, 32, calm_piano),
    ("warm_acoustic", "따뜻한 어쿠스틱", "회사 소개 · 일상", 92, 32, warm_acoustic),
    ("corporate", "기업 홍보", "신뢰감 · 발표", 100, 32, corporate),
    ("bright_pop", "산뜻한 어쿠스틱 팝", "숏츠 · 기능 소개", 112, 32, bright_pop),
    ("tech", "모던 비즈니스", "서비스 소개 · 화면 설명", 108, 32, tech),
    ("lofi", "편안한 로파이", "브이로그 · 일상", 84, 24, lofi),
    ("cinematic", "감동 시네마틱", "회사 소개 · 마무리", 66, 20, cinematic),
    ("hopeful", "희망찬", "성장 · 비전", 96, 32, hopeful),
    ("news_pulse", "정보 · 공지", "공지 · 업데이트", 104, 32, news_pulse),
    ("ambient", "산뜻한 일상", "현장 · 기사님 이야기", 100, 32, ambient),
]

if __name__ == "__main__":
    only = sys.argv[1:]
    meta = []
    for key, name, use, bpm, bars, fn in LIB:
        if only and key not in only: continue
        tr = Track(bpm, bars, hash(key) % 1000)
        opts = fn(tr); out, dur = finish(tr, name=key, **opts)
        meta.append({"key": key, "name": name, "use": use, "bpm": bpm, "sec": round(dur, 1), "url": f"/promo/bgm/{key}.mp3"})
        print(f"{name} {dur:.0f}초 → {out}")
    if not only:
        json.dump(meta, open(os.path.join(ROOT, "library.json"), "w"), ensure_ascii=False, indent=1)
