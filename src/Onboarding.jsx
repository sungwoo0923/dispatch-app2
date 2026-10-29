// ======================= src/Onboarding.jsx =======================
// 🚀 신규 운송사 첫 진입 — ① 튜토리얼(건너뛰기 가능) → ② 초기 설정 마법사(페이지 넘김)
//  - 언제 뜨나: 플랫폼에서 신규 운송사를 승인하면 companySettings/{회사}.onboarding.pending = true 가 기록되고,
//    그 회사 관리자가 처음 들어올 때 자동으로 뜬다. 끝내면 done = true → 다시 안 뜬다.
//  - "나중에 하기"는 이번 접속에서만 닫는다(다음 로그인 때 다시 안내)
//  - 다시 열기: 관리자 메뉴 › 환경 설정 › 초기 설정 / window 이벤트 "kp:tutorialOpen", "kp:setupWizardOpen"
//  - 여기서 정하는 값은 모두 회사별로 저장되는 "바꿀 수 있는" 항목뿐이다(드롭다운 목록, 결제일, 복사 문구, 매출목표)
import React from "react";
import { db, doc, onSnapshot, setDoc, DEFAULT_COMPANY } from "./firebase";
import { serverTimestamp } from "firebase/firestore";
import { DEFAULT_DROPDOWN_OPTIONS } from "./companyDropdownOptions";
import { CopyTemplateEditor } from "./CopyTemplateEditor";

const MONO = "'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace";
const companyKey = (userCompany) => {
  try { return (localStorage.getItem("loginCompany") || userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY).trim(); } catch { return userCompany || DEFAULT_COMPANY; }
};
const SNOOZE = "kpOnboardingSnooze";

// ─── 튜토리얼 슬라이드 ───
const TOUR = [
  { code: "01 · WELCOME", title: "KP-Flow에 오신 것을 환영합니다", desc: "배차 등록부터 기사 전달, 서류 회수, 정산·매출까지 한 화면에서 끝내는 운송사 전용 배차 프로그램입니다.\n2분이면 주요 흐름을 둘러볼 수 있어요.", points: ["오더 등록 → 배차 → 기사 전달 → 서류 업로드 → 정산", "모든 데이터는 회사별로 분리 저장", "PC · 모바일 어디서나 같은 데이터"] },
  { code: "02 · DISPATCH", title: "배차관리 · 실시간 배차현황", desc: "상단 메뉴의 배차관리에서 오더를 등록하고, 실시간 배차현황에서 오늘 오더를 한눈에 관리합니다.", points: ["Tab 키만으로 빠르게 입력 (드롭다운·날짜 자동 열림)", "차량번호 입력 시 기사 자동 매칭", "상태(배차중/배차완료) 즉시 변경"] },
  { code: "03 · COPY", title: "기사복사 · 업로드 링크", desc: "오더를 선택하고 기사복사를 누르면 카톡용 문구가 복사됩니다. 기사 전달용에는 서류 업로드 링크가 붙어, 기사가 사진만 찍어 올리면 끝.", points: ["전체 상세 / 기사 전달용 문구는 회사별로 수정 가능", "업로드 링크 포함 여부도 선택", "업로드되면 오더에 자동으로 첨부"] },
  { code: "04 · SETTLEMENT", title: "정산 · 매출 · 지급관리", desc: "청구·지급 운임과 수수료가 자동 계산되고, 매출 대시보드에서 목표 대비 실적을 확인합니다.", points: ["거래처별 청구 · 기사별 지급 관리", "결제일 규칙에 따라 지급 예정일 자동 계산", "연간 매출목표 대비 진행률"] },
  { code: "05 · ADMIN", title: "관리자 메뉴 · 직원 관리", desc: "직원 가입 승인, 권한, 접속 이력, 화주사 연동을 관리자 메뉴에서 처리합니다.", points: ["직원별 권한(마스터·경리·운송) 설정", "화주사 연동 시 화주가 직접 오더 등록", "이 안내는 관리자 메뉴 › 환경 설정에서 다시 볼 수 있어요"] },
];

