// ======================= src/OfficeBooks.jsx =======================
// 💼 경리 업무(2026-10-31) — 수입·지출 장부(현금출납) · 고정비 · 비품·자산 관리. PC·모바일 공용(반응형).
//  · 수입·지출: 날짜·구분·계정과목·결제수단·거래처·증빙(영수증 사진) → 월별 합계·계정별 비중·일자별 목록·CSV
//    전자결재 "비용·지출 결의" 승인분을 한 번에 장부로 가져오기, 매달 나가는 고정비(임대료·통신비 등) 한 번에 반영
//  · 비품·자산: 사무가구·IT기기·소모품 등 — 수량·위치·담당자·구입가·상태, 소모품은 최소 수량 아래면 "재고 부족", 입출고 이력
import React from "react";
import { runDelete } from "./DeleteProgress"; // ⭐ 2026-11-05 삭제 진행 창 + 한 번에 삭제
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, arrayUnion } from "firebase/firestore";
import { useCompanyRows } from "./companyColStore"; // ⭐ 2026-11-06 공용 구독
import useNarrow from "./useNarrow";
import { db, auth } from "./firebase";
import { compressImage } from "./InternalMail";
import CustomDatePicker from "./CustomDatePicker";
import { CustomSelect } from "./CustomSelect";
import { computeFunds, isCard, isCredit, last4, fundBadge } from "./fundsCalc";
import { upsertAutoEntry } from "./ledgerAuto";
import CashFlowChart from "./CashFlowChart"; // ⭐ 2026-11-17 일별 수입 · 지출 · 누계 그래프(SVG) — 예전 recharts 막대를 바꿈
import { kpConfirm } from "./kpDialog";
import { suggestAccount, evidenceOf, vatSplit } from "./acctSuggest"; // 🧾 2026-11-15 전표 자동화 — 계정과목 추천 · 증빙 · 부가세
import { profitStyle } from "./marginPct"; // ⭐ 2026-11-17 이익 금액 색(플러스 빨강 · 마이너스 파랑)

export const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
export const HERO_BG = "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)";
// 이미지(데이터 URL) 파일로 저장
export function saveImage(dataUrl, name = "이미지") {
  if (!dataUrl) return;
  const a = document.createElement("a"); a.href = dataUrl; a.download = `${String(name).replace(/[\\/:*?"<>|]/g, "_")}.jpg`;
  document.body.appendChild(a); a.click(); a.remove();
}
const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const won = (n) => `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}`;
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const tsMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0);
const inp = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";

