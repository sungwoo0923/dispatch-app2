// ======================= src/HrTools.jsx =======================
// 🧑‍💼 인사 업무(2026-10-31) — 연차 관리 대장 · 입·퇴사 체크리스트 · 재직/경력증명서 발급. PC·모바일 공용(반응형).
//  · 연차 관리 대장: 입사일(userProfiles.hireDate) 기준 발생(근로기준법 60조) − 전자결재 연차·반차 승인분 = 잔여
//    회기 종료 6개월 안에 잔여가 많으면 "사용 촉진"(근로기준법 61조 연차사용촉진) 대상으로 표시
//  · 입·퇴사 체크리스트: 근로계약서·4대보험 취득/상실 신고·장비 지급/반납·계정 발급/정지·퇴직금 정산 등
//    법정 기한(4대보험 다음 달 15일, 퇴직금 14일)을 함께 보여주고, 사람마다 체크 상태를 userProfiles에 저장
//  · 증명서 발급: 재직증명서·경력증명서 — 회사 정보·직인(회사정보에 등록된 것)으로 바로 인쇄, 발급 대장 남김
import { useLeaveGuard, draftStore } from "./leaveGuard";
import React from "react";
import { collection, doc, onSnapshot, query, setDoc, where, arrayUnion, getDocs, getDoc } from "firebase/firestore";
import { db, auth, DEFAULT_COMPANY } from "./firebase";
import { leaveEntitlement, leaveUseOf } from "./approvalForms";
import { isTMUser } from "./staffFilter";
import { personName } from "./userNames";
import { BookHero, BookCard, Chip, Sheet, MONO } from "./OfficeBooks";
import { sendInternalMail, compressImage } from "./InternalMail";
import html2canvas from "html2canvas";
import { printA4 } from "./a4Export";

