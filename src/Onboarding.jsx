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
import { RadiusEditor, officeRadii } from "./attendanceQuick";
import { HrSettingsPanel } from "./HrHub";

const MONO = "'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace";
const companyKey = (userCompany) => {
  try { return (localStorage.getItem("loginCompany") || userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY).trim(); } catch { return userCompany || DEFAULT_COMPANY; }
};
const SNOOZE = "kpOnboardingSnooze";

// ─── 튜토리얼 슬라이드 ───
// ⭐ 2026-11-01 팀별 튜토리얼 — 공통(환영·전자결재·회사관리·출퇴근) + 팀 업무(배차 / 경리 / 인사 / 임원)
const SLIDE_WELCOME = { en: "WELCOME", title: "KP-Flow에 오신 것을 환영합니다", desc: "운송사의 배차 · 경리 · 인사 업무를 한 프로그램에서 처리합니다.\n팀마다 필요한 메뉴만 보이도록 화면이 맞춰져 있어요.", points: ["PC · 모바일 어디서나 같은 데이터", "모든 데이터는 회사별로 분리 저장", "메뉴에 마우스를 올리면 세부 메뉴가 펼쳐집니다"] };
const SLIDE_COMMON = { en: "COMMON", title: "모든 팀이 같이 쓰는 기능", desc: "홈 화면의 시계 옆 [출근하기] 버튼과 전자결재 · 회사관리는 모든 팀이 함께 씁니다.", points: ["출근·퇴근 버튼 — 잘못 누른 퇴근은 [되돌리기]", "전자결재 — 휴가·지출결의·품의·보고", "회사관리 — 회사정보 · 조직도 · 내정보 · 출근기록부", "이 안내는 관리자메뉴 › 환경 설정에서 다시 볼 수 있어요"] };
const TEAM_SLIDES = {
  dispatch: [
    { en: "DISPATCH", title: "배차관리 · 실시간 배차현황", desc: "상단 메뉴의 배차관리에서 오더를 등록하고, 실시간 배차현황에서 오늘 오더를 한눈에 관리합니다.", points: ["Tab 키만으로 빠르게 입력 (드롭다운·날짜 자동 열림)", "차량번호 입력 시 기사 자동 매칭", "상태(배차중/배차완료) 즉시 변경"] },
    { en: "COPY", title: "기사복사 · 업로드 링크", desc: "오더를 선택하고 기사복사를 누르면 카톡용 문구가 복사됩니다. 기사 전달용에는 서류 업로드 링크가 붙어, 기사님이 사진만 찍어 올리면 끝.", points: ["전체 상세 / 기사 전달용 문구는 회사별로 수정 가능", "업로드되면 오더에 자동으로 첨부", "고정노선은 정해진 요일에 오더가 자동 생성"] },
    { en: "SETTLEMENT", title: "정산 · 매출", desc: "청구·지급 운임과 수수료가 자동 계산되고, 매출 대시보드에서 목표 대비 실적을 확인합니다.", points: ["거래처별 청구 · 기사별 지급 관리", "결제일 규칙에 따라 지급 예정일 자동 계산", "연간 매출목표 대비 진행률"] },
  ],
  acct: [
    { en: "SETTLEMENT", title: "정산관리 — 청구와 지급", desc: "거래명세서 발송 · 미수금 관리 · 용차 기사운임 지급을 처리합니다.", points: ["거래처별 거래명세서 · 이메일 발송", "미수금 / 입금 확인", "용차지급관리 — 지급완료를 누르면 장부에 자동 기록"] },
    { en: "ACCOUNTING", title: "회계관리 · 자금관리", desc: "장부 · 부가세 · 원가와 통장 · 카드 잔액, 고정비를 관리합니다.", points: ["지출결의 최종 승인 → 장부 자동 기록", "고정비는 납부일이 지나면 자동 반영", "통장별 자동 연동(기사운임 · 입금 · 지출)"] },
    { en: "ASSETS", title: "비품관리 · 퇴직 정산 · 요금제", desc: "회사 비품과 퇴직금·연차수당 정산, 요금제 변경 요청은 경리팀이 맡습니다.", points: ["비품 구입가는 장부에 자동 기록", "퇴직 정산 — 퇴직금 · 미사용 연차수당 계산", "사업자등록증 · 직인 · 정산계좌 등록(회사관리)"] },
  ],
  hr: [
    { en: "HR · RECORDS", title: "인사관리부 — 인사관리", desc: "이력서 · 근태/근속 · 인사발령을 한 곳에서 관리합니다.", points: ["인사관리 › 이력서 / 근태·근속 / 인사발령 / 발령 이력", "직원 등록(계정 없는 직원도 기록)", "직책 · 부서 설정은 회사별로 추가 · 숨김"] },
    { en: "STAFF", title: "직원 정보 · 퇴사 · 입사일", desc: "직원의 부서 · 직책 · 권한 · 재직 상태와 입사일은 인사팀만 바꿀 수 있습니다.", points: ["휴직 · 육아휴직 · 출산휴가 기간 관리", "퇴사 · 권고사직 처리(합의서 인쇄)", "입사일 = 연차 · 퇴직금 계산 기준"] },
    { en: "ATTENDANCE", title: "출근기록부 · 연차 · 증명서", desc: "출근 · 지각 · 휴가 현황과 연차 사용을 확인하고, 재직·경력 증명서를 발급합니다.", points: ["출근지 · 자동 출근 반경은 회사별로 설정", "연차 조정 이력 · 촉진 대상 확인", "가입 승인은 관리자메뉴 › 회원 관리"] },
  ],
  exec: [
    { en: "BRIEFING", title: "경영 브리핑", desc: "매출 · 수익 · 자금 현황을 한 화면에서 봅니다.", points: ["오늘 · 이번 달 · 올해 실적", "자금현황 — 통장 · 카드 잔액", "인사이트 — 거래처 · 노선 분석"] },
    { en: "SCHEDULE", title: "스케줄 · 결재", desc: "임원 일정과 전자결재를 처리합니다.", points: ["임원 스케줄 등록", "결재함 — 내 결재 차례", "직원 일정(연차 · 외근)은 홈 › 사내 게시판"] },
  ],
};
const ADMIN_SLIDE = { en: "ADMIN", title: "관리자 메뉴 · 회원 관리", desc: "직원 가입 승인과 화주사 연동, 접속 이력은 관리자 메뉴에서 처리합니다.", points: ["가입 신청은 상단 [관리자메뉴] 숫자로 알려드려요", "승인할 때 부서 · 직책 · 권한 지정", "화주사 연동 시 화주가 직접 오더 등록"] };
export function tourFor(team, isAdmin) {
  const mid = TEAM_SLIDES[team] || TEAM_SLIDES.dispatch;
  const list = [SLIDE_WELCOME, ...mid, ...(isAdmin ? [ADMIN_SLIDE] : []), SLIDE_COMMON];
  return list.map((x, k) => ({ ...x, code: `${String(k + 1).padStart(2, "0")} · ${x.en}` }));
}

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

