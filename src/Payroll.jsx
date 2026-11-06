// ======================= src/Payroll.jsx =======================
// ⭐ 2026-11-06 직원 급여 계산 · 급여명세서(사무직 직원 — 기사 운임 집계와 별개). PC·모바일 공용(반응형).
//  · 월 급여 계산: 달 고르기 → 직원 목록 → 출근기록부 시간(연장·야간·휴일) 자동 + 직접 수정 → 지급·공제·실지급 계산 →
//    [확정(잠금)] → [명세서 발행](직원 알림) → [지급 처리](수입·지출 장부 "급여·상여" 자동 기록)
//  · 직원 급여 설정: 월급/시급 · 식대·자가운전보조금(비과세) · 직책·기타수당 · 부양가족·자녀 · 4대보험 적용 제외 · 고정 세액
//  · 요율 설정: 연도별 4대보험·비과세 한도·가산율·최저시급(처음 값은 법정 요율 — payrollCalc.js PAYROLL_PRESETS)
//  · 급여명세서: 2021.11.19 시행 근로기준법 48조 2항 · 시행령 27조의2 기재사항(성명·생년월일·지급일·임금총액·구성항목별 금액·
//    계산방법·근로일수·연장/야간/휴일 근로시간·공제 항목별 금액과 총액) — 인쇄/PDF 저장 가능
//  · 권한: payrollAccess.js(화면) · firestore.rules payrollEditor()/payrollViewer()(데이터). 직원 본인은 "발행된" 본인 명세서만
//  데이터: payrollSettings/{회사} · payrollEmployees/{회사}__{uid} · payrollRuns/{회사}_{YYYY-MM} · payslips/{회사}_{YYYY-MM}_{uid} · hrNotices(알림)
import React from "react";
import { arrayUnion, collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { db, auth, DEFAULT_COMPANY } from "./firebase";
import { BookHero, BookCard, Chip, Sheet, MONO } from "./OfficeBooks";
import { isTMUser } from "./staffFilter";
import { personName } from "./userNames";
import { calcPayslip, hoursFromAttendance, ratesFor, presetFor, RATE_FIELDS, wonFmt } from "./payrollCalc";
import { isWeekend, isHoliday } from "./attendanceUtils";
import { upsertAutoEntry } from "./ledgerAuto";
import { usePayrollAccess } from "./payrollAccess";
import { useIsPhone } from "./KpSubNav";

const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const kstYm = () => kstDay().slice(0, 7);
const shiftYm = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const lastDayOf = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
export const safeId = (s) => String(s || "").replace(/[/\s#?[\]]/g, "_").slice(0, 80);
export const slipId = (co, ym, uid) => `${safeId(co)}_${ym}_${uid}`;
export const runId = (co, ym) => `${safeId(co)}_${ym}`;
export const empId = (co, uid) => `${safeId(co)}__${uid}`;
const tsMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0);
const toNum = (v) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ymLabel = (ym) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;
const inp = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82] disabled:bg-[#F5F7FB] disabled:text-[#8A97AD]";
const numInp = `${inp} text-right tabular-nums`;
const NUMS = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };
const Label = ({ children, hint }) => <div className="mb-1.5"><span className="text-[13px] font-black text-[#3A4A66]">{children}</span>{hint && <span className="ml-1.5 text-[12px] font-bold text-[#8A97AD]">{hint}</span>}</div>;
const STATUS = {
  none: ["작성 전", "#7A879C", "#F2F4F7"], draft: ["작성 중", "#B54708", "#FFF4E5"], confirmed: ["확정(잠금)", "#1B2B4B", "#EEF3FC"], paid: ["지급 완료", "#067647", "#ECFDF3"],
};
const StatusPill = ({ st, published }) => { const s = STATUS[st] || STATUS.none; return <span className="inline-flex items-center gap-1.5"><span className="h-7 px-2.5 rounded-lg text-[13px] font-black inline-flex items-center" style={{ color: s[1], background: s[2] }}>{s[0]}</span>{published && <span className="h-7 px-2.5 rounded-lg text-[13px] font-black inline-flex items-center bg-[#0F1A30] text-white">명세서 발행</span>}</span>; };
export const TAX_NOTE = "간이세액 근사치 — 확정은 세무사/간이세액표 확인";

// ── 데이터 구독 ──
const isStaff = (u, company) => (u.companyName || DEFAULT_COMPANY) === company && !["driver", "shipper", "cafeUser", "totalMaster"].includes(u.role) && !isTMUser(u) && u.approved !== false;
function useStaff(company) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "users"), where("companyName", "==", company)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => isStaff(u, company))), () => setRows([]));
  }, [company]);
  return rows;
}
function useCol(name, company, extra = null, key = "") {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!company) return undefined;
    const cons = [where("companyName", "==", company), ...(extra ? [where(extra[0], "==", extra[1])] : [])];
    return onSnapshot(query(collection(db, name), ...cons), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, company, key]);
  return rows;
}
function useDocData(path, id) {
  const [v, setV] = React.useState(undefined);
  React.useEffect(() => {
    if (!id) return undefined;
    return onSnapshot(doc(db, path, id), (s) => setV(s.exists() ? { id: s.id, ...s.data() } : null), () => setV(null));
  }, [path, id]);
  return v;
}
export const usePayrollSettings = (company) => useDocData("payrollSettings", company);

