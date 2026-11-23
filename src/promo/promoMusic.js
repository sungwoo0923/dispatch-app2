// ======================= src/promo/promoMusic.js =======================
// 🎵 2026-11-23 배경음악 합성기 — 저작권 걱정 없는 음악을 브라우저에서 바로 만든다(marketing/video/tools/music.py 를 옮김)
//  분위기(preset) · 빠르기(bpm) · 길이 · 강조 지점(hits: 번쩍 전환 · 로고 등장)으로 매번 같은 곡이 나온다(seed 고정)
const SR = 44100;
const note = (m) => 440 * 2 ** ((m - 69) / 12);
function rng(seed) { let s = seed >>> 0 || 7; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; }; }

export function synthMusic({ preset = "upbeat", bpm = 112, seconds = 30, hits = [], drop = null, seed = 7 } = {}) {
  const N = Math.ceil(SR * (seconds + 1.5));
  const L = new Float32Array(N), R = new Float32Array(N);
  const rnd = rng(seed);
  const beat = 60 / Math.max(50, Math.min(180, bpm)), bar = beat * 4;
  const add = (sig, start, gain = 1, pan = 0) => {
    const s = Math.floor(start * SR); if (s >= N) return;
    const l = Math.cos((pan + 1) * Math.PI / 4) * gain, r = Math.sin((pan + 1) * Math.PI / 4) * gain;
    const e = Math.min(N, s + sig.length);
    for (let i = Math.max(0, s); i < e; i++) { L[i] += sig[i - s] * l; R[i] += sig[i - s] * r; }
  };
  const env = (n, a, rel) => { const e = new Float32Array(n).fill(1); const A = Math.floor(a * SR), Rl = Math.floor(rel * SR); for (let i = 0; i < A && i < n; i++) e[i] = i / A; for (let i = 0; i < Rl && i < n; i++) e[n - 1 - i] *= i / Rl; return e; };
  const pad = (midis, dur, bright = 1) => {
    const n = Math.floor(dur * SR); const out = new Float32Array(n); const e = env(n, Math.min(0.6, dur / 3), Math.min(0.8, dur / 3));
    for (const m of midis) for (const det of [-0.08, 0.08]) {
      const w = 2 * Math.PI * note(m) * 2 ** (det / 12) / SR;
      for (let i = 0; i < n; i++) { const x = w * i; out[i] += Math.sin(x) + bright * 0.35 * Math.sin(2 * x) + bright * 0.12 * Math.sin(3 * x); }
    }
    const k = 1 / (midis.length * 2); for (let i = 0; i < n; i++) out[i] *= e[i] * k;
    return out;
  };
  const kick = () => { const n = Math.floor(0.35 * SR); const o = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; ph += 2 * Math.PI * (50 + 110 * Math.exp(-t * 28)) / SR; o[i] = Math.sin(ph) * Math.exp(-t * 9); } return o; };
  const hat = () => { const n = Math.floor(0.06 * SR); const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = rnd() * Math.exp(-(i / SR) * 70) * 0.5; return o; };
  const pluck = (m, d = 0.3, decay = 9) => { const n = Math.floor(d * SR); const o = new Float32Array(n); const w = 2 * Math.PI * note(m) / SR; for (let i = 0; i < n; i++) o[i] = (Math.sin(w * i) + 0.3 * Math.sin(2 * w * i)) * Math.exp(-(i / SR) * decay); return o; };
  const boom = () => { const n = Math.floor(2.5 * SR); const o = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; ph += 2 * Math.PI * (32 + 60 * Math.exp(-t * 6)) / SR; o[i] = (Math.sin(ph) + 0.4 * rnd() * Math.exp(-t * 12)) * Math.exp(-t * 1.6); } return o; };
  const bass = (m, d) => { const n = Math.floor(d * SR); const o = new Float32Array(n); const w = 2 * Math.PI * note(m) / SR; for (let i = 0; i < n; i++) o[i] = (Math.sin(w * i) + 0.25 * Math.sin(2 * w * i)) * Math.exp(-(i / SR) * 4); return o; };

  const minor = [[57, 60, 64], [53, 57, 60], [48, 52, 55, 60], [55, 59, 62]]; // Am F C G
  const major = [[48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60]]; // C G Am F
  const nb = Math.ceil(seconds / bar) + 1;
  const K = kick(), H = hat();
  if (preset === "upbeat" || preset === "corporate" || preset === "tech") {
    const prog = preset === "corporate" ? major : minor;
    for (let b = 0; b < nb; b++) {
      const ch = prog[b % 4]; const tb = b * bar;
      add(pad(ch.map((m) => m + 12), bar, preset === "tech" ? 0.5 : 0.8), tb, preset === "tech" ? 0.14 : 0.22);
      add(pad([ch[0] - 12], bar, 0.3), tb, 0.3);
      const arp = [...ch, ch[0] + 12];
      for (let q = 0; q < 4; q++) {
        const tq = tb + q * beat;
        if (preset === "corporate") { if (q % 2 === 0 && (b > 0 || q >= 2)) add(K, tq, 0.45); }
        else if (b > 0 || q >= 2) add(K, tq, 0.55);
        add(H, tq + beat / 2, 0.16, 0.3);
        if (preset === "tech") { add(H, tq + beat / 4, 0.07, -0.3); add(H, tq + beat * 0.75, 0.07, 0.3); add(bass(ch[0] - 12, beat / 2), tq + beat / 2, 0.5); }
        add(pluck(arp[q % arp.length] + 12), tq, preset === "tech" ? 0.06 : 0.1, -0.3);
        add(pluck(arp[(q + 2) % arp.length] + 12), tq + beat / 2, 0.07, 0.3);
      }
    }
  } else if (preset === "calm") {
    for (let b = 0; b < nb; b++) {
      const ch = major[b % 4]; const tb = b * bar;
      add(pad(ch, bar, 0.4), tb, 0.3);
      for (let q = 0; q < 8; q++) add(pluck(ch[q % ch.length] + 12 + (q >= 4 ? 12 : 0), 0.9, 3), tb + q * beat / 2, 0.06, q % 2 ? 0.4 : -0.4);
    }
  } else { // cinematic: 어둡게 시작 → drop 부터 리듬
    const dp = drop ?? seconds * 0.35;
    for (let b = 0; b < nb; b++) {
      const tb = b * bar; const ch = minor[b % 4];
      add(pad([...ch, ch[0] - 12], bar, tb < dp ? 0.4 : 0.9), tb, 0.3);
      if (tb >= dp) for (let q = 0; q < 4; q++) { add(K, tb + q * beat, 0.5); add(H, tb + q * beat + beat / 2, 0.14, 0.2); add(pluck(ch[q % ch.length] + 12), tb + q * beat, 0.08); }
      else if (b % 2 === 0) add(K, tb, 0.35);
    }
    add(boom(), Math.max(0, dp - 0.05), 0.9);
  }
  for (const h of hits || []) if (h > 0.2) add(boom(), h, preset === "cinematic" ? 0.6 : 0.35);
  // 끝 부분 페이드 + 정규화 + 살짝 부드럽게(1차 저역 통과)
  const fade = Math.floor(2.5 * SR), end = Math.min(N, Math.floor(seconds * SR) + Math.floor(0.5 * SR));
  for (let i = 0; i < N; i++) { const g = i >= end ? 0 : i > end - fade ? (end - i) / fade : 1; L[i] *= g; R[i] *= g; }
  let mx = 1e-9; let pl = 0, pr = 0; const a = 0.55;
  for (let i = 0; i < N; i++) { pl += a * (L[i] - pl); pr += a * (R[i] - pr); L[i] = pl; R[i] = pr; mx = Math.max(mx, Math.abs(pl), Math.abs(pr)); }
  const k = 0.8 / mx; for (let i = 0; i < N; i++) { L[i] *= k; R[i] *= k; }
  return { L, R, sampleRate: SR };
}
export function toAudioBuffer(ctx, m) { const b = ctx.createBuffer(2, m.L.length, m.sampleRate); b.copyToChannel(m.L, 0); b.copyToChannel(m.R, 1); return b; }