function Overlay({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-[100060] bg-[#0B1428]/70 backdrop-blur-[3px] flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      {children}
    </div>
  );
}

function Dots({ n, i }) {
  return <div className="flex items-center gap-1.5">{Array.from({ length: n }, (_, k) => <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? "w-6 bg-[#8FB0F0]" : k < i ? "w-1.5 bg-[#8FB0F0]/60" : "w-1.5 bg-white/20"}`} />)}</div>;
}

function Tutorial({ onSkip, onDone }) {
  const [i, setI] = React.useState(0);
  const s = TOUR[i];
  const last = i === TOUR.length - 1;
  React.useEffect(() => {
    const k = (e) => { if (e.key === "ArrowRight") setI((x) => Math.min(TOUR.length - 1, x + 1)); if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1)); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);
  return (
    <div className="w-full max-w-[760px] rounded-[28px] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.5)] text-white" style={{ background: "linear-gradient(135deg,#0B1428 0%,#1B2B4B 55%,#2D4C82 100%)" }}>
      <div className="relative px-9 pt-8 pb-7">
        <span className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "26px 26px" }} />
        <div className="relative flex items-center justify-between">
          <span className="text-[11px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>TUTORIAL · {s.code}</span>
          <button type="button" onClick={onSkip} className="h-8 px-3 rounded-lg text-[12.5px] font-bold text-white/60 hover:text-white hover:bg-white/10">건너뛰기 ›</button>
        </div>
        <div className="relative mt-6 grid md:grid-cols-[1fr_220px] gap-7 items-center min-h-[250px]">
          <div>
            <div className="text-[28px] font-black leading-tight">{s.title}</div>
            <p className="mt-3 text-[14.5px] leading-relaxed text-white/70 whitespace-pre-line">{s.desc}</p>
            <ul className="mt-5 space-y-2">
              {s.points.map((p) => <li key={p} className="flex items-start gap-2.5 text-[13.5px] font-semibold text-white/90"><span className="mt-[7px] w-1.5 h-1.5 rotate-45 bg-[#8FB0F0] shrink-0" />{p}</li>)}
            </ul>
          </div>
          <div className="hidden md:flex items-center justify-center">
            <div className="relative w-[200px] h-[200px] rounded-[32px] border border-white/15 bg-white/[0.04] flex items-center justify-center">
              <span className="absolute inset-3 rounded-[24px] border border-dashed border-[#8FB0F0]/30" />
              <div className="text-center">
                <div className="text-[64px] font-black leading-none text-[#8FB0F0] tabular-nums" style={{ fontFamily: MONO }}>{String(i + 1).padStart(2, "0")}</div>
                <div className="mt-2 text-[10.5px] font-extrabold tracking-[0.28em] text-white/50" style={{ fontFamily: MONO }}>{s.code.split(" · ")[1]}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between px-9 py-5 bg-black/20 border-t border-white/10">
        <Dots n={TOUR.length} i={i} />
        <div className="flex items-center gap-2">
          {i > 0 && <button type="button" onClick={() => setI(i - 1)} className="h-11 px-5 rounded-xl border border-white/20 text-[13.5px] font-bold hover:bg-white/10">이전</button>}
          <button type="button" onClick={() => (last ? onDone() : setI(i + 1))} className="h-11 px-6 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black hover:bg-[#EEF2F8]">{last ? "초기 설정 시작 →" : "다음 →"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── 초기 설정 마법사 ───
function ChipList({ value, onChange, placeholder }) {
  const [draft, setDraft] = React.useState("");
  const add = () => { const v = draft.trim(); if (!v || value.includes(v)) { setDraft(""); return; } onChange([...value, v]); setDraft(""); };
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= value.length) return; const n = [...value]; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  return (
    <div className="rounded-2xl border border-[#DCE3EE] bg-white p-3">
      <div className="flex flex-wrap gap-1.5">
        {value.map((v, i) => (
          <span key={v} className="group inline-flex items-center gap-1 h-8 pl-3 pr-1 rounded-lg bg-[#F2F5FA] border border-[#E1E7F0] text-[13px] font-bold text-[#0F1A30]">
            {i === 0 && <span className="text-[9.5px] font-black text-[#4B6CB7] tracking-wider mr-0.5" style={{ fontFamily: MONO }}>기본</span>}{v}
            <button type="button" onClick={() => move(i, -1)} className="w-5 h-6 text-[10px] text-[#9AA9C3] hover:text-[#1B2B4B]" title="앞으로">◀</button>
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="w-6 h-6 rounded-md text-[#9AA9C3] hover:bg-white hover:text-[#0F1A30]" title="빼기">✕</button>
          </span>
        ))}
        {value.length === 0 && <span className="text-[12.5px] text-[#9AA9C3] py-1.5">비어 있으면 기본 목록을 씁니다.</span>}
      </div>
      <div className="flex gap-1.5 mt-2.5">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={placeholder}
          className="flex-1 h-10 px-3 rounded-xl border border-[#DCE3EE] text-[13.5px] font-semibold outline-none focus:border-[#2D4C82]" />
        <button type="button" onClick={add} className="h-10 px-4 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-black">추가</button>
      </div>
    </div>
  );
}

const DD_ROWS = {
  units: [["화물타입", "화물내용 단위", "화물내용 옆 단위 드롭다운 (예: 파레트, 박스, 롤, 마대)", "예: 롤"], ["톤수타입", "톤수 단위", "차량톤수 옆 단위 (예: 톤, kg)", "예: kg"]],
  methods: [["상하차방법", "상·하차 방법", "지게차·수작업 등", "예: 호이스트"], ["지급방식", "지급 방식", "계산서·착불·선불 등", "예: 카드"], ["배차방식", "배차 방식", "24시·인성·직접배차 등", "예: 화물맨"]],
};

function Wizard({ company, settings, onClose, onFinish }) {
  const [step, setStep] = React.useState(0);
  const [dd, setDd] = React.useState(() => Object.fromEntries(Object.keys(DEFAULT_DROPDOWN_OPTIONS).map((k) => [k, Array.isArray(settings?.dropdownOptions?.[k]) && settings.dropdownOptions[k].length ? settings.dropdownOptions[k] : DEFAULT_DROPDOWN_OPTIONS[k]])));
  const [payDays, setPayDays] = React.useState(String(settings?.결제일규칙?.payDays ?? 30));
  const [target, setTarget] = React.useState(settings?.매출목표?.순수매출목표 ? String(settings.매출목표.순수매출목표) : "");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  const STEPS = [
    { en: "UNITS", title: "화물 · 톤수 단위", desc: "오더 등록과 오더복사 수정 창의 단위 드롭다운에 들어갈 목록입니다. 첫 번째 항목이 기본 선택값이 됩니다." },
    { en: "OPTIONS", title: "상하차 · 지급 · 배차 방식", desc: "등록 화면 곳곳의 선택 목록을 우리 회사 방식대로 맞춥니다." },
    { en: "PAYMENT", title: "기사 결제일", desc: "계산서 발행 후 며칠 뒤에 기사 운임을 지급하나요? 기사 업로드 링크의 \"결제일 정보\"와 지급관리 예정일 계산에 쓰입니다." },
    { en: "COPY", title: "기사복사 문구", desc: "카톡으로 보내는 전체 상세 · 기사 전달용 문구와 업로드 링크 포함 여부입니다. 이 단계에서 바로 저장됩니다." },
    { en: "TARGET", title: "연간 매출목표 (선택)", desc: "매출 대시보드에서 목표 대비 진행률을 보여줍니다. 나중에 정해도 됩니다." },
  ];
  const last = step === STEPS.length - 1;
  const s = STEPS[step];

  const finish = async () => {
    setErr("");
    const n = Math.round(Number(payDays));
    if (!Number.isFinite(n) || n < 0 || n > 365) { setStep(2); setErr("결제일은 0~365 사이 숫자로 입력해 주세요."); return; }
    setBusy(true);
    try {
      const patch = {
        dropdownOptions: Object.fromEntries(Object.entries(dd).map(([k, v]) => [k, v.length ? v : DEFAULT_DROPDOWN_OPTIONS[k]])),
        결제일규칙: { payDays: n },
        onboarding: { pending: false, done: true, doneAt: serverTimestamp() },
      };
      const t = Number(String(target).replace(/[^\d]/g, ""));
      if (t > 0) patch.매출목표 = { 순수매출목표: t, 제외거래처매출성장률: settings?.매출목표?.제외거래처매출성장률 ?? 3 };
      await setDoc(doc(db, "companySettings", company), patch, { merge: true });
      onFinish();
    } catch (e) { setErr(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };

  return (
    <div className="w-full max-w-[1080px] max-h-[94vh] flex flex-col rounded-[28px] overflow-hidden bg-[#F4F6FA] shadow-[0_40px_100px_rgba(0,0,0,0.5)]">
      <div className="relative px-8 pt-6 pb-5 text-white shrink-0" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
        <span className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "24px 24px" }} />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>SETUP WIZARD · {company}</div>
            <div className="text-[21px] font-black mt-0.5">초기 설정</div>
          </div>
          <button type="button" onClick={onClose} className="h-9 px-3.5 rounded-xl bg-white/10 border border-white/20 text-[12.5px] font-bold hover:bg-white/20">나중에 하기</button>
        </div>
        {/* 단계 표시 */}
        <div className="relative mt-5 grid gap-2" style={{ gridTemplateColumns: `repeat(${STEPS.length},minmax(0,1fr))` }}>
          {STEPS.map((x, k) => (
            <button key={x.en} type="button" onClick={() => setStep(k)} className="text-left group">
              <div className={`h-1 rounded-full transition ${k <= step ? "bg-[#8FB0F0]" : "bg-white/15"}`} />
              <div className={`mt-1.5 text-[10px] font-extrabold tracking-[0.2em] ${k === step ? "text-[#8FB0F0]" : "text-white/40"}`} style={{ fontFamily: MONO }}>{String(k + 1).padStart(2, "0")} · {x.en}</div>
              <div className={`text-[12.5px] font-bold truncate ${k === step ? "text-white" : "text-white/50"}`}>{x.title}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="text-[20px] font-black text-[#0F1A30]">{s.title}</div>
        <p className="text-[13.5px] text-[#5B6B85] mt-1 mb-5">{s.desc}</p>

        {(step === 0 || step === 1) && (
          <div className="grid gap-4 md:grid-cols-2">
            {DD_ROWS[step === 0 ? "units" : "methods"].map(([k, label, hint, ph]) => (
              <div key={k}>
                <div className="flex items-baseline justify-between mb-1.5"><span className="text-[14px] font-black text-[#1B2B4B]">{label}</span><span className="text-[11.5px] text-[#8A97AD]">{hint}</span></div>
                <ChipList value={dd[k]} onChange={(v) => setDd((p) => ({ ...p, [k]: v }))} placeholder={ph} />
                <button type="button" onClick={() => setDd((p) => ({ ...p, [k]: DEFAULT_DROPDOWN_OPTIONS[k] }))} className="mt-1 text-[11.5px] font-bold text-[#7A89A3] hover:text-[#1B2B4B]">기본 목록으로</button>
              </div>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="max-w-[520px]">
            <div className="rounded-2xl border border-[#DCE3EE] bg-white p-6 flex items-center gap-4">
              <span className="text-[15px] font-black text-[#1B2B4B] shrink-0">계산서 발행 후</span>
              <input value={payDays} onChange={(e) => setPayDays(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric"
                className="w-[110px] h-14 px-3 rounded-xl border border-[#DCE3EE] text-center font-black text-[#0F1A30] outline-none focus:border-[#2D4C82] tabular-nums" style={{ fontFamily: MONO, fontSize: 28 }} />
              <span className="text-[15px] font-black text-[#1B2B4B]">일 뒤 지급</span>
            </div>
            <div className="flex gap-1.5 mt-3">
              {[7, 15, 30, 45, 60].map((d) => <button key={d} type="button" onClick={() => setPayDays(String(d))} className={`h-9 px-3.5 rounded-lg text-[12.5px] font-black border ${String(d) === payDays ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3A4A66] border-[#DCE3EE] hover:border-[#2D4C82]"}`}>{d}일</button>)}
            </div>
            <div className="text-[12px] text-[#8A97AD] mt-3">나중에 정산관리 › 지급관리에서 언제든 바꿀 수 있습니다.</div>
          </div>
        )}

        {step === 3 && <CopyTemplateEditor canEdit />}

        {step === 4 && (
          <div className="max-w-[560px]">
            <div className="rounded-2xl border border-[#DCE3EE] bg-white p-6">
              <div className="text-[12px] font-bold text-[#7A879C]">연간 순수 매출목표</div>
              <div className="flex items-baseline gap-2 mt-1">
                <input value={target ? Number(target).toLocaleString() : ""} onChange={(e) => setTarget(e.target.value.replace(/[^\d]/g, ""))} placeholder="0" inputMode="numeric"
                  className="flex-1 h-14 px-3 rounded-xl border border-[#DCE3EE] text-right font-black text-[#0F1A30] outline-none focus:border-[#2D4C82] tabular-nums" style={{ fontFamily: MONO, fontSize: 26 }} />
                <span className="text-[16px] font-black text-[#1B2B4B]">원</span>
              </div>
              <div className="flex gap-1.5 mt-3">
                {[5, 10, 30, 50, 100].map((e) => <button key={e} type="button" onClick={() => setTarget(String(e * 100000000))} className="h-9 px-3 rounded-lg text-[12.5px] font-black border bg-white text-[#3A4A66] border-[#DCE3EE] hover:border-[#2D4C82]">{e}억</button>)}
              </div>
            </div>
            <div className="mt-4 rounded-2xl p-5 text-white" style={{ background: "linear-gradient(135deg,#0F1A30,#1B2B4B 60%,#2D4C82)" }}>
              <div className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>READY</div>
              <div className="text-[16px] font-black mt-1">설정 완료를 누르면 바로 적용됩니다</div>
              <div className="text-[12.5px] text-white/60 mt-1">모든 값은 각 메뉴에서 언제든 다시 바꿀 수 있고, 이 마법사는 관리자 메뉴 › 환경 설정 › 초기 설정에서 다시 열 수 있습니다.</div>
            </div>
          </div>
        )}
        {err && <div className="mt-4 rounded-xl border border-[#DCE3EE] bg-white px-4 py-2.5 text-[13px] font-bold text-[#1B2B4B]">⚠ {err}</div>}
      </div>

      <div className="shrink-0 flex items-center justify-between px-8 py-4 bg-white border-t border-[#E3E8F0]">
        <span className="text-[12px] font-bold text-[#8A97AD] tabular-nums" style={{ fontFamily: MONO }}>STEP {step + 1} / {STEPS.length}</span>
        <div className="flex gap-2">
          {step > 0 && <button type="button" onClick={() => setStep(step - 1)} className="h-11 px-5 rounded-xl border border-[#DCE3EE] text-[13.5px] font-black text-[#3A4A66] hover:bg-[#F5F7FB]">이전</button>}
          {last
            ? <button type="button" onClick={finish} disabled={busy} className="h-11 px-6 rounded-xl text-white text-[14px] font-black disabled:opacity-50 shadow-[0_10px_24px_rgba(15,26,48,0.3)]" style={{ background: "linear-gradient(135deg,#0F1A30,#2D4C82)" }}>{busy ? "저장 중…" : "설정 완료"}</button>
            : <button type="button" onClick={() => setStep(step + 1)} className="h-11 px-6 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black">다음 →</button>}
        </div>
      </div>
    </div>
  );
}

