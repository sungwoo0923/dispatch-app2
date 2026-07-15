// 알림음은 별도 음원 파일 없이 Web Audio API로 즉석 생성한다(자산 파일/
// 네트워크 요청 불필요, PC/모바일 브라우저 공통 지원). 메신저와 인력사무소
// 알림 등 여러 화면에서 공용으로 쓴다.
export const CHIME_PRESETS = {
  default: { label: "기본(2음 차임)", tones: [880, 1320], gap: 0.09, dur: 0.22 },
  soft: { label: "부드럽게", tones: [660], gap: 0, dur: 0.35 },
  pop: { label: "짧게(팝)", tones: [1046, 784, 1318], gap: 0.06, dur: 0.12 },
};

export function playChime(preset = "default") {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const cfg = CHIME_PRESETS[preset] || CHIME_PRESETS.default;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    cfg.tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * cfg.gap);
      gain.gain.linearRampToValueAtTime(0.18, now + i * cfg.gap + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * cfg.gap + cfg.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * cfg.gap);
      osc.stop(now + i * cfg.gap + cfg.dur + 0.03);
    });
    setTimeout(() => ctx.close(), 600);
  } catch {}
}
