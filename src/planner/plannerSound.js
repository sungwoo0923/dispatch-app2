// src/planner/plannerSound.js — 외부 사운드 파일 없이 Web Audio API로 즉석에서
// 만드는 짧은 효과음("파방!" 터지는 소리 / 안 되는 이동 알림음)과 진동 헬퍼.
// 브라우저 자동재생 정책 때문에, 반드시 사용자 조작(클릭/터치) 이후 호출되는
// 흐름 안에서만 실제로 소리가 난다.
let ctx = null;
function getCtx() {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

// ⭐ 순수 톤(사인/삼각파)만으로는 "삐용" 하는 전자음처럼 들려서, 실제로 뭔가
// "터지는" 질감이 부족하다는 피드백 — 화이트 노이즈를 짧게 만들어 대역폭을
// 확 좁혔다 넓혔다 하면서 감쇠시키면, 풍선/폭죽이 터질 때 나는 "파삭" 하는
// 크랙 질감이 난다. 이 노이즈 크랙을 낮은 "펑" 바디와 겹치면 훨씬 임팩트
// 있고 만족스러운 타격감이 만들어진다.
function noiseBurst(c, when, { duration = 0.1, freqStart = 4000, freqEnd = 800, gain = 0.3, q = 1 } = {}) {
  const size = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, size, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;

  const noise = c.createBufferSource();
  noise.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freqStart, when);
  filter.frequency.exponentialRampToValueAtTime(Math.max(80, freqEnd), when + duration);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + duration);
  noise.connect(filter).connect(g).connect(c.destination);
  noise.start(when);
  noise.stop(when + duration);
}

// 구슬 터질 때 — 낮은 "펑" 바디 위에 노이즈 크랙 두 겹을 살짝 시차를 두고
// 겹쳐서 "파방!" 하고 실제로 터지는 느낌을 낸다. pitch를 연쇄마다 조금씩
// 올려주면 콤보가 이어질수록 더 경쾌해진다.
export function playPopSound(pitch = 1) {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;

  // 낮은 "펑" 바디(타격감) — 대포 소리처럼 두툼하게.
  const thump = c.createOscillator();
  const thumpGain = c.createGain();
  thump.type = "sine";
  thump.frequency.setValueAtTime(190 * pitch, now);
  thump.frequency.exponentialRampToValueAtTime(48 * pitch, now + 0.13);
  thumpGain.gain.setValueAtTime(0.34, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
  thump.connect(thumpGain).connect(c.destination);
  thump.start(now);
  thump.stop(now + 0.16);

  // "파방" — 노이즈 크랙 두 겹(살짝 시차)으로 진짜 터지는 질감을 만든다.
  noiseBurst(c, now, { duration: 0.09, freqStart: 4200 * pitch, freqEnd: 900 * pitch, gain: 0.38, q: 0.9 });
  noiseBurst(c, now + 0.045, { duration: 0.07, freqStart: 3000 * pitch, freqEnd: 650 * pitch, gain: 0.24, q: 1.1 });

  // 높은 반짝임 꼬리(경쾌함 유지)
  const sparkle = c.createOscillator();
  const sparkleGain = c.createGain();
  sparkle.type = "sine";
  sparkle.frequency.setValueAtTime(900 * pitch, now + 0.02);
  sparkle.frequency.exponentialRampToValueAtTime(1400 * pitch, now + 0.06);
  sparkleGain.gain.setValueAtTime(0.0001, now);
  sparkleGain.gain.linearRampToValueAtTime(0.13, now + 0.02);
  sparkleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
  sparkle.connect(sparkleGain).connect(c.destination);
  sparkle.start(now);
  sparkle.stop(now + 0.14);
}

// 이동할 수 없는 자리로 옮기려고 할 때 — 짧고 낮은 "안 돼요" 느낌의 알림음.
export function playErrorSound() {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(150, now);
  gain.gain.setValueAtTime(0.09, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.12);
}

// 콤보(연쇄)가 이어질 때 — 기본 파방 소리 위에 상승하는 "휘리릭" 스윕과 굵은
// 노이즈 "펑" 폭발음을 겹쳐서 더 짜릿하고 임팩트 있게. chain이 클수록 더
// 굵고 크게 터진다.
export function playComboSound(chain = 2) {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const n = Math.min(chain, 6);

  const sweep = c.createOscillator();
  const sweepGain = c.createGain();
  sweep.type = "sawtooth";
  sweep.frequency.setValueAtTime(260 + n * 40, now);
  sweep.frequency.exponentialRampToValueAtTime(1500 + n * 160, now + 0.16);
  sweepGain.gain.setValueAtTime(0.0001, now);
  sweepGain.gain.linearRampToValueAtTime(0.16 + n * 0.02, now + 0.05);
  sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
  sweep.connect(sweepGain).connect(c.destination);
  sweep.start(now);
  sweep.stop(now + 0.24);

  // 낮은 임팩트 "펑" — 콤보가 커질수록 더 굵게.
  const boom = c.createOscillator();
  const boomGain = c.createGain();
  boom.type = "triangle";
  boom.frequency.setValueAtTime(90, now);
  boom.frequency.exponentialRampToValueAtTime(38, now + 0.16);
  boomGain.gain.setValueAtTime(0.08 + n * 0.05, now);
  boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  boom.connect(boomGain).connect(c.destination);
  boom.start(now);
  boom.stop(now + 0.22);

  // 대포 터지듯 굵은 노이즈 폭발 — 콤보가 커질수록 더 크고 길게.
  noiseBurst(c, now, { duration: 0.14 + n * 0.01, freqStart: 2600, freqEnd: 300, gain: 0.28 + n * 0.03, q: 0.7 });
}

export function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch {}
}
