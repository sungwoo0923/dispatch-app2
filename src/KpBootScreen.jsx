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

export default function KpBootScreen({ targets, subs = [], onAllDone, variant = "mobile", steps = BOOT_STEPS, zIndex, onSkip }) {
  const Z = SIZE[variant] || SIZE.mobile;
  // ⭐ 끊김 방지 — 예전엔 막대·숫자를 매 프레임(초당 60번) 자바스크립트로 다시 그렸고, 배경 흐림(blur)·점선 이동·
  // 테두리 깜빡임이 매 프레임 화면 전체를 다시 칠하게 만들었다. 데이터를 받느라 바쁜 저사양 폰(특히 LTE)에서
  // 그대로 끊겼다. 이제 막대·트럭은 "목표만 정해주고" 이동은 그래픽 칩(transform 전환효과)이 하게 해서,
  // 자바스크립트가 바빠도 부드럽게 움직인다.
  const STEP_MS = 280; // 한 단계가 차오르는 시간
  const [completed, setCompleted] = useState([false, false, false, false]);
  const shown = targets.map((t, i) => (i === 0 || completed[i - 1] ? Math.max(0, Math.min(100, t || 0)) : 0));
  const shownKey = shown.join(",");
  // 단계가 100%가 되면 막대가 다 차는 시간 뒤에 "완료" — 그다음 단계가 시작된다
  useEffect(() => {
    const timers = [];
    shown.forEach((v, i) => {
      if (v >= 100 && !completed[i]) timers.push(setTimeout(() => setCompleted((c) => (c[i] ? c : c.map((x, k) => (k === i ? true : x)))), STEP_MS));
    });
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey, completed.join(",")]);

  const doneRef = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setLeaving(true);
    setTimeout(() => onAllDone?.(), 200); // 사라지는 효과 후 화면 열기
  };
  useEffect(() => {
    if (!completed.every(Boolean)) return undefined;
    const t = setTimeout(finish, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed.join(",")]);

  // 전체 % 숫자 — 숫자 글자만 가볍게 직접 바꾼다(화면 전체를 다시 그리지 않음)
  const overall = Math.round(shown.reduce((a, v) => a + v, 0) / shown.length);
  const pctRef = useRef(null);
  const pctShownRef = useRef(0);
  useEffect(() => {
    let raf = 0;
    const from = pctShownRef.current;
    const start = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - start) / STEP_MS);
      const v = Math.round(from + (overall - from) * k);
      pctShownRef.current = v;
      if (pctRef.current) pctRef.current.textContent = String(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [overall]);

  // ⭐ 안내 문구 — 처음부터 보여주고, 오래 걸리면 바꾼다(받다 만 상태로 강제로 열지 않음).
  // 30초가 넘거나 인터넷이 끊겨 있으면 "저장된 오더로 먼저 열기"를 직접 고를 수 있다.
  const [phase, setPhase] = useState(0);
  const [offline, setOffline] = useState(typeof navigator !== "undefined" && navigator.onLine === false);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 20000);
    const t2 = setTimeout(() => setPhase(2), 30000);
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  const notice = offline
    ? { title: "인터넷 연결이 끊겨 있어요", desc: "연결되면 자동으로 이어서 받아와요" }
    : phase >= 2
      ? { title: "연결이 많이 느린 것 같아요", desc: "신호가 좋은 곳이나 와이파이에서 더 빨라요" }
      : phase >= 1
        ? { title: "열심히 가져오고 있어요", desc: "조금만 더 기다려 주세요" }
        : { title: "데이터 환경에 따라 조금 늦어질 수 있어요", desc: "최신 오더를 빠짐없이 받는 중이에요" };
  const canSkip = !!onSkip && (offline || phase >= 2);

  const activeIdx = completed.findIndex((c) => !c);
  const bar = (v) => ({ transform: `scaleX(${v / 100})`, transformOrigin: "0 50%", transition: `transform ${STEP_MS}ms ease-out`, willChange: "transform" });
  const truckW = 30 * Z.truck;
  return (
    <div
      className="fixed inset-0 z-[100001] flex flex-col items-center justify-center px-6 select-none"
      style={{
        background: "radial-gradient(120% 80% at 50% 0%, #2A3F6B 0%, #1B2B4B 45%, #0F1A30 100%)",
        zIndex,
        opacity: leaving ? 0 : 1,
        transition: "opacity 0.2s ease",
      }}
    >
      <style>{`
        @keyframes kpBootFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-1.5px) } }
        @keyframes kpBootDash { from { transform: translateX(0) } to { transform: translateX(-12px) } }
        @keyframes kpBootFade { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
        @keyframes kpBootRing { 0% { transform: scale(1); opacity: 0.7 } 100% { transform: scale(1.7); opacity: 0 } }
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
          <div className="absolute left-0 right-0 bottom-1.5 h-[2px] overflow-hidden opacity-30">
            <div
              className="absolute left-0 top-0 h-[2px]"
              style={{ width: "calc(100% + 12px)", backgroundImage: "linear-gradient(90deg, #fff 50%, transparent 50%)", backgroundSize: "12px 2px", animation: "kpBootDash 0.6s linear infinite", willChange: "transform" }}
            />
          </div>
          <div className="absolute left-0 right-0 bottom-1.5 h-[2px] rounded-full bg-gradient-to-r from-blue-400 to-sky-300" style={bar(overall)} />
          {/* 트럭 — 길 폭(트럭 폭 제외)만큼의 상자를 진행률만큼 옮긴다 */}
          <div className="absolute left-0 bottom-1.5" style={{ width: `calc(100% - ${truckW}px)`, transform: `translateX(${overall}%)`, transition: `transform ${STEP_MS}ms ease-out`, willChange: "transform" }}>
            <svg width={truckW} height={22 * Z.truck} viewBox="0 0 30 22" style={{ display: "block", animation: "kpBootFloat 0.5s ease-in-out infinite" }}>
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
          <span className={`${Z.pct} font-black text-white tabular-nums leading-none shrink-0`}><span ref={pctRef}>0</span><span className={`${Z.pctUnit} text-blue-200/70 ml-0.5`}>%</span></span>
        </div>

        {/* 단계별 진행 (배경 흐림 효과는 저사양 폰에서 매 프레임 다시 칠해져 끊김 원인이라 쓰지 않는다) */}
        <div className={`flex flex-col ${Z.card} rounded-2xl bg-white/[0.07] ring-1 ring-white/10`}>
          {steps.map((label, i) => {
            const v = Math.round(shown[i]);
            const done = completed[i];
            const active = i === activeIdx;
            return (
              <div key={label} className="flex items-center gap-3" style={{ opacity: done || active ? 1 : 0.38, transition: "opacity 0.2s" }}>
                <div className={`${Z.dot} relative shrink-0 rounded-full flex items-center justify-center font-black ${done ? "bg-blue-400 text-[#0F1A30]" : active ? "bg-white/10 text-white ring-2 ring-blue-400" : "bg-white/10 text-white/50"}`}>
                  {active && <span className="absolute inset-0 rounded-full ring-2 ring-blue-400" style={{ animation: "kpBootRing 1.2s ease-out infinite", willChange: "transform, opacity" }} />}
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
                    <div className="h-full w-full rounded-full bg-gradient-to-r from-blue-400 to-sky-300" style={bar(v)} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 안내 문구 — 처음부터 표시(자리를 미리 잡아 두어 문구가 바뀌어도 화면이 들썩이지 않게) */}
        <div className={`mt-4 flex flex-col items-center text-center ${variant === "pc" ? "min-h-[88px]" : "min-h-[84px]"}`}>
          <div key={notice.title} className="flex flex-col items-center gap-1" style={{ animation: "kpBootFade 0.4s ease" }}>
            <div className={`flex items-center gap-1.5 ${Z.label} font-bold text-sky-200`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              {notice.title}
            </div>
            <div className={`${Z.sub} font-semibold text-blue-100/55`}>{notice.desc}</div>
            {canSkip && (
              <button
                type="button"
                onClick={onSkip}
                className={`mt-2 px-4 py-1.5 rounded-full bg-white/10 ring-1 ring-white/20 text-white ${Z.sub} font-bold active:bg-white/20`}
              >
                저장된 오더로 먼저 열기
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
