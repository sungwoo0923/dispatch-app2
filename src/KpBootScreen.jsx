// ======================= src/KpBootScreen.jsx =======================
// ⭐ KP-Flow 첫 진입 로딩 화면(모바일·PC 공용) — 네이비 화면 위로 트럭이 전체 진행률만큼 길을 달리고,
// 4단계가 차례대로 0 → 100% 채워진다. 전부 100%가 되면 부드럽게 사라지며 최신 상태로 열린다.
// targets: 단계별 목표 %(0~100) 4개 / subs: 단계 옆에 보일 보조 문구 / variant: "mobile" | "pc"
import React, { useState, useEffect, useRef } from "react";
import KpTruck3D from "./KpTruck3D";

export const BOOT_STEPS = ["저장된 오더 불러오기", "서버 확인", "최신 오더 반영", "화면 준비"];
// ⭐ 2026-11-01 팀별 로딩 문구 — 배차팀 외(경리·인사·임원)는 그 팀 업무에 맞는 말로
export const BOOT_TEXT = {
  dispatch: { steps: BOOT_STEPS, first: "이 기기에 오더를 처음 저장하는 중이에요 · 다음부터는 빨라져요", slow: "최신 오더를 빠짐없이 받는 중이에요" },
  acct: { steps: ["정산 · 매출 자료 불러오기", "서버 확인", "입금 · 지급 최신 반영", "경리 화면 준비"], first: "이 기기에 정산 자료를 처음 저장하는 중이에요 · 다음부터는 빨라져요", slow: "매출 · 지급 자료를 빠짐없이 받는 중이에요" },
  hr: { steps: ["직원 정보 불러오기", "서버 확인", "근태 · 인사 최신 반영", "인사 화면 준비"], first: "이 기기에 인사 자료를 처음 저장하는 중이에요 · 다음부터는 빨라져요", slow: "직원 · 근태 정보를 빠짐없이 받는 중이에요" },
  exec: { steps: ["경영 자료 불러오기", "서버 확인", "실적 최신 반영", "경영 브리핑 준비"], first: "이 기기에 경영 자료를 처음 저장하는 중이에요 · 다음부터는 빨라져요", slow: "실적 자료를 빠짐없이 받는 중이에요" },
};

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