function DoneCard({ onClose }) {
  return (
    <div className="w-full max-w-[460px] rounded-[28px] overflow-hidden text-white text-center px-8 py-10 shadow-[0_40px_100px_rgba(0,0,0,0.5)]" style={{ background: "linear-gradient(135deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
      <div className="mx-auto w-16 h-16 rounded-2xl border border-[#8FB0F0]/40 bg-white/5 flex items-center justify-center text-[28px] text-[#8FB0F0]">✓</div>
      <div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0] mt-5" style={{ fontFamily: MONO }}>ALL SET</div>
      <div className="text-[22px] font-black mt-1">설정이 완료되었습니다</div>
      <div className="text-[13.5px] text-white/60 mt-2">이제 배차관리에서 첫 오더를 등록해 보세요.</div>
      <button type="button" onClick={onClose} className="mt-6 h-11 px-7 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black">시작하기</button>
    </div>
  );
}

export default function OnboardingHost({ role, userCompany }) {
  const company = companyKey(userCompany);
  const isAdmin = role === "admin" || role === "totalMaster";
  const [settings, setSettings] = React.useState(null);
  const [view, setView] = React.useState(null); // "tour" | "wizard" | "done" | null
  const autoShown = React.useRef(false);

  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(doc(db, "companySettings", company), (s) => setSettings(s.exists() ? s.data() : {}), () => setSettings({}));
  }, [company]);

  // 신규 승인된 회사의 관리자 → 첫 진입 때 자동으로 튜토리얼
  React.useEffect(() => {
    if (!settings || autoShown.current || !isAdmin || role === "totalMaster") return;
    const ob = settings.onboarding;
    let snoozed = false; try { snoozed = sessionStorage.getItem(SNOOZE) === company; } catch { /* 무시 */ }
    if (ob?.pending && !ob?.done && !snoozed) { autoShown.current = true; setView("tour"); }
  }, [settings, isAdmin, role, company]);

  React.useEffect(() => {
    const t = () => setView("tour"); const w = () => setView("wizard");
    window.addEventListener("kp:tutorialOpen", t); window.addEventListener("kp:setupWizardOpen", w);
    return () => { window.removeEventListener("kp:tutorialOpen", t); window.removeEventListener("kp:setupWizardOpen", w); };
  }, []);

  if (!view) return null;
  const snooze = () => { try { sessionStorage.setItem(SNOOZE, company); } catch { /* 무시 */ } setView(null); };
  return (
    <Overlay>
      {view === "tour" && <Tutorial onSkip={() => (isAdmin ? setView("wizard") : setView(null))} onDone={() => (isAdmin ? setView("wizard") : setView(null))} />}
      {view === "wizard" && <Wizard company={company} settings={settings || {}} onClose={snooze} onFinish={() => setView("done")} />}
      {view === "done" && <DoneCard onClose={() => setView(null)} />}
    </Overlay>
  );
}

export const openTutorial = () => window.dispatchEvent(new CustomEvent("kp:tutorialOpen"));
export const openSetupWizard = () => window.dispatchEvent(new CustomEvent("kp:setupWizardOpen"));
