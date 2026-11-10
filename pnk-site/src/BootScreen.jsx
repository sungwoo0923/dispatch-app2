// ======================= pnk-site/src/BootScreen.jsx =======================
// 🏢 PnK PROJECT 인트라넷 입장 로딩 화면 — 로지스웹 첫 진입 로딩(src/KpBootScreen.jsx)과 같은 느낌(네이비 · 큰 % · 빛나는 진행 줄 · 4단계)
//  stage: 0~4 (로그인 확인 → 구성원 · 사번 확인 → 본사 데이터 연결 → 인트라넷 준비). 4가 되면 남은 막대를 채우고 사라진다.
import React from "react";

const STEPS = ["로그인 확인", "구성원 · 사번 확인", "본사 데이터 연결", "인트라넷 준비"];

export default function BootScreen({ stage = 0, name = "", onDone }) {
  const [shown, setShown] = React.useState(0);
  const [leaving, setLeaving] = React.useState(false);
  const target = Math.min(100, stage * 25);
  // 너무 빨리 지나가지 않게 한 단계씩 차오른다(전체 최소 약 0.9초)
  React.useEffect(() => {
    if (shown >= target) return undefined;
    const t = setTimeout(() => setShown((v) => Math.min(target, v + 5)), 35);
    return () => clearTimeout(t);
  }, [shown, target]);
  React.useEffect(() => {
    if (shown < 100) return undefined;
    const t = setTimeout(() => { setLeaving(true); setTimeout(() => onDone?.(), 260); }, 180);
    return () => clearTimeout(t);
  }, [shown, onDone]);
  const active = Math.min(3, Math.floor(shown / 25));
  const d = new Date(Date.now() + 9 * 3600e3);
  const clock = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-[100001] flex flex-col items-center justify-center px-6 select-none overflow-hidden"
      style={{ background: "radial-gradient(90% 60% at 50% 0%, #22396A 0%, #0F1A30 55%, #060D1C 100%)", opacity: leaving ? 0 : 1, transition: "opacity .26s ease" }}>
      <style>{`
        @keyframes pnkBlink { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
        @keyframes pnkRise { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        @keyframes pnkGlow { 0%,100% { box-shadow: 0 0 0 0 rgba(143,176,240,.45) } 50% { box-shadow: 0 0 0 14px rgba(143,176,240,0) } }
      `}</style>
      {/* 본사 건물 실루엣(창문 불빛이 진행만큼 켜진다) */}
      <div className="absolute inset-x-0 bottom-0 h-[38%] pointer-events-none flex items-end justify-center gap-2 opacity-[0.22]" aria-hidden="true">
        {[46, 70, 120, 92, 160, 108, 64, 84, 52].map((h, i) => (
          <div key={i} className="w-10 md:w-16 rounded-t-md bg-[#8FB0F0]/30 relative overflow-hidden" style={{ height: `${h * 1.4}px` }}>
            <div className="absolute inset-2 grid grid-cols-2 gap-1.5 content-start">
              {Array.from({ length: Math.floor(h / 14) * 2 }).map((_, k) => (
                <div key={k} className="h-1.5 rounded-sm transition-colors duration-500" style={{ background: (k * 7 + i * 13) % 100 < shown ? "#CFE0FF" : "rgba(255,255,255,.12)" }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="relative w-full max-w-[440px]" style={{ animation: "pnkRise .4s ease both" }}>
        <div className="flex items-center justify-center gap-3.5 mb-10">
          <div className="w-16 h-16 rounded-[20px] bg-white flex items-center justify-center" style={{ animation: "pnkGlow 2.2s ease-in-out infinite" }}>
            <img src="/brand/pnk-mark-192.png" alt="" className="w-14 h-14 rounded-2xl" />
          </div>
          <div className="leading-tight">
            <div className="text-[26px] font-black text-white tracking-tight">PnK PROJECT</div>
            <div className="mt-1 text-[10.5px] font-bold tracking-[0.26em] text-white/45">HEADQUARTERS INTRANET</div>
          </div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8FB0F0]" style={{ animation: "pnkBlink 1.2s ease-in-out infinite" }} />
              {shown >= 100 ? "WELCOME" : "CONNECTING"} · KST {clock}
            </div>
            <div className="mt-1 text-[14px] font-bold text-white/75 truncate">{shown >= 100 ? `${name ? `${name}님, ` : ""}본사에 오신 것을 환영합니다` : `${STEPS[active]} 중…`}</div>
          </div>
          <div className="font-black text-white leading-none tabular-nums" style={{ fontSize: 56, letterSpacing: "-0.04em" }}>
            {shown}<span className="text-white/35 text-[22px] ml-0.5">%</span>
          </div>
        </div>

        <div className="relative h-[3px] mt-4 mb-7 rounded-full bg-white/[0.08] overflow-hidden">
          <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${shown}%`, background: "linear-gradient(90deg, #4B6CB7, #CFE0FF)", boxShadow: "0 0 12px rgba(143,176,240,.8)", transition: "width .12s linear" }} />
        </div>

        <ol className="space-y-2.5">
          {STEPS.map((s, i) => {
            const done = shown >= (i + 1) * 25;
            const on = i === active && !done;
            return (
              <li key={s} className={`flex items-center gap-3 rounded-2xl px-4 py-3 border transition ${on ? "border-[#8FB0F0]/40 bg-white/[0.06]" : "border-white/[0.06] bg-white/[0.02]"}`}>
                <span className={`w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center ${done ? "bg-[#CFE0FF] text-[#0F1A30]" : on ? "bg-[#4B6CB7] text-white" : "bg-white/10 text-white/40"}`}>{done ? "✓" : i + 1}</span>
                <span className={`flex-1 text-[13.5px] font-bold ${done || on ? "text-white" : "text-white/40"}`}>{s}</span>
                <span className="text-[11.5px] font-bold text-white/40 tabular-nums">{done ? "완료" : on ? "진행 중" : "대기"}</span>
              </li>
            );
          })}
        </ol>
        <div className="mt-7 text-center text-[11px] text-white/30">로지스웹 · 로지스웹 허브 · 공식 홈페이지 · 기사앱 통합 본사 시스템</div>
      </div>
    </div>
  );
}
