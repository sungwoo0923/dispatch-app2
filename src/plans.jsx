// ======================= src/plans.jsx =======================
// 💳 요금제(라이트·베이직·스탠다드·프로)별 사용 범위 — 한 곳에서 정하고 모든 화면이 같이 쓴다.
//  - 기능표(FEATURE_ROWS): 요금 안내(인쇄), 구독·결제 화면, 잠금 안내 창, 견적서가 모두 이 표를 그린다.
//  - 회사별 요금제: companyPlans/{회사} { planId } — 관리자 관리센터 › 청구 › 수납 관리에서 지정(최고관리자만 쓰기)
//  - ⭐ 요금제를 지정하지 않은 회사(기존 고객사)는 모든 기능이 열린다 → 지정하기 전까지 아무 변화 없음
//  - 공개 요금(이름·가격·포함량·입금 계좌): publicPricing/current — 요금제 관리에서 저장할 때 같이 갱신
import React from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export const PLAN_IDS = ["lite", "basic", "standard", "pro"];
export const PLAN_DEFAULTS = [
  { id: "lite", name: "라이트", en: "LITE", price: 49000, seats: 2, orders: 500, target: "1인 주선 · 개인 운송" },
  { id: "basic", name: "베이직", en: "BASIC", price: 99000, seats: 5, orders: 1500, target: "소규모 운송사 · 2~5인" },
  { id: "standard", name: "스탠다드", en: "STANDARD", price: 150000, seats: 10, orders: 3000, target: "일반 운송사 · 6~10인", recommended: true },
  { id: "pro", name: "프로", en: "PRO", price: 349000, seats: 25, orders: 8000, target: "중견 운송사 · 10인 이상" },
];

// 기능표 — min: 이 요금제부터 사용 가능
export const FEATURE_ROWS = [
  { key: "dispatch", label: "배차관리 · 실시간배차현황 · 배차현황", min: "lite" },
  { key: "master", label: "거래처 · 하차지 · 기사 관리", min: "lite" },
  { key: "fare", label: "단가표 · 전국 운임조회", min: "lite" },
  { key: "driverApp", label: "기사앱 · 업로드링크 · 기사복사", min: "lite" },
  { key: "settlement", label: "매출관리 · 정산관리 · 지급관리", min: "lite" },
  { key: "shipperPortal", label: "화주사 전용 포털 연동", min: "basic" },
  { key: "groupware", label: "전자결재 · 사내메일 · 게시판 · 인수인계", min: "basic" },
  { key: "hr", label: "인사 · 근태 · 회사관리", min: "basic" },
  { key: "fleet", label: "지입차관리 (GPS · 운행기록 · 사진)", min: "standard" },
  { key: "export", label: "데이터 추출 · 맞춤 리포트", min: "standard" },
  { key: "insight", label: "수익성 인사이트 (거래처·노선 마진 · 저마진 경고 · 이상 운임 감지)", min: "pro", star: true },
  { key: "shipperReport", label: "화주 월간 운송 리포트 (화주에게 보내는 원클릭 PDF)", min: "pro", star: true },
  { key: "call24", label: "화물정보망(24시콜) 오더 자동 전송", min: "pro", star: true },
  { key: "support", label: "우선 기술지원 · 분기별 운영 점검 미팅", min: "pro" },
];
export const FEATURE_BY_KEY = Object.fromEntries(FEATURE_ROWS.map((f) => [f.key, f]));

// 상단 메뉴 → 기능 (여기 없는 메뉴는 모든 요금제에서 사용)
export const MENU_FEATURE = { 지입차관리: "fleet", 회사관리: "hr", 인사이트: "insight", 전자결재: "groupware", 결재함: "groupware" };
// 홈 왼쪽 사이드바 항목 → 기능
export const homeItemFeature = (key) => (/^(ap:|mail|board:)/.test(String(key)) || key === "인수인계" ? "groupware" : null);

const rank = (id) => PLAN_IDS.indexOf(id);
export const planIncludes = (planId, featureKey) => {
  if (!planId) return true; // 요금제 미지정(기존 고객) → 전부 사용
  const f = FEATURE_BY_KEY[featureKey];
  if (!f) return true;
  return rank(planId) >= rank(f.min);
};
// 플랜별 "새로 추가되는 기능" 목록(견적서·요금 안내의 카드 설명용)
export function planFeatureLines(planId) {
  const i = rank(planId);
  const own = FEATURE_ROWS.filter((f) => f.min === planId).map((f) => f.label.replace(/ \(.*\)$/, ""));
  return i <= 0 ? own : [`${PLAN_DEFAULTS[i - 1].name} 전체 기능`, ...own];
}

