// ======================= src/KpBootScreen.jsx =======================
// ⭐ KP-Flow 첫 진입 로딩 화면(모바일·PC 공용) — 네이비 화면 위로 트럭이 전체 진행률만큼 길을 달리고,
// 4단계가 차례대로 0 → 100% 채워진다. 전부 100%가 되면 부드럽게 사라지며 최신 상태로 열린다.
// targets: 단계별 목표 %(0~100) 4개 / subs: 단계 옆에 보일 보조 문구 / variant: "mobile" | "pc"
import React, { useState, useEffect, useRef } from "react";

export const BOOT_STEPS = ["저장된 오더 불러오기", "서버 확인", "최신 오더 반영", "화면 준비"];

const SIZE = {
  mobile: {
    box: "max-w-[320px]", logo: "w-14 h-14 rounded-2xl", title: "text-[22px]", tag: "text-[11px]", logoGap: "mb-9",
    status: "text-[12px]", pct: "text-[26px]", pctUnit: "text-[14px]", card: "gap-3.5 px-4 py-4", dot: "w-[22px] h-[22px] text-[11px]",
    label: "text-[13px]", sub: "text-[11px]", bar: "h-[3px]", truck: 1,
  },
  pc: {
    box: "max-w-[460px]", logo: "w-20 h-20 rounded-[22px]", title: "text-[32px]", tag: "text-[13px]", logoGap: "mb-12",
    status: "text-[14px]", pct: "text-[36px]", pctUnit: "text-[18px]", card: "gap-5 px-6 py-6", dot: "w-[28px] h-[28px] text-[13px]",
    label: "text-[15px]", sub: "text-[13px]", bar: "h-[4px]", truck: 1.35,
  },
};