function Tutorial({ slides, onSkip, onDone, doneLabel = "초기 설정 시작 →" }) {
  const TOUR = slides;
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
          <button type="button" onClick={() => (last ? onDone() : setI(i + 1))} className="h-11 px-6 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black hover:bg-[#EEF2F8]">{last ? doneLabel : "다음 →"}</button>
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

function Wizard({ company, settings, onClose, onFinish, team = "dispatch" }) {
  const [step, setStep] = React.useState(0);
  const [dd, setDd] = React.useState(() => Object.fromEntries(Object.keys(DEFAULT_DROPDOWN_OPTIONS).map((k) => [k, Array.isArray(settings?.dropdownOptions?.[k]) && settings.dropdownOptions[k].length ? settings.dropdownOptions[k] : DEFAULT_DROPDOWN_OPTIONS[k]])));
  const [payDays, setPayDays] = React.useState(String(settings?.결제일규칙?.payDays ?? 30));
  const [target, setTarget] = React.useState(settings?.매출목표?.순수매출목표 ? String(settings.매출목표.순수매출목표) : "");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  // ⭐ 2026-11-01 팀별 초기 설정 — 배차팀: 단위·방식·결제일·복사문구·매출목표 / 경리팀: 지급방식·결제일·매출목표 / 인사팀: 출근 반경·직책·부서
  const ALL = {
    units: { en: "UNITS", title: "화물 · 톤수 단위", desc: "오더 등록과 오더복사 수정 창의 단위 드롭다운에 들어갈 목록입니다. 첫 번째 항목이 기본 선택값이 됩니다." },
    methods: { en: "OPTIONS", title: "상하차 · 지급 · 배차 방식", desc: "등록 화면 곳곳의 선택 목록을 우리 회사 방식대로 맞춥니다." },
    payopt: { en: "PAY TYPES", title: "지급 방식", desc: "오더·정산에서 쓰는 지급 방식(계산서·착불·선불 등) 목록을 우리 회사 방식대로 맞춥니다." },
    payment: { en: "PAYMENT", title: "기사 결제일", desc: "계산서 발행 후 며칠 뒤에 기사 운임을 지급하나요? 기사 업로드 링크의 \"결제일 정보\"와 지급관리 예정일 계산에 쓰입니다." },
    copy: { en: "COPY", title: "기사복사 문구", desc: "카톡으로 보내는 전체 상세 · 기사 전달용 문구와 업로드 링크 포함 여부입니다. 이 단계에서 바로 저장됩니다." },
    target: { en: "TARGET", title: "연간 매출목표 (선택)", desc: "매출 대시보드에서 목표 대비 진행률을 보여줍니다. 나중에 정해도 됩니다." },
    attend: { en: "ATTENDANCE", title: "자동 출근 반경", desc: "직원이 출근지에서 이 거리 안으로 들어오면 모바일에서 자동으로 출근 처리됩니다. 출근지 위치는 회사관리 › 출근기록부 › 출근지 설정에서 정합니다." },
    org: { en: "ORGANIZATION", title: "직책 · 부서", desc: "우리 회사에서 쓰는 부서와 직책을 추가하거나 숨깁니다. 이 단계에서 바로 저장됩니다." },
  };
  const ORDER = team === "acct" ? ["payopt", "payment", "target"] : team === "hr" ? ["attend", "org"] : ["units", "methods", "payment", "copy", "target"];
  const STEPS = ORDER.map((k) => ({ key: k, ...ALL[k] }));
  const [radius, setRadius] = React.useState(() => officeRadii(settings?.officeLocation));
  const last = step === STEPS.length - 1;
  const s = STEPS[step];
  const sk = s.key;

  const finish = async () => {
    setErr("");
    const n = Math.round(Number(payDays));
    if (ORDER.includes("payment") && (!Number.isFinite(n) || n < 0 || n > 365)) { setStep(ORDER.indexOf("payment")); setErr("결제일은 0~365 사이 숫자로 입력해 주세요."); return; }
    setBusy(true);
    try {
      const patch = team === "hr"
        ? { onboarding: { hrDone: true, hrDoneAt: serverTimestamp() }, officeLocation: { radius: radius.inM, outRadius: radius.outM } }
        : team === "acct"
          ? { dropdownOptions: { 지급방식: dd.지급방식.length ? dd.지급방식 : DEFAULT_DROPDOWN_OPTIONS.지급방식 }, 결제일규칙: { payDays: n }, onboarding: { acctDone: true, acctDoneAt: serverTimestamp() } }
          : {
            dropdownOptions: Object.fromEntries(Object.entries(dd).map(([k, v]) => [k, v.length ? v : DEFAULT_DROPDOWN_OPTIONS[k]])),
            결제일규칙: { payDays: n },
            onboarding: { pending: false, done: true, doneAt: serverTimestamp() },
          };
      const t = Number(String(target).replace(/[^\d]/g, ""));
      if (team !== "hr" && t > 0) patch.매출목표 = { 순수매출목표: t, 제외거래처매출성장률: settings?.매출목표?.제외거래처매출성장률 ?? 3 };
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

        {(sk === "units" || sk === "methods" || sk === "payopt") && (
          <div className="grid gap-4 md:grid-cols-2">
            {(sk === "payopt" ? DD_ROWS.methods.filter(([k]) => k === "지급방식") : DD_ROWS[sk]).map(([k, label, hint, ph]) => (
              <div key={k}>
                <div className="flex items-baseline justify-between mb-1.5"><span className="text-[14px] font-black text-[#1B2B4B]">{label}</span><span className="text-[11.5px] text-[#8A97AD]">{hint}</span></div>
                <ChipList value={dd[k]} onChange={(v) => setDd((p) => ({ ...p, [k]: v }))} placeholder={ph} />
                <button type="button" onClick={() => setDd((p) => ({ ...p, [k]: DEFAULT_DROPDOWN_OPTIONS[k] }))} className="mt-1 text-[11.5px] font-bold text-[#7A89A3] hover:text-[#1B2B4B]">기본 목록으로</button>
              </div>
            ))}
          </div>
        )}

        {sk === "attend" && (
          <div className="max-w-[640px]">
            <RadiusEditor value={radius} onChange={setRadius} />
            <div className="text-[12px] text-[#8A97AD] mt-3">휴대폰 앱이 켜져 있을 때 자동 출근 · 퇴근됩니다. 안 될 때는 홈 화면의 [출근하기] 버튼을 누르면 됩니다.</div>
          </div>
        )}

        {sk === "org" && <HrSettingsPanel company={company} canManage />}

        {sk === "payment" && (
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

        {sk === "copy" && <CopyTemplateEditor canEdit />}

        {sk === "target" && (
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

function DoneCard({ onClose, msg = "" }) {
  return (
    <div className="w-full max-w-[460px] rounded-[28px] overflow-hidden text-white text-center px-8 py-10 shadow-[0_40px_100px_rgba(0,0,0,0.5)]" style={{ background: "linear-gradient(135deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
      <div className="mx-auto w-16 h-16 rounded-2xl border border-[#8FB0F0]/40 bg-white/5 flex items-center justify-center text-[28px] text-[#8FB0F0]">✓</div>
      <div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0] mt-5" style={{ fontFamily: MONO }}>ALL SET</div>
      <div className="text-[22px] font-black mt-1">설정이 완료되었습니다</div>
      <div className="text-[13.5px] text-white/60 mt-2">{msg || "이제 배차관리에서 첫 오더를 등록해 보세요."}</div>
      <button type="button" onClick={onClose} className="mt-6 h-11 px-7 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black">시작하기</button>
    </div>
  );
}

// ⭐ 2026-11-01 사람별 · 팀별 —
//  · 튜토리얼: 새로 가입한 직원이 PC에서 처음 들어올 때 한 번(users/{uid}.tutorialDone). 모바일로 먼저 썼어도 PC 첫 실행 때 뜬다.
//    내용은 공통(환영·출퇴근·전자결재·회사관리) + 내 팀 업무(배차 / 경리 / 인사 / 임원).
//  · 초기 설정: 회사가 새로 승인됐을 때 팀 책임자에게 그 팀 것만 — 배차(운송관리자) / 경리(test·hrAcct) / 인사(hrManager·hrAcct). 모두 회사별 저장.
const NEW_USER_DAYS = 30;
export default function OnboardingHost({ role, realRole, userCompany, dept = null, uid = "", myDoc = null }) {
  const company = companyKey(userCompany);
  const rr = realRole || role;
  const isTM = rr === "totalMaster";
  const team = dept === "acct" ? "acct" : dept === "hr" ? "hr" : dept === "exec" ? "exec" : "dispatch";
  const isDispatchAdmin = rr === "admin" || isTM;
  const wizardTeam = team === "dispatch" ? (isDispatchAdmin ? "dispatch" : null)
    : team === "acct" ? (["test", "hrAcct"].includes(rr) || isTM ? "acct" : null)
      : team === "hr" ? (["hrManager", "hrAcct"].includes(rr) || isTM ? "hr" : null) : null;
  const isAdminUser = isDispatchAdmin || myDoc?.isMaster === true;
  const [settings, setSettings] = React.useState(null);
  const [view, setView] = React.useState(null); // "tour" | "wizard" | "done" | null
  const autoShown = React.useRef(false);

  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(doc(db, "companySettings", company), (s) => setSettings(s.exists() ? s.data() : {}), () => setSettings({}));
  }, [company]);

  const ob = settings?.onboarding || null;
  // 이 팀의 초기 설정이 아직인지(새로 승인된 회사만 — onboarding 기록이 있는 회사)
  const obMs = ob?.doneAt?.toMillis ? ob.doneAt.toMillis() : (ob?.doneAt?.seconds ? ob.doneAt.seconds * 1000 : 0);
  const newCompany = !!ob && (ob.pending || (obMs && Date.now() - obMs < 60 * 86400e3)); // 예전부터 쓰던 회사에는 경리·인사 설정을 갑자기 띄우지 않는다
  const wizardPending = !!ob && !!wizardTeam && (wizardTeam === "dispatch" ? (ob.pending && !ob.done) : newCompany && (wizardTeam === "acct" ? !ob.acctDone : !ob.hrDone));

  React.useEffect(() => {
    if (!settings || autoShown.current || isTM || !myDoc) return;
    let snoozed = false; try { snoozed = sessionStorage.getItem(SNOOZE) === `${company}|${uid}`; } catch { /* 무시 */ }
    if (snoozed) return;
    const created = myDoc.createdAt?.toMillis ? myDoc.createdAt.toMillis() : (myDoc.createdAt?.seconds ? myDoc.createdAt.seconds * 1000 : 0);
    const isNew = created && Date.now() - created < NEW_USER_DAYS * 86400e3;
    const needTour = !myDoc.tutorialDone && (isNew || wizardPending);
    if (needTour) { autoShown.current = true; setView("tour"); return; }
    if (wizardPending) { autoShown.current = true; setView("wizard"); }
  }, [settings, isTM, company, uid, myDoc, wizardPending]);

  React.useEffect(() => {
    const t = () => setView("tour"); const w = () => setView(wizardTeam ? "wizard" : "tour");
    window.addEventListener("kp:tutorialOpen", t); window.addEventListener("kp:setupWizardOpen", w);
    return () => { window.removeEventListener("kp:tutorialOpen", t); window.removeEventListener("kp:setupWizardOpen", w); };
  }, [wizardTeam]);

  if (!view) return null;
  const markTour = () => { if (uid && !myDoc?.tutorialDone) setDoc(doc(db, "users", uid), { tutorialDone: true, tutorialDoneAt: serverTimestamp() }, { merge: true }).catch(() => {}); };
  const snooze = () => { try { sessionStorage.setItem(SNOOZE, `${company}|${uid}`); } catch { /* 무시 */ } setView(null); };
  const afterTour = () => { markTour(); setView(wizardPending ? "wizard" : null); };
  const doneMsg = wizardTeam === "acct" ? "이제 정산관리 · 회계관리에서 업무를 시작해 보세요." : wizardTeam === "hr" ? "이제 인사관리부에서 직원 정보를 확인해 보세요." : "";
  return (
    <Overlay>
      {view === "tour" && <Tutorial slides={tourFor(team, isAdminUser && team === "dispatch")} onSkip={afterTour} onDone={afterTour} doneLabel={wizardTeam && wizardPending ? "초기 설정 시작 →" : "시작하기 →"} />}
      {view === "wizard" && <Wizard team={wizardTeam || "dispatch"} company={company} settings={settings || {}} onClose={snooze} onFinish={() => setView("done")} />}
      {view === "done" && <DoneCard msg={doneMsg} onClose={() => setView(null)} />}
    </Overlay>
  );
}

export const openTutorial = () => window.dispatchEvent(new CustomEvent("kp:tutorialOpen"));
export const openSetupWizard = () => window.dispatchEvent(new CustomEvent("kp:setupWizardOpen"));