// ─── 회사 요금제 구독 ───
const PlanCtx = React.createContext({ planId: null, company: "" });
export function PlanProvider({ company, children }) {
  const [planId, setPlanId] = React.useState(null);
  React.useEffect(() => {
    if (previewPlan) { setPlanId(previewPlan); return undefined; }
    if (!company) return undefined;
    return onSnapshot(doc(db, "companyPlans", company), (s) => setPlanId(s.exists() ? s.data()?.planId || null : null), () => setPlanId(null));
  }, [company]);
  const v = React.useMemo(() => ({ planId, company }), [planId, company]);
  return <PlanCtx.Provider value={v}>{children}</PlanCtx.Provider>;
}
export const usePlan = () => React.useContext(PlanCtx);
export const useFeature = (key) => planIncludes(usePlan().planId, key);
// 잠긴 기능을 눌렀을 때: openPlanLock("fleet")
export const openPlanLock = (feature) => window.dispatchEvent(new CustomEvent("kp:planLock", { detail: { feature } }));

// 공개 요금(가격 등) — 없으면 기본값
export function usePublicPricing() {
  const [p, setP] = React.useState({ plans: PLAN_DEFAULTS, bank: "", supplier: "KP-Flow" });
  React.useEffect(() => onSnapshot(doc(db, "publicPricing", "current"), (s) => {
    if (!s.exists()) return;
    const d = s.data();
    setP({ ...d, plans: PLAN_IDS.map((id) => ({ ...PLAN_DEFAULTS.find((x) => x.id === id), ...(d.plans || []).find((x) => x.id === id) })) });
  }, () => {}), []);
  return p;
}

const MONO = "'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace";
const won = (n) => `${Math.round(Number(n) || 0).toLocaleString()}`;

