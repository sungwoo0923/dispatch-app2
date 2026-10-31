// ======================= src/HrTools.jsx =======================
// 🧑‍💼 인사 업무(2026-10-31) — 연차 관리 대장 · 입·퇴사 체크리스트 · 재직/경력증명서 발급. PC·모바일 공용(반응형).
//  · 연차 관리 대장: 입사일(userProfiles.hireDate) 기준 발생(근로기준법 60조) − 전자결재 연차·반차 승인분 = 잔여
//    회기 종료 6개월 안에 잔여가 많으면 "사용 촉진"(근로기준법 61조 연차사용촉진) 대상으로 표시
//  · 입·퇴사 체크리스트: 근로계약서·4대보험 취득/상실 신고·장비 지급/반납·계정 발급/정지·퇴직금 정산 등
//    법정 기한(4대보험 다음 달 15일, 퇴직금 14일)을 함께 보여주고, 사람마다 체크 상태를 userProfiles에 저장
//  · 증명서 발급: 재직증명서·경력증명서 — 회사 정보·직인(회사정보에 등록된 것)으로 바로 인쇄, 발급 대장 남김
import React from "react";
import { collection, doc, onSnapshot, query, setDoc, where, arrayUnion, getDocs } from "firebase/firestore";
import { db, auth, DEFAULT_COMPANY } from "./firebase";
import { leaveEntitlement, leaveUseOf } from "./approvalForms";
import { isTMUser } from "./staffFilter";
import { personName } from "./userNames";
import { BookHero, BookCard, Chip, Sheet, MONO } from "./OfficeBooks";

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
export function LeaveLedger({ company, isViewer = false }) {
  const { loading, staff, profiles } = useStaff(company);
  const apprs = useLeaveApprovals(company);
  const [team, setTeam] = React.useState("전체");
  const [filter, setFilter] = React.useState("all");
  const [open, setOpen] = React.useState(null);
  const [editHire, setEditHire] = React.useState(null); // { u, v }
  const today = kstDay();
  const active = staff.filter((u) => u.employmentStatus !== "퇴사");
  const rows = active.map((u) => {
    const hire = hireOf(u, profiles);
    const ent = leaveEntitlement(hire);
    const mine = apprs.filter((a) => a.drafterUid === u.id);
    const inPeriod = (a) => { const x = leaveUseOf(a); return x && ent && x.date >= ent.from && x.date <= ent.to ? x : null; };
    const used = mine.filter((a) => a.status === "approved" && inPeriod(a)).reduce((s, a) => s + inPeriod(a).days, 0);
    const wait = mine.filter((a) => a.status === "pending" && inPeriod(a)).reduce((s, a) => s + inPeriod(a).days, 0);
    const total = ent?.total || 0;
    const remain = total - used;
    const left = ent ? dayGap(today, ent.to) : 0;
    const promote = !!ent && ent.label === "연차" && remain >= 3 && left <= 183;
    const hist = mine.filter((a) => leaveUseOf(a)).sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
    return { u, hire, ent, used, wait, total, remain, left, promote, hist };
  });
  const teams = ["전체", ...Array.from(new Set(active.map((u) => u.team || "미지정")))];
  const shown = rows
    .filter((r) => team === "전체" || (r.u.team || "미지정") === team)
    .filter((r) => (filter === "promote" ? r.promote : filter === "nohire" ? !r.hire : filter === "low" ? r.ent && r.remain <= 2 : true))
    .sort((a, b) => (b.promote - a.promote) || (b.remain - a.remain));
  const withEnt = rows.filter((r) => r.ent && r.total);
  const avgUse = withEnt.length ? Math.round((withEnt.reduce((s, r) => s + r.used / r.total, 0) / withEnt.length) * 100) : 0;
  const saveHire = async () => {
    if (!editHire?.v) return;
    await setDoc(doc(db, "userProfiles", editHire.u.id), { hireDate: editHire.v }, { merge: true });
    setEditHire(null);
  };
  if (loading) return <Loading />;
  return (
    <div className="space-y-3">
      <BookHero en="HR · ANNUAL LEAVE" title="연차 관리 대장" desc="입사일 기준 발생 연차와 전자결재 사용 내역으로 잔여 연차를 자동 계산합니다."
        kpis={[["대상 인원", `${active.length}명`], ["평균 소진율", `${avgUse}%`], ["사용 촉진 대상", `${rows.filter((r) => r.promote).length}명`, "회기 종료 6개월 이내 · 잔여 3일+"], ["입사일 미등록", `${rows.filter((r) => !r.hire).length}명`]]}
        right={<button type="button" onClick={() => csv(`연차관리대장_${today}.csv`, [["이름", "부서", "직급", "입사일", "구분", "회기", "발생", "사용", "결재 중", "잔여"], ...shown.map((r) => [nm(r.u), r.u.team, r.u.position, r.hire, r.ent?.label, r.ent ? `${r.ent.from}~${r.ent.to}` : "", r.total, r.used, r.wait, r.remain])])}
          className="h-10 px-4 rounded-xl bg-white/10 border border-white/20 text-[13px] font-black whitespace-nowrap">엑셀(CSV)</button>} />
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {[["all", "전체"], ["promote", "사용 촉진"], ["low", "잔여 2일 이하"], ["nohire", "입사일 미등록"]].map(([k, l]) => <Chip key={k} on={filter === k} onClick={() => setFilter(k)}>{l}</Chip>)}
        <span className="w-px bg-[#DCE3EE] mx-1 shrink-0" />
        {teams.map((t) => <Chip key={t} on={team === t} onClick={() => setTeam(t)}>{t}</Chip>)}
      </div>
      <BookCard en="LEDGER" title={`직원별 연차 · ${shown.length}명`} flush>
        {!shown.length ? <div className="py-12 text-center text-[13px] font-bold text-[#9AA9C3]">해당하는 직원이 없습니다</div> : (
          <div className="divide-y divide-[#EEF2F8]">
            {shown.map((r) => {
              const pct = r.total ? (r.used / r.total) * 100 : 0;
              return (
                <div key={r.u.id}>
                  <button type="button" onClick={() => setOpen(open === r.u.id ? null : r.u.id)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[#F7F9FC]">
                    <Avatar name={nm(r.u)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[14.5px] font-black text-[#0F1A30] whitespace-nowrap">{nm(r.u)}</span>
                        <span className="text-[12px] font-bold text-[#7A879C] whitespace-nowrap">{[r.u.team, r.u.position].filter(Boolean).join(" · ")}</span>
                        {r.promote && <span className="text-[10.5px] font-black px-1.5 py-0.5 rounded-md bg-[#FFF4E5] text-[#B54708] border border-[#FEDF89] whitespace-nowrap">사용 촉진</span>}
                        {!r.hire && <span className="text-[10.5px] font-black px-1.5 py-0.5 rounded-md bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA] whitespace-nowrap">입사일 없음</span>}
                      </div>
                      {r.ent ? (
                        <>
                          <div className="text-[11.5px] text-[#7A879C] mt-0.5 whitespace-nowrap truncate" style={{ fontFamily: MONO }}>{r.ent.label} · {r.ent.from} ~ {r.ent.to} · D-{Math.max(0, r.left)}</div>
                          <div className="mt-1.5 max-w-[360px]"><Bar pct={pct} tone={r.remain <= 2 ? "#D92D20" : "#2D4C82"} /></div>
                        </>
                      ) : <div className="text-[11.5px] text-[#9AA9C3] mt-0.5">입사일을 등록하면 연차가 자동 계산됩니다</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[20px] font-black text-[#0F1A30] tabular-nums leading-none" style={{ fontFamily: MONO }}>{r.ent ? r.remain : "-"}<span className="text-[11px] text-[#9AA9C3]">/{r.total}</span></div>
                      <div className="text-[11px] font-bold text-[#7A879C] mt-1 whitespace-nowrap">잔여{r.wait ? ` · 결재 중 ${r.wait}` : ""}</div>
                    </div>
                  </button>
                  {open === r.u.id && (
                    <div className="px-4 pb-4 bg-[#F7F9FC]">
                      <div className="flex items-center gap-2 py-2 flex-wrap">
                        <span className="text-[12.5px] font-black text-[#3A4A66]">입사일</span>
                        <span className="text-[13px] font-bold text-[#0F1A30]" style={{ fontFamily: MONO }}>{r.hire || "미등록"}</span>
                        {!isViewer && <button type="button" onClick={() => setEditHire({ u: r.u, v: r.hire || kstDay() })} className="h-8 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[12px] font-black text-[#1B2B4B]">입사일 {r.hire ? "수정" : "등록"}</button>}
                      </div>
                      {!r.hist.length ? <div className="text-[12.5px] text-[#9AA9C3] py-2">전자결재로 신청한 연차·반차가 없습니다</div> : (
                        <div className="rounded-xl bg-white border border-[#E3E8F0] divide-y divide-[#EEF2F8]">
                          {r.hist.slice(0, 20).map((a) => {
                            const x = leaveUseOf(a);
                            const st = { approved: ["승인", "#067647", "#ECFDF3"], pending: ["결재 중", "#B54708", "#FFF4E5"], rejected: ["반려", "#B42318", "#FEF3F2"] }[a.status] || ["취소", "#7A879C", "#F2F4F7"];
                            return (
                              <div key={a.id} className="px-3 py-2 flex items-center gap-2 text-[12.5px]">
                                <span className="font-bold text-[#0F1A30] whitespace-nowrap" style={{ fontFamily: MONO }}>{x.date}</span>
                                <span className="text-[#5B6B85] whitespace-nowrap">{a.form === "half" ? (a.data?.ampm || "반차") : (a.data?.kind || "연차")}</span>
                                <span className="text-[#5B6B85] whitespace-nowrap" style={{ fontFamily: MONO }}>{x.days}일</span>
                                <span className="ml-auto text-[11px] font-black px-1.5 py-0.5 rounded-md whitespace-nowrap" style={{ color: st[1], background: st[2] }}>{st[0]}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </BookCard>
      <div className="rounded-2xl bg-white border border-[#E3E8F0] px-4 py-3 text-[12px] text-[#5B6B85] leading-relaxed">
        <b className="text-[#0F1A30]">계산 기준</b> · 1년 미만: 1개월 개근 시 1일(최대 11일) · 1년 이상: 15일, 3년차부터 2년마다 1일 가산(최대 25일) · 반차 0.5일, 반반차 0.25일 ·
        회기 종료 6개월 전 서면 촉진, 2개월 전 사용 시기 지정 통보를 하면 미사용 연차 수당 지급 의무가 면제됩니다(근로기준법 61조).
      </div>
      {editHire && (
        <Sheet en="HIRE DATE" title={`${nm(editHire.u)} 입사일`} onClose={() => setEditHire(null)}
          footer={<><button type="button" onClick={() => setEditHire(null)} className="flex-1 h-12 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-black text-[#3A4A66]">취소</button><button type="button" onClick={saveHire} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black">저장</button></>}>
          <input type="date" value={editHire.v} onChange={(e) => setEditHire({ ...editHire, v: e.target.value })} className={inp} />
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

export function CertIssuer({ company, isViewer = false }) {
  const { loading, staff, profiles } = useStaff(company);
  const [form, setForm] = React.useState(null); // { uid, kind, purpose, duty }
  const [busy, setBusy] = React.useState(false);
  const [q, setQ] = React.useState("");
  const log = Object.entries(profiles).flatMap(([uid, p]) => (p.certLog || []).map((c) => ({ ...c, uid }))).filter((c) => staff.some((u) => u.id === c.uid)).sort((a, b) => String(b.no).localeCompare(String(a.no)));
  const ym = kstDay().slice(0, 7);
  const list = staff.filter((u) => !q || nm(u).includes(q) || String(u.team || "").includes(q)).sort((a, b) => (a.employmentStatus === "퇴사") - (b.employmentStatus === "퇴사") || nm(a).localeCompare(nm(b)));
  const issue = async () => {
    const u = staff.find((x) => x.id === form.uid);
    if (!u) return;
    if (!form.purpose.trim()) return alert("용도를 적어 주세요. (예: 금융기관 제출용)");
    const w = window.open("", "_blank");
    setBusy(true);
    try {
      const co = await companyPrintInfo(company);
      const issueDate = kstDay();
      const no = `${form.kind === "career" ? "CC" : "EC"}-${issueDate.replace(/-/g, "")}-${String(log.filter((c) => c.date === issueDate).length + 1).padStart(3, "0")}`;
      const html = certHtml({ kind: form.kind, no, u, pf: profiles[u.id], co, purpose: form.purpose, duty: form.duty, issueDate });
      if (w) { w.document.open(); w.document.write(html); w.document.close(); }
      if (!isViewer) await setDoc(doc(db, "userProfiles", u.id), { certLog: arrayUnion({ no, kind: form.kind, purpose: form.purpose, date: issueDate, by: auth.currentUser?.uid || "" }) }, { merge: true });
      setForm(null);
    } finally { setBusy(false); }
  };
  if (loading) return <Loading />;
  return (
    <div className="space-y-3">
      <BookHero en="HR · CERTIFICATES" title="증명서 발급" desc="재직증명서·경력증명서를 회사 정보와 직인으로 바로 인쇄하고 발급 대장을 남깁니다."
        kpis={[["재직", `${staff.filter((u) => u.employmentStatus !== "퇴사").length}명`], ["퇴사", `${staff.filter((u) => u.employmentStatus === "퇴사").length}명`], ["이번 달 발급", `${log.filter((c) => String(c.date).startsWith(ym)).length}건`], ["전체 발급", `${log.length}건`]]} />
      <div className="grid md:grid-cols-[1.2fr_1fr] gap-3">
        <BookCard en="EMPLOYEES" title="직원 선택" right={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·부서 검색" className="h-9 w-[150px] px-3 rounded-lg border border-[#DCE3EE] text-[13px] outline-none" />} flush>
          <div className="divide-y divide-[#EEF2F8] max-h-[560px] overflow-y-auto">
            {list.map((u) => {
              const left = u.employmentStatus === "퇴사";
              return (
                <div key={u.id} className="px-4 py-2.5 flex items-center gap-3">
                  <Avatar name={nm(u)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5"><span className="text-[14px] font-black text-[#0F1A30] whitespace-nowrap">{nm(u)}</span>{left && <span className="text-[10.5px] font-black px-1.5 py-0.5 rounded-md bg-[#F2F4F7] text-[#5B6B85] whitespace-nowrap">퇴사</span>}</div>
                    <div className="text-[11.5px] text-[#7A879C] truncate">{[u.team, u.position, hireOf(u, profiles) && `입사 ${hireOf(u, profiles)}`].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {!left && <button type="button" onClick={() => setForm({ uid: u.id, kind: "employ", purpose: "", duty: "" })} className="h-9 px-3 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black whitespace-nowrap">재직</button>}
                    <button type="button" onClick={() => setForm({ uid: u.id, kind: "career", purpose: "", duty: "" })} className="h-9 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[#1B2B4B] text-[12.5px] font-black whitespace-nowrap">경력</button>
                  </div>
                </div>
              );
            })}
          </div>
        </BookCard>
        <BookCard en="ISSUE LOG" title="발급 대장" flush>
          {!log.length ? <div className="py-12 text-center text-[13px] font-bold text-[#9AA9C3]">발급한 증명서가 없습니다</div> : (
            <div className="divide-y divide-[#EEF2F8] max-h-[560px] overflow-y-auto">
              {log.slice(0, 60).map((c) => {
                const u = staff.find((x) => x.id === c.uid);
                return (
                  <div key={c.no} className="px-4 py-2.5 flex items-center gap-2 text-[12.5px]">
                    <span className="text-[11px] font-bold text-[#4B6CB7] whitespace-nowrap" style={{ fontFamily: MONO }}>{c.no}</span>
                    <span className="font-black text-[#0F1A30] whitespace-nowrap">{nm(u)}</span>
                    <span className="text-[#5B6B85] truncate">{c.kind === "career" ? "경력" : "재직"} · {c.purpose}</span>
                  </div>
                );
              })}
            </div>
          )}
        </BookCard>
      </div>
      {form && (
        <Sheet en={form.kind === "career" ? "CAREER CERTIFICATE" : "EMPLOYMENT CERTIFICATE"} title={`${nm(staff.find((x) => x.id === form.uid))} · ${form.kind === "career" ? "경력증명서" : "재직증명서"}`} onClose={() => setForm(null)}
          footer={<><button type="button" onClick={() => setForm(null)} className="flex-1 h-12 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-black text-[#3A4A66]">취소</button><button type="button" disabled={busy} onClick={issue} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-50">{busy ? "준비 중…" : "발급·인쇄"}</button></>}>
          <div>
            <div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">용도</div>
            <input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="예: 금융기관 제출용" className={inp} />
            <div className="flex gap-1.5 mt-2 flex-wrap">{["금융기관 제출용", "관공서 제출용", "비자 발급용", "이직용", "개인 보관용"].map((p) => <Chip key={p} on={form.purpose === p} onClick={() => setForm({ ...form, purpose: p })}>{p}</Chip>)}</div>
          </div>
          <div>
            <div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">담당 업무(선택)</div>
            <input value={form.duty} onChange={(e) => setForm({ ...form, duty: e.target.value })} placeholder="예: 화물 배차·운송 관리" className={inp} />
          </div>
          <div className="rounded-xl bg-white border border-[#E3E8F0] px-3 py-2.5 text-[12px] text-[#5B6B85] leading-relaxed">
            회사 정보·직인은 <b>회사관리 › 회사정보</b>에 등록된 내용으로 찍힙니다. 생년월일·주소는 인사관리 › 이력서에 입력된 값을 사용합니다.
          </div>
        </Sheet>
      )}
    </div>
  );
}