const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const tsMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0);
const inp = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";
const nm = (u) => personName(u) || u?.email || "이름 없음";
const dayGap = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 864e5);
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const next15 = (d) => { if (!d) return ""; const x = new Date(`${d}T00:00:00`); x.setMonth(x.getMonth() + 1, 15); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-15`; };

// 회사 직원 + 인사 정보(userProfiles) 함께
function useStaff(company) {
  const [users, setUsers] = React.useState(null);
  const [profiles, setProfiles] = React.useState({});
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "users"), where("companyName", "==", company)), (s) => setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setUsers([]));
  }, [company]);
  React.useEffect(() => onSnapshot(collection(db, "userProfiles"), (s) => { const m = {}; s.docs.forEach((d) => { m[d.id] = d.data(); }); setProfiles(m); }, () => setProfiles({})), []);
  const staff = (users || []).filter((u) => (u.companyName || DEFAULT_COMPANY) === company && !["driver", "shipper", "cafeUser", "totalMaster"].includes(u.role) && !isTMUser(u) && u.approved !== false);
  return { loading: users === null, staff, profiles };
}
function useLeaveApprovals(company) {
  const [rows, setRows] = React.useState([]);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "approvals"), where("company", "==", company)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.cat === "leave")), () => setRows([]));
  }, [company]);
  return rows;
}
const hireOf = (u, pf) => pf[u.id]?.hireDate || u.hireDate || "";

function Loading() {
  return <div className="py-20 flex flex-col items-center gap-3 text-[#7A879C]"><span className="w-6 h-6 border-[3px] border-[#DCE3EE] border-t-[#1B2B4B] rounded-full animate-spin" /><span className="text-[12.5px] font-bold">불러오는 중…</span></div>;
}
function Avatar({ name }) {
  return <span className="w-10 h-10 rounded-xl bg-[#1B2B4B] text-white grid place-items-center text-[14px] font-black shrink-0">{String(name || "?").slice(0, 1)}</span>;
}
function Bar({ pct, tone = "#2D4C82" }) {
  return <div className="h-2 rounded-full bg-[#EEF2F8] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: tone }} /></div>;
}
const csv = (name, rows) => {
  const s = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([`﻿${s}`], { type: "text/csv" }));
  a.download = name; a.click();
};

// ═════════════════════════ 연차 관리 대장 ═════════════════════════
export function LeaveLedger({ company, isViewer = false, canManage = false }) {
  const { loading, staff, profiles } = useStaff(company);
  const apprs = useLeaveApprovals(company);
  const [team, setTeam] = React.useState("전체");
  const [filter, setFilter] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState(null);
  const [editHire, setEditHire] = React.useState(null);
  const [adj, setAdj] = React.useState(null); // { days, reason }
  const [busy, setBusy] = React.useState(false);
  const [hPage, setHPage] = React.useState(1); // 사용 내역 페이지(1·2·3…)
  React.useEffect(() => { setHPage(1); }, [sel]);
  const today = kstDay();
  const active = staff.filter((u) => u.employmentStatus !== "퇴사");
  const rows = active.map((u) => {
    const hire = hireOf(u, profiles);
    const ent = leaveEntitlement(hire);
    const mine = apprs.filter((a) => a.drafterUid === u.id);
    const inPeriod = (a) => { const x = leaveUseOf(a); return x && ent && x.date >= ent.from && x.date <= ent.to ? x : null; };
    const used = mine.filter((a) => a.status === "approved" && inPeriod(a)).reduce((s, a) => s + inPeriod(a).days, 0);
    const wait = mine.filter((a) => a.status === "pending" && inPeriod(a)).reduce((s, a) => s + inPeriod(a).days, 0);
    const adjList = ent ? (profiles[u.id]?.leaveAdjust || []).filter((x) => x.period === ent.from) : [];
    const adjSum = adjList.reduce((s, x) => s + (Number(x.days) || 0), 0);
    const total = (ent?.total || 0) + adjSum;
    const remain = total - used;
    const left = ent ? dayGap(today, ent.to) : 0;
    const promote = !!ent && ent.label === "연차" && remain >= 3 && left <= 183;
    const hist = mine.filter((a) => leaveUseOf(a)).sort((a, b) => String(leaveUseOf(b).date).localeCompare(String(leaveUseOf(a).date)));
    return { u, hire, ent, used, wait, total, base: ent?.total || 0, adjList, adjSum, remain, left, promote, hist };
  });
  const teams = ["전체", ...Array.from(new Set(active.map((u) => u.team || "미배정")))];
  const shown = rows
    .filter((r) => team === "전체" || (r.u.team || "미배정") === team)
    .filter((r) => (filter === "promote" ? r.promote : filter === "nohire" ? !r.hire : filter === "low" ? r.ent && r.remain <= 2 : true))
    .filter((r) => !q.trim() || [r.u.name, r.u.team, r.u.position].some((v) => String(v || "").includes(q.trim())))
    .sort((a, b) => (b.promote - a.promote) || String(a.u.name || "").localeCompare(String(b.u.name || ""), "ko"));
  const withEnt = rows.filter((r) => r.ent && r.total);
  const avgUse = withEnt.length ? Math.round((withEnt.reduce((s, r) => s + r.used / r.total, 0) / withEnt.length) * 100) : 0;
  const cur = rows.find((r) => r.u.id === sel) || shown[0] || null;
  const saveHire = async () => { if (!editHire?.v) return; await setDoc(doc(db, "userProfiles", editHire.u.id), { hireDate: editHire.v }, { merge: true }); setEditHire(null); };
  const me = auth.currentUser;
  // 🔐 연차 조정 — 사유 필수 · 지우지 못함(되돌리려면 반대 조정) · 본인에게 사내메일 자동 통보 · 본인 연차 화면에도 표시
  const saveAdj = async () => {
    const days = Number(adj?.days);
    if (!days || !isFinite(days)) return alert("조정 일수를 입력해 주세요. (예: 1, -0.5)");
    if (!String(adj.reason || "").trim() || adj.reason.trim().length < 4) return alert("조정 사유를 4자 이상 적어 주세요.");
    if (!window.confirm(`${nm(cur.u)}님 연차를 ${days > 0 ? "+" : ""}${days}일 조정할까요?\n· 조정 기록은 지울 수 없습니다\n· ${nm(cur.u)}님에게 사내메일로 바로 알려집니다`)) return;
    setBusy(true);
    try {
      const entry = { days, reason: adj.reason.trim(), period: cur.ent.from, at: Date.now(), date: today, by: me?.email || "", byName: personName(staff.find((x) => x.id === me?.uid)) || me?.email || "" };
      await setDoc(doc(db, "userProfiles", cur.u.id), { leaveAdjust: arrayUnion(entry) }, { merge: true });
      await sendInternalMail({ company, to: [{ uid: cur.u.id, name: nm(cur.u), team: cur.u.team || "", position: cur.u.position || "" }], subject: `[연차 조정 안내] ${days > 0 ? "+" : ""}${days}일`, body: `${nm(cur.u)}님의 ${cur.ent.label}(${cur.ent.from} ~ ${cur.ent.to})가 조정되었습니다.\n\n· 조정: ${days > 0 ? "+" : ""}${days}일\n· 사유: ${entry.reason}\n· 조정 후 발생: ${cur.total + days}일 / 사용 ${cur.used}일 / 잔여 ${cur.remain + days}일\n· 처리자: ${entry.byName} (${today})\n\n이의가 있으면 인사관리부에 문의해 주세요.`, kind: "hr", fromName: entry.byName }).catch(() => {});
      setAdj(null);
    } finally { setBusy(false); }
  };
  const sendPromote = async (r) => {
    if (!window.confirm(`${nm(r.u)}님에게 연차 사용 촉진 안내를 사내메일로 보낼까요? (잔여 ${r.remain}일)`)) return;
    await sendInternalMail({ company, to: [{ uid: r.u.id, name: nm(r.u), team: r.u.team || "", position: r.u.position || "" }], subject: `[연차 사용 촉진] 잔여 연차 ${r.remain}일 사용 계획을 알려 주세요`, body: `${nm(r.u)}님, 회기(${r.ent.from} ~ ${r.ent.to}) 잔여 연차가 ${r.remain}일 남았습니다.\n근로기준법 제61조에 따라 10일 안에 사용 시기를 정해 전자결재로 신청해 주세요.\n기한 내 정하지 않으면 회사가 사용 시기를 지정할 수 있습니다.`, kind: "hr", fromName: "인사관리부" }).catch(() => {});
    await setDoc(doc(db, "userProfiles", r.u.id), { leavePromote: arrayUnion({ at: Date.now(), date: today, remain: r.remain, period: r.ent.from }) }, { merge: true });
    alert("보냈습니다.");
  };
  // 회기 월별 사용(그래프)
  const monthly = cur?.ent ? Array.from({ length: 12 }, (_, i) => { const d = new Date(`${cur.ent.from}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + i); const m = d.toISOString().slice(0, 7); const v = cur.hist.filter((a) => a.status === "approved" && String(leaveUseOf(a).date).startsWith(m)).reduce((s, a) => s + leaveUseOf(a).days, 0); return { m, v }; }) : [];
  const maxM = Math.max(1, ...monthly.map((x) => x.v));
  if (loading) return <Loading />;
  return (
    <div className="space-y-3">
      <BookHero en="HR · ANNUAL LEAVE" title="연차 관리" desc="입사일 기준 발생 연차 − 전자결재 사용 + 인사 조정 = 잔여 · 조정은 기록이 남고 본인에게 통보됩니다"
        kpis={[["대상 인원", `${active.length}명`], ["평균 소진율", `${avgUse}%`], ["사용 촉진 대상", `${rows.filter((r) => r.promote).length}명`, "회기 종료 6개월 이내 · 잔여 3일+"], ["입사일 미등록", `${rows.filter((r) => !r.hire).length}명`]]}
        right={<button type="button" onClick={() => csv(`연차관리대장_${today}.csv`, [["이름", "부서", "직책", "입사일", "구분", "회기", "발생", "조정", "사용", "결재 중", "잔여"], ...rows.map((r) => [nm(r.u), r.u.team, r.u.position, r.hire, r.ent?.label, r.ent ? `${r.ent.from}~${r.ent.to}` : "", r.base, r.adjSum, r.used, r.wait, r.remain])])} className="h-10 px-4 rounded-xl bg-white/10 border border-white/20 text-[13px] font-black whitespace-nowrap">엑셀 다운로드</button>} />
      <div className="grid grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)] gap-4 items-start">
        {/* 왼쪽 — 직원 목록 */}
        <div className="rounded-[20px] bg-white border border-[#E3E8F0] overflow-hidden">
          <div className="p-3 border-b border-[#EEF1F6] space-y-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·부서 검색" className="h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-[#F8FAFD] text-[13.5px] outline-none" />
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">{[["all", "전체"], ["promote", "사용 촉진"], ["low", "잔여 2일↓"], ["nohire", "입사일 없음"]].map(([k, l]) => <Chip key={k} on={filter === k} onClick={() => setFilter(k)}>{l}</Chip>)}</div>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">{teams.map((t) => <button key={t} type="button" onClick={() => setTeam(t)} className={`h-7 px-2.5 rounded-lg text-[12px] font-black whitespace-nowrap shrink-0 ${team === t ? "bg-[#EEF3FC] text-[#1B2B4B]" : "text-[#7A879C]"}`}>{t}</button>)}</div>
          </div>
          <div className="divide-y divide-[#F1F4F9] lg:max-h-[calc(100vh-360px)] overflow-y-auto">
            {!shown.length ? <div className="py-12 text-center text-[13px] font-bold text-[#9AA9C3]">해당하는 직원이 없습니다</div> : shown.map((r) => (
              <button key={r.u.id} type="button" onClick={() => setSel(r.u.id)} className={`w-full text-left px-3.5 py-3 flex items-center gap-3 ${cur?.u.id === r.u.id ? "bg-[#F2F6FD] shadow-[inset_3px_0_0_#1B2B4B]" : "hover:bg-[#F8FAFD]"}`}>
                <Avatar name={nm(r.u)} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5"><span className="text-[15.5px] font-black text-[#0F1A30] truncate">{nm(r.u)}</span>{r.promote && <span className="text-[10px] font-black px-1 rounded bg-[#FFF4E5] text-[#B54708]">촉진</span>}{!r.hire && <span className="text-[10px] font-black px-1 rounded bg-[#FEF3F2] text-[#B42318]">입사일</span>}</span>
                  <span className="block text-[13px] text-[#5B6B85] truncate">{[r.u.team, r.u.position].filter(Boolean).join(" · ")}</span>
                  {r.ent && <span className="mt-1 block"><Bar pct={r.total ? (r.used / r.total) * 100 : 0} tone={r.remain <= 2 ? "#D92D20" : "#2D4C82"} /></span>}
                </span>
                <span className="text-right shrink-0"><span className="block text-[22px] font-black tabular-nums text-[#0F1A30] leading-none" style={{ fontFamily: MONO }}>{r.ent ? r.remain : "-"}</span><span className="block text-[12px] font-bold text-[#7A879C]">/{r.total} 잔여</span></span>
              </button>
            ))}
          </div>
        </div>
        {/* 오른쪽 — 상세 */}
        {!cur ? <div className="rounded-[20px] border-2 border-dashed border-[#DCE3EE] bg-white py-24 text-center text-[14px] font-bold text-[#9AA9C3]">왼쪽에서 직원을 고르세요</div> : (
          <div className="space-y-3 min-w-0">
            <div className="rounded-[20px] p-5 text-white flex flex-wrap items-center gap-5" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
              <div className="flex-1 min-w-[220px]">
                <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>{cur.ent ? `${cur.ent.label} · ${cur.ent.from} ~ ${cur.ent.to}` : "NO HIRE DATE"}</div>
                <div className="text-[22px] font-black mt-0.5">{nm(cur.u)} <span className="text-[14px] font-bold text-white/60">{[cur.u.team, cur.u.position].filter(Boolean).join(" · ")}</span></div>
                <div className="text-[13px] text-white/60 mt-0.5">입사 {cur.hire || "미등록"}{cur.ent ? ` · 근속 ${Math.floor(cur.ent.months / 12) ? `${Math.floor(cur.ent.months / 12)}년 ` : ""}${cur.ent.months % 12}개월 · 회기 종료 D-${Math.max(0, cur.left)}` : ""}</div>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[["발생", cur.base], ["조정", `${cur.adjSum > 0 ? "+" : ""}${cur.adjSum}`], ["사용", cur.used], ["결재 중", cur.wait], ["잔여", cur.remain]].map(([l, v], i) => (
                  <div key={l} className={`rounded-xl px-3 py-2 text-center min-w-[64px] ${i === 4 ? "bg-white text-[#0F1A30]" : "bg-white/[0.08] border border-white/10"}`}><div className={`text-[13px] font-bold ${i === 4 ? "text-[#5B6B85]" : "text-white/60"}`}>{l}</div><div className="text-[24px] font-black tabular-nums" style={{ fontFamily: MONO }}>{cur.ent ? v : "-"}</div></div>
                ))}
              </div>
            </div>
            {!cur.hire && <div className="rounded-2xl bg-[#FEF3F2] border border-[#FECDCA] px-4 py-3 flex items-center gap-3"><span className="text-[13.5px] font-bold text-[#B42318]">입사일이 없어 연차를 계산할 수 없습니다</span><span className="ml-auto text-[12px] font-bold text-[#B42318]/80">인사관리부 › 인사관리 › 직원관리에서 등록</span></div>}
            {cur.promote && <div className="rounded-2xl bg-[#FFF4E5] border border-[#FEDF89] px-4 py-3 flex items-center gap-3 flex-wrap"><span className="text-[13.5px] font-bold text-[#B54708]">연차 사용 촉진 대상 — 회기 종료 {cur.left}일 전, 잔여 {cur.remain}일 (근로기준법 61조)</span>{!isViewer && <button type="button" onClick={() => sendPromote(cur)} className="ml-auto h-9 px-3.5 rounded-lg bg-[#B54708] text-white text-[12.5px] font-black">촉진 안내 메일</button>}</div>}
            {cur.ent && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <BookCard en="MONTHLY USE" title="회기 월별 사용" right={<span className="text-[13px] font-black text-[#5B6B85]">사용 {cur.used}일</span>}>
                  <div className="flex items-end gap-2 h-[240px] pt-3">
                    {monthly.map((x) => (
                      <div key={x.m} className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
                        <span className="text-[14px] font-black text-[#0F1A30] tabular-nums" style={{ fontFamily: MONO }}>{x.v || ""}</span>
                        <div className="w-full flex-1 flex items-end rounded-t-lg bg-[#F3F6FA]"><span className={`w-full rounded-t-lg ${x.m === today.slice(0, 7) ? "bg-[#B88A2E]" : "bg-gradient-to-t from-[#1B2B4B] to-[#2D4C82]"}`} style={{ height: `${(x.v / maxM) * 100}%`, minHeight: x.v ? 6 : 0 }} /></div>
                        <span className={`text-[13px] font-black tabular-nums ${x.m === today.slice(0, 7) ? "text-[#B88A2E]" : "text-[#3A4A66]"}`}>{Number(x.m.slice(5))}월</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-[12.5px] font-bold text-[#7A879C]">금색 막대 = 이번 달 · 막대 위 숫자 = 사용 일수</div>
                </BookCard>
                <BookCard en="HISTORY" title={`사용 내역 ${cur.hist.length}건`}>
                  {!cur.hist.length ? <div className="py-8 text-center text-[15px] font-bold text-[#9AA9C3]">전자결재로 신청한 연차·반차가 없습니다</div> : (() => {
                    const PER = 6; const pages = Math.max(1, Math.ceil(cur.hist.length / PER)); const pg = Math.min(hPage, pages);
                    return (
                      <>
                        <div className="divide-y divide-[#EEF2F8]">
                          {cur.hist.slice((pg - 1) * PER, pg * PER).map((a) => { const x = leaveUseOf(a); const st = { approved: ["승인", "#067647", "#ECFDF3"], pending: ["결재 중", "#B54708", "#FFF4E5"], rejected: ["반려", "#B42318", "#FEF3F2"] }[a.status] || ["취소", "#7A879C", "#F2F4F7"]; return (
                            <div key={a.id} className="flex items-center gap-3 py-3">
                              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${x.date >= today ? "bg-[#B88A2E]" : "bg-[#1B2B4B]"}`} />
                              <span className="text-[16px] font-black tabular-nums text-[#0F1A30]" style={{ fontFamily: MONO }}>{x.date}</span>
                              <span className="text-[15px] font-bold text-[#3A4A66] truncate">{a.form === "half" ? (a.data?.ampm || "반차") : (a.data?.kind || "연차")} · <b className="text-[#0F1A30]">{x.days}일</b></span>
                              <span className="ml-auto text-[13px] font-black px-2.5 py-1 rounded-lg shrink-0" style={{ color: st[1], background: st[2] }}>{st[0]}</span>
                            </div>
                          ); })}
                        </div>
                        {pages > 1 && (
                          <div className="mt-3 flex items-center justify-center gap-1.5 flex-wrap">
                            <button type="button" disabled={pg <= 1} onClick={() => setHPage(pg - 1)} className="h-10 px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-black text-[#1B2B4B] disabled:opacity-30">‹</button>
                            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => <button key={n} type="button" onClick={() => setHPage(n)} className={`h-10 min-w-[40px] px-2 rounded-xl text-[15px] font-black tabular-nums ${n === pg ? "bg-[#0F1A30] text-white" : "border border-[#DCE3EE] bg-white text-[#3A4A66]"}`} style={{ fontFamily: MONO }}>{n}</button>)}
                            <button type="button" disabled={pg >= pages} onClick={() => setHPage(pg + 1)} className="h-10 px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-black text-[#1B2B4B] disabled:opacity-30">›</button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </BookCard>
              </div>
            )}
            {cur.ent && (
              <BookCard en="ADJUSTMENTS · AUDIT" title="연차 조정 이력" right={canManage && !isViewer && <button type="button" onClick={() => setAdj({ days: "", reason: "" })} className="h-9 px-3.5 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black">연차 조정</button>}>
                {!cur.adjList.length ? <div className="py-3 text-[13px] font-bold text-[#9AA9C3]">조정 기록이 없습니다</div> : cur.adjList.slice().reverse().map((x, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-[#F1F4F9] last:border-b-0">
                    <span className={`w-16 h-10 rounded-lg grid place-items-center text-[15px] font-black tabular-nums ${x.days > 0 ? "bg-[#EEF3FC] text-[#2D4C82]" : "bg-[#FEF3F2] text-[#B42318]"}`} style={{ fontFamily: MONO }}>{x.days > 0 ? "+" : ""}{x.days}</span>
                    <span className="flex-1 min-w-0"><span className="block text-[15px] font-black text-[#0F1A30] truncate">{x.reason}</span><span className="block text-[13px] text-[#7A879C]">{x.date} · {x.byName || x.by} · 본인 통보됨</span></span>
                  </div>
                ))}
                <div className="mt-2 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3 py-2 text-[11.5px] text-[#5B6B85] leading-relaxed">
                  ■ 몰래 바꾸지 못하게 — 사유 필수 · 조정 기록은 지울 수 없음(되돌리려면 반대로 조정) · 처리자·시각 자동 기록 · 본인에게 사내메일 자동 통보 · 본인의 "내 연차" 화면에도 조정 내역 표시
                </div>
              </BookCard>
            )}
            {/* ⭐ 2026-11-01 입사일 변경은 인사관리부 › 인사관리 › 직원관리에서만 */}
            {cur.hire && <div className="text-right text-[12px] font-bold text-[#7A879C]">입사일 변경은 인사관리부 › 인사관리 › 직원관리에서 합니다</div>}
          </div>
        )}
      </div>
      {editHire && (
        <Sheet en="HIRE DATE" title={`${nm(editHire.u)} 입사일`} onClose={() => setEditHire(null)}
          footer={<><button type="button" onClick={() => setEditHire(null)} className="flex-1 h-12 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-black text-[#3A4A66]">취소</button><button type="button" onClick={saveHire} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black">저장</button></>}>
          <input type="date" value={editHire.v} onChange={(e) => setEditHire({ ...editHire, v: e.target.value })} className={inp} />
        </Sheet>
      )}
      {adj && cur && (
        <Sheet side en="LEAVE · ADJUST" title={`${nm(cur.u)} 연차 조정`} onClose={() => setAdj(null)}
          footer={<><button type="button" onClick={() => setAdj(null)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">취소</button><button type="button" disabled={busy} onClick={saveAdj} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50">{busy ? "처리 중…" : "조정하고 본인에게 통보"}</button></>}>
          <div className="rounded-2xl bg-white border border-[#E3E8F0] p-4">
            <div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">조정 일수 (+ 추가 / − 차감)</div>
            <div className="flex gap-1.5 flex-wrap mb-2">{[-1, -0.5, 0.5, 1, 2].map((d) => <Chip key={d} on={Number(adj.days) === d} onClick={() => setAdj((p) => ({ ...p, days: String(d) }))}>{d > 0 ? "+" : ""}{d}일</Chip>)}</div>
            <input inputMode="decimal" value={adj.days} onChange={(e) => setAdj((p) => ({ ...p, days: e.target.value.replace(/[^\d.-]/g, "") }))} className={`${inp} text-right tabular-nums`} style={{ fontFamily: MONO }} placeholder="예: 1, -0.5" />
            <div className="mt-2 text-[12.5px] text-[#5B6B85]">조정 후 잔여: <b className="text-[#0F1A30]">{cur.remain + (Number(adj.days) || 0)}일</b></div>
          </div>
          <div><div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">사유 (필수 · 본인에게 그대로 전달)</div>
            <div className="flex gap-1.5 flex-wrap mb-2">{["포상 휴가 부여", "이월 연차 반영", "전산 누락분 정정", "공가 처리(예비군 등)", "중복 차감 정정"].map((t) => <Chip key={t} on={adj.reason === t} onClick={() => setAdj((p) => ({ ...p, reason: t }))}>{t}</Chip>)}</div>
            <textarea value={adj.reason} onChange={(e) => setAdj((p) => ({ ...p, reason: e.target.value }))} rows={3} className={`${inp} h-auto py-2`} />
          </div>
          <div className="rounded-xl bg-[#FFF4E5] border border-[#FEDF89] px-3.5 py-2.5 text-[12.5px] text-[#B54708] leading-relaxed">조정 기록은 삭제할 수 없고, 처리자 이름과 시각이 남으며 {nm(cur.u)}님에게 사내메일로 바로 알려집니다.</div>
        </Sheet>
      )}
    </div>
  );
}

// ═════════════════════════ 입·퇴사 체크리스트 ═════════════════════════
export const ONBOARD_ITEMS = [
  { key: "contract", label: "근로계약서 작성·교부", desc: "서면 작성 후 1부 교부(미교부 시 500만원 이하 벌금)", due: (d) => d },
  { key: "insurance", label: "4대보험 취득 신고", desc: "국민연금·건강·고용·산재 — 입사일 다음 달 15일까지", due: (d) => next15(d) },
  { key: "idcopy", label: "신분증·등본 사본", desc: "인사 기록용" },
  { key: "bank", label: "급여 통장 사본", desc: "급여 이체 계좌 확인" },
  { key: "privacy", label: "개인정보 수집·이용 동의서", desc: "인사·급여 처리 목적" },
  { key: "security", label: "보안·비밀유지 서약서", desc: "고객·운임 정보 보호" },
  { key: "account", label: "프로그램 계정·권한 발급", desc: "직원 관리에서 승인·권한 지정" },
  { key: "equip", label: "장비·비품 지급", desc: "PC·명함·출입카드 — 비품 관리에 출고 기록" },
  { key: "edu", label: "법정 의무교육 안내", desc: "성희롱·괴롭힘 예방, 개인정보 보호, 산업안전" },
  { key: "hire", label: "입사일 등록", desc: "연차 자동 계산 기준", auto: (u, pf) => !!hireOf(u, pf) },
];
export const OFFBOARD_ITEMS = [
  { key: "resign", label: "사직서 접수·수리", desc: "퇴사일 확정" },
  { key: "handover", label: "업무 인수인계", desc: "전자결재 › 인수인계로 작성" },
  { key: "equip", label: "장비·비품 반납", desc: "PC·법인카드·출입카드 — 비품 관리에 입고 기록" },
  { key: "account", label: "계정 정지·권한 회수", desc: "퇴사 처리 시 로그인 차단" },
  { key: "insurance", label: "4대보험 상실 신고", desc: "퇴사일 다음 달 15일까지", due: (d) => next15(d) },
  { key: "severance", label: "퇴직금·잔여 연차 수당 정산", desc: "퇴직일로부터 14일 이내 지급", due: (d) => (d ? addDays(d, 14) : "") },
  { key: "withholding", label: "근로소득 원천징수영수증 교부", desc: "중도 퇴사자 연말정산" },
  { key: "career", label: "경력증명서 발급", desc: "요청 시 즉시 발급(근로기준법 39조)" },
];

export function OnboardingBoard({ company, isViewer = false }) {
  const { loading, staff, profiles } = useStaff(company);
  const [mode, setMode] = React.useState("in");
  const [open, setOpen] = React.useState(null);
  const [showDone, setShowDone] = React.useState(false);
  const today = kstDay();
  const items = mode === "in" ? ONBOARD_ITEMS : OFFBOARD_ITEMS;
  const field = mode === "in" ? "onboarding" : "offboarding";
  const people = staff.filter((u) => (mode === "in" ? u.employmentStatus !== "퇴사" : u.employmentStatus === "퇴사"));
  const baseDate = (u) => (mode === "in" ? hireOf(u, profiles) : u.resignDate || u.퇴사일 || profiles[u.id]?.resignDate || "");
  const isDone = (u, it) => (it.auto ? it.auto(u, profiles) : !!profiles[u.id]?.[field]?.[it.key]);
  const progress = (u) => items.filter((it) => isDone(u, it)).length;
  const overdue = (u) => items.filter((it) => !isDone(u, it) && it.due && it.due(baseDate(u)) && it.due(baseDate(u)) < today).length;
  const rows = people.map((u) => ({ u, n: progress(u), od: overdue(u), base: baseDate(u) }))
    .filter((r) => showDone || r.n < items.length)
    .sort((a, b) => (b.od - a.od) || String(b.base).localeCompare(String(a.base)));
  const allPending = people.filter((u) => progress(u) < items.length).length;
  const toggle = async (u, it) => {
    if (isViewer || it.auto) return;
    const cur = profiles[u.id]?.[field]?.[it.key];
    await setDoc(doc(db, "userProfiles", u.id), { [field]: { [it.key]: cur ? null : { at: today, by: auth.currentUser?.uid || "" } } }, { merge: true });
  };
  if (loading) return <Loading />;
  return (
    <div className="space-y-3">
      <BookHero en="HR · ON/OFF BOARDING" title="입·퇴사 관리" desc="입사·퇴사 때 챙겨야 할 서류·신고·장비를 사람마다 체크하고 법정 기한을 놓치지 않게 알려 줍니다."
        kpis={[["진행 중 입사", `${staff.filter((u) => u.employmentStatus !== "퇴사" && ONBOARD_ITEMS.some((it) => !(it.auto ? it.auto(u, profiles) : profiles[u.id]?.onboarding?.[it.key]))).length}명`],
          ["진행 중 퇴사", `${staff.filter((u) => u.employmentStatus === "퇴사" && OFFBOARD_ITEMS.some((it) => !profiles[u.id]?.offboarding?.[it.key])).length}명`],
          ["기한 지남", `${people.reduce((s, u) => s + (overdue(u) ? 1 : 0), 0)}명`, mode === "in" ? "입사 처리 기준" : "퇴사 처리 기준"],
          ["이번 화면 미완료", `${allPending}명`]]} />
      <div className="flex gap-1.5 overflow-x-auto pb-1 items-center">
        <Chip on={mode === "in"} onClick={() => { setMode("in"); setOpen(null); }}>입사 처리</Chip>
        <Chip on={mode === "out"} onClick={() => { setMode("out"); setOpen(null); }}>퇴사 처리</Chip>
        <span className="w-px h-6 bg-[#DCE3EE] mx-1 shrink-0" />
        <Chip on={showDone} onClick={() => setShowDone(!showDone)}>완료한 사람도 보기</Chip>
      </div>
      <BookCard en={mode === "in" ? "ONBOARDING" : "OFFBOARDING"} title={`${mode === "in" ? "입사" : "퇴사"} 체크리스트 · ${rows.length}명`} flush>
        {!rows.length ? <div className="py-12 text-center text-[13px] font-bold text-[#9AA9C3]">{mode === "in" ? "처리할 입사자가 없습니다" : "처리할 퇴사자가 없습니다"}</div> : (
          <div className="divide-y divide-[#EEF2F8]">
            {rows.map(({ u, n, od, base }) => (
              <div key={u.id}>
                <button type="button" onClick={() => setOpen(open === u.id ? null : u.id)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[#F7F9FC]">
                  <Avatar name={nm(u)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[14.5px] font-black text-[#0F1A30] whitespace-nowrap">{nm(u)}</span>
                      <span className="text-[12px] font-bold text-[#7A879C] whitespace-nowrap">{[u.team, u.position].filter(Boolean).join(" · ")}</span>
                      {od > 0 && <span className="text-[10.5px] font-black px-1.5 py-0.5 rounded-md bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA] whitespace-nowrap">기한 지남 {od}</span>}
                    </div>
                    <div className="text-[11.5px] text-[#7A879C] mt-0.5 whitespace-nowrap" style={{ fontFamily: MONO }}>{mode === "in" ? "입사일" : "퇴사일"} {base || "미등록"}</div>
                    <div className="mt-1.5 max-w-[360px]"><Bar pct={(n / items.length) * 100} tone={n === items.length ? "#12B76A" : "#2D4C82"} /></div>
                  </div>
                  <div className="text-[18px] font-black text-[#0F1A30] tabular-nums shrink-0" style={{ fontFamily: MONO }}>{n}<span className="text-[11px] text-[#9AA9C3]">/{items.length}</span></div>
                </button>
                {open === u.id && (
                  <div className="px-3 md:px-4 pb-4 bg-[#F7F9FC] grid md:grid-cols-2 gap-2">
                    {items.map((it) => {
                      const done = isDone(u, it);
                      const due = it.due ? it.due(base) : "";
                      const late = !done && due && due < today;
                      const rec = profiles[u.id]?.[field]?.[it.key];
                      return (
                        <button key={it.key} type="button" onClick={() => toggle(u, it)} disabled={isViewer || it.auto}
                          className={`text-left rounded-xl border px-3 py-2.5 flex items-start gap-2.5 ${done ? "bg-[#ECFDF3] border-[#ABEFC6]" : late ? "bg-[#FEF3F2] border-[#FECDCA]" : "bg-white border-[#E3E8F0]"}`}>
                          <span className={`w-5 h-5 rounded-md mt-0.5 grid place-items-center text-[12px] font-black shrink-0 ${done ? "bg-[#12B76A] text-white" : "border-2 border-[#C9D2E0] bg-white"}`}>{done ? "✓" : ""}</span>
                          <span className="min-w-0">
                            <span className="block text-[13.5px] font-black text-[#0F1A30]">{it.label}</span>
                            <span className="block text-[11.5px] text-[#7A879C]">{it.desc}</span>
                            {(due || rec?.at) && <span className={`block text-[11px] font-bold mt-0.5 ${late ? "text-[#B42318]" : "text-[#5B6B85]"}`} style={{ fontFamily: MONO }}>{rec?.at ? `완료 ${rec.at}` : `기한 ${due}`}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </BookCard>
    </div>
  );
}

// ═════════════════════════ 재직·경력증명서 발급 ═════════════════════════
async function companyPrintInfo(company) {
  try {
    const s = await getDocs(query(collection(db, "transportApplications"), where("companyName", "==", company)));
    const ds = s.docs.map((d) => d.data());
    const f = ds.find((d) => d.type === "신규" && d.status === "approved") || ds.find((d) => d.type === "신규") || ds[0] || {};
    return { name: company, ceo: f.representative || f.대표자 || f.ceo || "", bizNo: f.businessNumber || f.사업자번호 || "", addr: f.address || f.주소 || "", phone: f.phone || f.연락처 || "", stamp: f.직인이미지 || "" };
  } catch { return { name: company }; }
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const krDate = (d) => (d ? `${d.slice(0, 4)}년 ${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일` : "");
function certHtml({ kind, no, u, pf, co, purpose, duty, issueDate }) {
  const hire = pf?.hireDate || u.hireDate || "";
  const end = kind === "career" ? (u.resignDate || u.퇴사일 || pf?.resignDate || issueDate) : "";
  const title = kind === "career" ? "경 력 증 명 서" : "재 직 증 명 서";
  const row = (k, v) => `<tr><th>${k}</th><td>${esc(v) || "&nbsp;"}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
@page{size:A4;margin:22mm 20mm}body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;margin:0}
.no{font-size:12px;color:#555}h1{text-align:center;font-size:30px;letter-spacing:6px;margin:34px 0 34px}
h2{font-size:14px;margin:22px 0 6px;border-left:4px solid #1B2B4B;padding-left:8px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{border:1px solid #333;padding:10px 12px;text-align:left}th{width:120px;background:#F2F4F8;font-weight:700}
.stmt{text-align:center;font-size:16px;margin:46px 0 22px}.date{text-align:center;font-size:16px;margin-bottom:48px}
.co{text-align:center;font-size:17px;line-height:2;position:relative}.stamp{position:absolute;width:74px;height:74px;object-fit:contain;margin-left:-10px;margin-top:-18px;opacity:.9}
</style></head><body>
<div class="no">발급번호 : ${esc(no)}</div><h1>${title}</h1>
<h2>인적 사항</h2><table>${row("성 명", personName(u))}${row("생년월일", pf?.birth || u.birth || u.생년월일 || "")}${row("주 소", pf?.address || u.address || u.주소 || "")}</table>
<h2>${kind === "career" ? "경력 사항" : "재직 사항"}</h2><table>${row("회 사 명", co.name)}${row("부 서", u.team || "")}${row("직 위", u.position || "")}${row("담당 업무", duty)}${row(kind === "career" ? "근무 기간" : "입 사 일", kind === "career" ? `${krDate(hire)} ~ ${krDate(end)}` : `${krDate(hire)} ~ 현재`)}${row("용 도", purpose)}</table>
<div class="stmt">위 기재 사항이 사실과 같음을 증명합니다.</div><div class="date">${krDate(issueDate)}</div>
<div class="co">${esc(co.name)}<br/>${co.addr ? `${esc(co.addr)}<br/>` : ""}${co.bizNo ? `사업자등록번호 ${esc(co.bizNo)}<br/>` : ""}대표이사 ${esc(co.ceo)} <span style="position:relative">(인)${co.stamp ? `<img class="stamp" src="${co.stamp}"/>` : ""}</span></div>
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
}

// 증명서 미리보기(화면용 — 발급 시 이 화면 그대로 인쇄·메일 첨부)
function CertPaper({ kind, no, u, pf, co, purpose, duty, issueDate, birth, address }) {
  const hire = pf?.hireDate || u?.hireDate || "";
  const end = kind === "career" ? (u?.resignedAt || u?.resignDate || u?.퇴사일 || issueDate) : "";
  const th = "border border-[#333] bg-[#F2F4F8] font-bold text-[14px] px-3 py-2.5 w-[120px] text-left";
  const td = "border border-[#333] text-[14px] px-3 py-2.5";
  const Row = ({ k, v }) => <tr><th className={th}>{k}</th><td className={td}>{v || " "}</td></tr>;
  return (
    <div className="bg-white text-[#111] mx-auto" style={{ width: 760, minHeight: 1050, padding: "56px 64px", fontFamily: "'Malgun Gothic','Apple SD Gothic Neo',sans-serif" }}>
      <div className="text-[12px] text-[#555]">발급번호 : {no}</div>
      <h1 className="text-center text-[32px] font-black my-9" style={{ letterSpacing: "0.4em" }}>{kind === "career" ? "경 력 증 명 서" : "재 직 증 명 서"}</h1>
      <div className="text-[14px] font-bold border-l-4 border-[#1B2B4B] pl-2 mt-5 mb-1.5">인적 사항</div>
      <table className="w-full border-collapse"><tbody><Row k="성 명" v={personName(u)} /><Row k="생년월일" v={birth} /><Row k="주 소" v={address} /></tbody></table>
      <div className="text-[14px] font-bold border-l-4 border-[#1B2B4B] pl-2 mt-6 mb-1.5">{kind === "career" ? "경력 사항" : "재직 사항"}</div>
      <table className="w-full border-collapse"><tbody>
        <Row k="회 사 명" v={co?.name} /><Row k="부 서" v={u?.team} /><Row k="직 위" v={u?.position} /><Row k="담당 업무" v={duty} />
        <Row k={kind === "career" ? "근무 기간" : "입 사 일"} v={kind === "career" ? `${krDate(hire)} ~ ${krDate(end)}` : `${krDate(hire)} ~ 현재`} />
        <Row k="용 도" v={purpose} />
      </tbody></table>
      <div className="text-center text-[16px] mt-14 mb-6">위 기재 사항이 사실과 같음을 증명합니다.</div>
      <div className="text-center text-[16px] mb-12">{krDate(issueDate)}</div>
      <div className="text-center text-[17px] leading-[2] relative">
        {co?.name}<br />{co?.addr && <>{co.addr}<br /></>}{co?.bizNo && <>사업자등록번호 {co.bizNo}<br /></>}
        대표이사 {co?.ceo} <span className="relative">(인){co?.stamp && <img src={co.stamp} alt="" className="absolute -left-3 -top-5 w-[72px] h-[72px] object-contain opacity-90" />}</span>
      </div>
    </div>
  );
}

export function CertIssuer({ company, isViewer = false }) {
  const { loading, staff, profiles } = useStaff(company);
  const [co, setCo] = React.useState(null);
  const [resumes, setResumes] = React.useState({});
  // ✋ 2026-11-01 임시저장(이 기기) — 쓰다가 다른 메뉴로 가면 저장할지 묻고, 다시 오면 이어서
  const draftKey = `cert:${company}`;
  const [draft] = React.useState(() => draftStore.get(draftKey));
  const [uid, setUid] = React.useState(draft?.uid || "");
  const [kind, setKind] = React.useState(draft?.kind || "employ");
  const [purpose, setPurpose] = React.useState(draft?.purpose || "");
  const [duty, setDuty] = React.useState(draft?.duty || "");
  const [mail, setMail] = React.useState(draft?.mail ?? true);
  useLeaveGuard(!!(purpose.trim() || duty.trim()), { label: "증명서 발급", onSave: () => draftStore.set(draftKey, { uid, kind, purpose, duty, mail }), onDiscard: () => draftStore.del(draftKey) });
  const [busy, setBusy] = React.useState("");
  const [q, setQ] = React.useState("");
  const paperRef = React.useRef(null);
  React.useEffect(() => { if (company) companyPrintInfo(company).then(setCo); }, [company]);
  React.useEffect(() => { if (!uid || resumes[uid]) return; getDoc(doc(db, "hrResumes", uid)).then((s) => setResumes((p) => ({ ...p, [uid]: s.exists() ? s.data() : {} }))).catch(() => {}); }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const log = Object.entries(profiles).flatMap(([id, p]) => (p.certLog || []).map((c) => ({ ...c, uid: id }))).filter((c) => staff.some((u) => u.id === c.uid)).sort((a, b) => String(b.no).localeCompare(String(a.no)));
  const ym = kstDay().slice(0, 7);
  const u = staff.find((x) => x.id === uid) || null;
  const today = kstDay();
  const no = `${kind === "career" ? "CC" : "EC"}-${today.replace(/-/g, "")}-${String(log.filter((c) => c.date === today).length + 1).padStart(3, "0")}`;
  const list = staff.filter((x) => !q || nm(x).includes(q) || String(x.team || "").includes(q)).sort((a, b) => (a.employmentStatus === "퇴사") - (b.employmentStatus === "퇴사") || nm(a).localeCompare(nm(b)));
  const rs = resumes[uid] || {};
  const issue = async () => {
    if (!u) return alert("직원을 골라 주세요.");
    if (!purpose.trim()) return alert("용도를 적어 주세요. (예: 금융기관 제출용)");
    if (kind === "employ" && u.employmentStatus === "퇴사") return alert("퇴사자는 경력증명서로 발급해 주세요.");
    setBusy("발급 중…");
    try {
      const canvas = await html2canvas(paperRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const image = await compressImage(canvas.toDataURL("image/jpeg", 0.92), 1600, 0.88);
      if (!isViewer) await setDoc(doc(db, "userProfiles", u.id), { certLog: arrayUnion({ no, kind, purpose: purpose.trim(), date: today, by: auth.currentUser?.uid || "", mailed: mail && !u.noAccount }) }, { merge: true });
      if (mail && !u.noAccount && u.employmentStatus !== "퇴사") {
        setBusy("사내메일 보내는 중…");
        const label = kind === "career" ? "경력증명서" : "재직증명서";
        await sendInternalMail({ company, to: [{ uid: u.id, name: nm(u), team: u.team || "", position: u.position || "" }], subject: `[${label} 발급] ${nm(u)} · ${purpose.trim()}`, body: `${nm(u)}님, 요청하신 ${label}를 발급했습니다.\n\n· 발급번호: ${no}\n· 용도: ${purpose.trim()}\n· 발급일: ${today}\n\n첨부 이미지를 저장·인쇄해 제출하세요. 원본(직인) 인쇄본이 필요하면 인사관리부에 말씀해 주세요.`, images: [image], kind: "hr", fromName: "인사관리부" }).catch((e) => alert(`메일 발송 실패: ${e.message}`));
      }
      setBusy("인쇄 창 여는 중…");
      await printA4(paperRef.current, `${kind === "career" ? "경력증명서" : "재직증명서"}_${nm(u)}`);
      setPurpose(""); setDuty(""); draftStore.del(draftKey);
    } finally { setBusy(""); }
  };
  if (loading) return <Loading />;
  return (
    <div className="space-y-3">
      <BookHero en="HR · CERTIFICATES" title="증명서 발급" desc="왼쪽에서 고르고 입력하면 오른쪽 양식에 바로 반영 · 발급하면 인쇄되고 본인에게 사내메일로 자동 발송됩니다"
        kpis={[["재직", `${staff.filter((x) => x.employmentStatus !== "퇴사").length}명`], ["퇴사", `${staff.filter((x) => x.employmentStatus === "퇴사").length}명`], ["이번 달 발급", `${log.filter((c) => String(c.date).startsWith(ym)).length}건`], ["전체 발급", `${log.length}건`]]} />
      <div className="grid grid-cols-1 xl:grid-cols-[400px_minmax(0,1fr)] gap-4 items-start">
        <div className="space-y-3">
          <BookCard en="STEP 1" title="직원 선택" right={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·부서" className="h-9 w-[130px] px-3 rounded-lg border border-[#DCE3EE] text-[13px] outline-none" />} flush>
            <div className="divide-y divide-[#EEF2F8] max-h-[260px] overflow-y-auto">
              {list.map((x) => (
                <button key={x.id} type="button" onClick={() => { setUid(x.id); if (x.employmentStatus === "퇴사") setKind("career"); }} className={`w-full text-left px-4 py-2 flex items-center gap-2.5 ${uid === x.id ? "bg-[#F2F6FD] shadow-[inset_3px_0_0_#1B2B4B]" : "hover:bg-[#F8FAFD]"}`}>
                  <Avatar name={nm(x)} />
                  <span className="flex-1 min-w-0"><span className="block text-[14px] font-black text-[#0F1A30] truncate">{nm(x)} {x.employmentStatus === "퇴사" && <span className="text-[10.5px] font-black px-1 rounded bg-[#F2F4F7] text-[#5B6B85]">퇴사</span>}</span><span className="block text-[11.5px] text-[#7A879C] truncate">{[x.team, x.position].filter(Boolean).join(" · ")}</span></span>
                </button>
              ))}
            </div>
          </BookCard>
          <BookCard en="STEP 2" title="발급 내용">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#F4F6FA] border border-[#E3E8F0]">{[["employ", "재직증명서"], ["career", "경력증명서"]].map(([k, l]) => <button key={k} type="button" onClick={() => setKind(k)} className={`h-10 rounded-lg text-[14px] font-black ${kind === k ? "bg-[#0F1A30] text-white" : "text-[#5B6B85]"}`}>{l}</button>)}</div>
              <div><div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">용도</div><input value={purpose} onChange={(e) => setPurpose(e.target.value)} className={inp} placeholder="예: 금융기관 제출용" />
                <div className="flex gap-1.5 mt-2 flex-wrap">{["금융기관 제출용", "관공서 제출용", "비자 발급용", "이직용", "개인 보관용"].map((p) => <Chip key={p} on={purpose === p} onClick={() => setPurpose(p)}>{p}</Chip>)}</div></div>
              <div><div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">담당 업무(선택)</div><input value={duty} onChange={(e) => setDuty(e.target.value)} className={inp} placeholder="예: 화물 배차·운송 관리" /></div>
              <label className="flex items-center gap-2 text-[13px] font-bold text-[#3A4A66]"><input type="checkbox" checked={mail} onChange={(e) => setMail(e.target.checked)} className="w-4 h-4" />발급하면 본인에게 사내메일로 자동 발송{u?.noAccount ? " (계정 없는 직원은 제외)" : ""}</label>
              <button type="button" disabled={!!busy || !u} onClick={issue} className="w-full h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50">{busy || "발급 · 인쇄" + (mail ? " · 메일 발송" : "")}</button>
            </div>
          </BookCard>
          <BookCard en="ISSUE LOG" title={`발급 대장 ${log.length}건`} flush>
            {!log.length ? <div className="py-6 text-center text-[13px] font-bold text-[#9AA9C3]">발급한 증명서가 없습니다</div> : (
              <div className="divide-y divide-[#EEF2F8] max-h-[220px] overflow-y-auto">
                {log.slice(0, 50).map((c) => <div key={c.no} className="px-4 py-2 flex items-center gap-2 text-[12.5px]"><span className="text-[11px] font-bold text-[#4B6CB7]" style={{ fontFamily: MONO }}>{c.no}</span><span className="font-black text-[#0F1A30]">{nm(staff.find((x) => x.id === c.uid))}</span><span className="text-[#5B6B85] truncate">{c.kind === "career" ? "경력" : "재직"} · {c.purpose}</span>{c.mailed && <span className="ml-auto text-[10.5px] font-black text-[#2D4C82]">메일</span>}</div>)}
              </div>
            )}
          </BookCard>
        </div>
        <div className="rounded-[20px] bg-[#E9EDF4] border border-[#DCE3EE] p-4 overflow-x-auto">
          <div className="flex items-center justify-between mb-3"><span className="text-[11px] font-extrabold tracking-[0.24em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>LIVE PREVIEW · A4</span><span className="text-[12px] font-bold text-[#7A879C]">입력하는 대로 바로 바뀝니다</span></div>
          {!u ? <div className="py-40 text-center text-[14px] font-bold text-[#9AA9C3]">왼쪽에서 직원을 고르면 양식이 보입니다</div> : (
            <div className="shadow-[0_18px_40px_rgba(15,26,48,0.18)] w-fit mx-auto" ref={paperRef}>
              <CertPaper kind={kind} no={no} u={u} pf={profiles[u.id]} co={co} purpose={purpose} duty={duty} issueDate={today} birth={rs.birthDate || u.birthDate || profiles[u.id]?.birth || ""} address={rs.address || u.address || ""} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
