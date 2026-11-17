// ======================= src/cellNote.jsx =======================
// 🏷 2026-11-17 표 칸 모서리 표시 + 말풍선 — 금액 옆에 알약(지게차 · 운임구분)을 붙이면 숫자 오른쪽 정렬이 칸마다 어긋나 보였다(사용자 요청)
//  · 숫자는 그대로 같은 자리에 두고, 칸 오른쪽 위 모서리에 작은 삼각형(엑셀 메모 표시처럼)만 붙인다
//  · 마우스를 올리거나(휴대폰은 누르면) 말풍선으로 자세한 내용(특수운임 항목 · 운임구분 · 수동 여부)을 보여 준다
//  · 칸(td)에 className "relative" 가 있어야 모서리에 붙는다
import React from "react";
import { createPortal } from "react-dom";

export const NOTE_TONES = {
  gold: { tri: "#E9B949", head: "#E9C46A" }, // 특수운임 · 지게차
  blue: { tri: "#4B7BE5", head: "#8FB0F0" }, // 운임구분
  red: { tri: "#E5484D", head: "#FFB4B4" },  // 손실 사유 등
};

export function CellNote({ tone = "gold", title = "", lines = [], corner = "tr", testId }) {
  const [pos, setPos] = React.useState(null);
  const ref = React.useRef(null);
  const T = NOTE_TONES[tone] || NOTE_TONES.gold;
  const show = () => { const r = ref.current?.getBoundingClientRect(); if (!r) return; setPos({ x: r.right, y: r.top, below: r.top < 120 }); };
  const hide = () => setPos(null);
  React.useEffect(() => {
    if (!pos) return undefined;
    const off = () => setPos(null);
    window.addEventListener("scroll", off, true); window.addEventListener("resize", off);
    return () => { window.removeEventListener("scroll", off, true); window.removeEventListener("resize", off); };
  }, [pos]);
  const left = corner === "tl";
  const tri = left
    ? { borderTop: `9px solid ${T.tri}`, borderRight: "9px solid transparent", left: 0 }
    : { borderTop: `9px solid ${T.tri}`, borderLeft: "9px solid transparent", right: 0 };
  return (
    <>
      <span ref={ref} role="button" tabIndex={0} aria-label={[title, ...lines].filter(Boolean).join(" · ")} data-cell-note={tone} data-testid={testId}
        onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
        onClick={(e) => { e.stopPropagation(); pos ? hide() : show(); }} onDoubleClick={(e) => e.stopPropagation()}
        className="absolute top-0 z-[1] w-4 h-4 cursor-help" style={{ [left ? "left" : "right"]: 0 }}>
        <span className="absolute top-0 w-0 h-0" style={tri} />
      </span>
      {pos && createPortal(
        <div role="tooltip" className="fixed z-[2147483000] pointer-events-none"
          style={{ left: Math.min(Math.max(8, pos.x - 120), window.innerWidth - 248), top: pos.below ? pos.y + 22 : undefined, bottom: pos.below ? undefined : window.innerHeight - pos.y + 8, width: 240 }}>
          <div className="relative rounded-xl bg-[#0F1A30] text-white shadow-[0_12px_28px_rgba(11,19,36,.35)] px-3 py-2.5">
            {title && <div className="text-[11.5px] font-black tracking-wide mb-1" style={{ color: T.head }}>{title}</div>}
            {lines.map((l, i) => <div key={i} className="text-[12.5px] font-semibold leading-snug text-white/90 tabular-nums">{l}</div>)}
            <span className="absolute w-2.5 h-2.5 bg-[#0F1A30] rotate-45" style={{ left: Math.min(226, Math.max(10, pos.x - Math.min(Math.max(8, pos.x - 120), window.innerWidth - 248) - 8)), [pos.below ? "top" : "bottom"]: -5 }} />
          </div>
        </div>, document.body)}
    </>
  );
}