// ── 공용 디자인 조각 ──
export function BookHero({ en, title, desc, kpis = [], right }) {
  return (
    <div className="relative overflow-hidden rounded-[22px] px-4 py-4 md:px-7 md:py-5 text-white shadow-[0_14px_32px_rgba(15,26,48,0.25)]" style={{ background: HERO_BG }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[11px] md:text-[12px] font-extrabold tracking-[0.08em] text-[#8FB0F0] whitespace-nowrap" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{en}</div>
          <div className="text-[20px] md:text-[24px] font-black mt-0.5">{title}</div>
          <div className="text-[12.5px] md:text-[14px] text-white/60 mt-0.5">{desc}</div>
        </div>
        {right}
      </div>
      {kpis.length > 0 && (
        <div className={`mt-3 grid grid-cols-2 ${kpis.length >= 4 ? "md:grid-cols-4" : "md:grid-cols-3"} gap-2`}>
          {kpis.map(([l, v, sub, profit]) => (
            <div key={l} className="rounded-2xl bg-white/[0.07] border border-white/10 px-3 md:px-4 py-2.5 min-w-0">
              <div className="text-[11.5px] md:text-[12.5px] font-bold text-white/55 whitespace-nowrap truncate">{l}</div>
              {/* ⭐ 2026-11-17 4번째 값(이익 · 수지 차액)을 주면 플러스 빨강 · 마이너스 파랑 */}
              <div className="text-[18px] md:text-[21px] font-black tabular-nums whitespace-nowrap truncate" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", ...(profit != null ? profitStyle(profit, { dark: true }) : {}) }}>{v}</div>
              {sub && <div className="text-[11px] text-white/45 truncate">{sub}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export function BookCard({ en, title, right, children, flush = false }) {
  return (
    <div className="rounded-[20px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_24px_rgba(16,24,40,0.05)] overflow-hidden min-w-0">
      {(en || title) && (
        <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            {en && <div className="text-[9.5px] font-extrabold tracking-[0.08em] text-[#4B6CB7] whitespace-nowrap" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{en}</div>}
            <div className="text-[15px] font-black text-[#0F1A30] tracking-tight truncate">{title}</div>
          </div>
          {right}
        </div>
      )}
      <div className={flush ? "" : "px-4 pb-4"}>{children}</div>
    </div>
  );
}
export const Chip = ({ on, children, onClick }) => (
  <button type="button" onClick={onClick} className={`h-9 px-3.5 rounded-full text-[13px] font-black border whitespace-nowrap shrink-0 ${on ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#5B6B85] border-[#DCE3EE]"}`}>{children}</button>
);
const Label = ({ children }) => <div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5 break-keep">{children}</div>;
export function Sheet({ title, en, onClose, children, footer, side = false }) {
  // ⭐ 2026-10-31 side — 등록·수정 창을 화면 오른쪽 넓은 사이드 패널로(팝업보다 크게 잘 보이게)
  if (side) return (
    <div className="fixed inset-0 z-[100000] bg-[#0F1A30]/45 flex justify-end" onClick={onClose}>
      <div className="kp-side-panel h-full w-full md:w-[600px] xl:w-[680px] bg-[#F4F6FA] flex flex-col shadow-[-24px_0_60px_rgba(15,26,48,0.35)]" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 md:px-7 py-5 text-white flex items-center gap-3 shrink-0" style={{ background: HERO_BG, paddingTop: "max(env(safe-area-inset-top, 0px), 20px)" }}>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold tracking-[0.08em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{en}</div>
            <div className="text-[21px] md:text-[23px] font-black truncate">{title}</div>
          </div>
          <button type="button" onClick={onClose} className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 shrink-0 text-[15px]">✕</button>
        </div>
        <div className="kp-side-body flex-1 overflow-y-auto px-5 md:px-7 py-5 space-y-4">{children}</div>
        {footer && <div className="shrink-0 px-5 md:px-7 py-4 bg-white border-t border-[#E3E8F0] flex gap-2" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}>{footer}</div>}
      </div>
    </div>
  );
  return (
    <div className="fixed inset-0 z-[100000] bg-[#0F1A30]/50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
      <div className="w-full md:max-w-[640px] max-h-[92vh] bg-[#F4F6FA] rounded-t-[24px] md:rounded-[22px] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 text-white flex items-center gap-3 shrink-0" style={{ background: HERO_BG }}>
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-extrabold tracking-[0.08em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{en}</div>
            <div className="text-[17px] font-black truncate">{title}</div>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl bg-white/10 shrink-0">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">{children}</div>
        {footer && <div className="shrink-0 px-4 py-3 bg-white border-t border-[#E3E8F0] flex gap-2" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}>{footer}</div>}
      </div>
    </div>
  );
}
// ⭐ 2026-11-06 속도 — 회사 컬렉션은 공용 구독(companyColStore)으로: 자금 현황·장부·대시보드가 한 번만 받아 함께 쓴다
function useCompanyCol(name, company) {
  return useCompanyRows(name, company);
}
// ⭐ 2026-11-06 불러오는 동안 빈 글자 대신 화면 뼈대(스켈레톤)
export function BookSkeleton({ rows = 6 }) {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="불러오는 중">
      <div className="rounded-[22px] h-[150px]" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }} />
      <div className="rounded-[22px] bg-white border border-[#E3E8F0] p-4 space-y-3">
        {Array.from({ length: rows }, (_, i) => <div key={i} className="h-10 rounded-xl bg-[#EEF2F8]" style={{ width: `${92 - (i % 3) * 9}%` }} />)}
      </div>
      <div className="text-center text-[14px] font-bold text-[#5B6B85]">장부를 불러오는 중…</div>
    </div>
  );
}

// ═════════════════════════ 수입·지출 장부 ═════════════════════════
export const LEDGER_ACCOUNTS = {
  지출: ["복리후생비", "여비교통비", "차량유지비", "유류비", "운반비", "접대비", "소모품비", "비품구입", "통신비", "임차료", "수도광열비", "보험료", "세금과공과", "지급수수료", "광고선전비", "교육훈련비", "도서인쇄비", "수선비", "급여·상여", "기타"],
  수입: ["운송수입", "기타수입", "이자수입", "보조금", "환급", "잡이익"],
};
const METHODS = ["법인카드", "계좌이체", "현금", "개인카드(정산)", "자동이체"];
const blankEntry = (type = "지출") => ({ date: kstDay(), type, account: type === "지출" ? "소모품비" : "운송수입", item: "", amount: "", method: type === "지출" ? "법인카드" : "계좌이체", vendor: "", memo: "", evidence: "", receipt: "" });

// ⭐ 2026-11-17 오른쪽 분석 칸 — 계정과목별 지출(순위 · 금액 · 비중 % · 건수 · 지난달 대비)
const NUMF = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };
function SpendBreakdown({ accTop = [], accN = {}, prevAcc = {}, expense = 0 }) {
  const [all, setAll] = React.useState(false);
  const shown = all ? accTop : accTop.slice(0, 8);
  const top3 = accTop.slice(0, 3).reduce((a, [, v]) => a + v, 0);
  return (
    <BookCard en="BREAKDOWN" title="계정과목별 지출">
      {!accTop.length ? <div className="py-8 text-center text-[14px] text-[#9AA9C3] font-bold">이 달 지출 내역이 없어요</div> : (<>
        <div className="rounded-2xl bg-[#F7F9FC] border border-[#E9EEF5] px-3.5 py-3 flex items-end justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[12.5px] font-bold text-[#5B6B85]">이 달 지출 합계</div>
            <div className="text-[22px] font-black text-[#0F1A30] whitespace-nowrap" style={NUMF}>{won(expense)}<span className="text-[14px] text-[#7A879C] ml-0.5">원</span></div>
          </div>
          <div className="text-right text-[12.5px] font-bold text-[#5B6B85] leading-snug">계정 {accTop.length}개<br />상위 3개가 <b className="text-[#0F1A30]" style={NUMF}>{expense ? Math.round((top3 / expense) * 100) : 0}%</b></div>
        </div>
        <ol className="mt-2">
          {shown.map(([k, v], i) => {
            const pct = expense ? (v / expense) * 100 : 0;
            const prev = prevAcc[k] || 0; const d = prev ? (v - prev) / prev : null;
            return (
              <li key={k} className="py-2.5 border-b border-[#F1F4F9] last:border-b-0">
                <div className="flex items-center gap-2">
                  <span className={`w-6 h-6 shrink-0 rounded-lg grid place-items-center text-[12px] font-black ${i < 3 ? "bg-[#0F1A30] text-white" : "bg-[#EEF2F8] text-[#5B6B85]"}`} style={NUMF}>{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-black text-[#1B2B4B]">{k}<span className="ml-1.5 text-[12px] font-bold text-[#9AA9C3]">{accN[k] || 0}건</span></span>
                  <span className="text-[15px] font-black text-[#0F1A30] whitespace-nowrap" style={NUMF}>{won(v)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 pl-8">
                  <div className="flex-1 h-2.5 rounded-full bg-[#EEF2F8] overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${Math.max(1.5, pct)}%`, background: i < 3 ? "linear-gradient(90deg,#1B2B4B,#3F63B5)" : "#9FB3D9" }} /></div>
                  <span className="w-[44px] text-right text-[13px] font-black text-[#3A4A66]" style={NUMF}>{pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%</span>
                  <span className={`w-[58px] text-right text-[12px] font-bold whitespace-nowrap ${d == null ? "text-[#B5C0D3]" : d > 0.1 ? "text-[#E5484D]" : d < -0.1 ? "text-[#2D6BE0]" : "text-[#7A879C]"}`} style={NUMF} title={prev ? `지난달 ${won(prev)}원` : "지난달 없음"}>{d == null ? "새로" : `${d > 0 ? "▲" : d < 0 ? "▼" : ""}${Math.abs(Math.round(d * 100))}%`}</span>
                </div>
              </li>
            );
          })}
        </ol>
        {accTop.length > 8 && <button type="button" onClick={() => setAll((x) => !x)} className="mt-1 w-full h-9 rounded-xl bg-[#F7F9FC] text-[13px] font-black text-[#2D4C82]">{all ? "접기" : `나머지 ${accTop.length - 8}개 더 보기`}</button>}
        <div className="mt-2 text-[12px] font-bold text-[#9AA9C3]">% = 이 달 지출 중 비중 · ▲▼ = 지난달보다 늘었는지 줄었는지</div>
      </>)}
    </BookCard>
  );
}
// ⭐ 2026-11-17 오른쪽 분석 칸 — 고정비(매달 나가는 돈) · 이번 달 반영 여부 · 합계와 지출 중 비중
function RecurringPanel({ recurring = [], recurDone, expense = 0, isViewer, onManage }) {
  const act = recurring.filter((r) => r.active !== false);
  const total = act.filter((r) => (r.type || "지출") === "지출").reduce((a, r) => a + toInt(r.amount), 0);
  const done = act.filter((r) => recurDone.has(r.id)).length;
  const sorted = [...recurring].sort((a, b) => (Number(a.day) || 1) - (Number(b.day) || 1));
  return (
    <BookCard en="RECURRING" title="고정비" right={!isViewer && <button type="button" onClick={onManage} className="h-9 px-3.5 rounded-xl border border-[#DCE3EE] text-[13px] font-black text-[#1B2B4B] whitespace-nowrap">관리</button>}>
      {!recurring.length ? <div className="py-3 text-[14px] text-[#7A879C] font-bold leading-relaxed">임대료 · 통신비 · 보험료처럼 매달 나가는 돈을 등록해 두면 한 번에 장부에 넣을 수 있어요</div> : (<>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="rounded-2xl bg-[#F7F9FC] border border-[#E9EEF5] px-3 py-2.5"><div className="text-[12.5px] font-bold text-[#5B6B85]">매달 고정비</div><div className="text-[18px] font-black text-[#0F1A30] whitespace-nowrap" style={NUMF}>{won(total)}원</div><div className="text-[12px] font-bold text-[#9AA9C3]">이 달 지출의 <span style={NUMF}>{expense ? Math.round((total / expense) * 100) : 0}%</span></div></div>
          <div className="rounded-2xl bg-[#F7F9FC] border border-[#E9EEF5] px-3 py-2.5"><div className="text-[12.5px] font-bold text-[#5B6B85]">이번 달 반영</div><div className="text-[18px] font-black text-[#0F1A30]" style={NUMF}>{done} / {act.length}건</div><div className="mt-1.5 h-2 rounded-full bg-[#EEF2F8] overflow-hidden"><span className="block h-full rounded-full bg-[#2D4C82]" style={{ width: `${act.length ? (done / act.length) * 100 : 0}%` }} /></div></div>
        </div>
        <ul>
          {sorted.map((r) => {
            const ok = recurDone.has(r.id); const off = r.active === false;
            return (
              <li key={r.id} className={`flex items-center gap-2.5 py-2.5 border-b border-[#F1F4F9] last:border-b-0 ${off ? "opacity-50" : ""}`}>
                <span className="w-11 shrink-0 text-center rounded-lg bg-[#EEF2F8] py-1"><span className="block text-[10.5px] font-bold text-[#7A879C] leading-none">매달</span><span className="block text-[14px] font-black text-[#1B2B4B] leading-tight" style={NUMF}>{Number(r.day) || 1}일</span></span>
                <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-black text-[#0F1A30] truncate">{r.name}</span><span className="block text-[12px] font-bold text-[#9AA9C3] truncate">{r.account || "기타"}{r.method ? ` · ${r.method}` : ""}</span></span>
                <span className="text-right shrink-0"><span className="block text-[15px] font-black text-[#0F1A30] whitespace-nowrap" style={NUMF}>{won(r.amount)}</span><span className={`block text-[12px] font-black ${off ? "text-[#9AA9C3]" : ok ? "text-[#2D4C82]" : "text-[#B0603A]"}`}>{off ? "쉬는 중" : ok ? "✓ 반영됨" : "반영 전"}</span></span>
              </li>
            );
          })}
        </ul>
      </>)}
    </BookCard>
  );
}

export function CashBook({ company, isViewer = false }) {
  const narrow = useNarrow(); // ⭐ 2026-11-06 PC 표·휴대폰 카드 중 하나만 그린다(예전엔 둘 다 그리고 CSS로 숨김 — 영수증 사진도 두 번 그렸다)
  const rowsRaw = useCompanyCol("acctLedger", company);
  // 자동 연동 줄 중 금액이 0이 된 것(지급 취소 등)은 숨긴다
  const rows = React.useMemo(() => (rowsRaw ? rowsRaw.filter((r) => !(r.auto && !toInt(r.amount))) : rowsRaw), [rowsRaw]);
  const recurring = useCompanyCol("acctRecurring", company);
  const funds = useCompanyCol("acctFunds", company);
  const [customAcc, setCustomAcc] = React.useState(false);
  const [scanMsg, setScanMsg] = React.useState(""); // 🧾 영수증 읽기 상태
  const [photo, setPhoto] = React.useState(null); // 증빙 사진 보기·저장
  const [ym, setYm] = React.useState(kstDay().slice(0, 7));
  const [type, setType] = React.useState("전체");
  const [q, setQ] = React.useState("");
  const [edit, setEdit] = React.useState(null);
  const [recurOpen, setRecurOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [approvals, setApprovals] = React.useState([]);
  const fileRef = React.useRef(null);
  // ⭐ 2026-11-06 속도 — 전자결재 지출결의(가져오기 버튼용)는 장부가 먼저 보인 뒤에 받는다 · 조회전용은 받지 않음
  const ledgerReady = rows !== null;
  React.useEffect(() => {
    if (!company || isViewer || !ledgerReady) return undefined;
    return onSnapshot(query(collection(db, "approvals"), where("company", "==", company), where("cat", "==", "expense")), (s) => setApprovals(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.cat === "expense" && a.status === "approved")), () => setApprovals([]));
  }, [company, isViewer, ledgerReady]);
  const F = React.useMemo(() => computeFunds(funds || [], rows || []), [funds, rows]);
  const fundOpts = React.useMemo(() => F.list.filter((f) => f.kind !== "대출"), [F]);
  // 🧾 2026-11-15 계정과목 자동 추천 — 거래처 · 내용을 적으면 ① 예전에 같은 거래처에 고른 값 ② 낱말 규칙으로 골라 둔다.
  //  사람이 계정과목을 직접 누르면(accTouched) 더는 바꾸지 않고, 저장한 값이 다음 추천의 ①이 된다
  const sug = React.useMemo(() => (edit ? suggestAccount({ type: edit.type, vendor: edit.vendor, item: edit.item, memo: edit.memo }, rows || []) : null), [edit?.type, edit?.vendor, edit?.item, edit?.memo, rows]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!edit || edit.accTouched || !sug || edit.account === sug.account) return;
    setEdit((p) => (p && !p.accTouched ? { ...p, account: sug.account, accAuto: sug.from } : p));
    setCustomAcc(false);
  }, [sug?.account]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (!edit) setScanMsg(""); }, [!!edit]); // eslint-disable-line react-hooks/exhaustive-deps
  // 🧾 영수증 사진 → 날짜 · 금액 · 사용처 · 증빙 종류 · 품목 자동 채우기(빈 칸만 · 금액은 비었을 때만)
  const readReceipt = async (img) => {
    setScanMsg("영수증을 읽고 있어요…");
    try {
      const { scanReceipt } = await import("./vehicleExpense");
      const r = await scanReceipt(img, (m) => setScanMsg(`${m}…`));
      if (!r || !r.count) { setScanMsg("영수증 글자를 읽지 못했어요. 직접 적어 주세요."); return; }
      const ev = evidenceOf(r);
      setEdit((p) => p && ({ ...p,
        date: r.date || p.date,
        amount: toInt(p.amount) ? p.amount : String(r.amount || ""),
        vendor: p.vendor || r.vendor || "",
        item: p.item || (r.items || [])[0] || "",
        evidence: p.evidence || ev,
        method: ev === "카드전표" && !["법인카드", "개인카드(정산)"].includes(p.method) ? "법인카드" : p.method,
        scan: { vendor: r.vendor || "", amount: r.amount || 0, date: r.date || "", bizNo: r.bizNo || "", cardApproval: r.cardApproval || "" } }));
      setScanMsg(`영수증에서 ${[r.date && "날짜", r.amount && "금액", r.vendor && "사용처", ev && "증빙"].filter(Boolean).join(" · ")}을(를) 읽었어요. 맞는지 확인해 주세요.`);
    } catch { setScanMsg("영수증을 읽지 못했어요. 직접 적어 주세요."); }
  };
  // ⭐ 2026-11-06 속도 — 이 달 계산(합계·계정별·일별·누계)은 장부·달이 바뀔 때만(검색 글자를 칠 때마다 다시 계산하지 않음)
  const M = React.useMemo(() => {
    const month = (rows || []).filter((r) => String(r.date || "").startsWith(ym));
    let income = 0, expense = 0, noEvidence = 0, nIn = 0, nOut = 0;
    const byAcc = {}; const byDay = {}; const accN = {};
    for (const r of month) {
      const v = toInt(r.amount);
      const dd = byDay[r.date] || (byDay[r.date] = { in: 0, out: 0 });
      if (r.type === "수입") { income += v; nIn++; dd.in += v; }
      else if (r.type === "지출") { expense += v; nOut++; dd.out += v; byAcc[r.account || "기타"] = (byAcc[r.account || "기타"] || 0) + v; accN[r.account || "기타"] = (accN[r.account || "기타"] || 0) + 1; if (!r.receipt && !r.evidence) noEvidence++; }
    }
    // ⭐ 2026-11-17 계정과목별 지출 — 지난달 같은 계정 금액(늘었는지 줄었는지 보여 주기)
    const pd = new Date(`${ym}-01T00:00:00`); pd.setMonth(pd.getMonth() - 1);
    const prevYm = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, "0")}`;
    const prevAcc = {};
    for (const r of rows || []) if (r.type === "지출" && String(r.date || "").startsWith(prevYm)) prevAcc[r.account || "기타"] = (prevAcc[r.account || "기타"] || 0) + toInt(r.amount);
    const dim = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
    let cum = 0;
    const daily = Array.from({ length: dim }, (_, i) => { const x = byDay[`${ym}-${String(i + 1).padStart(2, "0")}`] || { in: 0, out: 0 }; cum += x.in - x.out; return { d: i + 1, in: x.in, out: x.out, cum }; });
    return { month, income, expense, noEvidence, nIn, nOut, accTop: Object.entries(byAcc).sort((a, b) => b[1] - a[1]), accN, prevAcc, daily };
  }, [rows, ym]);
  const { month, income, expense, noEvidence, accTop, accN, prevAcc, daily } = M;
  const kw = q.trim();
  const list = React.useMemo(() => month.filter((r) => (type === "전체" || r.type === type) && (!kw || [r.item, r.vendor, r.account, r.memo].some((v) => String(v || "").includes(kw))))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || tsMs(b.createdAt) - tsMs(a.createdAt)), [month, type, kw]);
  // 장부 — 날짜 오름차순 + 누계 잔액(이 달 수입 − 지출)
  const ledgerRows = React.useMemo(() => { let bal = 0; return [...list].sort((a, b) => String(a.date).localeCompare(String(b.date)) || tsMs(a.createdAt) - tsMs(b.createdAt)).map((r) => { bal += (r.type === "수입" ? 1 : -1) * toInt(r.amount); return { ...r, bal }; }); }, [list]);
  const imported = React.useMemo(() => new Set((rows || []).map((r) => r.sourceId).filter(Boolean)), [rows]);
  const toImport = approvals.filter((a) => !imported.has(a.id) && Number(a.amount) > 0);
  const recurDone = new Set(month.map((r) => r.recurId).filter(Boolean));
  const recurTodo = (recurring || []).filter((r) => r.active !== false && !recurDone.has(r.id));
  const shiftYm = (n) => { const d = new Date(`${ym}-01T00:00:00`); d.setMonth(d.getMonth() + n); setYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); };

  const save = async () => {
    const e = edit;
    if (!e.item.trim() && !e.vendor.trim()) return alert("내용 또는 거래처를 입력해 주세요.");
    if (!toInt(e.amount)) return alert("금액을 입력해 주세요.");
    setBusy(true);
    try {
      const vs = vatSplit(e.amount, !["세금계산서", "카드전표", "현금영수증"].includes(e.evidence));
      const data = { date: e.date, type: e.type, account: String(e.account || "").trim() || "기타", fundId: e.fundId || "", item: e.item.trim(), amount: toInt(e.amount), method: e.method, vendor: e.vendor.trim(), memo: e.memo.trim(), evidence: e.evidence, receipt: e.receipt || "", companyName: company,
        supply: vs.supply, vat: vs.vat, accountAuto: e.accTouched ? "" : (e.accAuto || ""), ...(e.scan ? { scan: e.scan } : {}) }; // 🧾 2026-11-15 공급가 · 부가세 · 자동 추천 여부
      if (e.id) await updateDoc(doc(db, "acctLedger", e.id), { ...data, updatedAt: serverTimestamp() });
      else await addDoc(collection(db, "acctLedger"), { ...data, createdAt: serverTimestamp(), createdBy: auth.currentUser?.email || "" });
      setEdit(null);
    } catch (err) { alert(`저장 실패: ${err.message}`); } finally { setBusy(false); }
  };
  const remove = async (e) => { if (!(await kpConfirm("이 내역을 삭제할까요?"))) return; await runDelete({ label: "내역", task: () => deleteDoc(doc(db, "acctLedger", e.id)) }); setEdit(null); }; // ⭐ 2026-11-05 삭제 진행 창
  const importApprovals = async () => {
    if (!toImport.length) return;
    if (!(await kpConfirm(`전자결재로 승인된 지출결의 ${toImport.length}건을 장부에 넣을까요?`))) return;
    setBusy(true);
    try {
      // ⭐ 2026-11-01 결제수단에 맞는 통장·카드가 하나뿐이면 자동 지정(자금 잔액에 바로 반영) — 여러 개면 장부에서 골라 주세요
      const pickFund = (pay) => {
        const p = String(pay || "");
        const c = /법인카드/.test(p) ? fundOpts.filter((f) => f.kind === "법인카드" || f.kind === "법인카드 한도") : /현금/.test(p) ? fundOpts.filter((f) => f.kind === "현금") : /계좌|이체/.test(p) ? fundOpts.filter((f) => f.kind === "보통예금") : [];
        return c.length === 1 ? c[0].id : "";
      };
      for (const a of toImport) {
        const d = a.data || {};
        await setDoc(doc(db, "acctLedger", `appr_${a.id}`), { fundId: pickFund(d.pay || d.method || "법인카드"), date: d.date || d.spendDate || new Date(tsMs(a.createdAt) + 9 * 3600e3).toISOString().slice(0, 10), type: "지출", account: d.account || "기타", item: a.title || a.formLabel || "지출결의", amount: Number(a.amount) || 0, method: d.pay || d.method || "법인카드", vendor: d.vendor || "", memo: `전자결재 ${a.docNo || ""} · ${a.drafter?.name || ""}`, evidence: "전자결재", receipt: (a.images || [])[0] || "", sourceId: a.id, companyName: company, createdAt: serverTimestamp(), createdBy: auth.currentUser?.email || "" }, { merge: true });
      }
    } finally { setBusy(false); }
  };
  // 고정비 한 달 치를 장부에 — 같은 고정비·같은 달은 한 줄만(문서 이름 고정: 여러 명이 눌러도 두 번 안 들어감)
  const writeRecur = async (list, month) => {
    for (const r of list) {
      const day = String(Math.min(28, Math.max(1, Number(r.day) || 1))).padStart(2, "0");
      await setDoc(doc(db, "acctLedger", `recur_${r.id}_${month}`), { date: `${month}-${day}`, type: r.type || "지출", account: r.account || "기타", item: r.name, amount: toInt(r.amount), method: r.method || "자동이체", fundId: r.fundId || "", vendor: r.vendor || "", memo: "고정비 자동 반영", evidence: "", receipt: "", recurId: r.id, companyName: company, createdAt: serverTimestamp(), createdBy: auth.currentUser?.email || "" }, { merge: true });
    }
  };
  // ⭐ 2026-11-01 이번 달 고정비는 납부일이 지나면 장부를 열 때 자동 반영(경리·관리자 화면)
  const autoRecurRef = React.useRef("");
  React.useEffect(() => {
    if (isViewer || !rows || !recurring) return;
    const today = kstDay(); const month = today.slice(0, 7);
    if (ym !== month || autoRecurRef.current === month) return;
    const due = recurTodo.filter((r) => Math.min(28, Math.max(1, Number(r.day) || 1)) <= Number(today.slice(8, 10)));
    autoRecurRef.current = month;
    if (due.length) writeRecur(due, month).catch(() => {});
  }, [rows, recurring, ym, isViewer]); // eslint-disable-line react-hooks/exhaustive-deps
  const applyRecurring = async () => {
    if (!recurTodo.length) return;
    if (!(await kpConfirm(`${ym.replace("-", "년 ")}월 고정비 ${recurTodo.length}건을 장부에 넣을까요?`))) return;
    setBusy(true);
    try {
      await writeRecur(recurTodo, ym);
    } finally { setBusy(false); }
  };
  const csv = () => {
    const head = ["날짜", "구분", "계정과목", "내용", "거래처", "결제수단", "금액", "공급가", "부가세", "증빙", "메모"]; // 🧾 2026-11-15 공급가 · 부가세(세무사 전달용)
    const lines = [head.join(","), ...list.map((r) => { const v = r.supply != null ? { supply: r.supply, vat: r.vat } : vatSplit(r.amount, !["세금계산서", "카드전표", "현금영수증"].includes(r.evidence)); return [r.date, r.type, r.account, r.item, r.vendor, r.method, r.amount, v.supply, v.vat, r.evidence || (r.receipt ? "영수증" : ""), r.memo]; }).map((x) => x.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" })); a.download = `수입지출_${ym}.csv`; a.click();
  };

  if (rows === null) return <BookSkeleton rows={8} />; // ⭐ 2026-11-06 첫 불러오기 — 뼈대 화면
  return (
    <div className="space-y-4">
      <BookHero en="ACCOUNTING · CASH BOOK" title="수입·지출 장부" desc="돈이 들어오고 나간 내역을 날짜·계정과목별로 기록하고 증빙(영수증)까지 보관합니다"
        right={<div className="flex items-center gap-1.5">
          <button type="button" onClick={() => shiftYm(-1)} className="w-9 h-9 rounded-xl bg-white/10 border border-white/15">‹</button>
          <span className="h-9 px-3 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black grid place-items-center tabular-nums whitespace-nowrap" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{ym.replace("-", ".")}</span>
          <button type="button" onClick={() => shiftYm(1)} className="w-9 h-9 rounded-xl bg-white/10 border border-white/15">›</button>
        </div>}
        kpis={[["수입", `${won(income)}원`, `${M.nIn}건`], ["지출", `${won(expense)}원`, `${M.nOut}건`], ["수지 차액", `${income - expense >= 0 ? "+" : ""}${won(income - expense)}원`, "수입 − 지출", income - expense], ["증빙 없는 지출", `${noEvidence}건`, "영수증·전자결재 미첨부"]]} />

      {!isViewer && (toImport.length > 0 || recurTodo.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {toImport.length > 0 && <button type="button" disabled={busy} onClick={importApprovals} className="rounded-2xl border border-[#C9D6EE] bg-[#EEF3FC] px-4 py-3 text-left"><b className="text-[14px] text-[#0F1A30]">✎ 승인된 지출결의 {toImport.length}건 가져오기</b><div className="text-[12px] text-[#5B6B85]">전자결재 › 비용·지출 결의에서 승인된 문서를 장부에 넣습니다</div></button>}
          {recurTodo.length > 0 && <button type="button" disabled={busy} onClick={applyRecurring} className="rounded-2xl border border-[#C9D6EE] bg-[#EEF3FC] px-4 py-3 text-left"><b className="text-[14px] text-[#0F1A30]">↻ 이번 달 고정비 {recurTodo.length}건 반영</b><div className="text-[12px] text-[#5B6B85]">{recurTodo.slice(0, 3).map((r) => r.name).join(" · ")}{recurTodo.length > 3 ? " …" : ""}</div></button>}
        </div>
      )}

      {/* ⭐ 2026-11-17 일별 현금 흐름 — 위로 수입 · 아래로 지출 · 누계 차액 선 + 이 달 요약(총수입 · 총지출 · 순이익 · 최대 지출일) · 넓게 한 줄 */}
      <BookCard en="DAILY CASH FLOW" title={`${ym.replace("-", "년 ")}월 일별 수입 · 지출 · 누계`}>
        <CashFlowChart daily={daily} ym={ym} today={kstDay()} compact={narrow} />
      </BookCard>

      {/* ⭐ 2026-11-17 2칸 — 왼쪽 장부(LEDGER · 약 60%) | 오른쪽 분석(계정과목별 지출 · 고정비 · 약 40%) · 좁은 화면은 위아래로 */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 items-start">
        <div className="space-y-4 min-w-0">
        <BookCard flush>
          <div className="px-3.5 md:px-4 py-3 border-b border-[#EEF1F6] flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-extrabold tracking-[0.08em] text-[#4B6CB7] mr-1" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>LEDGER</span>
            {["전체", "지출", "수입"].map((t) => <Chip key={t} on={type === t} onClick={() => setType(t)}>{t}</Chip>)}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="적요·거래처·계정 검색" className="order-last md:order-none w-full md:w-auto md:ml-auto md:min-w-[150px] h-9 px-3 rounded-xl border border-[#DCE3EE] bg-[#F8FAFD] text-[13.5px] outline-none focus:border-[#2D4C82]" />
            {!isViewer && <button type="button" onClick={() => setEdit(blankEntry("지출"))} className="ml-auto md:ml-0 h-9 px-3.5 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black whitespace-nowrap shrink-0">+ 지출</button>}
            {!isViewer && <button type="button" onClick={() => setEdit(blankEntry("수입"))} className="h-9 px-3.5 rounded-xl border border-[#0F1A30] text-[#0F1A30] text-[13px] font-black whitespace-nowrap shrink-0">+ 수입</button>}
          </div>
          {rows === null ? <div className="py-16 text-center text-[13px] font-bold text-[#9AA9C3]">불러오는 중…</div>
            : !ledgerRows.length ? <div className="py-16 text-center text-[13.5px] font-bold text-[#9AA9C3]">이 달 내역이 없습니다</div> : (
            <>
              {/* PC — 줄 친 장부 */}
              {!narrow && <div className="overflow-x-auto">
                <table className="w-full text-[13px] border-collapse" style={{ minWidth: 740 }}>{/* ⭐ 2026-11-17 2칸 배치에 맞게 조금 좁게(820 → 740) */}
                  <thead>
                    <tr className="bg-[#0F1A30] text-white">
                      {[["일자", 62], ["구분", 52], ["계정과목", 104], ["적요 · 거래처", null], ["수입", 104], ["지출", 104], ["누계 잔액", 112], ["증빙", 60]].map(([h, w]) => <th key={h} className="px-3 py-2.5 text-[12px] font-black text-left whitespace-nowrap" style={w ? { width: w } : undefined}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerRows.map((r, i) => {
                      const newDay = i === 0 || ledgerRows[i - 1].date !== r.date;
                      return (
                        <tr key={r.id} onClick={() => !isViewer && setEdit({ ...blankEntry(r.type), ...r, amount: String(r.amount || ""), accTouched: true })} className={`cursor-pointer hover:bg-[#F2F6FD] ${newDay && i ? "border-t-2 border-[#DCE3EE]" : "border-t border-[#EEF2F8]"} ${i % 2 ? "bg-[#FBFCFE]" : "bg-white"}`}>
                          <td className="px-3 py-2 font-black text-[#1B2B4B] tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{newDay ? String(r.date).slice(5).replace("-", ".") : ""}</td>
                          <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded-md text-[11px] font-black ${r.type === "수입" ? "bg-[#EEF3FC] text-[#2D4C82]" : "bg-[#0F1A30] text-white"}`}>{r.type}</span></td>
                          <td className="px-3 py-2 font-bold text-[#3A4A66] truncate max-w-[120px]">{r.account}</td>
                          <td className="px-3 py-2 min-w-0">{(r.auto || r.recurId || r.sourceId) && <span title={r.memo || "다른 화면에서 자동 반영"} className="mr-1.5 px-1.5 py-0.5 rounded-md bg-[#F3E7CC] text-[#6B5320] text-[10.5px] font-black">자동</span>}<span className="font-black text-[#0F1A30]">{r.item || "-"}</span>{r.auto === "drvpay" && r.count ? <span className="ml-1 text-[11px] text-[#7A879C]">({r.count}건)</span> : null}{r.vendor && <span className="text-[#7A879C]"> · {r.vendor}</span>}{r.method && <span className="ml-1 text-[11px] text-[#9AA9C3]">{r.method}</span>}{F.byId[r.fundId] && <span className="ml-1.5 px-1.5 py-0.5 rounded-md bg-[#EEF3FC] text-[#2D4C82] text-[11px] font-black whitespace-nowrap">{isCard(F.byId[r.fundId]) ? "▭" : "▣"} {F.byId[r.fundId].name}</span>}</td>
                          <td className="px-3 py-2 text-right font-black tabular-nums text-[#2D4C82]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{r.type === "수입" ? won(r.amount) : ""}</td>
                          <td className="px-3 py-2 text-right font-black tabular-nums text-[#0F1A30]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{r.type === "지출" ? won(r.amount) : ""}</td>
                          <td className={`px-3 py-2 text-right font-black tabular-nums ${r.bal < 0 ? "text-[#2D6BE0]" : "text-[#1B2B4B]"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{r.bal < 0 ? "−" : ""}{won(Math.abs(r.bal))}</td>
                          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>{r.receipt ? <button type="button" onClick={() => setPhoto(r)} title="증빙 보기·저장" className="w-8 h-8 rounded-lg border border-[#DCE3EE] bg-cover bg-center" style={{ backgroundImage: `url(${r.receipt})` }} /> : r.evidence ? <span className="text-[11px] font-bold text-[#7A879C]">{r.evidence}</span> : r.type === "지출" ? <span className="text-[11px] font-black text-[#B42318]">없음</span> : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-[3px] border-double border-[#0F1A30] bg-[#F5F8FD]">
                      <td colSpan={4} className="px-3 py-2.5 font-black text-[#0F1A30]">이 달 합계 · {ledgerRows.length}건</td>
                      <td className="px-3 py-2.5 text-right font-black tabular-nums text-[#2D4C82]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{won(ledgerRows.filter((r) => r.type === "수입").reduce((s2, r) => s2 + toInt(r.amount), 0))}</td>
                      <td className="px-3 py-2.5 text-right font-black tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{won(ledgerRows.filter((r) => r.type === "지출").reduce((s2, r) => s2 + toInt(r.amount), 0))}</td>
                      <td colSpan={2} className="px-3 py-2.5 font-black tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{(() => { const v = ledgerRows.length ? ledgerRows[ledgerRows.length - 1].bal : 0; return `${v < 0 ? "−" : "+"}${won(Math.abs(v))}`; })()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>}
              {/* 휴대폰 — 장부 줄 카드 */}
              {narrow && <div className="divide-y divide-[#EEF2F8]">
                {ledgerRows.map((r) => (
                  <button key={r.id} type="button" onClick={() => !isViewer && setEdit({ ...blankEntry(r.type), ...r, amount: String(r.amount || ""), accTouched: true })} className="w-full text-left px-3.5 py-2.5 flex items-center gap-2.5">
                    <span className="w-11 text-center shrink-0"><span className="block text-[13px] font-black text-[#1B2B4B] tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{String(r.date).slice(8)}</span><span className={`block text-[10px] font-black ${r.type === "수입" ? "text-[#2D4C82]" : "text-[#7A879C]"}`}>{r.type}</span></span>
                    <span className="flex-1 min-w-0"><span className="block text-[14px] font-black text-[#0F1A30] truncate">{r.item || r.vendor || r.account}</span><span className="block text-[11.5px] text-[#7A879C] truncate">{r.account}{r.vendor ? ` · ${r.vendor}` : ""}{F.byId[r.fundId] ? ` · ${F.byId[r.fundId].name}` : ""}</span></span>
                    {r.receipt && <span onClick={(e) => { e.stopPropagation(); setPhoto(r); }} className="w-8 h-8 rounded-lg border border-[#DCE3EE] bg-cover bg-center shrink-0" style={{ backgroundImage: `url(${r.receipt})` }} />}
                    <span className="text-right shrink-0"><span className={`block text-[14px] font-black tabular-nums ${r.type === "수입" ? "text-[#2D4C82]" : "text-[#0F1A30]"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{r.type === "수입" ? "+" : "−"}{won(r.amount)}</span><span className="block text-[10.5px] text-[#9AA9C3] tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>잔 {won(r.bal)}</span></span>
                  </button>
                ))}
              </div>}
            </>
          )}
        </BookCard>
        </div>
        <div className="space-y-4 min-w-0 xl:sticky xl:top-3">
          <SpendBreakdown accTop={accTop} accN={accN} prevAcc={prevAcc} expense={expense} />
          <RecurringPanel recurring={recurring || []} recurDone={recurDone} expense={expense} isViewer={isViewer} onManage={() => setRecurOpen(true)} />
          <button type="button" onClick={csv} className="w-full h-12 rounded-2xl border border-[#DCE3EE] bg-white text-[14px] font-black text-[#1B2B4B] hover:border-[#2D4C82]">이 달 장부 엑셀(CSV) 내려받기</button>
        </div>
      </div>

      {/* ⭐ 2026-10-31 회사 총 자금 — 자금 현황과 같은 계산(장부에서 고른 통장·카드 입출금 반영) */}
      {fundOpts.length > 0 && (
        <div className="rounded-[22px] overflow-hidden text-white shadow-[0_14px_32px_rgba(15,26,48,0.22)]" style={{ background: HERO_BG }}>
          <div className="px-4 md:px-6 py-4 flex items-end justify-between gap-3 flex-wrap border-b border-white/10">
            <div>
              <div className="text-[11px] font-extrabold tracking-[0.08em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>COMPANY FUNDS · 회사 총 자금</div>
              <div className="text-[28px] md:text-[34px] font-black tabular-nums leading-tight" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{won(F.cash)}<span className="text-[16px] text-white/60 ml-1">원</span></div>
              <div className="text-[12.5px] text-white/55">통장·현금 잔액 합계 · 장부에서 고른 통장·카드 입출금이 바로 반영됩니다</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <div className="rounded-2xl bg-white/[0.07] border border-white/10 px-3.5 py-2"><div className="text-[11.5px] font-bold text-white/55">이번 달 카드 사용</div><div className="text-[17px] font-black tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{won(F.cardMonth)}원</div></div>
              {F.loan > 0 && <div className="rounded-2xl bg-white/[0.07] border border-white/10 px-3.5 py-2"><div className="text-[11.5px] font-bold text-white/55">대출 잔액</div><div className="text-[17px] font-black tabular-nums text-[#FCA5A5]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>−{won(F.loan)}원</div></div>}
            </div>
          </div>
          <div className="px-3 md:px-5 py-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
            {fundOpts.map((f) => (
              <div key={f.id} className="rounded-2xl bg-white/[0.06] border border-white/10 px-3 py-2.5 flex items-center gap-2.5 min-w-0">
                <span className="w-9 h-9 rounded-xl grid place-items-center text-[10px] font-black shrink-0" style={{ background: isCard(f) ? "linear-gradient(135deg,#B88A2E,#E2C077)" : "rgba(255,255,255,0.12)" }}>{fundBadge(f)}</span>
                <span className="flex-1 min-w-0"><span className="block text-[13.5px] font-black truncate">{f.name}</span><span className="block text-[11px] text-white/50 truncate">{isCredit(f) ? `남은 한도 · 이번 달 ${won(f.usedMonth || 0)} 사용` : f.linkName ? `${f.linkName} 연결` : [f.bank, last4(f)].filter(Boolean).join(" ") || f.kind}</span></span>
                <span className={`text-[15px] font-black tabular-nums shrink-0 ${f.balance < 0 ? "text-[#8FB0F0]" : ""}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{f.balance < 0 ? "−" : ""}{won(Math.abs(f.balance))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {edit && (
        <Sheet side en={`CASH BOOK · ${edit.id ? "EDIT" : "NEW"}`} title={`${edit.type} ${edit.id ? "수정" : "등록"}`} onClose={() => { setEdit(null); setCustomAcc(false); }}
          footer={<>{edit.id && <button type="button" onClick={() => remove(edit)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#B42318]">삭제</button>}<button type="button" onClick={() => setEdit(null)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">취소</button><button type="button" disabled={busy} onClick={save} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50">{busy ? "저장 중…" : "저장"}</button></>}>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white border border-[#E3E8F0]">
            {["지출", "수입"].map((t) => <button key={t} type="button" onClick={() => setEdit((p) => ({ ...p, type: t, account: LEDGER_ACCOUNTS[t][0], accTouched: false, accAuto: "" }))} className={`h-10 rounded-lg text-[14px] font-black ${edit.type === t ? "bg-[#0F1A30] text-white" : "text-[#5B6B85]"}`}>{t}</button>)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>날짜</Label><CustomDatePicker value={edit.date} onChange={(e) => setEdit((p) => ({ ...p, date: e.target.value }))} className={inp} showIcon /></div>
            <div><Label>금액(원)</Label><input inputMode="numeric" value={edit.amount ? won(edit.amount) : ""} onChange={(e) => setEdit((p) => ({ ...p, amount: e.target.value.replace(/[^\d]/g, "") }))} className={`${inp} text-right tabular-nums`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }} placeholder="0" />
              {toInt(edit.amount) > 0 && ["세금계산서", "카드전표", "현금영수증"].includes(edit.evidence) && (() => { const v = vatSplit(edit.amount); return <div className="mt-1 text-right text-[11.5px] font-bold text-[#7A879C] tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>공급가 {won(v.supply)} · 부가세 {won(v.vat)}</div>; })()}
            </div>
          </div>
          {/* 🧾 2026-11-15 영수증 먼저 — 찍으면 날짜 · 금액 · 사용처 · 증빙을 읽어 채운다 */}
          {!edit.id && !edit.receipt && <button type="button" onClick={() => fileRef.current?.click()} className="w-full h-12 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black" data-kp="receipt-first">▤ 영수증 사진으로 자동 채우기</button>}
          {scanMsg && <div className="rounded-xl bg-[#F5F8FD] border border-[#DCE3EE] px-3 py-2 text-[12.5px] font-bold text-[#1B2B4B]">{scanMsg}</div>}
          <div><Label>계정과목</Label>
            {/* 🧾 2026-11-15 자동 추천 — 왜 골랐는지 · 다른 후보 */}
            {sug && !edit.accTouched && edit.account === sug.account && (
              <div className="mb-2 rounded-xl border border-[#C9D5EA] bg-[#F5F8FD] px-3 py-2 text-[12.5px] text-[#1B2B4B] flex items-center gap-2 flex-wrap" data-kp="acct-suggest">
                <span className="h-6 px-2 rounded-md bg-[#0F1A30] text-white text-[11.5px] font-black inline-flex items-center">자동 추천</span>
                <span className="font-bold">{sug.why}</span>
                {sug.alts.length > 0 && <span className="text-[#7A879C] font-bold">다른 후보:</span>}
                {sug.alts.map((a) => <button key={a} type="button" onClick={() => setEdit((p) => ({ ...p, account: a, accTouched: true }))} className="h-6 px-2 rounded-md border border-[#C9D5EA] bg-white text-[11.5px] font-black">{a}</button>)}
              </div>
            )}
            {(() => {
              // 기본 계정 + 이 회사가 직접 입력해 쓴 계정
              const base = LEDGER_ACCOUNTS[edit.type];
              const used = [...new Set((rows || []).filter((r) => r.type === edit.type).map((r) => r.account).filter((a) => a && !base.includes(a)))];
              const all = [...base, ...used];
              const isCustom = customAcc || (edit.account && !all.includes(edit.account));
              return (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {all.map((a) => <Chip key={a} on={!isCustom && edit.account === a} onClick={() => { setCustomAcc(false); setEdit((p) => ({ ...p, account: a, accTouched: true })); }}>{a}</Chip>)}
                    <Chip on={isCustom} onClick={() => { setCustomAcc(true); setEdit((p) => ({ ...p, account: "", accTouched: true })); }}>✎ 직접입력</Chip>
                  </div>
                  {isCustom && <input autoFocus value={edit.account} onChange={(e) => setEdit((p) => ({ ...p, account: e.target.value }))} className={`${inp} mt-2`} placeholder="계정과목을 직접 입력 (예: 차량리스료, 협회비)" />}
                </>
              );
            })()}
          </div>
          <div><Label>통장 · 카드 · 현금 <span className="block md:inline font-semibold text-[#9AA9C3]">(고르면 자금 현황 잔액이 그만큼 {edit.type === "지출" ? "줄어듭니다" : "늘어납니다"})</span></Label>
            {fundOpts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#C9D2E0] bg-white px-3 py-3 text-[12.5px] font-bold text-[#7A879C]">등록된 통장·카드가 없습니다 — 자금관리 › 자금 현황에서 먼저 등록해 주세요</div>
            ) : (
              <CustomSelect value={edit.fundId || ""} onChange={(e) => { const id = e.target.value; const f = F.byId[id]; setEdit((p) => ({ ...p, fundId: id, method: !f ? p.method : f.kind === "현금" ? "현금" : isCard(f) ? (f.kind === "법인카드" ? "법인카드" : "개인카드(정산)") : (["법인카드", "개인카드(정산)", "현금"].includes(p.method) ? "계좌이체" : p.method) })); }} className={inp}>
                <option value="">지정 안 함 (잔액에 반영하지 않음)</option>
                {fundOpts.map((f) => <option key={f.id} value={f.id}>{`${f.name} · ${f.kind}${f.bank ? ` ${f.bank}` : ""}${last4(f) ? ` ${last4(f)}` : ""} — ${isCredit(f) ? "남은 한도" : "잔액"} ${won(f.balance)}원`}</option>)}
              </CustomSelect>
            )}
            {(() => {
              const f = F.byId[edit.fundId];
              if (!f) return null;
              const orig = edit.id ? (rows || []).find((r) => r.id === edit.id) : null;
              const origEff = orig && orig.fundId === f.id ? (orig.type === "수입" ? 1 : -1) * toInt(orig.amount) : 0;
              const now = f.balance - origEff;
              const next = now + (edit.type === "수입" ? 1 : -1) * toInt(edit.amount);
              return (
                <div className="mt-2 rounded-xl px-3.5 py-3 text-white flex items-center gap-3" style={{ background: HERO_BG }}>
                  <span className="w-9 h-9 rounded-xl grid place-items-center text-[10px] font-black shrink-0" style={{ background: isCard(f) ? "linear-gradient(135deg,#B88A2E,#E2C077)" : "rgba(255,255,255,0.12)" }}>{fundBadge(f)}</span>
                  <span className="flex-1 min-w-0"><span className="block text-[13.5px] font-black truncate">{f.name}{f.linkName ? ` → ${f.linkName}` : ""}</span><span className="block text-[11.5px] text-white/55">{isCredit(f) ? "이번 달 남은 한도" : "잔액"} · 저장하면</span></span>
                  <span className="text-right shrink-0 tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}><span className="block text-[12px] text-white/55 line-through">{won(now)}</span><span className={`block text-[17px] font-black ${next < 0 ? "text-[#FCA5A5]" : ""}`}>{next < 0 ? "−" : ""}{won(Math.abs(next))}원</span></span>
                </div>
              );
            })()}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div><Label>내용</Label><input value={edit.item} onChange={(e) => setEdit((p) => ({ ...p, item: e.target.value }))} className={inp} placeholder="예: 복합기 토너, 사무실 생수" /></div>
            <div><Label>거래처(사용처)</Label><input value={edit.vendor} onChange={(e) => setEdit((p) => ({ ...p, vendor: e.target.value }))} className={inp} placeholder="예: ○○문구" /></div>
          </div>
          <div><Label>결제수단</Label><div className="flex flex-wrap gap-1.5">{METHODS.map((m) => <Chip key={m} on={edit.method === m} onClick={() => setEdit((p) => ({ ...p, method: m }))}>{m}</Chip>)}</div></div>
          <div><Label>증빙</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">{["세금계산서", "카드전표", "현금영수증", "간이영수증", "증빙 없음"].map((m) => <Chip key={m} on={edit.evidence === m} onClick={() => setEdit((p) => ({ ...p, evidence: m }))}>{m}</Chip>)}</div>
            {edit.receipt ? (
              <div className="relative rounded-xl overflow-hidden border border-[#E3E8F0] bg-white"><img src={edit.receipt} alt="" className="w-full max-h-72 object-contain" /><div className="absolute top-2 right-2 flex gap-1.5"><button type="button" onClick={() => saveImage(edit.receipt, `증빙_${edit.date}_${edit.item || edit.vendor || edit.account}`)} className="h-8 px-3 rounded-lg bg-white/90 text-[#0F1A30] text-[12px] font-black border border-[#DCE3EE]">⬇ 사진 저장</button><button type="button" onClick={() => setEdit((p) => ({ ...p, receipt: "" }))} className="h-8 px-3 rounded-lg bg-[#0F1A30]/80 text-white text-[12px] font-bold">사진 빼기</button></div></div>
            ) : <button type="button" onClick={() => fileRef.current?.click()} className="w-full h-16 rounded-xl border-2 border-dashed border-[#C9D2E0] bg-white text-[13px] font-bold text-[#5B6B85]">▤ 영수증 사진 찍기·올리기</button>}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { const r = await compressImage(f, 1400, 0.8).catch(() => ""); setEdit((p) => ({ ...p, receipt: r })); if (r) readReceipt(r); } }} />
          </div>
          <div><Label>메모</Label><input value={edit.memo} onChange={(e) => setEdit((p) => ({ ...p, memo: e.target.value }))} className={inp} placeholder="선택" /></div>
        </Sheet>
      )}
      {photo && (
        <div className="fixed inset-0 z-[100001] bg-[#0B1428]/85 flex flex-col items-center justify-center p-4" onClick={() => setPhoto(null)}>
          <img src={photo.receipt} alt="" className="max-w-full max-h-[78vh] rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => saveImage(photo.receipt, `증빙_${photo.date}_${photo.item || photo.vendor || photo.account}`)} className="h-11 px-5 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black">⬇ 사진 저장</button>
            <button type="button" onClick={() => setPhoto(null)} className="h-11 px-5 rounded-xl bg-white/15 text-white text-[14px] font-bold">닫기</button>
          </div>
        </div>
      )}
      {recurOpen && <RecurringEditor company={company} rows={recurring || []} ledger={rows || []} funds={fundOpts} onClose={() => setRecurOpen(false)} />}
    </div>
  );
}

function RecurringEditor({ company, rows, ledger = [], funds = [], onClose }) {
  const [f, setF] = React.useState({ type: "지출", name: "", account: "임차료", amount: "", day: "25", method: "자동이체", vendor: "", fundId: "" });
  const [custom, setCustom] = React.useState(false);
  const accs = [...new Set([...LEDGER_ACCOUNTS[f.type], ...ledger.filter((r) => r.type === f.type).map((r) => r.account).filter(Boolean)])];
  const add = async () => {
    if (!f.name.trim() || !toInt(f.amount)) return alert("이름과 금액을 입력해 주세요.");
    if (!String(f.account || "").trim()) return alert("계정과목을 입력해 주세요.");
    await addDoc(collection(db, "acctRecurring"), { ...f, account: String(f.account).trim(), name: f.name.trim(), amount: toInt(f.amount), active: true, companyName: company, createdAt: serverTimestamp() });
    setF((p) => ({ ...p, name: "", amount: "", vendor: "" }));
  };
  return (
    <Sheet side en="CASH BOOK · RECURRING" title="고정비 · 정기 수입 관리" onClose={onClose} footer={<button type="button" onClick={onClose} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black">닫기</button>}>
      <div className="rounded-2xl bg-white border border-[#E3E8F0] p-4 space-y-3">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#F4F6FA] border border-[#E3E8F0]">
          {["지출", "수입"].map((t) => <button key={t} type="button" onClick={() => { setCustom(false); setF((p) => ({ ...p, type: t, account: LEDGER_ACCOUNTS[t][0] })); }} className={`h-10 rounded-lg text-[14px] font-black ${f.type === t ? "bg-[#0F1A30] text-white" : "text-[#5B6B85]"}`}>매달 {t}</button>)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>이름</Label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inp} placeholder={f.type === "지출" ? "예: 사무실 임대료" : "예: 주차장 임대수입"} /></div>
          <div><Label>금액</Label><input inputMode="numeric" value={f.amount ? won(f.amount) : ""} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d]/g, "") })} className={`${inp} text-right`} /></div>
          <div><Label>계정과목</Label>
            <CustomSelect value={custom ? "__custom" : f.account} onChange={(e) => { if (e.target.value === "__custom") { setCustom(true); setF({ ...f, account: "" }); } else { setCustom(false); setF({ ...f, account: e.target.value }); } }} className={inp}>
              {accs.map((a) => <option key={a} value={a}>{a}</option>)}
              <option value="__custom">✎ 직접입력</option>
            </CustomSelect>
            {custom && <input autoFocus value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })} className={`${inp} mt-2`} placeholder="계정과목 직접 입력" />}
          </div>
          <div><Label>매달 (일)</Label><input inputMode="numeric" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value.replace(/[^\d]/g, "").slice(0, 2) })} className={inp} /></div>
          {funds.length > 0 && <div className="col-span-2"><Label>나가는(들어오는) 통장·카드 <span className="font-semibold text-[#9AA9C3]">(장부에 넣으면 자금 잔액에 반영)</span></Label>
            <CustomSelect value={f.fundId} onChange={(e) => setF({ ...f, fundId: e.target.value })} className={inp}>
              <option value="">지정 안 함</option>
              {funds.map((x) => <option key={x.id} value={x.id}>{`${x.name} · ${x.kind}${x.bank ? ` ${x.bank}` : ""}`}</option>)}
            </CustomSelect></div>}
        </div>
        <button type="button" onClick={add} className="w-full h-11 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black">+ 고정비 추가</button>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="rounded-2xl bg-white border border-[#E3E8F0] px-3 py-2.5 flex items-center gap-2">
          <div className="flex-1 min-w-0"><div className="text-[14px] font-black text-[#0F1A30] truncate">{r.name} <span className={`text-[11px] font-black ${r.type === "수입" ? "text-[#2D4C82]" : "text-[#7A879C]"}`}>{r.type || "지출"}</span></div><div className="text-[11.5px] text-[#7A879C]">{r.account} · 매달 {r.day}일 · {r.method}</div>
            {funds.length > 0 && <CustomSelect value={r.fundId || ""} onChange={(e) => updateDoc(doc(db, "acctRecurring", r.id), { fundId: e.target.value })} className="mt-1 h-8 px-2 rounded-lg border border-[#DCE3EE] bg-white text-[12px] font-bold text-[#1B2B4B] max-w-full"><option value="">통장·카드 지정 안 함</option>{funds.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</CustomSelect>}</div>
          <span className="text-[13.5px] font-black tabular-nums whitespace-nowrap" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{won(r.amount)}</span>
          <button type="button" onClick={() => updateDoc(doc(db, "acctRecurring", r.id), { active: r.active === false })} className={`h-8 px-2.5 rounded-lg text-[12px] font-black whitespace-nowrap ${r.active === false ? "border border-[#DCE3EE] text-[#9AA9C3]" : "bg-[#EEF3FC] text-[#1B2B4B]"}`}>{r.active === false ? "꺼짐" : "켜짐"}</button>
          <button type="button" onClick={async () => (await kpConfirm("삭제할까요?")) && runDelete({ label: "고정비", task: () => deleteDoc(doc(db, "acctRecurring", r.id)) }).catch(() => {})} /* ⭐ 2026-11-05 삭제 진행 창 */ className="w-8 h-8 rounded-lg text-[#9AA9C3]">✕</button>
        </div>
      ))}
    </Sheet>
  );
}

// ═════════════════════════ 비품·자산 관리 ═════════════════════════
export const ASSET_CATS = ["사무가구", "IT기기", "사무기기", "소모품", "차량·장비", "기타"];
const ASSET_STATUS = ["사용중", "보관", "수리중", "폐기"];
const blankAsset = () => ({ name: "", category: "IT기기", qty: "1", unit: "개", minQty: "", location: "", holder: "", purchaseDate: kstDay(), price: "", vendor: "", status: "사용중", code: "", memo: "", photo: "", toLedger: true });

// 🧾 2026-11-17 비품 등록 · 수정 — 3분할 작업 화면(사용자 요청)
//  왼쪽: 등록된 비품 대장 목록(검색 · 분류 · 누르면 그 비품을 바로 불러와 고침) · 가운데: 입력칸 · 오른쪽: 종이 미리보기(비품 등록 대장, 입력하는 대로 바로 바뀜)
//  좁은 화면: 목록은 숨기고(1024px 아래) 미리보기는 입력칸 아래로(1280px 아래). 저장 · 계산은 예전과 같다
const AD_LINE = "border-[#0F1A30]/55";
const adInp = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/10 placeholder:text-[#A9B6CC]";
const adChip = (on) => `h-9 px-3 rounded-lg text-[13px] font-black border transition ${on ? "bg-[#0F1A30] border-[#0F1A30] text-white" : "bg-white border-[#DCE3EE] text-[#3A4A66] hover:border-[#9AA9C3]"}`;
function AdField({ label, hint, children, className = "" }) {
  return <div className={className}><div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">{label}</div>{children}{hint && <div className="mt-1 text-[11.5px] font-semibold text-[#8A97AD]">{hint}</div>}</div>;
}
function AdSection({ no, title, children }) {
  return (
    <section className="bg-white rounded-2xl border border-[#E3E8F0] p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3.5"><span className="w-6 h-6 rounded-md bg-[#EEF3FB] text-[#2D4C82] text-[11.5px] font-black grid place-items-center tabular-nums">{no}</span><span className="text-[15px] font-black text-[#0F1A30]">{title}</span></div>
      {children}
    </section>);
}
const costOf = (e) => (e.category === "소모품" ? toInt(e.price) : toInt(e.price) * Math.max(1, toInt(e.qty)));
// 종이 미리보기(읽기 전용)
function AssetPaper({ edit }) {
  const row = (l, v, wide) => (
    <div className={`flex ${wide ? "col-span-2" : ""} border-b ${AD_LINE} min-w-0`}>
      <div className={`w-[100px] shrink-0 bg-[#EEF1F6] border-r ${AD_LINE} px-2.5 py-2 text-[12.5px] font-black text-[#0F1A30] flex items-center whitespace-nowrap`}>{l}</div>
      <div className="flex-1 min-w-0 px-2.5 py-2 text-[13px] font-semibold text-[#0F1A30] break-keep [overflow-wrap:anywhere]">{v || <span className="text-[#B8C2D3]">-</span>}</div>
    </div>);
  const cost = costOf(edit);
  return (
    <div className="bg-white shadow-[0_10px_30px_rgba(15,26,48,0.12)] px-6 py-7 w-full" style={{ fontFamily: "'Pretendard','Noto Sans KR',sans-serif" }} data-kp="asset-paper">
      <div className="flex items-start gap-3">
        <div className="min-w-0 mr-auto">
          <div className="text-[11px] font-extrabold tracking-[0.16em] text-[#4B6CB7]">OFFICE ASSET · {edit.code || "AS"}</div>
          <div className="text-[23px] font-black tracking-[0.12em] text-[#0F1A30] mt-1 whitespace-nowrap">비 품 등 록 대 장</div>
          <div className="text-[12px] text-[#5A6A85] mt-1">{edit.id ? `수정일 ${kstDay()}` : `등록일 ${kstDay()}`}</div>
        </div>
        <div className="w-[96px] h-[92px] border border-[#0F1A30] flex flex-col shrink-0">
          <div className="h-6 bg-[#EEF1F6] border-b border-[#0F1A30] text-[11.5px] font-black text-[#0F1A30] grid place-items-center">사 진</div>
          <div className="flex-1 min-h-0 bg-cover bg-center grid place-items-center text-[11px] text-[#B8C2D3]" style={edit.photo ? { backgroundImage: `url(${edit.photo})` } : null}>{edit.photo ? "" : "없음"}</div>
        </div>
      </div>
      <div className="mt-5 border-t-2 border-x border-[#0F1A30] grid grid-cols-2">
        {row("분류", edit.category)}{row("상태", edit.status)}
        {row("품목 이름", <b>{edit.name}</b>, true)}
        {row("관리번호", edit.code)}{row("수량", edit.qty ? `${won(edit.qty)}${edit.unit || "개"}` : "")}
        {row("위치", edit.location)}{row("담당 · 사용자", edit.holder)}
        {row("구입일", edit.purchaseDate)}{row("구입가", edit.price ? `${won(edit.price)}원` : "")}
        {row("구입처", edit.vendor, true)}
        {row("최소 수량", edit.minQty ? `${won(edit.minQty)}${edit.unit || "개"} 이하면 재고 부족` : "")}{row("장부 반영", edit.toLedger !== false ? "수입·지출 장부 지출" : "기록 안 함")}
        {row("메모", edit.memo, true)}
      </div>
      <div className="mt-3 flex items-center justify-end gap-3">
        <span className="text-[13px] font-bold text-[#5B6B85]">자산 금액</span>
        <span className="text-[18px] font-black text-[#0F1A30] tabular-nums border-b-[3px] border-double border-[#0F1A30] pb-0.5">{won(cost)}원</span>
      </div>
      {edit.id && (edit.history || []).length > 0 && (
        <div className="mt-5">
          <div className="text-[12.5px] font-black text-[#0F1A30] mb-1.5">입출고 이력</div>
          <div className="border border-[#0F1A30]/40 text-[12.5px]">
            {[...(edit.history || [])].reverse().slice(0, 10).map((h, i) => (
              <div key={i} className="grid grid-cols-[96px_56px_minmax(0,1fr)_60px] border-b border-[#0F1A30]/15 last:border-b-0">
                <div className="px-2 py-1.5 tabular-nums">{new Date(h.at).toLocaleDateString("ko-KR")}</div>
                <div className="px-2 py-1.5 border-l border-[#0F1A30]/15 font-bold">{h.kind}</div>
                <div className="px-2 py-1.5 border-l border-[#0F1A30]/15 truncate text-[#5B6B85]">{h.memo || "-"}</div>
                <div className="px-2 py-1.5 border-l border-[#0F1A30]/15 text-right font-black tabular-nums">{h.kind === "출고" ? "−" : "+"}{h.n}</div>
              </div>))}
          </div>
        </div>)}
    </div>
  );
}
export function AssetDocForm({ edit, setEdit, busy, onSave, onDelete, fileRef, rows = [], onPick, onNew, onMove, inline = false, readOnly = false }) {
  const [okAt, setOkAt] = React.useState(0);
  const doSave = async () => { const r = await onSave?.(); if (r !== false) { snap.current = ""; setOkAt(Date.now()); setTimeout(() => setOkAt(0), 1800); } };
  const set = (k) => (e) => setEdit((p) => ({ ...p, [k]: e.target.value }));
  const num = (k) => (e) => setEdit((p) => ({ ...p, [k]: e.target.value.replace(/[^\d]/g, "") }));
  const cost = costOf(edit);
  const [q, setQ] = React.useState("");
  const [cat, setCat] = React.useState("전체");
  const snap = React.useRef("");
  const key = edit.id || "__new";
  React.useEffect(() => { snap.current = JSON.stringify(edit); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = () => snap.current && snap.current !== JSON.stringify(edit);
  const guard = async (fn) => { if (dirty() && !(await kpConfirm("저장하지 않은 내용이 있어요. 그래도 넘어갈까요?"))) return; fn(); };
  React.useEffect(() => { if (inline) return undefined; const k = (e) => { if (e.key === "Escape") guard(() => setEdit(null)); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (okAt === 0) snap.current = JSON.stringify(edit); }, [okAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const kw = q.trim();
  const isLow = (a) => toInt(a.minQty) > 0 && toInt(a.qty) <= toInt(a.minQty);
  const lowN = (rows || []).filter((a) => a.status !== "폐기" && isLow(a)).length;
  const list = (rows || []).filter((a) => (cat === "전체" ? a.status !== "폐기" : cat === "재고 부족" ? a.status !== "폐기" && isLow(a) : cat === "폐기" ? a.status === "폐기" : a.category === cat && a.status !== "폐기"))
    .filter((a) => !kw || [a.name, a.location, a.holder, a.code].some((v) => String(v || "").includes(kw)))
    .sort((a, b) => String(a.category).localeCompare(String(b.category), "ko") || String(a.name).localeCompare(String(b.name), "ko"));
  return (
    <div className={inline ? "relative rounded-2xl overflow-hidden border border-[#E3E8F0] bg-[#EEF1F6] flex flex-col shadow-[0_1px_2px_rgba(15,26,48,.04)]" : "fixed inset-0 z-[100000] bg-[#EEF1F6] flex flex-col"} style={inline ? { height: "max(640px, calc(100vh - 300px))" } : undefined} data-kp="asset-doc-form">
      {/* 위 막대 */}
      <div className={`shrink-0 flex items-center gap-2 px-4 md:px-6 ${inline ? "h-14" : "h-16"} text-white`} style={{ background: HERO_BG }}>
        <div className="min-w-0 mr-auto"><div className="text-[11px] font-bold tracking-[0.14em] text-[#8FB0F0]">OFFICE ASSET · {edit.id ? "EDIT" : "NEW"}</div><div className="text-[17px] font-black truncate">{edit.id ? `${edit.name || "비품"} · 수정` : "새 비품 등록"}</div></div>
        {!readOnly && edit.id && onMove && edit.status !== "폐기" && <>
          <button type="button" onClick={() => onMove("in")} className="h-10 px-3.5 rounded-xl bg-white/10 border border-white/20 text-[13.5px] font-bold text-white hover:bg-white/15">입고</button>
          <button type="button" onClick={() => onMove("out")} className="h-10 px-3.5 rounded-xl bg-white/10 border border-white/20 text-[13.5px] font-bold text-white hover:bg-white/15">출고</button>
        </>}
        {!readOnly && onDelete && <button type="button" onClick={onDelete} className="h-10 px-4 rounded-xl bg-white/10 border border-white/20 text-[13.5px] font-bold text-[#FFB4B4] hover:bg-white/15">삭제</button>}
        {!inline && <button type="button" onClick={() => guard(() => setEdit(null))} className="h-10 px-4 rounded-xl bg-white/10 border border-white/20 text-[13.5px] font-bold text-white hover:bg-white/15">닫기</button>}
        {!readOnly && <button type="button" disabled={busy} onClick={doSave} className="h-10 px-6 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black disabled:opacity-50 shadow-[0_6px_16px_rgba(0,0,0,.2)]">{busy ? "저장 중…" : okAt ? "저장했어요 ✓" : edit.id ? "수정 저장" : "등록"}</button>}
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_minmax(0,1fr)]">
        {/* ① 왼쪽 — 비품 대장 목록 */}
        <aside className="hidden lg:flex flex-col min-h-0 bg-white border-r border-[#E3E8F0]">
          <div className="p-3 border-b border-[#EEF1F6] space-y-2">
            <button type="button" onClick={() => guard(() => onNew?.())} className={`w-full h-10 rounded-xl text-[13.5px] font-black ${!edit.id ? "bg-[#0F1A30] text-white" : "border border-dashed border-[#9AA9C3] text-[#1B2B4B] hover:bg-[#F4F6FA]"}`}>+ 새 비품</button>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="품목 · 위치 · 담당자 검색" className="h-9 w-full px-3 rounded-lg border border-[#DCE3EE] bg-[#F8FAFD] text-[13px] outline-none focus:border-[#2D4C82] focus:bg-white" />
            <div className="flex flex-wrap gap-1">{["전체", "재고 부족", ...ASSET_CATS, "폐기"].map((c) => <button key={c} type="button" onClick={() => setCat(c)} className={`h-7 px-2 rounded-md text-[11.5px] font-black ${cat === c ? "bg-[#0F1A30] text-white" : c === "재고 부족" && lowN ? "bg-[#FEECEC] text-[#B42318]" : "bg-[#F1F4F9] text-[#5B6B85]"}`}>{c}{c === "재고 부족" && lowN ? ` ${lowN}` : ""}</button>)}</div>
          </div>
          <div className="px-3 pt-2 pb-1 text-[11px] font-bold tracking-[0.12em] text-[#9AA9C3]">ASSET LEDGER · {list.length}건</div>
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
            {!list.length && <div className="py-10 text-center text-[12.5px] font-bold text-[#9AA9C3]">등록된 비품이 없어요</div>}
            {list.map((a) => { const on = a.id === edit.id; const low = toInt(a.minQty) > 0 && toInt(a.qty) <= toInt(a.minQty); return (
              <button key={a.id} type="button" onClick={() => on || guard(() => onPick?.(a))} className={`w-full text-left flex items-center gap-2.5 px-2 py-2 rounded-xl mb-1 transition ${on ? "bg-[#0F1A30] text-white" : "hover:bg-[#F4F6FA]"}`}>
                <span className="w-9 h-9 rounded-lg shrink-0 grid place-items-center text-[10px] font-black bg-cover bg-center" style={a.photo ? { backgroundImage: `url(${a.photo})` } : { background: on ? "rgba(255,255,255,.12)" : "#EEF3FB", color: on ? "#fff" : "#2D4C82" }}>{a.photo ? "" : String(a.category || "").slice(0, 2)}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-black">{a.name}</span><span className={`block truncate text-[11.5px] ${on ? "text-white/60" : "text-[#7A879C]"}`}>{[a.code, a.location, a.holder].filter(Boolean).join(" · ") || a.category}</span></span>
                <span className={`shrink-0 text-[12px] font-black tabular-nums ${low ? (on ? "text-[#FFB4B4]" : "text-[#B42318]") : ""}`}>{won(a.qty)}{a.unit || "개"}</span>
              </button>); })}
          </div>
        </aside>
        {/* ② 가운데 — 입력칸 */}
        <div className="min-h-0 overflow-y-auto">
          <div className="max-w-[720px] mx-auto p-4 md:p-6 space-y-3">
            {/* 좁은 화면 — 왼쪽 목록 대신 고르기 칸 */}
            <div className="lg:hidden flex gap-2">
              <select value={edit.id || ""} onChange={(e) => { const a = (rows || []).find((x) => x.id === e.target.value); guard(() => (a ? onPick?.(a) : onNew?.())); }} className={`${adInp} flex-1`}>
                <option value="">+ 새 비품 등록</option>
                {(rows || []).filter((a) => a.status !== "폐기").map((a) => <option key={a.id} value={a.id}>{a.name} · {won(a.qty)}{a.unit || "개"}</option>)}
              </select>
            </div>
            <AdSection no="1" title="기본 정보">
              <AdField label="분류"><div className="flex flex-wrap gap-1.5">{ASSET_CATS.map((c) => <button key={c} type="button" className={adChip(edit.category === c)} onClick={() => setEdit((p) => ({ ...p, category: c }))}>{c}</button>)}</div></AdField>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-2.5">
                <AdField label="품목 이름"><input value={edit.name} onChange={set("name")} className={`${adInp} font-black`} placeholder="예: 노트북, A4용지, 복합기" autoFocus={!edit.id && !inline} /></AdField>
                <AdField label="관리번호 (선택)"><input value={edit.code} onChange={set("code")} className={adInp} placeholder="예: IT-001" /></AdField>
              </div>
            </AdSection>
            <AdSection no="2" title="수량 · 위치">
              <div className="grid grid-cols-3 gap-2.5">
                <AdField label="수량"><input inputMode="numeric" value={edit.qty} onChange={num("qty")} className={`${adInp} text-right tabular-nums`} /></AdField>
                <AdField label="단위"><input value={edit.unit} onChange={set("unit")} className={adInp} placeholder="개 · 대 · 박스" /></AdField>
                <AdField label="최소 수량" hint="이하면 재고 부족 알림"><input inputMode="numeric" value={edit.minQty} onChange={num("minQty")} className={`${adInp} text-right tabular-nums`} placeholder="소모품" /></AdField>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                <AdField label="위치"><input value={edit.location} onChange={set("location")} className={adInp} placeholder="예: 2층 사무실" /></AdField>
                <AdField label="담당 · 사용자"><input value={edit.holder} onChange={set("holder")} className={adInp} placeholder="예: 홍길동" /></AdField>
              </div>
            </AdSection>
            <AdSection no="3" title="구입 · 장부">
              <div className="grid grid-cols-2 gap-2.5">
                <AdField label="구입일"><CustomDatePicker value={edit.purchaseDate} onChange={set("purchaseDate")} className={adInp} showIcon /></AdField>
                <AdField label="구입가(원)"><input inputMode="numeric" value={edit.price ? won(edit.price) : ""} onChange={num("price")} className={`${adInp} text-right tabular-nums`} placeholder="0" /></AdField>
              </div>
              <AdField label="구입처" className="mt-2.5"><input value={edit.vendor} onChange={set("vendor")} className={adInp} placeholder="예: ○○문구, 쿠팡" /></AdField>
              <label className="mt-3 flex items-center gap-2 rounded-xl bg-[#F6F8FC] border border-[#E3E8F0] px-3 py-2.5 text-[13.5px] font-bold text-[#1B2B4B] cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-[#0F1A30]" checked={edit.toLedger !== false} onChange={(e) => setEdit((p) => ({ ...p, toLedger: e.target.checked }))} />
                수입·지출 장부에 지출로 기록 <span className="ml-auto text-[#5B6B85] tabular-nums">{cost ? `${won(cost)}원${edit.category !== "소모품" && toInt(edit.qty) > 1 ? ` (× ${toInt(edit.qty)})` : ""}` : ""}</span>
              </label>
            </AdSection>
            <AdSection no="4" title="상태 · 사진 · 메모">
              <AdField label="상태"><div className="flex flex-wrap gap-1.5">{ASSET_STATUS.map((c) => <button key={c} type="button" className={adChip(edit.status === c)} onClick={() => setEdit((p) => ({ ...p, status: c }))}>{c}</button>)}</div></AdField>
              <AdField label="사진" className="mt-3">
                {edit.photo ? <div className="relative rounded-xl overflow-hidden border border-[#E3E8F0] bg-[#F8FAFD]"><img src={edit.photo} alt="" className="w-full max-h-44 object-contain" /><button type="button" onClick={() => setEdit((p) => ({ ...p, photo: "" }))} className="absolute top-2 right-2 h-8 px-3 rounded-lg bg-[#0F1A30]/80 text-white text-[12px] font-bold">빼기</button></div>
                  : <button type="button" onClick={() => fileRef.current?.click()} className="w-full h-14 rounded-xl border-2 border-dashed border-[#C9D2E0] bg-[#FBFCFE] text-[13px] font-bold text-[#5B6B85] hover:bg-white">◎ 사진 올리기 (선택)</button>}
              </AdField>
              <AdField label="메모" className="mt-3"><textarea value={edit.memo} onChange={set("memo")} rows={3} className={`${adInp} h-auto py-2.5 resize-y`} placeholder="보증기간 · 시리얼 번호 등" /></AdField>
            </AdSection>
            {/* 좁은 화면 — 미리보기를 아래에 */}
            <div className="xl:hidden pt-2"><div className="text-[12px] font-bold tracking-[0.12em] text-[#9AA9C3] mb-2">PREVIEW</div><AssetPaper edit={edit} /></div>
          </div>
        </div>
        {/* ③ 오른쪽 — 미리보기 */}
        <div className="hidden xl:block min-h-0 overflow-y-auto bg-[#E4E9F1] border-l border-[#DCE3EE]">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3"><span className="text-[11px] font-bold tracking-[0.14em] text-[#7A879C]">PREVIEW</span><span className="text-[13px] font-black text-[#1B2B4B]">비품 등록 대장 미리보기</span><span className="ml-auto text-[11.5px] font-semibold text-[#7A879C]">입력하는 대로 바로 바뀌어요</span></div>
            <AssetPaper edit={edit} />
          </div>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { const r = await compressImage(f, 1000, 0.75).catch(() => ""); setEdit((p) => ({ ...p, photo: r })); } }} />
    </div>
  );
}
export function AssetManager({ company, isViewer = false }) {
  const rows = useCompanyCol("officeAssets", company);
  const [edit, setEdit] = React.useState(() => blankAsset()); // ⭐ 2026-11-17 비품관리 화면 = 바로 3칸 작업 화면(새 비품 입력부터)
  const [move, setMove] = React.useState(null); // { a, kind: "in"|"out", n, memo }
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef(null);
  const L = rows || [];
  const active = L.filter((a) => a.status !== "폐기");
  const low = active.filter((a) => toInt(a.minQty) > 0 && toInt(a.qty) <= toInt(a.minQty));
  const value = active.reduce((s, a) => s + toInt(a.price) * (a.category === "소모품" ? 1 : Math.max(1, toInt(a.qty))), 0);
  const repair = active.filter((a) => a.status === "수리중");
  const save = async () => {
    const e = edit;
    if (!e.name.trim()) return alert("품목 이름을 입력해 주세요.");
    setBusy(true);
    try {
      const data = { name: e.name.trim(), category: e.category, qty: toInt(e.qty), unit: e.unit || "개", minQty: toInt(e.minQty), location: e.location.trim(), holder: e.holder.trim(), purchaseDate: e.purchaseDate || "", price: toInt(e.price), vendor: e.vendor.trim(), status: e.status, code: e.code.trim(), memo: e.memo.trim(), photo: e.photo || "", companyName: company };
      const toLedger = e.toLedger !== false;
      let id = e.id;
      if (e.id) await updateDoc(doc(db, "officeAssets", e.id), { ...data, toLedger, updatedAt: serverTimestamp() });
      else id = (await addDoc(collection(db, "officeAssets"), { ...data, toLedger, history: [{ at: Date.now(), kind: "등록", n: data.qty, by: auth.currentUser?.email || "" }], createdAt: serverTimestamp() })).id;
      // 🔗 2026-11-01 구입가 → 수입·지출 장부 "비품 구입" 지출(자금 잔액 반영). 끄면 장부에서 빠진다
      const cost = data.category === "소모품" ? data.price : data.price * Math.max(1, data.qty);
      await upsertAutoEntry(db, id, { company, date: data.purchaseDate, account: data.category === "소모품" ? "소모품비" : "비품구입", item: `비품 구입 · ${data.name}`, amount: toLedger ? cost : 0, vendor: data.vendor, memo: "비품·자산 등록 — 자동 반영", auto: "asset" }).catch(() => {});
      setEdit((p) => ({ ...p, id, history: p.history || [{ at: Date.now(), kind: "등록", n: data.qty }] })); // ⭐ 2026-11-17 저장 뒤에도 그 비품을 계속 보여 준다
      return true;
    } catch (err) { alert(`저장 실패: ${err.message}`); return false; } finally { setBusy(false); }
  };
  const doMove = async () => {
    const n = toInt(move.n); if (!n) return;
    const next = Math.max(0, toInt(move.a.qty) + (move.kind === "in" ? n : -n));
    await updateDoc(doc(db, "officeAssets", move.a.id), { qty: next, history: arrayUnion({ at: Date.now(), kind: move.kind === "in" ? "입고" : "출고", n, memo: move.memo || "", by: auth.currentUser?.email || "" }) });
    setMove(null);
  };
  return (
    <div className="space-y-4">
      <BookHero en="ACCOUNTING · OFFICE ASSETS" title="비품·자산 관리" desc="사무가구·IT기기·소모품의 수량·위치·담당자·구입가를 관리하고 소모품 재고 부족을 알려줍니다"
        right={<button type="button" data-manual-btn="비품관리" onClick={() => window.dispatchEvent(new CustomEvent("kp-open-manual", { detail: { menu: "비품관리", section: "assets" } }))} className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-[13.5px] font-black whitespace-nowrap bg-white/12 text-white border border-white/25 hover:bg-white/20">📘 비품 매뉴얼</button>}
        kpis={[["관리 품목", `${active.length}종`, `폐기 ${L.length - active.length}`], ["자산 금액", `${won(value)}원`, "구입가 기준"], ["재고 부족", `${low.length}종`, "최소 수량 이하 소모품"], ["수리중", `${repair.length}건`, ""]]} />
      {/* ⭐ 2026-11-17 [+ 비품 등록] 버튼 없이 처음부터 3칸(비품 대장 목록 · 입력칸 · 등록 대장 미리보기) */}
      <AssetDocForm inline readOnly={isViewer} edit={edit} setEdit={setEdit} busy={busy} onSave={save} fileRef={fileRef} rows={L}
        onNew={() => setEdit(blankAsset())}
        onPick={(a) => setEdit({ ...blankAsset(), ...a, toLedger: a.toLedger === true, qty: String(a.qty ?? ""), minQty: String(a.minQty || ""), price: String(a.price || "") })}
        onMove={(kind) => { const a = L.find((x) => x.id === edit.id); if (a) setMove({ a, kind, n: "1", memo: "" }); }}
        onDelete={edit.id ? async () => { if ((await kpConfirm("삭제할까요? (폐기 처리는 상태를 '폐기'로)"))) { const _id = edit.id; /* ⭐ 2026-11-05 삭제 진행 창 */ await runDelete({ label: "비품", task: async () => { await deleteDoc(doc(db, "officeAssets", _id)); /* ⭐ 2026-11-02 점검 — 비품 삭제 시 '비품 구입' 자동 지출 줄도 함께 삭제(amount 0 → 줄 제거) */ await upsertAutoEntry(db, _id, { company, amount: 0, auto: "asset" }).catch(() => {}); } }); setEdit(blankAsset()); } } : null} />
      {move && (
        <Sheet en={`ASSET · ${move.kind === "in" ? "STOCK IN" : "STOCK OUT"}`} title={`${move.a.name} ${move.kind === "in" ? "입고" : "출고"}`} onClose={() => setMove(null)}
          footer={<><button type="button" onClick={() => setMove(null)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">취소</button><button type="button" onClick={doMove} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black">{move.kind === "in" ? "입고" : "출고"} 처리</button></>}>
          <div className="text-[13px] text-[#5B6B85]">지금 {won(move.a.qty)}{move.a.unit || "개"} → {won(Math.max(0, toInt(move.a.qty) + (move.kind === "in" ? 1 : -1) * toInt(move.n)))}{move.a.unit || "개"}</div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>수량</Label><input inputMode="numeric" value={move.n} onChange={(e) => setMove((p) => ({ ...p, n: e.target.value.replace(/[^\d]/g, "") }))} className={`${inp} text-right`} /></div>
            <div><Label>메모</Label><input value={move.memo} onChange={(e) => setMove((p) => ({ ...p, memo: e.target.value }))} className={inp} placeholder={move.kind === "in" ? "예: ○○문구 구입" : "예: 영업팀 지급"} /></div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