// ═════════════════ 급여명세서(화면·인쇄 공용 HTML) ═════════════════
export function payslipHtml(slip, company) {
  const r = slip?.result || {};
  const w = r.work || {};
  const row = (l, a, c) => `<tr><td class="l">${esc(l)}</td><td class="a">${wonFmt(a)}</td><td class="c">${esc(c || "")}</td></tr>`;
  const earn = (r.earnings || []).map((e) => row(`${e.label}${e.taxable === false ? " (비과세)" : ""}`, e.amount, e.calc)).join("");
  const ded = (r.deductions || []).filter((d) => d.amount || ["np", "hi", "ltc", "ei", "tax", "local"].includes(d.key)).map((d) => row(d.label, d.amount, d.calc)).join("");
  const info = [["성명", slip.name], ["생년월일", slip.birthDate || "-"], ["소속", [slip.team, slip.position].filter(Boolean).join(" · ") || "-"], ["입사일", slip.hireDate || "-"], ["귀속 월", ymLabel(slip.ym || "0000-00")], ["지급일", slip.paidDate || slip.payDate || "-"]];
  const workCells = [["근로일수", `${w.workDays || 0}일`], ["소정(정상) 근로", `${w.regularHours || 0}시간`], ["연장근로", `${w.otHours || 0}시간`], ["야간근로", `${w.nightHours || 0}시간`], ["휴일근로", `${(w.holHours || 0) + (w.holOverHours || 0)}시간`]];
  return `<div class="ps">
<div class="hd"><div><div class="en">PAYSLIP · ${esc(slip.ym || "")}</div><div class="tt">급 여 명 세 서</div></div><div class="co">${esc(company || slip.companyName || "")}</div></div>
<table class="info">${[0, 2, 4].map((i) => `<tr><th>${info[i][0]}</th><td>${esc(info[i][1])}</td><th>${info[i + 1][0]}</th><td>${esc(info[i + 1][1])}</td></tr>`).join("")}</table>
<table class="work"><tr>${workCells.map(([k]) => `<th>${k}</th>`).join("")}</tr><tr>${workCells.map(([, v]) => `<td>${v}</td>`).join("")}</tr></table>
<div class="two">
<div><div class="st">지급 내역</div><table class="it"><tr><th>항목</th><th>금액(원)</th><th>계산 방법</th></tr>${earn}<tr class="sum"><td class="l">지급 총액</td><td class="a">${wonFmt(r.gross)}</td><td class="c">과세 ${wonFmt(r.taxable)} · 비과세 ${wonFmt(r.nonTaxable)}</td></tr></table></div>
<div><div class="st">공제 내역</div><table class="it"><tr><th>항목</th><th>금액(원)</th><th>계산 방법</th></tr>${ded}<tr class="sum"><td class="l">공제 총액</td><td class="a">${wonFmt(r.totalDeduct)}</td><td class="c"></td></tr></table></div>
</div>
<div class="net"><span>실수령액</span><b>${wonFmt(r.net)}원</b></div>
<div class="nt">통상시급 ${wonFmt(r.ordinaryHourly)}원 (통상임금 ÷ 월 소정근로시간) · 연장 ${r.small ? "1.0" : esc(slip.rates?.otRate ?? 1.5)}배 · 야간 가산 ${r.small ? "0" : esc(slip.rates?.nightRate ?? 0.5)}배 · 휴일 ${r.small ? "1.0" : esc(slip.rates?.holRate ?? 1.5)}배(8시간 초과 ${r.small ? "1.0" : esc(slip.rates?.holOverRate ?? 2)}배)${r.small ? " · 상시 5인 미만 사업장(가산수당 미적용)" : ""}<br/>
${r.taxMode === "auto" ? `소득세: ${TAX_NOTE}<br/>` : ""}${slip.input?.memo ? `비고: ${esc(slip.input.memo)}<br/>` : ""}본 명세서는 근로기준법 제48조 제2항에 따라 교부합니다.</div>
</div>`;
}
export const PAYSLIP_CSS = `.ps{font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#0F1A30;background:#fff;max-width:860px;margin:0 auto}
.ps .hd{display:flex;justify-content:space-between;align-items:flex-end;padding:18px 22px;border-radius:14px;color:#fff;background:linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ps .en{font-size:11px;font-weight:800;letter-spacing:.24em;color:#8FB0F0}.ps .tt{font-size:24px;font-weight:900;letter-spacing:.3em;margin-top:2px}.ps .co{font-size:15px;font-weight:800}
.ps table{width:100%;min-width:0 !important;border-collapse:collapse;font-size:14px;table-layout:fixed}.ps th,.ps td{border:1px solid #DCE3EE;padding:8px 10px;overflow-wrap:anywhere;word-break:keep-all;white-space:normal !important}.ps .it .a{white-space:nowrap !important}
.ps .info{margin-top:12px}.ps .info th{width:16%;background:#F5F8FD;color:#3A4A66;text-align:left;font-weight:800}.ps .info td{font-weight:700}
.ps .work{margin-top:10px}.ps .work th{background:#F5F8FD;color:#3A4A66;font-weight:800}.ps .work td{text-align:center;font-weight:900;font-size:15px}
.ps .two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin-top:12px}.ps .it th:nth-child(1){width:30%}.ps .it th:nth-child(2){width:27%}.ps .st{font-size:14px;font-weight:900;margin-bottom:6px;border-left:4px solid #1B2B4B;padding-left:8px}
.ps .it th{background:#1B2B4B;color:#fff;font-weight:800;-webkit-print-color-adjust:exact;print-color-adjust:exact}.ps .it .l{font-weight:700}.ps .it .a{text-align:right;font-weight:900;white-space:nowrap}.ps .it .c{font-size:12.5px;color:#5B6B85}
.ps .it .sum td{background:#EEF3FC;font-weight:900;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ps .net{margin-top:12px;display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-radius:12px;border:2px solid #1B2B4B}.ps .net span{font-size:16px;font-weight:900}.ps .net b{font-size:26px;font-weight:900}
.ps .nt{margin-top:10px;font-size:12.5px;line-height:1.7;color:#5B6B85}
@media (max-width:1100px){.ps .two{grid-template-columns:minmax(0,1fr)}}@media (max-width:640px){.ps table{font-size:13px !important}.ps th,.ps td{padding:6px 6px}.ps .info th{width:22%}.ps .net b{font-size:22px}.ps .tt{font-size:19px}.ps .work th,.ps .work td{font-size:12.5px;padding:6px 4px}}`;
export function printPayslips(slips, company) {
  const w = window.open("", "_blank"); if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>급여명세서</title><style>@page{size:A4;margin:14mm}body{margin:0}${PAYSLIP_CSS}.pg{page-break-after:always;padding:4px}.pg:last-child{page-break-after:auto}</style></head><body>${(slips || []).map((s) => `<div class="pg">${payslipHtml(s, company)}</div>`).join("")}<script>setTimeout(()=>print(),300)</script></body></html>`);
  w.document.close();
}
export function PayslipView({ slip, company }) {
  return <div className="kp-payslip"><style>{PAYSLIP_CSS}</style><div dangerouslySetInnerHTML={{ __html: payslipHtml(slip, company) }} /></div>;
}

// ═════════════════ 급여관리(경리·인사·마스터) ═════════════════
export default function PayrollCenter({ company, role = "" }) {
  const uid = auth.currentUser?.uid || "preview";
  const acc = usePayrollAccess(company, uid, role, auth.currentUser?.email || "");
  const [tab, setTab] = React.useState("run");
  if (!acc.loading && !acc.canView) return <div className="rounded-2xl bg-white border border-[#E3E8F0] py-16 text-center text-[15px] font-bold text-[#7A879C]">급여 정보는 경리·인사 담당자만 볼 수 있습니다 · 본인 명세서는 회사관리 › 급여명세서에서</div>;
  const ro = !acc.canEdit;
  return (
    <div className="space-y-3" data-testid="payroll-center">
      <div className="flex items-center gap-1.5 flex-wrap">
        {[["run", "월 급여 계산"], ["emp", "직원 급여 설정"], ["rates", "요율 · 설정"]].map(([k, l]) => <Chip key={k} on={tab === k} onClick={() => setTab(k)}>{l}</Chip>)}
        {ro && <span className="ml-auto h-8 px-3 rounded-lg bg-[#F2F4F7] text-[#5B6B85] text-[13px] font-black inline-flex items-center">조회 전용 — 수정은 경리 담당자</span>}
      </div>
      {tab === "run" && <PayrollRun company={company} ro={ro} onGoEmp={() => setTab("emp")} />}
      {tab === "emp" && <PayEmployees company={company} ro={ro} />}
      {tab === "rates" && <PayRates company={company} ro={ro} />}
    </div>
  );
}

// ── 월 급여 계산 ──
function PayrollRun({ company, ro, onGoEmp }) {
  const phone = useIsPhone();
  const [ym, setYm] = React.useState(kstYm);
  const staff = useStaff(company);
  const emps = useCol("payrollEmployees", company);
  const slipsRaw = useCol("payslips", company, ["ym", ym], ym);
  const slips = React.useMemo(() => (slipsRaw ? slipsRaw.filter((x) => x.ym === ym) : null), [slipsRaw, ym]);
  const att = useCol("attendance", company, ["month", ym], ym);
  const hols = useCol("holidays", company);
  const settings = usePayrollSettings(company);
  const run = useDocData("payrollRuns", company ? runId(company, ym) : "");
  const [edit, setEdit] = React.useState(null); // uid
  const [view, setView] = React.useState(null); // slip
  const [busy, setBusy] = React.useState(false);
  const st = run?.status || (slips?.length ? "draft" : "none");
  const locked = st === "confirmed" || st === "paid";
  const year = Number(ym.slice(0, 4));
  const rates = locked && run?.rates ? run.rates : ratesFor(settings || {}, year);
  const empMap = React.useMemo(() => Object.fromEntries((emps || []).map((e) => [e.uid, e])), [emps]);
  const slipMap = React.useMemo(() => Object.fromEntries((slips || []).map((s) => [s.uid, s])), [slips]);
  const isOff = React.useCallback((d) => isWeekend(d) || isHoliday(d, hols || []), [hols]);
  const monthStart = `${ym}-01`; const monthEnd = lastDayOf(ym);
  const people = (staff || []).filter((u) => {
    if (slipMap[u.id]) return true;
    if (u.employmentStatus === "퇴사" && String(u.resignedAt || u.resignPlan?.date || "9999").slice(0, 10) < monthStart) return false;
    if (u.hireDate && u.hireDate > monthEnd) return false;
    return u.employmentStatus !== "퇴사" || !!empMap[u.id];
  }).sort((a, b) => String(a.team || "").localeCompare(String(b.team || ""), "ko") || String(a.name || "").localeCompare(String(b.name || ""), "ko"));
  const rows = people.map((u) => {
    const emp = empMap[u.id];
    const slip = slipMap[u.id];
    if (locked && slip?.result) return { u, emp, slip, result: slip.result, input: slip.input || {}, att: slip.att || {} };
    if (!emp) return { u, emp: null, slip, result: null, input: slip?.input || {}, att: null };
    const a = hoursFromAttendance((att || []).filter((r) => r.uid === u.id), isOff);
    const input = slip?.input || {};
    const pick = (k) => (input[k] !== undefined && input[k] !== "" && input[k] !== null ? toNum(input[k]) : a[k]);
    const month = {
      workDays: pick("workDays"), regularHours: pick("regularHours"), otHours: pick("otHours"), nightHours: pick("nightHours"), holHours: pick("holHours"), holOverHours: pick("holOverHours"),
      weeklyHolidayHours: toNum(input.weeklyHolidayHours), bonus: toNum(input.bonus), extraPays: input.extraPays || [], extraDeducts: input.extraDeducts || [],
      taxOverride: input.taxOverride, localTaxOverride: input.localTaxOverride,
    };
    return { u, emp, slip, result: calcPayslip(emp, month, rates), input, att: a };
  });
  const ready = rows.filter((r) => r.result);
  const sum = (f) => ready.reduce((s, r) => s + (f(r.result) || 0), 0);
  const totals = { n: ready.length, gross: sum((x) => x.gross), deduct: sum((x) => x.totalDeduct), net: sum((x) => x.net), employer: sum((x) => x.employer?.total), tax: sum((x) => (x.deductions || []).filter((d) => d.key === "tax" || d.key === "local").reduce((s, d) => s + d.amount, 0)) };
  const me = auth.currentUser;
  const byName = me?.email || "";
  const logEntry = (action, detail = "") => ({ at: Date.now(), action, by: byName, detail });
  const payDateDefault = () => { const d = Number(settings?.payDay) || 0; if (!d) return kstDay(); const n = shiftYm(ym, settings?.payNextMonth === false ? 0 : 1); return `${n}-${String(Math.min(d, 28)).padStart(2, "0")}`; };

  const slipDoc = (r, extra = {}) => ({
    companyName: company, ym, uid: r.u.id, name: personName(r.u) || r.u.name || "", team: r.u.team || "", position: r.u.position || "",
    birthDate: r.u.birthDate || "", hireDate: r.u.hireDate || "", payType: r.emp?.payType || "monthly", payDate: run?.payDate || payDateDefault(),
    input: r.input || {}, att: r.att || {}, result: r.result, rates, updatedAt: serverTimestamp(), updatedBy: byName, ...extra,
  });
  const saveAll = async (status) => {
    if (ro) return;
    if (!ready.length) return alert("급여 설정이 된 직원이 없습니다. [직원 급여 설정]에서 기본급을 먼저 입력해 주세요.");
    setBusy(true);
    try {
      const b = writeBatch(db);
      ready.forEach((r) => b.set(doc(db, "payslips", slipId(company, ym, r.u.id)), slipDoc(r, { status, published: false }), { merge: true }));
      b.set(doc(db, "payrollRuns", runId(company, ym)), {
        companyName: company, ym, status, published: false, totals, rates, payDate: run?.payDate || payDateDefault(), updatedAt: serverTimestamp(), updatedBy: byName,
        ...(status === "confirmed" ? { confirmedAt: Date.now(), confirmedBy: byName } : {}),
        log: arrayUnion(logEntry(status === "confirmed" ? "확정" : "저장", `${ready.length}명 · 실지급 ${wonFmt(totals.net)}원`)),
      }, { merge: true });
      await b.commit();
    } catch (e) { alert(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const unlock = async () => {
    const reason = window.prompt("확정을 풀고 다시 수정합니다. 사유를 적어 주세요(기록이 남고, 발행된 명세서는 직원 화면에서 내려갑니다).");
    if (!reason || reason.trim().length < 2) return;
    setBusy(true);
    try {
      const b = writeBatch(db);
      (slips || []).forEach((s) => b.update(doc(db, "payslips", s.id), { status: "draft", published: false, updatedAt: serverTimestamp(), updatedBy: byName, unlockReason: reason.trim() }));
      b.set(doc(db, "payrollRuns", runId(company, ym)), { status: "draft", published: false, updatedAt: serverTimestamp(), log: arrayUnion(logEntry("확정 해제", reason.trim())) }, { merge: true });
      await b.commit();
    } catch (e) { alert(`실패: ${e.message}`); } finally { setBusy(false); }
  };
  const publish = async () => {
    if (!window.confirm(`${ymLabel(ym)} 급여명세서 ${slips.length}건을 발행할까요?\n· 직원은 회사관리 › 급여명세서에서 본인 것만 볼 수 있습니다\n· 직원에게 알림이 갑니다`)) return;
    setBusy(true);
    try {
      const b = writeBatch(db);
      (slips || []).forEach((s) => {
        b.update(doc(db, "payslips", s.id), { published: true, publishedAt: Date.now(), publishedBy: byName, updatedAt: serverTimestamp() });
        b.set(doc(collection(db, "hrNotices")), { companyName: company, uid: s.uid, kind: "payslip", link: "payslip", refId: s.id, title: `${ymLabel(ym)} 급여명세서가 발행되었습니다`, body: `${s.name}님, ${ymLabel(ym)}분 급여명세서가 발행되었습니다.\n실수령액 ${wonFmt(s.result?.net)}원 · 지급일 ${s.paidDate || s.payDate || "-"}\n\n회사관리 › 급여명세서에서 확인·인쇄할 수 있습니다.`, createdAt: serverTimestamp(), createdBy: byName });
      });
      b.set(doc(db, "payrollRuns", runId(company, ym)), { published: true, publishedAt: Date.now(), publishedBy: byName, log: arrayUnion(logEntry("명세서 발행", `${slips.length}건 · 직원 알림`)) }, { merge: true });
      await b.commit();
    } catch (e) { alert(`발행 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const pay = async () => {
    const d = window.prompt("지급일(YYYY-MM-DD)", run?.payDate || payDateDefault());
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.trim())) return;
    setBusy(true);
    try {
      const b = writeBatch(db);
      (slips || []).forEach((s) => b.update(doc(db, "payslips", s.id), { status: "paid", paidDate: d.trim(), paidAt: Date.now(), updatedAt: serverTimestamp() }));
      b.set(doc(db, "payrollRuns", runId(company, ym)), { status: "paid", payDate: d.trim(), paidAt: Date.now(), paidBy: byName, log: arrayUnion(logEntry("지급 처리", `${d.trim()} · 실지급 ${wonFmt(run?.totals?.net ?? totals.net)}원`)) }, { merge: true });
      await b.commit();
      // 🔗 수입·지출 장부 연동(ledgerAuto) — 실지급액 합계 1줄(원천세·4대보험은 신고·납부 때 따로)
      if (settings?.ledgerOn !== false) {
        await upsertAutoEntry(db, `payroll_${ym}`, { company, date: d.trim(), account: "급여·상여", item: `${ymLabel(ym)} 직원 급여 지급 · ${slips.length}명`, amount: run?.totals?.net ?? totals.net, vendor: "직원 급여", memo: `급여 계산 자동 — 지급 총액 ${wonFmt(run?.totals?.gross ?? totals.gross)}원 · 공제 ${wonFmt(run?.totals?.deduct ?? totals.deduct)}원(원천세·4대보험은 따로 납부)`, auto: "payroll" }).catch((e) => console.warn("장부 기록 실패", e));
      }
    } catch (e) { alert(`지급 처리 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const unpay = async () => {
    if (!window.confirm("지급 처리를 취소할까요? 장부의 급여 지급 줄도 지워집니다.")) return;
    setBusy(true);
    try {
      const b = writeBatch(db);
      (slips || []).forEach((s) => b.update(doc(db, "payslips", s.id), { status: "confirmed", paidDate: "", updatedAt: serverTimestamp() }));
      b.set(doc(db, "payrollRuns", runId(company, ym)), { status: "confirmed", paidAt: null, log: arrayUnion(logEntry("지급 취소")) }, { merge: true });
      await b.commit();
      await upsertAutoEntry(db, `payroll_${ym}`, { company, amount: 0, auto: "payroll" }).catch(() => {});
    } catch (e) { alert(`실패: ${e.message}`); } finally { setBusy(false); }
  };
  const loading = staff === null || emps === null || slips === null;
  const cur = edit ? rows.find((r) => r.u.id === edit) : null;
  const shownSlips = (slips || []).slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko"));

  return (
    <div className="space-y-3">
      <BookHero en={`PAYROLL · ${ym}`} title="월 급여 계산" desc="출근기록부 시간 자동 반영 · 직접 수정 → 확정(잠금) → 명세서 발행(직원 알림) → 지급 처리(장부 자동 기록)"
        kpis={[["대상 인원", `${totals.n}명`, rows.length > totals.n ? `설정 필요 ${rows.length - totals.n}명` : ""], ["지급 총액", `${wonFmt(totals.gross)}원`], ["공제 총액", `${wonFmt(totals.deduct)}원`, `원천세 ${wonFmt(totals.tax)}원`], ["실지급 총액", `${wonFmt(totals.net)}원`, `회사 부담 4대보험 ${wonFmt(totals.employer)}원`]]}
        right={
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setYm(shiftYm(ym, -1))} className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 text-[16px] font-black" aria-label="이전 달">‹</button>
            <span className="min-w-[118px] text-center text-[17px] font-black" style={NUMS}>{ymLabel(ym)}</span>
            <button type="button" onClick={() => setYm(shiftYm(ym, 1))} className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 text-[16px] font-black" aria-label="다음 달">›</button>
          </div>
        } />
      <div className="rounded-2xl bg-white border border-[#E3E8F0] px-4 py-3 flex items-center gap-2 flex-wrap">
        <StatusPill st={st} published={run?.published} />
        {run?.payDate && <span className="text-[13.5px] font-bold text-[#5B6B85]">지급일 <b className="text-[#0F1A30]" style={NUMS}>{run.payDate}</b></span>}
        <span className="text-[12.5px] font-bold text-[#8A97AD]">{rates.year}년 요율 · 국민연금 {rates.npEmp}% · 건강 {rates.hiEmp}% · 장기요양 {rates.ltcRatio}% · 고용 {rates.eiEmp}%{rates.small ? " · 5인 미만(가산 없음)" : ""}</span>
        <span className="flex-1" />
        {!ro && !locked && <button type="button" disabled={busy} onClick={() => saveAll("draft")} className="h-10 px-4 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-black text-[#1B2B4B] disabled:opacity-50">임시 저장</button>}
        {!ro && !locked && <button type="button" disabled={busy} onClick={() => { if (window.confirm(`${ymLabel(ym)} 급여 ${ready.length}명을 확정할까요? 확정하면 잠겨서 수정할 수 없습니다(확정 해제는 사유 기록).`)) saveAll("confirmed"); }} className="h-10 px-4 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-50" data-testid="payroll-confirm">확정(잠금)</button>}
        {!ro && st === "confirmed" && <button type="button" disabled={busy} onClick={unlock} className="h-10 px-4 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-black text-[#B42318] disabled:opacity-50">확정 해제</button>}
        {!ro && locked && !run?.published && <button type="button" disabled={busy} onClick={publish} className="h-10 px-4 rounded-xl bg-[#2D4C82] text-white text-[14px] font-black disabled:opacity-50" data-testid="payroll-publish">명세서 발행</button>}
        {!ro && st === "confirmed" && <button type="button" disabled={busy} onClick={pay} className="h-10 px-4 rounded-xl bg-[#067647] text-white text-[14px] font-black disabled:opacity-50">지급 처리</button>}
        {!ro && st === "paid" && <button type="button" disabled={busy} onClick={unpay} className="h-10 px-4 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-black text-[#B42318] disabled:opacity-50">지급 취소</button>}
        {locked && shownSlips.length > 0 && <button type="button" onClick={() => printPayslips(shownSlips, company)} className="h-10 px-4 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-black text-[#1B2B4B]">명세서 전체 인쇄</button>}
      </div>
      {loading ? <div className="py-16 text-center text-[14px] font-bold text-[#9AA9C3]">불러오는 중…</div> : !rows.length ? (
        <div className="rounded-2xl bg-white border border-[#E3E8F0] py-16 text-center text-[14.5px] font-bold text-[#7A879C]">이 달 대상 직원이 없습니다</div>
      ) : phone ? (
        <div className="space-y-2">
          {rows.map((r) => (
            <button key={r.u.id} type="button" onClick={() => (r.result ? (locked ? setView(r.slip || null) : setEdit(r.u.id)) : onGoEmp())} className="w-full text-left rounded-2xl bg-white border border-[#E3E8F0] px-4 py-3">
              <div className="flex items-center gap-2"><b className="text-[16px] text-[#0F1A30]">{personName(r.u) || r.u.name}</b><span className="text-[13px] text-[#5B6B85] truncate">{[r.u.team, r.u.position].filter(Boolean).join(" · ")}</span></div>
              {r.result ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[["지급", r.result.gross], ["공제", r.result.totalDeduct], ["실지급", r.result.net]].map(([l, v]) => <div key={l} className="rounded-xl bg-[#F5F8FD] px-2 py-1.5"><div className="text-[12px] font-bold text-[#7A879C]">{l}</div><div className="text-[15px] font-black text-[#0F1A30]" style={NUMS}>{wonFmt(v)}</div></div>)}
                </div>
              ) : <div className="mt-1.5 text-[13.5px] font-black text-[#B54708]">급여 설정 필요 — 눌러서 설정</div>}
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-[20px] bg-white border border-[#E3E8F0] overflow-x-auto">
          <table className="w-full min-w-[980px] text-[14px]">
            <thead><tr className="bg-[#F5F8FD] text-[#3A4A66] text-[13px] font-black">
              {["직원", "근무일", "연장·야간·휴일(h)", "지급 총액", "4대보험", "소득세·지방세", "공제 총액", "실지급", "회사 부담", ""].map((h, i) => <th key={i} className={`px-3 py-2.5 ${i >= 3 && i <= 8 ? "text-right" : "text-left"}`}>{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-[#EEF1F6]">
              {rows.map((r) => {
                const x = r.result; const d = (k) => (x?.deductions || []).filter((y) => k.includes(y.key)).reduce((s, y) => s + y.amount, 0);
                return (
                  <tr key={r.u.id} className="hover:bg-[#F8FAFD]">
                    <td className="px-3 py-2.5"><div className="font-black text-[15px] text-[#0F1A30]">{personName(r.u) || r.u.name}</div><div className="text-[12.5px] text-[#7A879C]">{[r.u.team, r.u.position].filter(Boolean).join(" · ") || "-"}{r.emp?.payType === "hourly" ? " · 시급제" : ""}</div></td>
                    {x ? <>
                      <td className="px-3 py-2.5 font-black" style={NUMS}>{x.work?.workDays || 0}일</td>
                      <td className="px-3 py-2.5 font-bold text-[#3A4A66]" style={NUMS}>{x.work?.otHours || 0} · {x.work?.nightHours || 0} · {(x.work?.holHours || 0) + (x.work?.holOverHours || 0)}</td>
                      <td className="px-3 py-2.5 text-right font-black" style={NUMS}>{wonFmt(x.gross)}</td>
                      <td className="px-3 py-2.5 text-right font-bold" style={NUMS}>{wonFmt(d(["np", "hi", "ltc", "ei"]))}</td>
                      <td className="px-3 py-2.5 text-right font-bold" style={NUMS}>{wonFmt(d(["tax", "local"]))}{x.taxMode !== "auto" && <span className="ml-1 text-[11px] font-black text-[#2D4C82]">직접</span>}</td>
                      <td className="px-3 py-2.5 text-right font-black" style={NUMS}>{wonFmt(x.totalDeduct)}</td>
                      <td className="px-3 py-2.5 text-right font-black text-[16px] text-[#0F1A30]" style={NUMS}>{wonFmt(x.net)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-[#5B6B85]" style={NUMS}>{wonFmt(x.employer?.total)}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {locked ? (r.slip && <button type="button" onClick={() => setView(r.slip)} className="h-9 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[13px] font-black text-[#1B2B4B]">명세서</button>)
                          : <button type="button" onClick={() => setEdit(r.u.id)} className="h-9 px-3 rounded-lg bg-[#0F1A30] text-white text-[13px] font-black" data-testid="payroll-edit">{ro ? "보기" : "수정"}</button>}
                        {x.warnings?.some((w) => /최저/.test(w)) && <span className="ml-1 text-[12px] font-black text-[#B42318]" title={x.warnings.join("\n")}>!</span>}
                      </td>
                    </> : <td colSpan={9} className="px-3 py-2.5"><button type="button" onClick={onGoEmp} className="h-9 px-3 rounded-lg bg-[#FFF4E5] text-[#B54708] text-[13px] font-black">급여 설정 필요 — 직원 급여 설정으로</button></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-4 py-2.5 text-[12.5px] text-[#5B6B85] leading-relaxed">
        ■ 소득세는 <b className="text-[#0F1A30]">{TAX_NOTE}</b>입니다. 직원별 [고정 세액] 또는 명세서별 [소득세 직접 입력]으로 국세청 간이세액표 금액을 넣을 수 있습니다.
        ■ 시간은 출근기록부(출근·퇴근 시각, 휴게 4h↑30분·8h↑1시간 공제, 평일 8시간 초과 = 연장, 22~06시 = 야간, 주말·공휴일 = 휴일)에서 자동 계산되며 직접 고칠 수 있습니다.
        {run?.log?.length > 0 && <> ■ 처리 기록: {run.log.slice(-3).map((l) => `${new Date(l.at).toLocaleString("ko-KR")} ${l.action}${l.detail ? `(${l.detail})` : ""}`).join(" · ")}</>}
      </div>
      {cur && <SlipEditor company={company} ym={ym} row={cur} rates={rates} ro={ro || locked} onClose={() => setEdit(null)} slipDoc={slipDoc} />}
      {view && (
        <Sheet side en={`PAYSLIP · ${view.ym}`} title={`${view.name} 급여명세서`} onClose={() => setView(null)}
          footer={<><button type="button" onClick={() => setView(null)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">닫기</button><button type="button" onClick={() => printPayslips([view], company)} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black">인쇄 · PDF 저장</button></>}>
          <PayslipView slip={view} company={company} />
        </Sheet>
      )}
    </div>
  );
}

// 한 사람 이번 달 입력(시간 수정·상여·기타 지급/공제·세액 직접)
function SlipEditor({ company, ym, row, rates, ro, onClose, slipDoc }) {
  const [f, setF] = React.useState(() => ({ ...row.input }));
  const [busy, setBusy] = React.useState(false);
  const a = row.att || {};
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const pick = (k) => (f[k] !== undefined && f[k] !== "" && f[k] !== null ? toNum(f[k]) : a[k] || 0);
  const result = row.emp ? calcPayslip(row.emp, {
    workDays: pick("workDays"), regularHours: pick("regularHours"), otHours: pick("otHours"), nightHours: pick("nightHours"), holHours: pick("holHours"), holOverHours: pick("holOverHours"),
    weeklyHolidayHours: toNum(f.weeklyHolidayHours), bonus: toNum(f.bonus), extraPays: f.extraPays || [], extraDeducts: f.extraDeducts || [], taxOverride: f.taxOverride, localTaxOverride: f.localTaxOverride,
  }, rates) : row.result;
  const save = async () => {
    setBusy(true);
    try { await setDoc(doc(db, "payslips", slipId(company, ym, row.u.id)), slipDoc({ ...row, input: f, result }, { status: "draft", published: false }), { merge: true }); onClose(); } catch (e) { alert(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const list = (k, label) => (
    <div>
      <Label hint="이번 달만">{label}</Label>
      {(f[k] || []).map((x, i) => (
        <div key={i} className="flex gap-1.5 mb-1.5">
          <input disabled={ro} value={x.label || ""} onChange={(e) => set(k, (f[k] || []).map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} className={inp} placeholder="항목 이름" />
          <input disabled={ro} inputMode="numeric" value={x.amount ? wonFmt(x.amount) : ""} onChange={(e) => set(k, (f[k] || []).map((y, j) => (j === i ? { ...y, amount: toNum(e.target.value) } : y)))} className={`${numInp} w-[140px] shrink-0`} style={NUMS} placeholder="금액" />
          {k === "extraPays" && <button type="button" disabled={ro} onClick={() => set(k, (f[k] || []).map((y, j) => (j === i ? { ...y, taxable: y.taxable === false } : y)))} className="h-11 px-2.5 rounded-xl border border-[#DCE3EE] bg-white text-[12.5px] font-black text-[#3A4A66] shrink-0 whitespace-nowrap">{x.taxable === false ? "비과세" : "과세"}</button>}
          {!ro && <button type="button" onClick={() => set(k, (f[k] || []).filter((_, j) => j !== i))} className="h-11 w-11 rounded-xl border border-[#DCE3EE] bg-white text-[#B42318] shrink-0">✕</button>}
        </div>
      ))}
      {!ro && <button type="button" onClick={() => set(k, [...(f[k] || []), { label: "", amount: 0 }])} className="h-9 px-3 rounded-lg border border-dashed border-[#9AA9C3] text-[13px] font-black text-[#2D4C82]">+ 항목 추가</button>}
    </div>
  );
  const hourField = (k, label) => (
    <div><Label hint={`출근기록 ${a[k] ?? 0}`}>{label}</Label><input disabled={ro} inputMode="decimal" value={f[k] ?? ""} onChange={(e) => set(k, e.target.value.replace(/[^\d.]/g, ""))} placeholder={String(a[k] ?? 0)} className={numInp} style={NUMS} /></div>
  );
  const slipPreview = { ...slipDoc({ ...row, input: f, result }), result, ym, rates };
  return (
    <Sheet side en={`PAYROLL · ${ym}`} title={`${personName(row.u) || row.u.name} · 이번 달 급여`} onClose={onClose}
      footer={<><button type="button" onClick={onClose} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">닫기</button>{!ro && <button type="button" disabled={busy} onClick={save} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50" data-testid="slip-save">{busy ? "저장 중…" : `저장 · 실지급 ${wonFmt(result?.net)}원`}</button>}</>}>
      <BookCard en="HOURS" title="근무 시간 (비우면 출근기록부 값)" right={a.missing ? <span className="text-[12.5px] font-black text-[#B54708]">퇴근 누락 {a.missing}일 — 정상 8시간으로 봄</span> : null}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
          {hourField("workDays", "근로일수")}
          {row.emp?.payType === "hourly" && hourField("regularHours", "정상 근로시간")}
          {hourField("otHours", "연장근로(h)")}
          {hourField("nightHours", "야간근로(h)")}
          {hourField("holHours", "휴일근로 8h 이내")}
          {hourField("holOverHours", "휴일근로 8h 초과")}
          {row.emp?.payType === "hourly" && <div><Label hint="주 15h 이상">주휴시간</Label><input disabled={ro} inputMode="decimal" value={f.weeklyHolidayHours ?? ""} onChange={(e) => set("weeklyHolidayHours", e.target.value.replace(/[^\d.]/g, ""))} className={numInp} style={NUMS} /></div>}
        </div>
      </BookCard>
      <BookCard en="PAY · DEDUCT" title="이번 달 추가 지급 · 공제 · 세액">
        <div className="space-y-3">
          <div><Label>상여금</Label><input disabled={ro} inputMode="numeric" value={f.bonus ? wonFmt(f.bonus) : ""} onChange={(e) => set("bonus", toNum(e.target.value))} className={numInp} style={NUMS} /></div>
          {list("extraPays", "기타 지급")}
          {list("extraDeducts", "기타 공제 (가불금·경조회비 등)")}
          <div className="grid grid-cols-2 gap-2.5">
            <div><Label hint={`자동 ${wonFmt(result?.autoTax)}`}>소득세 직접 입력</Label><input disabled={ro} inputMode="numeric" value={f.taxOverride ?? ""} onChange={(e) => set("taxOverride", e.target.value.replace(/[^\d]/g, ""))} placeholder="비우면 자동" className={numInp} style={NUMS} /></div>
            <div><Label hint="비우면 소득세 10%">지방소득세 직접 입력</Label><input disabled={ro} inputMode="numeric" value={f.localTaxOverride ?? ""} onChange={(e) => set("localTaxOverride", e.target.value.replace(/[^\d]/g, ""))} placeholder="비우면 자동" className={numInp} style={NUMS} /></div>
          </div>
          <div className="rounded-xl bg-[#FFF4E5] border border-[#FEDF89] px-3 py-2 text-[12.5px] font-bold text-[#B54708]">{TAX_NOTE}</div>
          <div><Label>비고(명세서에 표시)</Label><input disabled={ro} value={f.memo || ""} onChange={(e) => set("memo", e.target.value)} className={inp} /></div>
        </div>
      </BookCard>
      {result?.warnings?.filter((w) => !/간이세액/.test(w)).map((w) => <div key={w} className="rounded-xl bg-[#FEF3F2] border border-[#FECDCA] px-3 py-2 text-[13px] font-bold text-[#B42318]">{w}</div>)}
      {result && <PayslipView slip={slipPreview} company={company} />}
      {result && <div className="rounded-xl bg-white border border-[#E3E8F0] px-4 py-3 text-[13.5px] text-[#3A4A66]">회사 부담(참고): 국민연금 <b style={NUMS}>{wonFmt(result.employer.np)}</b> · 건강 <b style={NUMS}>{wonFmt(result.employer.hi)}</b> · 장기요양 <b style={NUMS}>{wonFmt(result.employer.ltc)}</b> · 고용 <b style={NUMS}>{wonFmt(result.employer.ei)}</b> · 산재 <b style={NUMS}>{wonFmt(result.employer.ia)}</b> = <b className="text-[#0F1A30]" style={NUMS}>{wonFmt(result.employer.total)}원</b> · 인건비 합계 <b className="text-[#0F1A30]" style={NUMS}>{wonFmt(result.costTotal)}원</b></div>}
    </Sheet>
  );
}

// ── 직원 급여 설정 ──
const EMP_BLANK = { payType: "monthly", baseMonthly: 0, hourlyWage: 0, meal: 200000, car: 0, positionAllow: 0, allowances: [], dependents: 1, children: 0, taxRatePct: 100, taxFixed: "", npBase: "", hiBase: "", npExempt: false, hiExempt: false, eiExempt: false, mealOrdinary: false, memo: "" };
function PayEmployees({ company, ro }) {
  const staff = useStaff(company);
  const emps = useCol("payrollEmployees", company);
  const settings = usePayrollSettings(company);
  const rates = ratesFor(settings || {}, Number(kstYm().slice(0, 4)));
  const map = Object.fromEntries((emps || []).map((e) => [e.uid, e]));
  const [sel, setSel] = React.useState(null);
  const [f, setF] = React.useState(null);
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const list = (staff || []).filter((u) => u.employmentStatus !== "퇴사" || map[u.id]).filter((u) => !q.trim() || [u.name, u.team, u.position].some((v) => String(v || "").includes(q.trim())))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko"));
  const open = (u) => { setSel(u); setF({ ...EMP_BLANK, ...(map[u.id] || {}) }); };
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (f.payType === "monthly" && !toNum(f.baseMonthly)) return alert("월 기본급을 입력해 주세요.");
    if (f.payType === "hourly" && !toNum(f.hourlyWage)) return alert("시급을 입력해 주세요.");
    setBusy(true);
    try {
      const clean = { ...f, baseMonthly: toNum(f.baseMonthly), hourlyWage: toNum(f.hourlyWage), meal: toNum(f.meal), car: toNum(f.car), positionAllow: toNum(f.positionAllow), dependents: Math.max(1, toNum(f.dependents) || 1), children: toNum(f.children), taxRatePct: toNum(f.taxRatePct) || 100,
        allowances: (f.allowances || []).filter((x) => x.label || toNum(x.amount)).map((x) => ({ label: x.label || "기타수당", amount: toNum(x.amount), taxable: x.taxable !== false, ordinary: x.ordinary !== false })) };
      delete clean.id;
      await setDoc(doc(db, "payrollEmployees", empId(company, sel.id)), { ...clean, companyName: company, uid: sel.id, name: personName(sel) || sel.name || "", updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || "" }, { merge: true });
      setSel(null);
    } catch (e) { alert(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const preview = f ? calcPayslip(f, { regularHours: f.payType === "hourly" ? rates.monthlyHours : 0 }, rates) : null;
  const money = (k, label, hint) => <div><Label hint={hint}>{label}</Label><input disabled={ro} inputMode="numeric" value={toNum(f[k]) ? wonFmt(f[k]) : ""} onChange={(e) => set(k, toNum(e.target.value))} className={numInp} style={NUMS} placeholder="0" /></div>;
  const toggle = (k, label) => <button type="button" disabled={ro} onClick={() => set(k, !f[k])} className={`h-10 px-3 rounded-xl border text-[13.5px] font-black ${f[k] ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3A4A66] border-[#DCE3EE]"}`}>{f[k] ? "✓ " : ""}{label}</button>;
  return (
    <div className="space-y-3">
      <BookHero en="PAYROLL · EMPLOYEES" title="직원 급여 설정" desc="월급제·시급제 · 비과세 수당 · 부양가족(소득세) · 4대보험 적용 — 한 번 정해 두면 매달 그대로 계산합니다"
        kpis={[["직원", `${list.length}명`], ["설정 완료", `${list.filter((u) => map[u.id]).length}명`], ["설정 필요", `${list.filter((u) => !map[u.id]).length}명`]]} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·부서 검색" className={inp} />
      <div className="rounded-[20px] bg-white border border-[#E3E8F0] divide-y divide-[#EEF1F6] overflow-hidden">
        {staff === null ? <div className="py-12 text-center text-[14px] font-bold text-[#9AA9C3]">불러오는 중…</div> : !list.length ? <div className="py-12 text-center text-[14px] font-bold text-[#9AA9C3]">직원이 없습니다</div> : list.map((u) => {
          const e = map[u.id];
          return (
            <button key={u.id} type="button" onClick={() => open(u)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[#F8FAFD]" data-testid="payemp-row">
              <span className="w-10 h-10 rounded-xl bg-[#1B2B4B] text-white grid place-items-center text-[15px] font-black shrink-0">{String(u.name || "?").slice(0, 1)}</span>
              <span className="flex-1 min-w-0"><span className="block text-[15.5px] font-black text-[#0F1A30] truncate">{personName(u) || u.name}</span><span className="block text-[13px] text-[#5B6B85] truncate">{[u.team, u.position].filter(Boolean).join(" · ") || "-"}</span></span>
              {e ? <span className="text-right"><span className="block text-[16px] font-black text-[#0F1A30]" style={NUMS}>{e.payType === "hourly" ? `시급 ${wonFmt(e.hourlyWage)}` : wonFmt(e.baseMonthly)}원</span><span className="block text-[12.5px] font-bold text-[#7A879C]">부양 {e.dependents || 1}명{e.children ? ` · 자녀 ${e.children}` : ""}{e.taxFixed !== "" && e.taxFixed !== undefined ? " · 고정 세액" : ""}</span></span>
                : <span className="h-8 px-3 rounded-lg bg-[#FFF4E5] text-[#B54708] text-[13px] font-black inline-flex items-center">설정 필요</span>}
            </button>
          );
        })}
      </div>
      {sel && f && (
        <Sheet side en="PAYROLL · EMPLOYEE" title={`${personName(sel) || sel.name} 급여 설정`} onClose={() => setSel(null)}
          footer={<><button type="button" onClick={() => setSel(null)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">닫기</button>{!ro && <button type="button" disabled={busy} onClick={save} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50" data-testid="payemp-save">{busy ? "저장 중…" : "저장"}</button>}</>}>
          <BookCard en="BASE PAY" title="기본 급여">
            <div className="flex gap-1.5 mb-3">{[["monthly", "월급제"], ["hourly", "시급제"]].map(([k, l]) => <Chip key={k} on={f.payType === k} onClick={() => !ro && set("payType", k)}>{l}</Chip>)}</div>
            <div className="grid grid-cols-2 gap-2.5">
              {f.payType === "hourly" ? money("hourlyWage", "시급", `최저 ${wonFmt(rates.minWage)}원`) : money("baseMonthly", "월 기본급")}
              {money("positionAllow", "직책수당", "통상임금 포함")}
              {money("meal", "식대", `비과세 월 ${wonFmt(rates.mealExempt)}원까지`)}
              {money("car", "자가운전보조금", `비과세 월 ${wonFmt(rates.carExempt)}원까지`)}
            </div>
          </BookCard>
          <BookCard en="ALLOWANCES" title="기타 고정 수당">
            {(f.allowances || []).map((x, i) => (
              <div key={i} className="flex gap-1.5 mb-1.5 flex-wrap">
                <input disabled={ro} value={x.label || ""} onChange={(e) => set("allowances", f.allowances.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} className={`${inp} flex-1 min-w-[120px]`} placeholder="수당 이름(예: 자격수당)" />
                <input disabled={ro} inputMode="numeric" value={x.amount ? wonFmt(x.amount) : ""} onChange={(e) => set("allowances", f.allowances.map((y, j) => (j === i ? { ...y, amount: toNum(e.target.value) } : y)))} className={`${numInp} w-[130px]`} style={NUMS} placeholder="금액" />
                <button type="button" disabled={ro} onClick={() => set("allowances", f.allowances.map((y, j) => (j === i ? { ...y, taxable: y.taxable === false } : y)))} className="h-11 px-2.5 rounded-xl border border-[#DCE3EE] bg-white text-[12.5px] font-black text-[#3A4A66]">{x.taxable === false ? "비과세" : "과세"}</button>
                <button type="button" disabled={ro} onClick={() => set("allowances", f.allowances.map((y, j) => (j === i ? { ...y, ordinary: y.ordinary === false } : y)))} className="h-11 px-2.5 rounded-xl border border-[#DCE3EE] bg-white text-[12.5px] font-black text-[#3A4A66]">{x.ordinary === false ? "통상임금 제외" : "통상임금 포함"}</button>
                {!ro && <button type="button" onClick={() => set("allowances", f.allowances.filter((_, j) => j !== i))} className="h-11 w-11 rounded-xl border border-[#DCE3EE] bg-white text-[#B42318]">✕</button>}
              </div>
            ))}
            {!ro && <button type="button" onClick={() => set("allowances", [...(f.allowances || []), { label: "", amount: 0, taxable: true, ordinary: true }])} className="h-9 px-3 rounded-lg border border-dashed border-[#9AA9C3] text-[13px] font-black text-[#2D4C82]">+ 수당 추가</button>}
            <div className="mt-2">{toggle("mealOrdinary", "식대를 통상임금에 포함")}</div>
          </BookCard>
          <BookCard en="INCOME TAX" title="소득세(간이세액)">
            <div className="grid grid-cols-2 gap-2.5">
              <div><Label hint="본인 포함">공제대상 가족 수</Label><input disabled={ro} inputMode="numeric" value={f.dependents} onChange={(e) => set("dependents", e.target.value.replace(/[^\d]/g, ""))} className={numInp} style={NUMS} /></div>
              <div><Label hint="8세 이상 20세 이하">자녀 수</Label><input disabled={ro} inputMode="numeric" value={f.children} onChange={(e) => set("children", e.target.value.replace(/[^\d]/g, ""))} className={numInp} style={NUMS} /></div>
            </div>
            <div className="mt-2.5"><Label hint="근로자 선택(원천징수 비율)">세액 비율</Label><div className="flex gap-1.5">{[80, 100, 120].map((p) => <Chip key={p} on={Number(f.taxRatePct || 100) === p} onClick={() => !ro && set("taxRatePct", p)}>{p}%</Chip>)}</div></div>
            <div className="mt-2.5"><Label hint="간이세액표 금액을 직접 넣으면 그 값으로">고정 세액(월)</Label><input disabled={ro} inputMode="numeric" value={f.taxFixed ?? ""} onChange={(e) => set("taxFixed", e.target.value.replace(/[^\d]/g, ""))} placeholder="비우면 자동 계산(근사치)" className={numInp} style={NUMS} /></div>
            <div className="mt-2 rounded-xl bg-[#FFF4E5] border border-[#FEDF89] px-3 py-2 text-[12.5px] font-bold text-[#B54708]">{TAX_NOTE}</div>
          </BookCard>
          <BookCard en="SOCIAL INSURANCE" title="4대보험">
            <div className="grid grid-cols-2 gap-2.5">
              <div><Label hint="비우면 이번 달 과세급여">국민연금 기준소득월액</Label><input disabled={ro} inputMode="numeric" value={f.npBase ? wonFmt(f.npBase) : ""} onChange={(e) => set("npBase", toNum(e.target.value) || "")} className={numInp} style={NUMS} /></div>
              <div><Label hint="비우면 이번 달 과세급여">건강보험 보수월액</Label><input disabled={ro} inputMode="numeric" value={f.hiBase ? wonFmt(f.hiBase) : ""} onChange={(e) => set("hiBase", toNum(e.target.value) || "")} className={numInp} style={NUMS} /></div>
            </div>
            <div className="mt-2.5 flex gap-1.5 flex-wrap">{toggle("npExempt", "국민연금 제외(만 60세 이상 등)")}{toggle("hiExempt", "건강·장기요양 제외")}{toggle("eiExempt", "고용보험 제외(만 65세 이후 신규 등)")}</div>
          </BookCard>
          {preview && <div className="rounded-2xl bg-[#0F1A30] text-white px-4 py-3 flex items-center gap-3 flex-wrap"><span className="text-[13px] font-bold text-white/60">추가 근무 없는 달 기준</span><span className="text-[14px] font-bold">지급 <b style={NUMS}>{wonFmt(preview.gross)}</b> − 공제 <b style={NUMS}>{wonFmt(preview.totalDeduct)}</b></span><span className="ml-auto text-[19px] font-black" style={NUMS}>실지급 {wonFmt(preview.net)}원</span></div>}
        </Sheet>
      )}
    </div>
  );
}

// ── 요율 · 설정 ──
function PayRates({ company, ro }) {
  const settings = usePayrollSettings(company);
  const [year, setYear] = React.useState(() => Number(kstYm().slice(0, 4)));
  const [f, setF] = React.useState(null);
  const [opt, setOpt] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (settings !== undefined) { setF(ratesFor(settings || {}, year)); setOpt({ small: !!settings?.small, payDay: settings?.payDay ?? 10, payNextMonth: settings?.payNextMonth !== false, ledgerOn: settings?.ledgerOn !== false }); } }, [settings, year]);
  if (!f || !opt) return <div className="py-16 text-center text-[14px] font-bold text-[#9AA9C3]">불러오는 중…</div>;
  const save = async () => {
    setBusy(true);
    try {
      const vals = Object.fromEntries(RATE_FIELDS.map(([k]) => [k, toNum(f[k])]));
      await setDoc(doc(db, "payrollSettings", company), { companyName: company, years: { [year]: { ...vals, small: !!opt.small } }, small: !!opt.small, payDay: toNum(opt.payDay) || 10, payNextMonth: !!opt.payNextMonth, ledgerOn: !!opt.ledgerOn, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || "" }, { merge: true });
      alert("저장했습니다.");
    } catch (e) { alert(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const p = presetFor(year);
  return (
    <div className="space-y-3">
      <BookHero en={`PAYROLL · RATES · ${year}`} title="요율 · 급여 설정" desc="4대보험 요율·상하한·비과세 한도·가산율은 연도별로 저장됩니다 — 처음 값은 그 해 법정 요율"
        right={<div className="flex gap-1.5">{[year - 1, year, year + 1].filter((y) => y >= 2025).map((y) => <button key={y} type="button" onClick={() => setYear(y)} className={`h-10 px-3.5 rounded-xl text-[14px] font-black ${y === year ? "bg-white text-[#0F1A30]" : "bg-white/10 border border-white/20"}`} style={NUMS}>{y}</button>)}</div>} />
      <BookCard en="RATES" title={`${year}년 요율`} right={!ro && <button type="button" onClick={() => setF({ ...presetFor(year) })} className="h-9 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[13px] font-black text-[#1B2B4B]">법정 기본값으로</button>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {RATE_FIELDS.map(([k, label, unit, hint]) => (
            <div key={k}>
              <Label hint={hint}>{label}</Label>
              <div className="relative"><input disabled={ro} inputMode="decimal" value={unit === "원" ? (toNum(f[k]) ? wonFmt(f[k]) : "") : (f[k] ?? "")} onChange={(e) => setF((x) => ({ ...x, [k]: unit === "원" ? toNum(e.target.value) : e.target.value.replace(/[^\d.]/g, "") }))} className={`${numInp} pr-12`} style={NUMS} data-testid={`rate-${k}`} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-black text-[#8A97AD]">{unit}</span></div>
              {String(p[k]) !== String(f[k]) && <div className="mt-1 text-[12px] font-bold text-[#2D4C82]">법정 기본 {unit === "원" ? wonFmt(p[k]) : p[k]}{unit}</div>}
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3 py-2 text-[12.5px] text-[#5B6B85] leading-relaxed">
          2026년 처음 값: 국민연금 9.5%(근로자 4.75% — 연금개혁으로 2026년부터 매년 0.5%p 인상) · 건강보험 7.19%(근로자 3.595%) · 장기요양 = 건강보험료 × 13.14% · 고용보험 근로자 0.9% · 최저시급 10,320원.
          고시가 바뀌면 여기서 고치면 됩니다(확정된 달은 확정할 때의 요율이 그대로 남습니다).
        </div>
      </BookCard>
      <BookCard en="OPTIONS" title="급여 설정">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><Label hint="매월">급여 지급일</Label><div className="flex gap-1.5 items-center"><button type="button" disabled={ro} onClick={() => setOpt((o) => ({ ...o, payNextMonth: !o.payNextMonth }))} className="h-11 px-3 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-black text-[#1B2B4B] whitespace-nowrap">{opt.payNextMonth ? "다음 달" : "그 달"}</button><input disabled={ro} inputMode="numeric" value={opt.payDay} onChange={(e) => setOpt((o) => ({ ...o, payDay: e.target.value.replace(/[^\d]/g, "") }))} className={numInp} style={NUMS} /><span className="text-[14px] font-black text-[#3A4A66]">일</span></div></div>
          <div><Label>사업장 규모</Label><div className="flex gap-1.5"><Chip on={!opt.small} onClick={() => !ro && setOpt((o) => ({ ...o, small: false }))}>상시 5인 이상</Chip><Chip on={opt.small} onClick={() => !ro && setOpt((o) => ({ ...o, small: true }))}>5인 미만(가산수당 없음)</Chip></div></div>
          <div className="md:col-span-2"><Label>장부 연동</Label><Chip on={opt.ledgerOn} onClick={() => !ro && setOpt((o) => ({ ...o, ledgerOn: !o.ledgerOn }))}>{opt.ledgerOn ? "✓ " : ""}지급 처리하면 수입·지출 장부에 "급여·상여" 지출 자동 기록</Chip></div>
        </div>
      </BookCard>
      {!ro && <button type="button" disabled={busy} onClick={save} className="w-full h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50" data-testid="rates-save">{busy ? "저장 중…" : `${year}년 요율 · 설정 저장`}</button>}
    </div>
  );
}

// ═════════════════ 내 급여명세서(직원 본인 — 발행된 것만) ═════════════════
export function MyPayslips({ company, uid: uidIn }) {
  const uid = uidIn || auth.currentUser?.uid || "";
  const [rows, setRows] = React.useState(null);
  const [sel, setSel] = React.useState(null);
  React.useEffect(() => {
    if (!uid) { setRows([]); return undefined; }
    return onSnapshot(query(collection(db, "payslips"), where("uid", "==", uid), where("published", "==", true)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.ym).localeCompare(String(a.ym)))), () => setRows([]));
  }, [uid]);
  const cur = rows?.find((r) => r.id === sel) || rows?.[0] || null;
  React.useEffect(() => { if (cur && !cur.readAt && uid && cur.uid === uid) updateDoc(doc(db, "payslips", cur.id), { readAt: Date.now() }).catch(() => {}); }, [cur, uid]);
  const year = cur?.ym?.slice(0, 4);
  const yearRows = (rows || []).filter((r) => r.ym?.startsWith(year || ""));
  return (
    <div className="space-y-3" data-testid="my-payslips">
      <BookHero en="MY · PAYSLIP" title="급여명세서" desc="회사가 발행한 본인 급여명세서만 보입니다 · 인쇄하거나 PDF로 저장할 수 있습니다"
        kpis={cur ? [["최근 실수령액", `${wonFmt(cur.result?.net)}원`, ymLabel(cur.ym)], [`${year}년 지급 총액`, `${wonFmt(yearRows.reduce((s, r) => s + (r.result?.gross || 0), 0))}원`], [`${year}년 실수령 합계`, `${wonFmt(yearRows.reduce((s, r) => s + (r.result?.net || 0), 0))}원`]] : []} />
      {rows === null ? <div className="py-16 text-center text-[14px] font-bold text-[#9AA9C3]">불러오는 중…</div> : !rows.length ? (
        <div className="rounded-2xl bg-white border border-[#E3E8F0] py-16 text-center text-[15px] font-bold text-[#7A879C]">아직 발행된 급여명세서가 없습니다</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-3 items-start">
          <div className="rounded-[20px] bg-white border border-[#E3E8F0] overflow-hidden flex lg:block overflow-x-auto">
            {rows.map((r) => (
              <button key={r.id} type="button" onClick={() => setSel(r.id)} className={`shrink-0 lg:w-full text-left px-4 py-3 border-b border-[#EEF1F6] ${cur?.id === r.id ? "bg-[#F2F6FD] shadow-[inset_3px_0_0_#1B2B4B]" : ""}`}>
                <div className="text-[15px] font-black text-[#0F1A30] whitespace-nowrap">{ymLabel(r.ym)}{!r.readAt && <span className="ml-1.5 text-[11px] font-black px-1.5 py-0.5 rounded bg-[#FF3B30] text-white">N</span>}</div>
                <div className="text-[14px] font-black text-[#2D4C82] whitespace-nowrap" style={NUMS}>{wonFmt(r.result?.net)}원</div>
              </button>
            ))}
          </div>
          {cur && (
            <div className="space-y-2 min-w-0">
              <div className="flex justify-end"><button type="button" onClick={() => printPayslips([cur], company || cur.companyName)} className="h-10 px-4 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black">인쇄 · PDF 저장</button></div>
              <div className="rounded-[20px] bg-white border border-[#E3E8F0] p-3 md:p-5 overflow-x-auto"><PayslipView slip={cur} company={company || cur.companyName} /></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
