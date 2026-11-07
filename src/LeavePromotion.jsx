// ======================= src/LeavePromotion.jsx =======================
// ⭐ 2026-11-06 연차 사용 촉진(근로기준법 제61조) — 인사 화면(촉진 대상 · 1차/2차 발송 · 사용 계획 · 날짜 지정 · 발송 기록) + 직원 본인 [사용 계획 제출]
//  · 회기: 입사일 기준 또는 회계연도 기준(payrollSettings/{회사}.leave = { basis: "hire"|"fiscal", fiscalStart: "MM-DD", autoSend, email })
//  · 1차: 회기 종료 6개월 전(1년 미만 월차는 3개월 전) — 직원은 10일 안에 사용 계획 제출
//  · 2차: 1차 계획 제출 기한(10일)이 지나면 ~ 회기 종료 2개월 전(월차 1개월 전)까지 — 계획을 안 낸 직원에게 회사가 사용 시기를 지정해 서면 통보
//  · 매일 아침 서버(functions leavePromotionDaily)가 자동 발송, 이 화면에서 직접 발송·재발송·날짜 지정도 가능
//  · 모든 발송·제출은 leavePromotions/{회사}_{uid}_{회기 시작일}.log 에 시각과 함께 쌓이고(지울 수 없음 — 보안 규칙), 서면 통보서 인쇄 가능
//  ⭐ 2026-11-06 화면 다듬기 — 노란 표시 제거(네이비 팔레트) · 글자 14px 이상
import React from "react";
import { addDoc, arrayUnion, collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db, auth, DEFAULT_COMPANY } from "./firebase";
import { BookHero, BookCard, Chip, Sheet, MONO } from "./OfficeBooks";
import { isTMUser } from "./staffFilter";
import { personName } from "./userNames";
import { leaveUseOf } from "./approvalForms";
import { leavePeriodOf, promoteSchedule, promoteStageDue, addDaysStr, dayDiffStr } from "./payrollCalc";
import { leaveManagerOf } from "./payrollAccess";
import { mirrorLeaveBasis } from "./leaveBasis"; // ⭐ 2026-11-07 회기 기준 공용
import { sendInternalMail } from "./InternalMail";
import CustomDatePicker from "./CustomDatePicker";

