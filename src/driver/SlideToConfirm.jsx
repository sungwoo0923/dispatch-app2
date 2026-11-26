// ======================= src/driver/SlideToConfirm.jsx =======================
// 🟦 2026-11-26 기사앱 리디자인(2차 시안) — 아이폰 "밀어서 잠금 해제" 느낌의 밀어서 확인 버튼
//  · 왼쪽 로지스웹 로고 손잡이를 오른쪽 끝까지 밀면 onConfirm — 운전 중에 잘못 눌러 상태가 바뀌는 일을 막는다
//  · 글자 위로 빛이 천천히 흐른다(움직임 줄이기 설정이면 멈춤) · 끝까지 밀면 짧은 진동
//  · disabled 면 손잡이가 움직이지 않고 note(이유)를 아래에 보여 준다 · loading 이면 "처리 중…"
//  · 눌러만 보면 손잡이가 살짝 튀어 "밀어 주세요"를 알려 준다 · 키보드(Enter/Space)로도 확인 가능(접근성)
import React from "react";

const CSS = `
.kp-slide{position:relative;height:64px;border-radius:32px;user-select:none;-webkit-user-select:none;touch-action:pan-y;overflow:hidden;
 background:linear-gradient(180deg,rgba(9,16,38,.92),rgba(20,32,66,.92));box-shadow:inset 0 1px 3px rgba(0,0,0,.5),inset 0 0 0 1px rgba(175,195,255,.16),0 10px 26px rgba(11,20,48,.28)}
.kp-slide.light{background:linear-gradient(180deg,#0F1A36,#1B2B55)}
.kp-slide .fill{position:absolute;left:0;top:0;bottom:0;border-radius:32px;background:linear-gradient(90deg,rgba(111,134,232,.35),rgba(175,195,255,.18))}
.kp-slide .txt{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding-left:52px;font-size:18px;font-weight:700;letter-spacing:-.2px;pointer-events:none;
 background:linear-gradient(90deg,rgba(243,246,253,.42) 0%,rgba(243,246,253,.42) 40%,#fff 50%,rgba(243,246,253,.42) 60%,rgba(243,246,253,.42) 100%);background-size:250% 100%;
 -webkit-background-clip:text;background-clip:text;color:transparent;animation:kpSlideShim 2.6s linear infinite}
.kp-slide .chev{margin-left:8px;letter-spacing:-3px;opacity:.7}
@keyframes kpSlideShim{from{background-position:100% 0}to{background-position:-150% 0}}
.kp-slide .knob{position:absolute;left:6px;top:6px;width:52px;height:52px;border-radius:16px;background:url(/icons/icon-192x192.png) center/cover;
 box-shadow:0 4px 14px rgba(46,75,170,.6),inset 0 0 0 1px rgba(255,255,255,.22);touch-action:none;cursor:grab}
.kp-slide .knob:after{content:"";position:absolute;right:-10px;top:50%;margin-top:-5px;border-left:6px solid rgba(255,255,255,.6);border-top:5px solid transparent;border-bottom:5px solid transparent}
.kp-slide.snap .knob,.kp-slide.snap .fill{transition:transform .32s cubic-bezier(.2,.9,.3,1.2),width .32s cubic-bezier(.2,.9,.3,1.2)}
.kp-slide.off{opacity:.55}.kp-slide.off .txt{animation:none;background:none;color:rgba(243,246,253,.55)}.kp-slide.off .knob{cursor:not-allowed;filter:grayscale(.6)}
.kp-slide.done .txt{animation:none;background:none;color:#fff}
.kp-slide.nudge .knob{animation:kpSlideNudge .55s ease}
@keyframes kpSlideNudge{30%{transform:translateX(26px)}60%{transform:translateX(-4px)}100%{transform:translateX(0)}}
.kp-slide-note{margin-top:7px;font-size:14px;font-weight:700;color:#5B6B85;text-align:center}
@media (prefers-reduced-motion:reduce){.kp-slide .txt{animation:none;background:none;color:rgba(243,246,253,.85)}}
`;

export default function SlideToConfirm({ label, onConfirm, disabled = false, loading = false, note = "", doneLabel = "처리 중…", style }) {
  const trackRef = React.useRef(null);
  const drag = React.useRef(null);
  const [x, setX] = React.useState(0);
  const [snap, setSnap] = React.useState(true);
  const [nudge, setNudge] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const max = () => Math.max(0, (trackRef.current?.clientWidth || 300) - 64);
  // 처리가 끝나면(로딩이 풀리면) 손잡이를 처음 자리로
  React.useEffect(() => { if (!loading && done) { setDone(false); setSnap(true); setX(0); } }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps
  const off = disabled || loading || done;
  const fire = () => {
    setDone(true); setSnap(true); setX(max());
    try { navigator.vibrate?.(35); } catch { /* 무시 */ }
    Promise.resolve().then(() => onConfirm?.()).finally(() => { setTimeout(() => { setDone(false); setX(0); }, 900); });
  };
  const down = (e) => {
    if (off) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
    drag.current = { sx: e.clientX, moved: false };
    setSnap(false);
  };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    const dx = Math.max(0, Math.min(max(), e.clientX - d.sx));
    if (dx > 4) d.moved = true;
    setX(dx);
  };
  const up = () => {
    const d = drag.current; drag.current = null; if (!d) return;
    setSnap(true);
    if (x >= max() * 0.86) { fire(); return; }
    setX(0);
    if (!d.moved) { setNudge(true); setTimeout(() => setNudge(false), 600); }
  };
  const key = (e) => { if (!off && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); fire(); } };
  const m = max() || 1;
  return (
    <div style={style}>
      <style>{CSS}</style>
      <div ref={trackRef} className={`kp-slide${snap ? " snap" : ""}${off && !done ? " off" : ""}${done ? " done" : ""}${nudge ? " nudge" : ""}`}
        role="button" tabIndex={off ? -1 : 0} aria-disabled={off} aria-label={`${label} — 오른쪽으로 밀어서 확인`} onKeyDown={key}>
        <div className="fill" style={{ width: x + 58 }} />
        <span className="txt" style={{ opacity: done ? 1 : Math.max(0.15, 1 - x / m * 1.4) }}>{done || loading ? doneLabel : <>{label}<span className="chev">›››</span></>}</span>
        <span className="knob" style={{ transform: `translateX(${x}px)` }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      </div>
      {note ? <div className="kp-slide-note">{note}</div> : null}
    </div>
  );
}