export default function KpBootScreen({ targets, subs = [], onAllDone, variant = "mobile", steps: stepsProp, zIndex, onSkip, team = "dispatch" }) {
  const TXT = BOOT_TEXT[team] || BOOT_TEXT.dispatch;
  const steps = stepsProp || TXT.steps;
  const Z = SIZE[variant] || SIZE.mobile;
  // ⭐ 끊김 방지 — 예전엔 막대·숫자를 매 프레임(초당 60번) 자바스크립트로 다시 그렸고, 배경 흐림(blur)·점선 이동·
  // 테두리 깜빡임이 매 프레임 화면 전체를 다시 칠하게 만들었다. 데이터를 받느라 바쁜 저사양 폰(특히 LTE)에서
  // 그대로 끊겼다. 이제 막대·트럭은 "목표만 정해주고" 이동은 그래픽 칩(transform 전환효과)이 하게 해서,
  // 자바스크립트가 바빠도 부드럽게 움직인다.
  const STEP_MS = 160; // 한 단계가 차오르는 시간(속도 개선: 280 → 160)
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
  // 이 기기에서 처음 여는지(저장된 오더가 없어 처음부터 받아야 함) — 다 열리면 기록
  const [firstVisit] = useState(() => { try { return !localStorage.getItem("kpBootedOnce"); } catch { return false; } });
  useEffect(() => () => { try { localStorage.setItem("kpBootedOnce", "1"); } catch { /* 무시 */ } }, []);
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
        : firstVisit
          ? { title: "처음 접속하면 로딩이 조금 걸릴 수 있어요", desc: TXT.first }
          : { title: "데이터 환경에 따라 늦어질 수 있어요", desc: TXT.slow };
  const canSkip = !!onSkip && (offline || phase >= 2);

  const activeIdx = completed.findIndex((c) => !c);
  const bar = (v) => ({ transform: `scaleX(${v / 100})`, transformOrigin: "0 50%", transition: `transform ${STEP_MS}ms ease-out`, willChange: "transform" });
  const truckW = 30 * Z.truck * 3.2;
  const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
  const pc = variant === "pc";
  return (
    <div
      className="fixed inset-0 z-[100001] flex flex-col items-center justify-center px-6 select-none overflow-hidden"
      style={{
        background: "radial-gradient(90% 60% at 50% 0%, #22396A 0%, #0F1A30 55%, #060D1C 100%)",
        zIndex,
        opacity: leaving ? 0 : 1,
        transition: "opacity 0.2s ease",
      }}
    >
      <style>{`
        @keyframes kpBootDash { from { transform: translateX(0) } to { transform: translateX(-24px) } }
        @keyframes kpBootFade { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
        @keyframes kpBootRing { 0% { transform: scale(1); opacity: 0.7 } 100% { transform: scale(1.7); opacity: 0 } }
        @keyframes kpBootBlink { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
      `}</style>
      {/* 원근 격자 바닥(정지 — 끊김 방지로 움직이지 않음) */}
      <div className="absolute inset-x-0 bottom-0 h-[45%] pointer-events-none overflow-hidden" style={{ perspective: "520px" }} aria-hidden="true">
        <div className="absolute inset-x-[-50%] top-0 h-[200%]" style={{
          backgroundImage: "linear-gradient(rgba(143,176,240,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(143,176,240,0.14) 1px, transparent 1px)",
          backgroundSize: "56px 56px", transform: "rotateX(62deg)", transformOrigin: "50% 0",
          maskImage: "linear-gradient(180deg, transparent 0%, #000 40%)", WebkitMaskImage: "linear-gradient(180deg, transparent 0%, #000 40%)",
        }} />
      </div>

      <div className={`relative w-full ${Z.box} flex flex-col min-w-0`}>
        {/* 로고 */}
        <div className={`flex items-center justify-center gap-2.5 ${pc ? "mb-10" : "mb-7"}`}>
          <img src="/icons/sflow-icon.png" alt="KP-Flow" className={`${pc ? "w-12 h-12 rounded-[14px]" : "w-10 h-10 rounded-[12px]"} ring-1 ring-white/20 shadow-[0_8px_24px_rgba(0,0,0,0.35)]`} />
          <div className="leading-tight text-left">
            <div className={`text-white font-black tracking-[0.2em] whitespace-nowrap ${pc ? "text-[20px]" : "text-[16px]"}`} style={{ fontFamily: MONO }}>KP-FLOW</div>
            <div className={`font-bold tracking-[0.26em] text-white/40 whitespace-nowrap ${pc ? "text-[11px]" : "text-[9.5px]"}`}>배차관리 시스템</div>
          </div>
        </div>

        {/* 큰 숫자 % */}
        <div className="flex items-end justify-between gap-3 whitespace-nowrap">
          <div className="min-w-0">
            <div className={`flex items-center gap-1.5 font-extrabold tracking-[0.24em] text-[#8FB0F0] ${pc ? "text-[11.5px]" : "text-[10px]"}`} style={{ fontFamily: MONO }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#8FB0F0]" style={{ animation: "kpBootBlink 1.2s ease-in-out infinite" }} />
              {activeIdx === -1 ? "READY" : "SYNCING"}
            </div>
            <div className={`mt-1 ${Z.status} font-bold text-white/70 truncate`}>{activeIdx === -1 ? "준비 완료" : `${steps[activeIdx]} 중…`}</div>
          </div>
          <div className="font-black text-white tabular-nums leading-none shrink-0" style={{ fontFamily: MONO, fontSize: pc ? 64 : 48, letterSpacing: "-0.04em" }}>
            <span ref={pctRef}>0</span><span className="text-white/35" style={{ fontSize: pc ? 26 : 20, marginLeft: 2 }}>%</span>
          </div>
        </div>

        {/* 도로 — 진행만큼 빛나는 길 위를 3D 트럭이 달린다 */}
        <div className={`relative ${pc ? "h-[104px] mt-3" : "h-[86px] mt-2"} mb-6`}>
          <div className="absolute left-0 right-0 bottom-[18px] h-[3px] rounded-full bg-white/[0.08] overflow-hidden">
            <div className="absolute left-0 top-0 h-full" style={{ width: "calc(100% + 24px)", backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0.35) 50%, transparent 50%)", backgroundSize: "24px 3px", animation: "kpBootDash 0.5s linear infinite", willChange: "transform" }} />
          </div>
          <div className="absolute left-0 right-0 bottom-[18px] h-[3px] rounded-full" style={{ ...bar(overall), background: "linear-gradient(90deg, #4B6CB7, #CFE0FF)", boxShadow: "0 0 12px rgba(143,176,240,0.8)" }} />
          {/* 눈금 */}
          <div className="absolute left-0 right-0 bottom-0 flex justify-between text-[9px] font-bold text-white/25 tabular-nums" style={{ fontFamily: MONO }}>
            {["0", "25", "50", "75", "100"].map((t) => <span key={t}>{t}</span>)}
          </div>
          <div className="absolute left-0 bottom-[16px]" style={{ width: `calc(100% - ${truckW}px)`, transform: `translateX(${overall}%)`, transition: `transform ${STEP_MS}ms ease-out`, willChange: "transform" }}>
            <KpTruck3D width={truckW} />
          </div>
        </div>

        {/* 단계별 진행 */}
        <div className={`flex flex-col ${Z.card} rounded-[20px] bg-white/[0.05] ring-1 ring-white/10`}>
          {steps.map((label, i) => {
            const v = Math.round(shown[i]);
            const done = completed[i];
            const active = i === activeIdx;
            return (
              <div key={label} className="flex items-center gap-3" style={{ opacity: done || active ? 1 : 0.35, transition: "opacity 0.2s" }}>
                <div className={`${Z.dot} relative shrink-0 rounded-[8px] flex items-center justify-center font-black tabular-nums ${done ? "bg-[#CFE0FF] text-[#0F1A30]" : active ? "bg-white/10 text-white ring-1 ring-[#8FB0F0]" : "bg-white/[0.06] text-white/50"}`} style={{ fontFamily: MONO }}>
                  {active && <span className="absolute inset-0 rounded-[8px] ring-1 ring-[#8FB0F0]" style={{ animation: "kpBootRing 1.2s ease-out infinite", willChange: "transform, opacity" }} />}
                  {done ? (
                    <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2.5 6.3l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  ) : String(i + 1).padStart(2, "0")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline gap-2 whitespace-nowrap">
                    <span className={`${Z.label} font-bold truncate min-w-0 ${done ? "text-white" : "text-white/85"}`}>{label}</span>
                    <span className={`${Z.sub} font-bold tabular-nums text-[#CFE0FF]/80 shrink-0`} style={{ fontFamily: MONO }}>{subs[i] && (done || active) ? subs[i] : `${String(v).padStart(3, " ")}%`}</span>
                  </div>
                  <div className={`mt-1.5 ${Z.bar} rounded-full bg-white/[0.08] overflow-hidden relative`}>
                    <div className="h-full w-full rounded-full" style={{ ...bar(v), background: "linear-gradient(90deg, #4B6CB7, #CFE0FF)" }} />
                    {/* 디지털 눈금 틈 */}
                    <div className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 7px, rgba(6,13,28,0.9) 7px 9px)" }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 안내 문구 — 처음부터 표시(자리를 미리 잡아 두어 문구가 바뀌어도 화면이 들썩이지 않게) */}
        <div className={`mt-4 flex flex-col items-center text-center ${pc ? "min-h-[88px]" : "min-h-[84px]"}`}>
          {/* ⚠️ 첫 문구는 효과 없이 바로 보이게 — 앱이 막 켜져 바쁜 순간엔 "서서히 나타나기" 효과가 멈춰 있어
              문구가 투명한 채로 있다가 로딩이 다 끝나서야 보였다. 문구가 바뀔 때만 효과를 준다. */}
          <div key={notice.title} className="flex flex-col items-center gap-1 max-w-full" style={offline || phase > 0 ? { animation: "kpBootFade 0.4s ease" } : undefined}>
            <div className={`flex items-center gap-1.5 ${Z.label} font-bold text-white/85 whitespace-nowrap max-w-full`}>
              <svg className="shrink-0 text-[#8FB0F0]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              <span className="truncate">{notice.title}</span>
            </div>
            <div className={`${Z.sub} font-semibold text-white/45`}>{notice.desc}</div>
            {canSkip && (
              <button type="button" onClick={onSkip}
                className={`mt-2 px-4 py-1.5 rounded-full bg-white text-[#0F1A30] ${Z.sub} font-black active:opacity-80`}>
                저장된 오더로 먼저 열기
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