const safeId = (s) => String(s || "").replace(/[/\s#?[\]]/g, "_").slice(0, 80); // Payroll.jsx와 같은 규칙
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const NUMS = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };
const inp = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";
const fmtAt = (ms) => (ms ? new Date(ms).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const promoId = (co, uid, from) => `${safeId(co)}_${uid}_${from}`;
const realEmail = (u) => { const e = String(u?.email || "").trim(); return e && /@/.test(e) && !/@driver\.run25\.kr$/i.test(e) && !u?.noAccount ? e : ""; };

export function promoteText(kind, { name, label = "연차", from, to, remain, due, dates = [], company }) {
  if (kind === "n1") return {
    subject: `[연차 사용 촉진 1차] 미사용 ${label} ${remain}일 — ${due}까지 사용 계획을 알려 주세요`,
    body: `${name}님, ${label} 사용 기간(${from} ~ ${to}) 중 사용하지 않은 ${label}가 ${remain}일 남아 있습니다.\n\n근로기준법 제61조에 따라 이 통보를 받은 날부터 10일 이내(${due}까지) 남은 ${label}의 사용 시기를 정하여 회사에 알려 주시기 바랍니다.\n앱 알림의 [사용 계획 제출] 또는 내정보 › 연차 사용 계획에서 날짜를 골라 제출할 수 있습니다.\n\n기한까지 사용 시기를 알리지 않으면 회사가 사용 시기를 정하여 서면으로 통보(2차)하며, 이 절차에 따라 사용하지 않은 ${label}에 대해서는 미사용 수당 지급 의무가 없을 수 있습니다.\n\n${company} 인사관리부`,
  };
  return {
    subject: `[연차 사용 촉진 2차] 미사용 ${label} ${remain}일 사용 시기 ${dates.length ? "지정 통보" : "지정 예정 안내"}`,
    body: `${name}님, ${label} 사용 기간(${from} ~ ${to}) 종료가 다가오지만 사용하지 않은 ${label}가 ${remain}일 남아 있고 사용 계획이 제출되지 않았습니다.\n\n${dates.length ? `근로기준법 제61조에 따라 회사가 아래 날짜를 ${label} 사용일로 지정하여 통보합니다.\n· 지정일: ${dates.join(", ")}\n\n지정일에는 출근하지 않고 ${label}를 사용해 주시기 바랍니다.` : `근로기준법 제61조에 따라 회사가 남은 ${label}의 사용 시기를 지정하여 곧 다시 통보합니다. 그 전에 원하는 날짜가 있으면 [사용 계획 제출]로 알려 주세요.`}\n\n${company} 인사관리부`,
  };
}
// 서면 통보서 인쇄(법적 증빙 보관용)
export function printPromoteNotice(rec, kind, company) {
  const n = kind === "n1" ? rec.n1 : rec.n2;
  const t = promoteText(kind, { name: rec.name, label: rec.label, from: rec.periodFrom, to: rec.periodTo, remain: n?.remain ?? rec.remain, due: rec.n1?.due || "", dates: rec.designated?.dates || n?.dates || [], company });
  const w = window.open("", "_blank"); if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${kind === "n1" ? "연차 사용 촉진 통보서" : "연차 사용시기 지정 통보서"}</title><style>@page{size:A4;margin:22mm 20mm}body{font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#111}h1{text-align:center;letter-spacing:6px;font-size:24px;margin:24px 0}table{width:100%;border-collapse:collapse;font-size:14px}th,td{border:1px solid #333;padding:9px}th{width:120px;background:#f2f4f8}p{font-size:14.5px;line-height:1.9;white-space:pre-wrap}.sign{margin-top:40px;font-size:15px;line-height:2.2}</style></head><body>
<h1>${kind === "n1" ? "연차 유급휴가 사용 촉진 통보서" : "연차 유급휴가 사용시기 지정 통보서"}</h1>
<table><tr><th>성명</th><td>${esc(rec.name)}</td><th>구분</th><td>${esc(rec.label || "연차")}</td></tr><tr><th>사용 기간</th><td>${esc(rec.periodFrom)} ~ ${esc(rec.periodTo)}</td><th>미사용 일수</th><td>${esc(n?.remain ?? rec.remain)}일</td></tr><tr><th>통보 일시</th><td colspan="3">${esc(fmtAt(n?.sentAt))}</td></tr>${kind === "n1" ? `<tr><th>계획 제출 기한</th><td colspan="3">${esc(rec.n1?.due || "")}</td></tr>` : `<tr><th>지정일</th><td colspan="3">${esc((rec.designated?.dates || []).join(", ") || "-")}</td></tr>`}</table>
<p>${esc(t.body)}</p>
<div class="sign">회사: ${esc(company)} (인)<br/>수령 확인: ${esc(rec.name)} (서명)</div>
<script>setTimeout(()=>print(),300)</script></body></html>`);
  w.document.close();
}

function useLeaveSetting(company) {
  const [v, setV] = React.useState(undefined);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(doc(db, "payrollSettings", company), (s) => setV(s.exists() ? s.data().leave || {} : {}), () => setV({}));
  }, [company]);
  return v;
}
function useCompanyUsers(company) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "users"), where("companyName", "==", company)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => (u.companyName || DEFAULT_COMPANY) === company && !["driver", "shipper", "cafeUser", "totalMaster"].includes(u.role) && !isTMUser(u) && u.approved !== false)), () => setRows([]));
  }, [company]);
  return rows;
}

// 직원 한 명에게 1차/2차 통보 — 기록(log) · 앱 알림(hrNotices) · 사내메일(푸시) · (선택) 이메일
export async function sendPromote({ company, u, row, kind, dates = [], withEmail = false, byName = "" }) {
  const now = Date.now();
  const today = kstDay();
  const due = addDaysStr(today, 10);
  const by = auth.currentUser?.email || "";
  const email = withEmail ? realEmail(u) : "";
  const id = promoId(company, u.id, row.period.from);
  const name = personName(u) || u.name || "";
  const t = promoteText(kind, { name, label: row.period.label, from: row.period.from, to: row.period.to, remain: row.remain, due, dates, company });
  const channel = ["앱 알림", "사내메일", ...(email ? ["이메일"] : [])];
  await setDoc(doc(db, "leavePromotions", id), {
    companyName: company, uid: u.id, name, label: row.period.label, periodFrom: row.period.from, periodTo: row.period.to, total: row.total, used: row.used, remain: row.remain,
    [kind]: kind === "n1" ? { sentAt: now, by, byName, remain: row.remain, due, auto: false } : { sentAt: now, by, byName, remain: row.remain, dates, auto: false },
    ...(kind === "n2" && dates.length ? { designated: { dates, at: now, by, byName } } : {}),
    log: arrayUnion({ at: now, type: kind, by, byName, channel, remain: row.remain, ...(kind === "n1" ? { due } : { dates }) }),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await addDoc(collection(db, "hrNotices"), { companyName: company, uid: u.id, kind: kind === "n1" ? "leave1" : "leave2", link: "leavePlan", refId: id, title: t.subject, body: t.body, createdAt: serverTimestamp(), createdBy: by });
  await sendInternalMail({ company, to: [{ uid: u.id, name, team: u.team || "", position: u.position || "" }], subject: t.subject, body: t.body, kind: "hr", fromName: byName || "인사관리부", important: true }).catch(() => {});
  if (email) {
    await fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: email, subject: t.subject, html: `<div style="font-family:'Malgun Gothic',sans-serif;font-size:15px;line-height:1.8;white-space:pre-wrap">${esc(t.body)}</div>`, fromName: `${company} 인사관리부` }) }).catch(() => {});
  }
}

// ═════════════════ 인사 화면 — 연차 사용 촉진 ═════════════════
export default function LeavePromotionBoard({ company, canManage = false }) {
  const users = useCompanyUsers(company);
  const setting = useLeaveSetting(company);
  const [profiles, setProfiles] = React.useState({});
  const [apprs, setApprs] = React.useState([]);
  const [recs, setRecs] = React.useState(null);
  const [filter, setFilter] = React.useState("due");
  const [act, setAct] = React.useState(null); // { row, kind }
  const [logOf, setLogOf] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [cfg, setCfg] = React.useState(null);
  React.useEffect(() => onSnapshot(collection(db, "userProfiles"), (s) => { const m = {}; s.docs.forEach((d) => { m[d.id] = d.data(); }); setProfiles(m); }, () => setProfiles({})), []);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "approvals"), where("company", "==", company)), (s) => setApprs(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.cat === "leave" && d.status === "approved")), () => setApprs([]));
  }, [company]);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "leavePromotions"), where("companyName", "==", company)), (s) => setRecs(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRecs([]));
  }, [company]);
  React.useEffect(() => { if (setting !== undefined) setCfg({ basis: setting.basis || "hire", fiscalStart: setting.fiscalStart || "01-01", autoSend: setting.autoSend !== false, email: setting.email !== false }); }, [setting]);
  // ⭐ 2026-11-07 회기 기준을 직원이 읽는 곳(hrSettings.leaveBasis)에도 — 내정보 · 전자결재 연차 현황이 같은 회기로 계산
  React.useEffect(() => { if (setting !== undefined && canManage) mirrorLeaveBasis(company, setting); }, [setting, canManage, company]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = kstDay();
  const basisOpt = { basis: setting?.basis || "hire", fiscalStart: setting?.fiscalStart || "01-01" };
  const recMap = Object.fromEntries((recs || []).map((r) => [r.id, r]));
  const rows = (users || []).filter((u) => u.employmentStatus !== "퇴사").map((u) => {
    const hire = profiles[u.id]?.hireDate || u.hireDate || "";
    const period = leavePeriodOf(hire, today, basisOpt);
    if (!period) return { u, hire, period: null };
    const adj = (profiles[u.id]?.leaveAdjust || []).filter((x) => x.period === period.from).reduce((s, x) => s + (Number(x.days) || 0), 0);
    const used = apprs.filter((a) => a.drafterUid === u.id).map(leaveUseOf).filter((x) => x && x.date >= period.from && x.date <= period.to).reduce((s, x) => s + x.days, 0);
    const total = period.total + adj;
    const remain = Math.max(0, total - used);
    const sched = promoteSchedule(period);
    const rec = recMap[promoId(company, u.id, period.from)] || null;
    const stage = promoteStageDue(period, today, rec || {}, remain);
    const inWindow = remain > 0 && today >= sched.first && today <= period.to;
    const soon = remain > 0 && today < sched.first && dayDiffStr(today, sched.first) <= 30;
    return { u, hire, period, total, used, remain, sched, rec, stage, inWindow, soon };
  });
  const withP = rows.filter((r) => r.period);
  const shown = withP.filter((r) => (filter === "due" ? r.inWindow : filter === "soon" ? r.soon : filter === "plan" ? r.rec?.plan?.submittedAt : true))
    .sort((a, b) => (b.inWindow - a.inWindow) || String(a.sched.first).localeCompare(String(b.sched.first)));
  const kpi = {
    due: withP.filter((r) => r.inWindow).length,
    n1: withP.filter((r) => r.rec?.n1?.sentAt).length,
    plan: withP.filter((r) => r.rec?.plan?.submittedAt).length,
    need2: withP.filter((r) => r.inWindow && (today >= r.sched.second || (r.rec?.n1?.due && today > r.rec.n1.due)) && !(r.rec?.plan?.submittedAt) && !(r.rec?.designated?.dates || []).length).length,
  };
  const myDoc = (users || []).find((u) => u.id === auth.currentUser?.uid);
  const byName = personName(myDoc) || auth.currentUser?.email || "인사관리부";
  const saveCfg = async () => {
    setBusy(true);
    try { await setDoc(doc(db, "payrollSettings", company), { companyName: company, leave: { ...cfg }, leaveUpdatedAt: serverTimestamp(), leaveUpdatedBy: auth.currentUser?.email || "" }, { merge: true }); await mirrorLeaveBasis(company, cfg); alert("저장했습니다."); } catch (e) { alert(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3" data-testid="leave-promo">
      <BookHero en="HR · LEAVE PROMOTION" title="연차 사용 촉진" desc="근로기준법 제61조 — 1차(종료 6개월 전 · 10일 내 계획 제출) · 2차(계획 기한 지나면 · 종료 2개월 전까지 회사가 사용 시기 지정) · 발송 일시가 모두 기록됩니다"
        kpis={[["촉진 대상", `${kpi.due}명`, "1차 시기 진입 · 잔여 있음"], ["1차 발송", `${kpi.n1}명`], ["계획 제출", `${kpi.plan}명`], ["2차 지정 필요", `${kpi.need2}명`, "계획 미제출"]]} />
      {cfg && (
        <BookCard en="SETTINGS" title="회기 기준 · 자동 발송" right={canManage && <button type="button" disabled={busy} onClick={saveCfg} className="h-9 px-3.5 rounded-lg bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-50" data-testid="leave-cfg-save">저장</button>}>
          <div className="flex flex-wrap items-center gap-2">
            <Chip on={cfg.basis === "hire"} onClick={() => canManage && setCfg((c) => ({ ...c, basis: "hire" }))}>입사일 기준</Chip>
            <Chip on={cfg.basis === "fiscal"} onClick={() => canManage && setCfg((c) => ({ ...c, basis: "fiscal" }))}>회계연도 기준</Chip>
            {cfg.basis === "fiscal" && <span className="inline-flex items-center gap-1.5 text-[14px] font-black text-[#3A4A66]">시작일<input disabled={!canManage} value={cfg.fiscalStart} onChange={(e) => setCfg((c) => ({ ...c, fiscalStart: e.target.value.replace(/[^\d-]/g, "").slice(0, 5) }))} className="h-10 w-[90px] px-2 rounded-xl border border-[#DCE3EE] text-center text-[14.5px] font-black" style={NUMS} placeholder="01-01" /></span>}
            <span className="w-px h-6 bg-[#E3E8F0] mx-1" />
            <Chip on={cfg.autoSend} onClick={() => canManage && setCfg((c) => ({ ...c, autoSend: !c.autoSend }))}>{cfg.autoSend ? "✓ " : ""}매일 아침 자동 발송</Chip>
            <Chip on={cfg.email} onClick={() => canManage && setCfg((c) => ({ ...c, email: !c.email }))}>{cfg.email ? "✓ " : ""}이메일도 보내기</Chip>
          </div>
          <div className="mt-2 text-[14px] text-[#5B6B85] leading-relaxed">입사 1년 미만(월차)은 종료 3개월 전 1차 · 1개월 전까지 2차. 자동 발송을 끄면 대상자를 인사 담당자에게만 알립니다. 자동 이메일은 회사 PC 프로그램이 켜져 있을 때 예약 메일로 나갑니다.</div>
        </BookCard>
      )}
      <div className="flex gap-1.5 flex-wrap">{[["due", `촉진 대상 ${kpi.due}`], ["soon", "30일 안 시작"], ["plan", "계획 제출"], ["all", "전체"]].map(([k, l]) => <Chip key={k} on={filter === k} onClick={() => setFilter(k)}>{l}</Chip>)}</div>
      <div className="rounded-[20px] bg-white border border-[#E3E8F0] divide-y divide-[#EEF1F6] overflow-hidden">
        {users === null || recs === null ? <div className="py-12 text-center text-[14px] font-bold text-[#9AA9C3]">불러오는 중…</div> : !shown.length ? <div className="py-12 text-center text-[14.5px] font-bold text-[#9AA9C3]">해당하는 직원이 없습니다{rows.some((r) => !r.period) ? ` · 입사일 미등록 ${rows.filter((r) => !r.period).length}명` : ""}</div> : shown.map((r) => {
          const n1 = r.rec?.n1; const n2 = r.rec?.n2; const plan = r.rec?.plan; const des = r.rec?.designated;
          const overdue = n1?.due && today > n1.due && !plan?.submittedAt;
          return (
            <div key={r.u.id} className="px-4 py-3.5 flex flex-wrap items-center gap-3" data-testid="promo-row">
              <div className="min-w-[160px] flex-1">
                <div className="flex items-center gap-1.5"><b className="text-[16px] text-[#0F1A30]">{personName(r.u) || r.u.name}</b><span className="text-[14px] text-[#5B6B85]">{[r.u.team, r.u.position].filter(Boolean).join(" · ")}</span></div>
                <div className="text-[14px] font-bold text-[#7A879C]" style={NUMS}>{r.period.label} {r.period.from} ~ {r.period.to}</div>
              </div>
              <div className="text-center min-w-[72px]"><div className="text-[14px] font-bold text-[#7A879C]">잔여</div><div className="text-[22px] font-black text-[#0F1A30] leading-none" style={NUMS}>{r.remain}<span className="text-[14px] text-[#7A879C]">/{r.total}</span></div></div>
              <div className="min-w-[170px]">
                <div className="text-[14px] font-black text-[#3A4A66]">1차 <span className="font-bold text-[#7A879C]" style={NUMS}>{r.sched.first}</span></div>
                {n1?.sentAt ? <div className="text-[14px] font-bold text-[#067647]" style={NUMS}>발송 {fmtAt(n1.sentAt)}{n1.auto ? " · 자동" : ""}</div> : <div className={`text-[14px] font-black ${today >= r.sched.first ? "text-[#B42318]" : "text-[#9AA9C3]"}`}>{today >= r.sched.first ? "미발송" : "예정"}</div>}
                {n1?.due && <div className={`text-[14px] font-bold ${overdue ? "text-[#B42318]" : "text-[#5B6B85]"}`} style={NUMS}>계획 기한 {n1.due}{overdue ? " · 지남" : ""}</div>}
              </div>
              <div className="min-w-[170px]">
                <div className="text-[14px] font-black text-[#3A4A66]">계획 · 2차 기한 <span className="font-bold text-[#7A879C]" style={NUMS}>{r.sched.second}</span></div>
                {plan?.submittedAt ? <div className="text-[14px] font-bold text-[#067647]" style={NUMS}>계획 제출 {fmtAt(plan.submittedAt)} · {(plan.dates || []).length}일</div> : null}
                {n2?.sentAt ? <div className="text-[14px] font-bold text-[#1B2B4B]" style={NUMS}>2차 {fmtAt(n2.sentAt)}{n2.auto ? " · 자동" : ""}</div> : null}
                {(des?.dates || []).length ? <div className="text-[14px] font-bold text-[#1B2B4B]" style={NUMS}>지정일 {des.dates.join(", ")}</div> : (n2?.sentAt && !plan?.submittedAt ? <div className="text-[14px] font-black text-[#2D4C82]">ⓘ 지정일 미정 — 날짜 지정 필요</div> : null)}
                {!plan?.submittedAt && !n2?.sentAt && <div className="text-[14px] font-bold text-[#9AA9C3]">—</div>}
              </div>
              <div className="flex gap-1.5 flex-wrap ml-auto">
                {canManage && <button type="button" onClick={() => setAct({ row: r, kind: "n1", email: !!cfg?.email })} className="h-9 px-3 rounded-lg bg-[#0F1A30] text-white text-[14px] font-black" data-testid="promo-send1">{n1?.sentAt ? "1차 재발송" : "1차 발송"}</button>}
                {canManage && <button type="button" onClick={() => setAct({ row: r, kind: "n2", dates: des?.dates || [], email: !!cfg?.email })} className="h-9 px-3 rounded-lg border border-[#1B2B4B] bg-white text-[#1B2B4B] text-[14px] font-black">2차 · 날짜 지정</button>}
                <button type="button" onClick={() => setLogOf(r)} className="h-9 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[#3A4A66] text-[14px] font-black">기록 {r.rec?.log?.length || 0}</button>
              </div>
            </div>
          );
        })}
      </div>
      {act && <SendSheet company={company} act={act} byName={byName} onClose={() => setAct(null)} />}
      {logOf && (
        <Sheet side en="AUDIT LOG" title={`${personName(logOf.u) || logOf.u.name} · 촉진 기록`} onClose={() => setLogOf(null)}
          footer={<><button type="button" onClick={() => setLogOf(null)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">닫기</button>{logOf.rec?.n1 && <button type="button" onClick={() => printPromoteNotice(logOf.rec, "n1", company)} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black">1차 통보서 인쇄</button>}{logOf.rec?.n2 && <button type="button" onClick={() => printPromoteNotice(logOf.rec, "n2", company)} className="flex-1 h-12 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-black">2차 통보서 인쇄</button>}</>}>
          {!(logOf.rec?.log || []).length ? <div className="py-10 text-center text-[14px] font-bold text-[#9AA9C3]">아직 기록이 없습니다</div> : (
            <div className="rounded-2xl bg-white border border-[#E3E8F0] divide-y divide-[#EEF1F6]">
              {logOf.rec.log.slice().sort((a, b) => (b.at || 0) - (a.at || 0)).map((l, i) => (
                <div key={i} className="px-4 py-3">
                  <div className="flex items-center gap-2"><b className="text-[14.5px] text-[#0F1A30]">{{ n1: "1차 촉진 통보", n2: "2차 통보(사용 시기 지정)", plan: "직원 사용 계획 제출", hr: "인사 담당자 안내", overdue: "계획 기한 경과 안내" }[l.type] || l.type}</b><span className="ml-auto text-[14px] font-bold text-[#5B6B85]" style={NUMS}>{fmtAt(l.at)}</span></div>
                  <div className="text-[14px] text-[#5B6B85]">{l.byName || l.by || (l.auto ? "자동(서버)" : "")}{l.channel ? ` · ${[].concat(l.channel).join(", ")}` : ""}{l.remain !== undefined ? ` · 잔여 ${l.remain}일` : ""}{l.due ? ` · 기한 ${l.due}` : ""}{(l.dates || []).length ? ` · ${l.dates.join(", ")}` : ""}</div>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3 py-2 text-[14px] text-[#5B6B85]">기록은 지울 수 없습니다(보안 규칙). 분쟁 대비로 통보서를 인쇄해 수령 서명을 받아 두면 더 확실합니다.</div>
        </Sheet>
      )}
    </div>
  );
}

function SendSheet({ company, act, byName, onClose }) {
  const { row, kind } = act;
  const [dates, setDates] = React.useState(act.dates || []);
  const [pick, setPick] = React.useState("");
  const [withEmail, setWithEmail] = React.useState(!!act.email && !!realEmail(row.u));
  const [busy, setBusy] = React.useState(false);
  const t = promoteText(kind, { name: personName(row.u) || row.u.name, label: row.period.label, from: row.period.from, to: row.period.to, remain: row.remain, due: addDaysStr(kstDay(), 10), dates, company });
  const go = async () => {
    if (kind === "n2" && !dates.length && !window.confirm("지정일 없이 2차 안내만 보낼까요? (법적 2차 통보는 사용 시기를 지정해야 합니다)")) return;
    setBusy(true);
    try { await sendPromote({ company, u: row.u, row, kind, dates, withEmail, byName }); onClose(); } catch (e) { alert(`발송 실패: ${e.message}`); } finally { setBusy(false); }
  };
  return (
    <Sheet side en={kind === "n1" ? "LEAVE PROMOTION · 1ST" : "LEAVE PROMOTION · 2ND"} title={`${personName(row.u) || row.u.name} · ${kind === "n1" ? "1차 촉진 통보" : "2차 사용 시기 지정"}`} onClose={onClose}
      footer={<><button type="button" onClick={onClose} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">취소</button><button type="button" disabled={busy} onClick={go} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50" data-testid="promo-send-go">{busy ? "보내는 중…" : "보내기 · 기록 남기기"}</button></>}>
      {kind === "n2" && (
        <BookCard en="DESIGNATE" title={`사용일 지정 (잔여 ${row.remain}일)`}>
          {row.rec?.plan?.dates?.length ? <div className="mb-2 text-[14px] font-bold text-[#067647]">직원 제출 계획: {row.rec.plan.dates.join(", ")}</div> : null}
          <div className="flex gap-1.5"><div className="flex-1"><CustomDatePicker value={pick} onChange={(e) => setPick(e.target.value)} className={inp} showIcon /></div><button type="button" onClick={() => { if (pick && !dates.includes(pick)) setDates([...dates, pick].sort()); setPick(""); }} className="h-11 px-4 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black">추가</button></div>
          <div className="mt-2 flex gap-1.5 flex-wrap">{dates.map((d) => <button key={d} type="button" onClick={() => setDates(dates.filter((x) => x !== d))} className="h-9 px-3 rounded-full bg-[#EEF3FC] text-[#1B2B4B] text-[14px] font-black" style={NUMS}>{d} ✕</button>)}</div>
        </BookCard>
      )}
      <BookCard en="PREVIEW" title={t.subject}><div className="text-[14.5px] leading-[1.8] text-[#0F1A30] whitespace-pre-wrap">{t.body}</div></BookCard>
      <div className="flex gap-1.5 flex-wrap items-center">
        <span className="h-9 px-3 rounded-full bg-[#EEF3FC] text-[#1B2B4B] text-[14px] font-black inline-flex items-center">✓ 앱 알림(팝업)</span>
        <span className="h-9 px-3 rounded-full bg-[#EEF3FC] text-[#1B2B4B] text-[14px] font-black inline-flex items-center">✓ 사내메일 · 푸시</span>
        {realEmail(row.u) ? <Chip on={withEmail} onClick={() => setWithEmail(!withEmail)}>{withEmail ? "✓ " : ""}이메일 {realEmail(row.u)}</Chip> : <span className="text-[14px] font-bold text-[#9AA9C3]">이메일 없음</span>}
      </div>
    </Sheet>
  );
}

// ═════════════════ 직원 본인 — 연차 사용 계획 제출 ═════════════════
export function MyLeavePlan({ company, uid: uidIn }) {
  const uid = uidIn || auth.currentUser?.uid || "";
  const [rows, setRows] = React.useState(null);
  const [form, setForm] = React.useState({});
  const [pick, setPick] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const users = useCompanyUsers(company);
  React.useEffect(() => {
    if (!uid) { setRows([]); return undefined; }
    return onSnapshot(query(collection(db, "leavePromotions"), where("uid", "==", uid)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.periodFrom).localeCompare(String(a.periodFrom)))), () => setRows([]));
  }, [uid]);
  const today = kstDay();
  const submit = async (r) => {
    const f = form[r.id] || { dates: r.plan?.dates || [], memo: r.plan?.memo || "" };
    if (!f.dates?.length) return alert("사용할 날짜를 하나 이상 골라 주세요.");
    if (f.dates.some((d) => d < today || d > r.periodTo)) return alert(`날짜는 오늘부터 ${r.periodTo} 사이로 골라 주세요.`);
    setBusy(true);
    try {
      const now = Date.now();
      const me = (users || []).find((u) => u.id === uid);
      await updateDoc(doc(db, "leavePromotions", r.id), { plan: { dates: f.dates, memo: String(f.memo || "").slice(0, 500), submittedAt: now }, log: arrayUnion({ at: now, type: "plan", by: auth.currentUser?.email || "", byName: personName(me) || r.name, dates: f.dates }), updatedAt: serverTimestamp() });
      // 인사 담당자에게 알림
      const hr = (users || []).filter((u) => u.id !== uid && leaveManagerOf(u)).slice(0, 20);
      await Promise.all(hr.map((h) => addDoc(collection(db, "hrNotices"), { companyName: company, uid: h.id, kind: "leavePlan", link: "leavePromo", refId: r.id, title: `${r.name}님 연차 사용 계획 제출`, body: `${r.name}님이 ${r.label || "연차"} 사용 계획을 제출했습니다.\n· 날짜: ${f.dates.join(", ")}${f.memo ? `\n· 메모: ${f.memo}` : ""}\n\n전자결재로 휴가 신청도 함께 받아 주세요.`, createdAt: serverTimestamp(), createdBy: auth.currentUser?.email || "" }).catch(() => {})));
      alert("제출했습니다. 실제 휴가는 전자결재 › 근태·휴가 신청으로도 올려 주세요.");
    } catch (e) { alert(`제출 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const active = (rows || []).filter((r) => r.periodTo >= today);
  return (
    <div className="space-y-3" data-testid="my-leave-plan">
      <BookHero en="MY · ANNUAL LEAVE PLAN" title="연차 사용 계획" desc="회사의 연차 사용 촉진 통보를 받으면 10일 안에 사용할 날짜를 정해 제출해 주세요(근로기준법 제61조)" />
      {rows === null ? <div className="py-16 text-center text-[14px] font-bold text-[#9AA9C3]">불러오는 중…</div> : !active.length ? (
        <div className="rounded-2xl bg-white border border-[#E3E8F0] py-16 text-center text-[15px] font-bold text-[#7A879C]">받은 연차 사용 촉진 통보가 없습니다</div>
      ) : active.map((r) => {
        const f = form[r.id] || { dates: r.plan?.dates || [], memo: r.plan?.memo || "" };
        const setF = (v) => setForm((p) => ({ ...p, [r.id]: { ...f, ...v } }));
        const due = r.n1?.due;
        return (
          <BookCard key={r.id} en={`${r.label || "연차"} · ${r.periodFrom} ~ ${r.periodTo}`} title={`남은 ${r.label || "연차"} ${r.remain}일`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
              <div className="rounded-xl bg-[#F5F8FD] px-3 py-2"><div className="text-[14px] font-bold text-[#7A879C]">1차 통보</div><div className="text-[14.5px] font-black text-[#0F1A30]" style={NUMS}>{r.n1?.sentAt ? fmtAt(r.n1.sentAt) : "-"}</div></div>
              <div className={`rounded-xl px-3 py-2 ${due && today > due && !r.plan?.submittedAt ? "bg-[#FEF3F2]" : "bg-[#F5F8FD]"}`}><div className="text-[14px] font-bold text-[#7A879C]">계획 제출 기한</div><div className="text-[14.5px] font-black text-[#0F1A30]" style={NUMS}>{due || "-"}</div></div>
              <div className="rounded-xl bg-[#F5F8FD] px-3 py-2"><div className="text-[14px] font-bold text-[#7A879C]">{r.designated?.dates?.length ? "회사 지정일" : "제출 상태"}</div><div className="text-[14.5px] font-black text-[#0F1A30]" style={NUMS}>{r.designated?.dates?.length ? r.designated.dates.join(", ") : r.plan?.submittedAt ? `제출 ${fmtAt(r.plan.submittedAt)}` : "미제출"}</div></div>
            </div>
            <div className="text-[14px] font-black text-[#3A4A66] mb-1.5">사용할 날짜</div>
            <div className="flex gap-1.5"><div className="flex-1"><CustomDatePicker value={pick[r.id] || ""} onChange={(e) => setPick((p) => ({ ...p, [r.id]: e.target.value }))} className={inp} showIcon /></div>
              <button type="button" onClick={() => { const d = pick[r.id]; if (d && !f.dates.includes(d)) setF({ dates: [...f.dates, d].sort() }); setPick((p) => ({ ...p, [r.id]: "" })); }} className="h-11 px-4 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black">추가</button></div>
            <div className="mt-2 flex gap-1.5 flex-wrap">{f.dates.map((d) => <button key={d} type="button" onClick={() => setF({ dates: f.dates.filter((x) => x !== d) })} className="h-9 px-3 rounded-full bg-[#EEF3FC] text-[#1B2B4B] text-[14px] font-black" style={NUMS}>{d} ✕</button>)}{!f.dates.length && <span className="text-[14px] font-bold text-[#9AA9C3]">아직 고른 날짜가 없습니다</span>}</div>
            <input value={f.memo} onChange={(e) => setF({ memo: e.target.value })} className={`${inp} mt-2`} placeholder="메모(선택)" />
            <button type="button" disabled={busy} onClick={() => submit(r)} className="mt-3 w-full h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50" data-testid="plan-submit">{r.plan?.submittedAt ? "사용 계획 다시 제출" : "사용 계획 제출"} · {f.dates.length}일</button>
          </BookCard>
        );
      })}
    </div>
  );
}