// ─── 넷플릭스식 요금제 비교표 ───
export function PlanMatrix({ plans = PLAN_DEFAULTS, current = null, highlight = null, onPick, pickLabel = "이 요금제로 변경 요청", compact = false }) {
  const cols = plans.filter((p) => PLAN_IDS.includes(p.id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate table-fixed" style={{ borderSpacing: 0, minWidth: compact ? 760 : 900 }}>
        <thead>
          <tr>
            <th className="text-left align-bottom pb-3 pr-3" style={{ width: "34%" }}>
              <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>COMPARE PLANS</div>
              <div className="text-[17px] font-black text-[#0F1A30]">요금제별 사용 범위</div>
            </th>
            {cols.map((p) => {
              const on = p.id === current, hi = p.id === highlight || (!highlight && p.recommended);
              return (
                <th key={p.id} className="px-1.5 pb-3 align-bottom">
                  <div className={`rounded-2xl px-3 py-3 text-center border ${on ? "bg-[#0F1A30] text-white border-[#0F1A30] shadow-[0_12px_26px_rgba(15,26,48,0.3)]" : hi ? "bg-[#F2F5FA] border-[#2D4C82] text-[#0F1A30]" : "bg-white border-[#E3E8F0] text-[#0F1A30]"}`}>
                    <div className={`text-[10px] font-extrabold tracking-[0.24em] ${on ? "text-[#8FB0F0]" : "text-[#4B6CB7]"}`} style={{ fontFamily: MONO }}>{p.en}</div>
                    <div className="text-[16px] font-black mt-0.5 whitespace-nowrap">{p.name}</div>
                    <div className="text-[18px] font-black mt-1 tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{won(p.price)}<span className={`text-[10.5px] font-bold ml-0.5 ${on ? "text-white/60" : "text-[#7A89A3]"}`}>원/월</span></div>
                    <div className={`text-[11px] font-bold mt-0.5 whitespace-nowrap ${on ? "text-white/60" : "text-[#7A89A3]"}`}>{p.seats}명 · 월 {Number(p.orders || 0).toLocaleString()}건</div>
                    {(on || (hi && p.recommended)) && <div className={`mt-1.5 inline-block px-2 py-0.5 rounded-md text-[10.5px] font-black ${on ? "bg-white text-[#0F1A30]" : "bg-[#0F1A30] text-white"}`}>{on ? "사용 중" : "추천"}</div>}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {FEATURE_ROWS.map((f, i) => (
            <tr key={f.key} className={i % 2 ? "bg-[#F7F9FC]" : "bg-white"}>
              <td className="px-3 py-2.5 text-[13px] font-bold text-[#1B2B4B] border-t border-[#EEF1F6] rounded-l-lg">
                {f.star && <span className="mr-1.5 px-1.5 py-0.5 rounded-md bg-[#0F1A30] text-[#8FB0F0] text-[9.5px] font-black tracking-wider align-middle">PRO</span>}{f.label}
              </td>
              {cols.map((p) => {
                const ok = planIncludes(p.id, f.key);
                return (
                  <td key={p.id} className={`text-center py-2.5 border-t border-[#EEF1F6] ${p.id === current ? "bg-[#0F1A30]/[0.04]" : ""}`}>
                    {ok ? <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-[#0F1A30] text-white text-[13px] font-black">✓</span>
                      : <span className="text-[#C3CDDD] text-[16px] font-black">–</span>}
                  </td>
                );
              })}
            </tr>
          ))}
          {onPick && (
            <tr>
              <td />
              {cols.map((p) => (
                <td key={p.id} className="pt-3 px-1.5">
                  {p.id === current ? <div className="h-10 rounded-xl bg-[#EEF2F8] text-[#1B2B4B] text-[12.5px] font-black flex items-center justify-center">현재 요금제</div>
                    : <button type="button" onClick={() => onPick(p)} className="w-full h-10 rounded-xl bg-[#0F1A30] text-white text-[12.5px] font-black hover:bg-[#1B2B4B]">{pickLabel}</button>}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// 인쇄용(요금 안내 · 견적서) 비교표 HTML
export function planMatrixHtml(plans = PLAN_DEFAULTS, chosenId = null) {
  const cols = plans.filter((p) => PLAN_IDS.includes(p.id));
  const head = cols.map((p) => `<th class="pm-h ${p.id === chosenId ? "on" : p.recommended && !chosenId ? "rec" : ""}"><div class="pm-en">${p.en}${p.recommended ? " · 추천" : ""}</div><div class="pm-n">${p.name}</div><div class="pm-p">${won(p.price)}<span>원/월</span></div><div class="pm-s">${p.seats}명 · 월 ${Number(p.orders || 0).toLocaleString()}건</div></th>`).join("");
  const rows = FEATURE_ROWS.map((f, i) => `<tr class="${i % 2 ? "odd" : ""}"><td class="pm-f">${f.star ? '<span class="pm-pro">PRO</span>' : ""}${f.label}</td>${cols.map((p) => `<td class="pm-c ${p.id === chosenId ? "on" : ""}">${planIncludes(p.id, f.key) ? '<span class="pm-ok">✓</span>' : '<span class="pm-no">–</span>'}</td>`).join("")}</tr>`).join("");
  return `<table class="pm"><thead><tr><th class="pm-t">요금제별 사용 범위</th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}
export const PLAN_MATRIX_CSS = `
  .pm{width:100%;border-collapse:separate;border-spacing:0;margin:6px 0 4px;font-size:11.5px}
  .pm-t{text-align:left;font-size:12px;color:#0F1A30;vertical-align:bottom;padding:0 6px 8px 0;width:36%}
  .pm-h{padding:0 3px 8px;vertical-align:bottom}
  .pm-h>div{text-align:center}
  .pm-h .pm-en{font-family:monospace;font-size:8.5px;letter-spacing:.2em;color:#4B6CB7;font-weight:800}
  .pm-h .pm-n{font-size:13px;font-weight:900;color:#0F1A30;margin-top:2px}
  .pm-h .pm-p{font-size:14px;font-weight:900;color:#0F1A30;font-family:monospace}
  .pm-h .pm-p span{font-size:9px;color:#7A89A3;margin-left:1px}
  .pm-h .pm-s{font-size:9.5px;color:#7A89A3}
  .pm-h.on>div,.pm-h.rec>div{}
  .pm-h.on{background:#0F1A30;border-radius:10px 10px 0 0}
  .pm-h.on .pm-n,.pm-h.on .pm-p{color:#fff}.pm-h.on .pm-en{color:#8FB0F0}.pm-h.on .pm-s,.pm-h.on .pm-p span{color:rgba(255,255,255,.6)}
  .pm-h.rec{background:#EEF2F8;border-radius:10px 10px 0 0}
  .pm-f{padding:6px 6px;border-top:1px solid #E3E8F0;font-weight:700;color:#1B2B4B}
  .pm-c{text-align:center;border-top:1px solid #E3E8F0;padding:5px 0}
  .pm-c.on{background:#F2F5FA}
  .pm tr.odd td{background:#FAFBFD}.pm tr.odd td.on{background:#EEF2F8}
  .pm-ok{display:inline-block;width:17px;height:17px;line-height:17px;border-radius:50%;background:#0F1A30;color:#fff;font-weight:900;font-size:10px}
  .pm-no{color:#C3CDDD;font-weight:900}
  .pm-pro{display:inline-block;background:#0F1A30;color:#8FB0F0;font-size:8px;font-weight:900;padding:1px 4px;border-radius:4px;margin-right:4px;letter-spacing:.08em}
`;

// ─── 잠긴 기능을 눌렀을 때 뜨는 안내 창(앱 어디서든 openPlanLock 으로 연다) ───
export function PlanLockHost({ userEmail = "", userName = "" }) {
  const { planId, company } = usePlan();
  const pricing = usePublicPricing();
  const [feature, setFeature] = React.useState(null);
  const [sent, setSent] = React.useState("");
  React.useEffect(() => {
    const h = (e) => { setFeature(e.detail?.feature || null); setSent(""); };
    window.addEventListener("kp:planLock", h);
    return () => window.removeEventListener("kp:planLock", h);
  }, []);
  if (!feature) return null;
  const f = FEATURE_BY_KEY[feature];
  const need = PLAN_DEFAULTS.find((p) => p.id === f?.min);
  const request = async (p) => {
    try {
      await addDoc(collection(db, "planRequests"), { company, from: planId || "", to: p.id, toName: p.name, feature, by: userEmail, byName: userName, status: "요청", createdAt: serverTimestamp() });
      setSent(`${p.name} 요금제로 변경을 요청했습니다. 담당자가 곧 연락드립니다.`);
    } catch (e) { setSent(`요청 실패: ${e.message}`); }
  };
  return (
    <div className="fixed inset-0 z-[100070] bg-[#0B1428]/70 backdrop-blur-[3px] flex items-center justify-center p-4">
      <div className="w-full max-w-[1180px] max-h-[92vh] overflow-y-auto rounded-[26px] bg-[#F4F6FA] shadow-[0_40px_100px_rgba(0,0,0,0.5)]">
        <div className="relative px-7 py-6 text-white overflow-hidden" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <span className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>UPGRADE · {need?.en}</div>
              <div className="text-[22px] font-black mt-1">■ {need?.name} 요금제부터 쓸 수 있는 기능입니다</div>
              <div className="text-[13.5px] text-white/70 mt-1">{f?.label}</div>
            </div>
            <button type="button" onClick={() => setFeature(null)} className="h-9 px-3.5 rounded-xl bg-white/10 border border-white/20 text-[13px] font-bold hover:bg-white/20">닫기 ✕</button>
          </div>
        </div>
        <div className="p-6">
          <div className="bg-white rounded-[20px] border border-[#E3E8F0] p-5">
            <PlanMatrix plans={pricing.plans} current={planId} highlight={f?.min} onPick={request} />
          </div>
          {sent && <div className="mt-4 rounded-xl bg-[#0F1A30] text-white px-5 py-3 text-[13.5px] font-black">{sent}</div>}
          <div className="mt-3 text-[12px] text-[#7A89A3]">요금제 변경은 관리자 확인 후 바로 적용되며, 남은 기간 차액만 청구됩니다.</div>
        </div>
      </div>
    </div>
  );
}

// 잠금 표시 아이콘
export const LockIcon = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="inline-block align-[-1px]"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);

// DispatchApp처럼 Provider를 직접 그리는 컴포넌트용 — 구독은 직접 하고 값만 내려준다
// 👀 승인 전 둘러보기 — 가입 때 고른 요금제로 메뉴를 보여준다(서버 조회 없음)
let previewPlan = null;
export const setPreviewPlan = (p) => { previewPlan = p || null; };
export function useCompanyPlanId(company) {
  const [planId, setPlanId] = React.useState(previewPlan);
  React.useEffect(() => {
    if (previewPlan) { setPlanId(previewPlan); return undefined; }
    if (!company) return undefined;
    return onSnapshot(doc(db, "companyPlans", company), (s) => setPlanId(s.exists() ? s.data()?.planId || null : null), () => setPlanId(null));
  }, [company]);
  return planId;
}
export function PlanValueProvider({ planId, company, children }) {
  const v = React.useMemo(() => ({ planId, company }), [planId, company]);
  return <PlanCtx.Provider value={v}>{children}</PlanCtx.Provider>;
}
// 훅을 못 쓰는 자리(이벤트 핸들러 등)용 — PlanValueProvider가 현재 값을 기억해 둔다
let _currentPlanId = null;
export const featureOn = (key) => planIncludes(_currentPlanId, key);
export function PlanValueSync({ planId }) { _currentPlanId = planId || null; return null; }
