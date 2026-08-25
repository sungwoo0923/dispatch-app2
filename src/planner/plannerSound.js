// src/planner/plannerSound.js — 외부 사운드 파일 없이 Web Audio API로 즉석에서
// 만드는 짧은 효과음("뽝" 터지는 소리 / 안 되는 이동 알림음)과 진동 헬퍼.
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

// 구슬 터질 때 — 풍선 터지듯 "퐁!" 하고 두 겹으로 겹쳐 울리게 해서 더 통통 튀고
// 중독성 있게. pitch를 연쇄마다 조금씩 올려주면 콤보가 이어질수록 경쾌해진다.
export function playPopSound(pitch = 1) {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;

  // 낮은 "퍽" 레이어(타격감)
  const thump = c.createOscillator();
  const thumpGain = c.createGain();
  thump.type = "triangle";
  thump.frequency.setValueAtTime(140 * pitch, now);
  thump.frequency.exponentialRampToValueAtTime(60 * pitch, now + 0.09);
  thumpGain.gain.setValueAtTime(0.22, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  thump.connect(thumpGain).connect(c.destination);
  thump.start(now);
  thump.stop(now + 0.1);

  // 높은 "퐁" 레이어(경쾌함) — 살짝 늦게 겹쳐서 이중 타격감을 준다.
  const pop = c.createOscillator();
  const popGain = c.createGain();
  pop.type = "sine";
  pop.frequency.setValueAtTime(720 * pitch, now + 0.02);
  pop.frequency.exponentialRampToValueAtTime(1100 * pitch, now + 0.07);
  pop.frequency.exponentialRampToValueAtTime(300 * pitch, now + 0.18);
  popGain.gain.setValueAtTime(0.0001, now);
  popGain.gain.linearRampToValueAtTime(0.22, now + 0.03);
  popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  pop.connect(popGain).connect(c.destination);
  pop.start(now);
  pop.stop(now + 0.2);
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

export function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch {}
}