export default function KpBootScreen({ targets, subs = [], onAllDone, variant = "mobile", steps = BOOT_STEPS, zIndex, maxWaitMs = 10000 }) {
  const Z = SIZE[variant] || SIZE.mobile;
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const [shown, setShown] = useState([0, 0, 0, 0]);
  // ⚠️ 진행값은 ref에서 바로 계산한다 — setState 함수 안에서 "계속 움직일지"를 정하면
  // React가 그 함수를 나중에 실행해 애니메이션이 중간(예: 41%)에 멈춰버렸다.
  const shownRef = useRef([0, 0, 0, 0]);
  const doneRef = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const targetKey = targets.join(",");
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(50, now - last);
      last = now;
      const next = [...shownRef.current];
      let moving = false;
      for (let i = 0; i < next.length; i += 1) {
        if (i > 0 && next[i - 1] < 100) break; // 앞 단계가 100%가 돼야 다음 단계 시작
        const t = targetsRef.current[i];
        if (next[i] < t) { next[i] = Math.min(t, next[i] + dt * 0.5); moving = true; } // 한 단계 약 0.2초
      }
      if (moving) {
        shownRef.current = next;
        setShown(next);
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [targetKey]);
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setLeaving(true);
    setTimeout(() => onAllDone?.(), 260); // 사라지는 효과 후 화면 열기
  };
  // 안전장치 — 어떤 이유로든 maxWaitMs(기본 10초) 안에 다 안 차면 그냥 연다
  useEffect(() => {
    const t = setTimeout(finish, maxWaitMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (shown.some((v) => v < 100)) return;
    const t = setTimeout(finish, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  const overall = Math.round(shown.reduce((a, v) => a + v, 0) / shown.length);
  const activeIdx = shown.findIndex((v) => v < 100);
  return (
    <div
      className="fixed inset-0 z-[100001] flex flex-col items-center justify-center px-6 select-none"
      style={{
        background: "radial-gradient(120% 80% at 50% 0%, #2A3F6B 0%, #1B2B4B 45%, #0F1A30 100%)",
        zIndex,
        opacity: leaving ? 0 : 1,
        transform: leaving ? "scale(1.02)" : "none",
        transition: "opacity 0.26s ease, transform 0.26s ease",
      }}
    >
      <style>{`
        @keyframes kpBootFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-1.5px) } }
        @keyframes kpBootDash { from { background-position: 0 0 } to { background-position: -24px 0 } }
        @keyframes kpBootPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(96,165,250,0.55) } 70% { box-shadow: 0 0 0 7px rgba(96,165,250,0) } }
      `}</style>
      <div className={`w-full ${Z.box} flex flex-col min-w-0`}>
        {/* 로고 */}
        <div className={`flex flex-col items-center ${Z.logoGap}`}>
          <img src="/icons/sflow-icon.png" alt="KP-Flow" className={`${Z.logo} shadow-[0_8px_24px_rgba(0,0,0,0.35)] ring-1 ring-white/15`} />
          <div className={`mt-3 text-white ${Z.title} font-black tracking-tight`}>KP-Flow</div>
          <div className={`mt-0.5 ${Z.tag} font-semibold tracking-[0.2em] text-blue-200/60 whitespace-nowrap`}>배차관리 시스템</div>
        </div>

        {/* 트럭이 전체 진행률만큼 달리는 길 */}
        <div className="relative h-9 mb-1">
          <div
            className="absolute left-0 right-0 bottom-1.5 h-[2px] rounded-full opacity-30"
            style={{ backgroundImage: "linear-gradient(90deg, #fff 50%, transparent 50%)", backgroundSize: "12px 2px", animation: "kpBootDash 0.6s linear infinite" }}
          />
          <div className="absolute left-0 bottom-1.5 h-[2px] rounded-full bg-gradient-to-r from-blue-400 to-sky-300" style={{ width: `${overall}%` }} />
          <div className="absolute bottom-1.5" style={{ left: `calc(${overall}% - ${overall * 0.3 * Z.truck}px)` }}>
            <svg width={30 * Z.truck} height={22 * Z.truck} viewBox="0 0 30 22" style={{ animation: "kpBootFloat 0.5s ease-in-out infinite" }}>
              <rect x="1" y="3" width="17" height="12" rx="2" fill="#E8EEF9" />
              <path d="M18 7h5.5l4 4.5V15H18z" fill="#93C5FD" />
              <rect x="20" y="8.3" width="3.2" height="2.6" rx="0.6" fill="#1B2B4B" />
              <circle cx="7" cy="17" r="2.6" fill="#0F1A30" stroke="#E8EEF9" strokeWidth="1.3" />
              <circle cx="22.5" cy="17" r="2.6" fill="#0F1A30" stroke="#E8EEF9" strokeWidth="1.3" />
            </svg>
          </div>
        </div>
        <div className="flex justify-between items-baseline gap-2 mb-7 whitespace-nowrap">
          <span className={`${Z.status} font-bold text-blue-100/70 truncate min-w-0`}>{activeIdx === -1 ? "준비 완료" : `${steps[activeIdx]} 중…`}</span>
          <span className={`${Z.pct} font-black text-white tabular-nums leading-none shrink-0`}>{overall}<span className={`${Z.pctUnit} text-blue-200/70 ml-0.5`}>%</span></span>
        </div>

        {/* 단계별 진행 */}
        <div className={`flex flex-col ${Z.card} rounded-2xl bg-white/[0.06] ring-1 ring-white/10 backdrop-blur-sm`}>
          {steps.map((label, i) => {
            const v = Math.round(shown[i]);
            const done = v >= 100;
            const active = i === activeIdx;
            return (
              <div key={label} className="flex items-center gap-3" style={{ opacity: done || active ? 1 : 0.38, transition: "opacity 0.2s" }}>
                <div
                  className={`${Z.dot} shrink-0 rounded-full flex items-center justify-center font-black ${done ? "bg-blue-400 text-[#0F1A30]" : active ? "bg-white/10 text-white ring-2 ring-blue-400" : "bg-white/10 text-white/50"}`}
                  style={active ? { animation: "kpBootPulse 1.2s ease-out infinite" } : undefined}
                >
                  {done ? (
                    <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2.5 6.3l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  ) : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline gap-2 whitespace-nowrap">
                    <span className={`${Z.label} font-bold truncate min-w-0 ${done ? "text-white" : "text-blue-50/90"}`}>{label}</span>
                    <span className={`${Z.sub} font-bold tabular-nums text-blue-200/80 shrink-0`}>{subs[i] && (done || active) ? subs[i] : `${v}%`}</span>
                  </div>
                  <div className={`mt-1.5 ${Z.bar} rounded-full bg-white/10 overflow-hidden`}>
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-sky-300" style={{ width: `${v}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
