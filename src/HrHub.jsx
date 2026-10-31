// ======================= src/HrHub.jsx =======================
// 🧑‍💼 인사관리부 허브(2026-10-31) — 인사관리자 상단 메뉴 [인사관리부] 안의 왼쪽 메뉴.
//  인사 기록(이력서·근태·인사발령) · 직원 등록(계정 없이 인사 기록) · 정보 수정(공문 없이 바로) · 출근기록부 ·
//  퇴사·권고사직 · 직책·부서 설정(회사별 추가·숨김) · 사내 규정(취업규칙 등)
import React from "react";
import { addDoc, arrayUnion, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db, auth, DEFAULT_COMPANY } from "./firebase";
import KpSubNav from "./KpSubNav";
import { BookHero, BookCard, Chip, Sheet, MONO } from "./OfficeBooks";
import { useHrOptions, isExecProfile, suggestRole, ROLE_NAME, EXEC_TEAM, TEAM_OPTIONS, POSITION_OPTIONS, EXEC_POSITION_OPTIONS } from "./hrConstants";
import { isTMUser } from "./staffFilter";
import { RETIRE_REASONS } from "./AcctSuite";
import { LeaveLedger } from "./HrTools";
import ObituaryWriter from "./ObituaryWriter";
import { useRoleOptions } from "./customRoles";
import { RULE_CATS, RULE_TEMPLATES, fillCompany } from "./companyRuleTemplates";

const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const inp = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";
const Label = ({ children }) => <div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">{children}</div>;
const ROLE_KEYS = ["admin", "hrManager", "hrAcct", "test", "user", "viewer"];
// 재직 상태 — 휴직 계열은 재직자로 센다(퇴사·권고사직은 [퇴사] 탭에서 처리)
export const LEAVE_STATUSES = ["휴직", "육아휴직", "출산휴가"];
const STATUS_OPTIONS = ["재직", ...LEAVE_STATUSES];
// 부서·직책으로 권한 추천 — 임원이면 권한 관리의 "임원 화면" 역할(없으면 관리자)
const suggestFor = (x, execKeys = []) => (isExecProfile(x) && execKeys[0] ? execKeys[0] : suggestRole(x));
const ROLE_DESC = {
  admin: "배차·정산·매출·관리자메뉴 등 전체 업무(임원은 이 권한으로 고정)",
  hrManager: "인사관리부 화면 — 인사 기록·발령·근태·입퇴사·직원 승인",
  test: "경리 화면 — 정산·회계·자금·비품·퇴직 정산",
  hrAcct: "경리 + 인사 — 상단 버튼으로 경리 화면 ↔ 인사 화면 전환",
  user: "실무자 — 배차·기사·거래처 업무(매출·정산 제외)",
  viewer: "조회전용 — 보기만, 수정 불가",
};

function useStaff(company) {
  const [users, setUsers] = React.useState(null);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "users"), where("companyName", "==", company)), (s) => setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setUsers([]));
  }, [company]);
  return (users || []).filter((u) => (u.companyName || DEFAULT_COMPANY) === company && !["driver", "shipper", "cafeUser", "totalMaster"].includes(u.role) && !isTMUser(u));
}
const Avatar = ({ name }) => <span className="w-10 h-10 rounded-xl bg-[#1B2B4B] text-white grid place-items-center text-[14px] font-black shrink-0">{String(name || "?").slice(0, 1)}</span>;

// ═════════════════ 직원 등록(계정 없이) ═════════════════
export function StaffRegister({ company, onDone }) {
  const hr = useHrOptions(company);
  const ro = useRoleOptions();
  const blank = { name: "", phone: "", email: "", team: "", position: "", hireDate: kstDay(), birthDate: "", address: "", employType: "정규직", memo: "" };
  const [f, setF] = React.useState(blank);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(null);
  const save = async () => {
    if (!f.name.trim()) return alert("이름을 입력해 주세요.");
    setBusy(true);
    try {
      const role = suggestFor({ team: f.team, position: f.position }, ro.execKeys);
      const ref = await addDoc(collection(db, "users"), {
        companyName: company, name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), team: f.team, position: f.position, role, approved: true,
        employmentStatus: "재직", hireDate: f.hireDate, employType: f.employType, noAccount: true, registeredBy: auth.currentUser?.email || "", createdAt: serverTimestamp(),
        personnelHistory: [{ date: kstDay(), type: "인사 등록", detail: `${f.team || "미배정"} · ${f.position || "-"} · ${f.employType}` }],
      });
      await setDoc(doc(db, "userProfiles", ref.id), { hireDate: f.hireDate }, { merge: true });
      await setDoc(doc(db, "hrResumes", ref.id), { companyName: company, birthDate: f.birthDate, address: f.address, memo: f.memo }, { merge: true });
      setDone({ id: ref.id, name: f.name.trim() });
      setF(blank);
    } catch (e) { alert(`등록 실패: ${e.message}`); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <BookHero en="HR · REGISTER" title="직원 등록" desc="프로그램 계정이 없어도 인사 기록을 만들 수 있습니다 — 등록 후 인사 기록에서 이력서를 채우세요" />
      {done && <div className="rounded-2xl bg-[#ECFDF3] border border-[#ABEFC6] px-4 py-3 flex items-center gap-3"><b className="text-[14px] text-[#067647]">✓ {done.name}님을 등록했습니다</b><button type="button" onClick={() => onDone?.(done.id)} className="ml-auto h-9 px-4 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black">이력서 작성하러 가기 ›</button></div>}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
        <BookCard en="PERSONAL" title="인적 사항">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>이름 *</Label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inp} /></div>
            <div><Label>생년월일</Label><input type="date" value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value })} className={inp} /></div>
            <div><Label>연락처</Label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={inp} placeholder="010-0000-0000" /></div>
            <div><Label>이메일(선택)</Label><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={inp} /></div>
            <div className="md:col-span-2"><Label>주소</Label><input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} className={inp} /></div>
          </div>
        </BookCard>
        <BookCard en="POSITION" title="소속 · 입사">
          <div className="space-y-3">
            <div><Label>부서</Label><select value={f.team} onChange={(e) => { const team = e.target.value; setF({ ...f, team, position: hr.positionsFor(team).includes(f.position) ? f.position : "" }); }} className={inp}><option value="">미배정</option>{hr.teams.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div><Label>직책</Label><select value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} className={inp}><option value="">미설정</option>{hr.positionsFor(f.team).map((p) => <option key={p}>{p}</option>)}</select></div>
            <div><Label>고용 형태</Label><div className="flex flex-wrap gap-1.5">{["정규직", "계약직", "수습", "파트타임", "일용직"].map((k) => <Chip key={k} on={f.employType === k} onClick={() => setF({ ...f, employType: k })}>{k}</Chip>)}</div></div>
            <div><Label>입사일</Label><input type="date" value={f.hireDate} onChange={(e) => setF({ ...f, hireDate: e.target.value })} className={inp} /></div>
            <div className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3 py-2 text-[12px] text-[#5B6B85]">권한: <b className="text-[#0F1A30]">{ro.label(suggestFor({ team: f.team, position: f.position }, ro.execKeys))}</b> (부서·직책 기준) · 계정이 없으므로 로그인은 안 됩니다</div>
            <button type="button" disabled={busy} onClick={save} className="w-full h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50">{busy ? "등록 중…" : "직원 등록"}</button>
          </div>
        </BookCard>
      </div>
    </div>
  );
}

export function printResign(company, u, plan) {
    const w = window.open("", "_blank"); if (!w) return;
    const isAdvice = plan.type === "권고사직";
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${isAdvice ? "권고사직 합의서" : "퇴직 확인서"}</title><style>@page{size:A4;margin:22mm 20mm}body{font-family:'Malgun Gothic',sans-serif;color:#111}h1{text-align:center;letter-spacing:8px;font-size:28px;margin:30px 0}table{width:100%;border-collapse:collapse;font-size:14px}th,td{border:1px solid #333;padding:10px}th{width:120px;background:#f2f4f8}p{font-size:14.5px;line-height:1.9}.sign{margin-top:50px;font-size:15px;line-height:2.2}</style></head><body>
<h1>${isAdvice ? "권 고 사 직 합 의 서" : "퇴 직 확 인 서"}</h1>
<table><tr><th>성명</th><td>${u.name || ""}</td><th>소속</th><td>${[u.team, u.position].filter(Boolean).join(" · ")}</td></tr><tr><th>입사일</th><td>${u.hireDate || ""}</td><th>퇴직일</th><td>${plan.date}</td></tr><tr><th>구분</th><td colspan="3">${plan.type}</td></tr><tr><th>사유</th><td colspan="3">${String(plan.reason || "").replace(/</g, "&lt;")}</td></tr></table>
<p>${isAdvice ? "회사는 위 근로자에게 사직을 권고하였고, 근로자는 이에 동의하여 위 퇴직일에 근로관계를 종료하기로 합의합니다. 회사는 퇴직금 및 미사용 연차수당 등 법정 금품을 퇴직일로부터 14일 이내에 지급하며, 근로자의 실업급여 신청을 위한 이직확인서를 고용센터에 제출합니다." : "위 근로자는 위 퇴직일자로 퇴직하였음을 확인합니다. 회사는 법정 금품을 퇴직일로부터 14일 이내에 지급합니다."}</p>
<div class="sign">${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 ${new Date().getDate()}일<br/>회사: ${company} &nbsp; 대표이사 (인)<br/>근로자: ${u.name || ""} (서명)</div>
<script>setTimeout(()=>print(),300)</script></body></html>`);
    w.document.close();
  }

// ═════════════════ 직원 정보 · 퇴사(정보 수정 + 퇴사·권고사직 통합, 2026-10-31) ═════════════════
const tenureOf = (h) => { if (!h) return ""; const m = Math.max(0, Math.floor((new Date(`${kstDay()}T00:00:00Z`) - new Date(`${h}T00:00:00Z`)) / (30.44 * 864e5))); return `${Math.floor(m / 12) ? `${Math.floor(m / 12)}년 ` : ""}${m % 12}개월`; };
export function StaffInfoBoard({ company, canManage }) {
  const all = useStaff(company);
  const hr = useHrOptions(company);
  const ro = useRoleOptions();
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState(null);
  const [mode, setMode] = React.useState("info"); // info | resign
  const [f, setF] = React.useState(null);
  const [r, setR] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [showLeft, setShowLeft] = React.useState(false);
  const active = all.filter((u) => u.employmentStatus !== "퇴사");
  const planned = active.filter((u) => u.resignPlan?.date);
  const left = all.filter((u) => u.employmentStatus === "퇴사").sort((a, b) => String(b.resignedAt || "").localeCompare(String(a.resignedAt || "")));
  const kw = q.trim();
  const match = (u) => !kw || [u.name, u.team, u.position, u.phone].some((v) => String(v || "").includes(kw));
  const groups = (() => { const g = {}; active.filter(match).forEach((u) => { const t = u.team || "미배정"; (g[t] = g[t] || []).push(u); }); return hr.teams.concat(["미배정"]).filter((t) => g[t]).map((t) => [t, g[t].sort((a, b) => hr.positionsFor(t).indexOf(b.position) - hr.positionsFor(t).indexOf(a.position) || String(a.name || "").localeCompare(String(b.name || ""), "ko"))]).concat(Object.keys(g).filter((t) => !hr.teams.includes(t) && t !== "미배정").map((t) => [t, g[t]])); })();
  const open = (u, m = "info") => {
    setSel(u); setMode(m);
    setF({ name: u.name || "", phone: u.phone || "", team: u.team || "", position: u.position || "", role: u.role || "user", employType: u.employType || "정규직", employmentStatus: u.employmentStatus || "재직", leaveFrom: u.leave?.from || kstDay(), leaveTo: u.leave?.to || "", leaveMemo: u.leave?.memo || "" });
    setR({ type: u.resignPlan?.type || "자진 퇴사", date: u.resignPlan?.date || kstDay(), reason: u.resignPlan?.reason || "", noticeDate: kstDay() });
  };
  const saveInfo = async () => {
    const onLeave = LEAVE_STATUSES.includes(f.employmentStatus);
    if (onLeave && !f.leaveFrom) return alert("휴직 시작일을 입력해 주세요.");
    setBusy(true);
    try {
      const role = f.role;
      const ch = [];
      if ((sel.employmentStatus || "재직") !== f.employmentStatus) ch.push(`재직상태 ${sel.employmentStatus || "재직"}→${f.employmentStatus}${onLeave ? ` (${f.leaveFrom}~${f.leaveTo || "미정"})` : ""}`);
      if ((sel.team || "") !== f.team) ch.push(`부서 ${sel.team || "미배정"}→${f.team || "미배정"}`);
      if ((sel.position || "") !== f.position) ch.push(`직책 ${sel.position || "-"}→${f.position || "-"}`);
      if ((sel.role || "") !== role && !sel.isMaster) ch.push(`권한 ${ro.label(sel.role)}→${ro.label(role)}`);
      await updateDoc(doc(db, "users", sel.id), { name: f.name.trim(), phone: f.phone.trim(), team: f.team, position: f.position, ...(sel.isMaster ? {} : { role }), employType: f.employType, employmentStatus: f.employmentStatus, leave: onLeave ? { type: f.employmentStatus, from: f.leaveFrom, to: f.leaveTo || "", memo: (f.leaveMemo || "").trim() } : null, ...(ch.length ? { personnelHistory: arrayUnion({ date: kstDay(), type: "정보 수정", detail: `${ch.join(" · ")} (공문 없음)` }) } : {}) });
      setSel(null);
    } catch (e) { alert(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const applyResign = async (now) => {
    if (!r.reason.trim()) return alert("사유를 적어 주세요.");
    const go = now || r.date <= kstDay();
    if (!window.confirm(go ? `${sel.name}님을 ${r.type}(퇴사) 처리할까요?\n퇴사 처리하면 이 계정은 바로 로그인할 수 없고, 경리 › 퇴직 정산에 올라갑니다.` : `${sel.name}님 ${r.type} 예정(${r.date})으로 등록할까요?\n예정 상태에서는 로그인이 되고, 그날 [퇴사 확정]을 누르면 막힙니다.`)) return;
    setBusy(true);
    try {
      if (go) {
        await updateDoc(doc(db, "users", sel.id), { employmentStatus: "퇴사", resignedAt: r.date, resignType: r.type, resignReason: r.reason.trim(), resignPlan: null, personnelHistory: arrayUnion({ date: kstDay(), type: r.type, detail: `퇴직일 ${r.date} · ${r.reason.trim()}` }) });
        await setDoc(doc(db, "retireCases", sel.id), { companyName: company, uid: sel.id, name: sel.name || "", team: sel.team || "", position: sel.position || "", reason: r.type, lastDay: r.date, createdBy: auth.currentUser?.email || "", createdAt: serverTimestamp() }, { merge: true });
      } else {
        await updateDoc(doc(db, "users", sel.id), { resignPlan: { type: r.type, date: r.date, reason: r.reason.trim(), noticeDate: r.noticeDate, by: auth.currentUser?.email || "" }, personnelHistory: arrayUnion({ date: kstDay(), type: `${r.type} 통보`, detail: `퇴직 예정일 ${r.date}` }) });
      }
      setSel(null);
    } catch (e) { alert(`처리 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const cancelPlan = async (u) => { if (window.confirm(`${u.name}님 퇴사 예정을 취소할까요?`)) await updateDoc(doc(db, "users", u.id), { resignPlan: null, personnelHistory: arrayUnion({ date: kstDay(), type: "퇴사 예정 취소", detail: "" }) }); };
  const reinstate = async (u) => { if (window.confirm(`${u.name}님을 복직 처리할까요? (다시 로그인할 수 있게 됩니다)`)) await updateDoc(doc(db, "users", u.id), { employmentStatus: "재직", resignedAt: null, personnelHistory: arrayUnion({ date: kstDay(), type: "복직", detail: "" }) }); };
  const Card = ({ u }) => (
    <button type="button" disabled={!canManage} onClick={() => open(u)} className="relative text-left rounded-2xl bg-white border border-[#E3E8F0] p-3.5 enabled:hover:border-[#2D4C82] enabled:hover:shadow-[0_10px_24px_rgba(15,26,48,0.10)] transition min-w-0">
      {u.resignPlan?.date && <span className="absolute top-2.5 right-2.5 text-[10px] font-black px-1.5 py-0.5 rounded bg-[#FFF4E5] text-[#B54708]">퇴사 예정</span>}
      <div className="flex items-center gap-3">
        <span className="w-12 h-12 rounded-2xl grid place-items-center text-[17px] font-black text-white shrink-0" style={{ background: isExecProfile(u) ? "linear-gradient(135deg,#B88A2E,#D7BC82)" : "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}>{String(u.name || "?").slice(0, 1)}</span>
        <span className="min-w-0">
          <span className="block text-[15px] font-black text-[#0F1A30] truncate">{u.name || u.email}</span>
          <span className="block text-[12.5px] font-bold text-[#5B6B85] truncate">{u.position || "직책 없음"}</span>
        </span>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
        <span className="text-[10.5px] font-black px-1.5 py-0.5 rounded-md bg-[#EEF3FC] text-[#1B2B4B]">{ro.label(u.role)}</span>
        {u.employType && u.employType !== "정규직" && <span className="text-[10.5px] font-black px-1.5 py-0.5 rounded-md bg-[#F3F6FA] text-[#5B6B85]">{u.employType}</span>}
        {LEAVE_STATUSES.includes(u.employmentStatus) && <span className="text-[10.5px] font-black px-1.5 py-0.5 rounded-md bg-[#F3E7CC] text-[#6B5320]">{u.employmentStatus}{u.leave?.to ? ` ~${String(u.leave.to).slice(2).replace(/-/g, ".")}` : ""}</span>}
        {u.noAccount && <span className="text-[10.5px] font-black px-1.5 py-0.5 rounded-md bg-[#F3F6FA] text-[#9AA9C3]">계정 없음</span>}
        <span className="ml-auto text-[11px] font-bold text-[#9AA9C3] tabular-nums" style={{ fontFamily: MONO }}>{tenureOf(u.hireDate)}</span>
      </div>
    </button>
  );
  return (
    <div className="space-y-4">
      <BookHero en="HR · STAFF BOARD" title="직원 정보 · 퇴사" desc="카드를 누르면 정보 수정(공문 없이 바로)과 퇴사·권고사직 처리를 한 곳에서 합니다"
        kpis={[["재직", `${active.length}명`, `${groups.length}개 부서`], ["휴직 · 육아휴직", `${active.filter((u) => LEAVE_STATUSES.includes(u.employmentStatus)).length}명`, `육아휴직 ${active.filter((u) => u.employmentStatus === "육아휴직").length}명`], ["퇴사 예정", `${planned.length}명`], ["이번 달 퇴사", `${left.filter((u) => String(u.resignedAt || "").startsWith(kstDay().slice(0, 7))).length}명`]]}
        right={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·부서·직책 검색" className="h-10 w-[220px] px-3.5 rounded-xl bg-white/95 text-[#0F1A30] text-[13.5px] font-semibold outline-none" />} />
      {!canManage && <div className="rounded-2xl bg-[#FEF3F2] border border-[#FECDCA] px-4 py-3 text-[13px] font-bold text-[#B42318]">직책·부서·권한 변경과 퇴사 처리는 마스터·인사관리자만 할 수 있습니다</div>}
      {planned.length > 0 && (
        <div className="rounded-2xl border border-[#FEDF89] bg-[#FFFBF2] p-3.5">
          <div className="text-[12px] font-extrabold tracking-[0.2em] text-[#B54708] mb-2" style={{ fontFamily: MONO }}>PLANNED · 퇴사 예정</div>
          <div className="flex flex-wrap gap-2">
            {planned.map((u) => (
              <div key={u.id} className="flex items-center gap-2 rounded-xl bg-white border border-[#FEDF89] pl-3 pr-1.5 py-1.5">
                <span className="text-[13.5px] font-black text-[#0F1A30]">{u.name}</span><span className="text-[12px] text-[#7A879C]">{u.resignPlan.type} · <b style={{ fontFamily: MONO }}>{u.resignPlan.date}</b></span>
                {canManage && <><button type="button" onClick={() => cancelPlan(u)} className="h-8 px-2.5 rounded-lg text-[12px] font-bold text-[#5B6B85]">취소</button><button type="button" onClick={() => open(u, "resign")} className="h-8 px-3 rounded-lg bg-[#0F1A30] text-white text-[12px] font-black">퇴사 확정</button></>}
              </div>
            ))}
          </div>
        </div>
      )}
      {groups.map(([t, us]) => (
        <div key={t}>
          <div className="flex items-center gap-2 mb-2"><span className="w-1.5 h-4 rounded-full bg-[#1B2B4B]" /><span className="text-[15px] font-black text-[#0F1A30]">{t}</span><span className="text-[12px] font-black text-[#7A879C] tabular-nums" style={{ fontFamily: MONO }}>{us.length}명</span><span className="flex-1 h-px bg-[#E3E8F0]" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5">{us.map((u) => <Card key={u.id} u={u} />)}</div>
        </div>
      ))}
      <div className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden">
        <button type="button" onClick={() => setShowLeft(!showLeft)} className="w-full px-4 py-3 flex items-center gap-2 text-left">
          <span className="text-[14px] font-black text-[#0F1A30]">퇴사자</span><span className="text-[12px] font-black text-[#7A879C]">{left.length}명 · 로그인 차단됨</span><span className="ml-auto text-[#9AA9C3]">{showLeft ? "접기 ▲" : "펼치기 ▼"}</span>
        </button>
        {showLeft && <div className="divide-y divide-[#EEF2F8] border-t border-[#EEF1F6]">
          {!left.length ? <div className="py-8 text-center text-[13px] font-bold text-[#9AA9C3]">퇴사자가 없습니다</div> : left.map((u) => (
            <div key={u.id} className="px-4 py-2.5 flex items-center gap-3">
              <Avatar name={u.name} />
              <span className="flex-1 min-w-0"><span className="block text-[14px] font-black text-[#0F1A30] truncate">{u.name} {u.resignType && <span className="text-[11px] font-black px-1.5 py-0.5 rounded bg-[#F3F6FA] text-[#5B6B85]">{u.resignType}</span>}</span><span className="block text-[12px] text-[#7A879C] truncate" style={{ fontFamily: MONO }}>{u.resignedAt || "-"} · {u.team || ""} · {u.resignReason || ""}</span></span>
              <button type="button" onClick={() => printResign(company, u, { type: u.resignType || "자진 퇴사", date: u.resignedAt || "", reason: u.resignReason || "" })} className="h-8 px-2.5 rounded-lg border border-[#DCE3EE] text-[12px] font-bold text-[#1B2B4B]">인쇄</button>
              {canManage && <button type="button" onClick={() => reinstate(u)} className="h-8 px-2.5 rounded-lg border border-[#DCE3EE] text-[12px] font-bold text-[#5B6B85]">복직</button>}
            </div>
          ))}
        </div>}
      </div>
      {sel && f && r && (
        <Sheet side en={`HR · ${mode === "info" ? "EDIT" : "RESIGNATION"}`} title={`${sel.name || sel.email}`} onClose={() => setSel(null)}
          footer={mode === "info"
            ? <><button type="button" onClick={() => setSel(null)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">취소</button><button type="button" disabled={busy} onClick={saveInfo} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50">{busy ? "저장 중…" : "바로 저장(공문 없음)"}</button></>
            : <><button type="button" onClick={() => setSel(null)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">취소</button>{r.date > kstDay() && <button type="button" disabled={busy} onClick={() => applyResign(false)} className="h-12 px-4 rounded-xl border border-[#0F1A30] bg-white text-[14px] font-black text-[#0F1A30]">예정 등록</button>}<button type="button" disabled={busy} onClick={() => applyResign(true)} className="flex-1 h-12 rounded-xl bg-[#B42318] text-white text-[15px] font-black disabled:opacity-50">지금 퇴사 확정</button></>}>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white border border-[#E3E8F0]">
            {[["info", "정보 수정"], ["resign", "퇴사 · 권고사직"]].map(([k, l]) => <button key={k} type="button" onClick={() => setMode(k)} disabled={sel.isMaster && k === "resign"} className={`h-11 rounded-lg text-[14px] font-black disabled:opacity-30 ${mode === k ? (k === "resign" ? "bg-[#B42318] text-white" : "bg-[#0F1A30] text-white") : "text-[#5B6B85]"}`}>{l}</button>)}
          </div>
          {mode === "info" ? (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>이름</Label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inp} /></div>
              <div><Label>연락처</Label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={inp} /></div>
              <div><Label>부서</Label><select value={f.team} onChange={(e) => { const team = e.target.value; const position = hr.positionsFor(team).includes(f.position) ? f.position : ""; setF({ ...f, team, position, role: suggestFor({ team, position }, ro.execKeys) }); }} className={inp}><option value="">미배정</option>{hr.teams.map((t) => <option key={t}>{t}</option>)}</select></div>
              <div><Label>직책</Label><select value={f.position} onChange={(e) => setF({ ...f, position: e.target.value, role: suggestFor({ team: f.team, position: e.target.value }, ro.execKeys) })} className={inp}><option value="">미설정</option>{[...new Set([...hr.positionsFor(f.team), f.position].filter(Boolean))].map((p) => <option key={p}>{p}</option>)}</select></div>
              <div><Label>권한</Label><select value={f.role} disabled={sel.isMaster} onChange={(e) => setF({ ...f, role: e.target.value })} className={`${inp} disabled:bg-[#F5F8FD] disabled:text-[#9AA9C3]`}>{[...ro.options, ...(ro.options.some(([k]) => k === f.role) ? [] : [[f.role, ro.label(f.role)]])].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><div className="text-[11.5px] text-[#7A879C] mt-1">{sel.isMaster ? "마스터 계정은 권한을 바꿀 수 없습니다" : ROLE_DESC[f.role] || (ro.execKeys.includes(f.role) ? "임원 화면(경영 브리핑) — 권한 관리에서 만든 역할" : "권한 관리에서 만든 역할 — 메뉴는 그 설정을 따릅니다")}</div></div>
              <div><Label>고용 형태</Label><select value={f.employType} onChange={(e) => setF({ ...f, employType: e.target.value })} className={inp}>{["정규직", "계약직", "수습", "파트타임", "일용직"].map((k) => <option key={k}>{k}</option>)}</select></div>
              <div className="col-span-2"><Label>재직 상태</Label>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_OPTIONS.map((k) => <Chip key={k} on={f.employmentStatus === k} onClick={() => setF({ ...f, employmentStatus: k })}>{k}</Chip>)}
                  <span className="w-px h-7 bg-[#DCE3EE] mx-1 self-center" />
                  {[["퇴사", "자진 퇴사"], ["권고사직", "권고사직"]].map(([l, t]) => <button key={l} type="button" disabled={sel.isMaster} onClick={() => { setR((p) => ({ ...p, type: t })); setMode("resign"); }} className="h-9 px-3.5 rounded-full text-[13px] font-black border border-[#FECDCA] bg-[#FEF3F2] text-[#B42318] disabled:opacity-30 whitespace-nowrap">{l} →</button>)}
                </div>
                <div className="text-[11.5px] text-[#7A879C] mt-1">퇴사·권고사직을 누르면 퇴사 처리 화면으로 넘어갑니다(퇴직일·사유·합의서 인쇄 · 확정 시 로그인 차단)</div>
              </div>
              {LEAVE_STATUSES.includes(f.employmentStatus) && (
                <div className="col-span-2 rounded-2xl bg-white border border-[#E3E8F0] p-3.5 space-y-2.5">
                  <div className="text-[11px] font-extrabold tracking-[0.2em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>{f.employmentStatus === "육아휴직" ? "PARENTAL LEAVE" : f.employmentStatus === "출산휴가" ? "MATERNITY LEAVE" : "LEAVE OF ABSENCE"} · 기간</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>시작일</Label><input type="date" value={f.leaveFrom} onChange={(e) => setF({ ...f, leaveFrom: e.target.value })} className={inp} /></div>
                    <div><Label>복직 예정일</Label><input type="date" value={f.leaveTo} onChange={(e) => setF({ ...f, leaveTo: e.target.value })} className={inp} /></div>
                  </div>
                  {f.leaveFrom && f.leaveTo && <div className="text-[12.5px] font-black text-[#1B2B4B]">총 {Math.max(0, Math.round((new Date(f.leaveTo) - new Date(f.leaveFrom)) / 864e5) + 1)}일 · 약 {(Math.max(0, (new Date(f.leaveTo) - new Date(f.leaveFrom)) / 864e5 + 1) / 30.44).toFixed(1)}개월</div>}
                  <input value={f.leaveMemo} onChange={(e) => setF({ ...f, leaveMemo: e.target.value })} className={inp} placeholder={f.employmentStatus === "육아휴직" ? "자녀 이름·생년월일, 전자결재 문서번호 등" : "사유·메모"} />
                  {f.employmentStatus === "육아휴직" && <div className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3 py-2.5 text-[12px] text-[#5B6B85] leading-relaxed">만 8세 이하(초2 이하) 자녀 · 최대 1년(부모 모두 3개월 이상 쓰면 1년 6개월) · 휴직 30일 전 신청 · 휴직 기간도 근속·연차 산정에 포함 · 복귀 시 같은 업무(같은 수준 임금) — 급여는 고용센터에서 지급(회사는 확인서 제출)</div>}
                  {f.employmentStatus === "출산휴가" && <div className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3 py-2.5 text-[12px] text-[#5B6B85] leading-relaxed">출산 전후 90일(다태아 120일) · 출산 후 45일(다태아 60일) 이상 · 최초 60일(다태아 75일) 유급</div>}
                </div>
              )}
              <div className="col-span-2 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3 py-2.5 text-[12.5px] text-[#5B6B85]">변경 내역은 인사 이력에 남습니다. 공문(인사발령)을 남기려면 인사 기록 › 인사발령을 쓰세요.</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div><Label>구분</Label><div className="flex flex-wrap gap-1.5">{RETIRE_REASONS.map((x) => <Chip key={x} on={r.type === x} onClick={() => setR({ ...r, type: x })}>{x}</Chip>)}</div></div>
              {r.type === "권고사직" && <div className="rounded-xl bg-[#EEF3FC] border border-[#C9D6EE] px-3 py-2.5 text-[12.5px] text-[#1B2B4B] leading-relaxed">권고사직은 근로자 동의(합의서)가 필요하고 실업급여 대상(비자발적 이직)입니다. 경리에게 이직확인서 제출이 안내됩니다.</div>}
              {r.type === "해고" && <div className="rounded-xl bg-[#FEF3F2] border border-[#FECDCA] px-3 py-2.5 text-[12.5px] text-[#B42318] leading-relaxed">해고는 정당한 사유와 30일 전 서면 통지가 필요합니다(근로기준법 23·26·27조). 노무 검토 후 진행하세요.</div>}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>퇴직일(마지막 근무일)</Label><input type="date" value={r.date} onChange={(e) => setR({ ...r, date: e.target.value })} className={inp} /></div>
                <div><Label>통보일</Label><input type="date" value={r.noticeDate} onChange={(e) => setR({ ...r, noticeDate: e.target.value })} className={inp} /></div>
              </div>
              <div><Label>사유</Label><textarea value={r.reason} onChange={(e) => setR({ ...r, reason: e.target.value })} rows={4} className={`${inp} h-auto py-2`} /></div>
              <button type="button" onClick={() => printResign(company, sel, r)} className="w-full h-11 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-black text-[#1B2B4B]">{r.type === "권고사직" ? "권고사직 합의서 인쇄" : "퇴직 확인서 인쇄"}</button>
              <div className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3 py-2.5 text-[12.5px] text-[#5B6B85] leading-relaxed">■ 퇴사 확정 즉시 이 계정은 로그인할 수 없습니다(로그인 시 "퇴사 처리된 계정" 안내 후 차단). 퇴사 예정 상태에서는 그날까지 로그인됩니다.</div>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}

// ═════════════════ 직책·부서 설정(회사별) ═════════════════
export function HrSettingsPanel({ company, canManage }) {
  const hr = useHrOptions(company);
  const ro = useRoleOptions();
  const cfg = hr.cfg || {};
  const [t, setT] = React.useState(""); const [p, setP] = React.useState(""); const [pe, setPe] = React.useState(false);
  const save = (patch) => setDoc(doc(db, "hrSettings", company), { companyName: company, ...patch, updatedAt: serverTimestamp() }, { merge: true });
  const addTeam = async () => { const v = t.trim(); if (!v) return; if (hr.teams.includes(v)) return alert("이미 있는 부서입니다."); await save({ teams: [...(cfg.teams || []), v], hiddenTeams: (cfg.hiddenTeams || []).filter((x) => x !== v) }); setT(""); };
  const addPos = async () => { const v = p.trim(); if (!v) return; const key = pe ? "execPositions" : "positions"; await save({ [key]: [...new Set([...(cfg[key] || []), v])], hiddenPositions: (cfg.hiddenPositions || []).filter((x) => x !== v) }); setP(""); };
  const removeTeam = async (v) => { if (!window.confirm(`부서 「${v}」를 목록에서 뺄까요? (이미 지정된 직원 정보는 그대로)`)) return; if ((cfg.teams || []).includes(v)) await save({ teams: cfg.teams.filter((x) => x !== v) }); else await save({ hiddenTeams: [...new Set([...(cfg.hiddenTeams || []), v])] }); };
  const removePos = async (v) => { if (!window.confirm(`직책 「${v}」를 목록에서 뺄까요?`)) return; const k = (cfg.positions || []).includes(v) ? "positions" : (cfg.execPositions || []).includes(v) ? "execPositions" : null; if (k) await save({ [k]: cfg[k].filter((x) => x !== v) }); else await save({ hiddenPositions: [...new Set([...(cfg.hiddenPositions || []), v])] }); };
  const restore = async () => { if (window.confirm("숨긴 기본 부서·직책을 모두 되살릴까요?")) await save({ hiddenTeams: [], hiddenPositions: [] }); };
  const Pill = ({ v, onX, base }) => <span className="inline-flex items-center gap-1.5 h-9 pl-3.5 pr-1.5 rounded-full bg-white border border-[#DCE3EE] text-[13.5px] font-black text-[#0F1A30]">{v}{base && <span className="text-[10px] font-bold text-[#9AA9C3]">기본</span>}{canManage && onX && <button type="button" onClick={onX} className="w-6 h-6 rounded-full hover:bg-[#FEF3F2] text-[#9AA9C3] hover:text-[#B42318]">✕</button>}</span>;
  return (
    <div className="space-y-4">
      <BookHero en="HR · SETTINGS" title="직책 · 부서 · 권한 설정" desc="우리 회사에 맞게 부서와 직책을 추가하거나 뺍니다 — 인사관리자·마스터만 바꿀 수 있습니다" right={canManage && <button type="button" onClick={restore} className="h-10 px-4 rounded-xl bg-white/10 border border-white/20 text-[13px] font-black">기본값 되살리기</button>} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BookCard en="DEPARTMENTS" title={`부서 ${hr.teams.length}개`}>
          <div className="flex flex-wrap gap-1.5">{hr.teams.map((v) => <Pill key={v} v={v} base={TEAM_OPTIONS.includes(v)} onX={v === EXEC_TEAM ? null : () => removeTeam(v)} />)}</div>
          {canManage && <div className="mt-3 flex gap-2"><input value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTeam()} className={inp} placeholder="새 부서 (예: 영업팀, 물류센터)" /><button type="button" onClick={addTeam} className="h-11 px-4 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black whitespace-nowrap">+ 추가</button></div>}
          <div className="mt-2 text-[11.5px] text-[#9AA9C3]">「임원」 부서는 임원 직책·권한 추천과 연결돼 있어 뺄 수 없습니다</div>
        </BookCard>
        <BookCard en="POSITIONS" title="직책">
          <div className="text-[12px] font-black text-[#4B6CB7] mb-1.5">임원 직책 (부서 임원 전용)</div>
          <div className="flex flex-wrap gap-1.5 mb-3">{hr.exec.map((v) => <Pill key={v} v={v} base={EXEC_POSITION_OPTIONS.includes(v)} onX={["대표"].includes(v) ? null : () => removePos(v)} />)}</div>
          <div className="text-[12px] font-black text-[#4B6CB7] mb-1.5">일반 직책</div>
          <div className="flex flex-wrap gap-1.5">{hr.normal.map((v) => <Pill key={v} v={v} base={POSITION_OPTIONS.includes(v)} onX={() => removePos(v)} />)}</div>
          {canManage && <div className="mt-3 flex gap-2 items-center"><input value={p} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPos()} className={inp} placeholder="새 직책 (예: 실장, 소장)" /><Chip on={pe} onClick={() => setPe(!pe)}>임원 직책</Chip><button type="button" onClick={addPos} className="h-11 px-4 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black whitespace-nowrap">+ 추가</button></div>}
        </BookCard>
      </div>
      <BookCard en="ROLES" title="권한(프로그램 사용 범위)">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {ro.options.map(([r, l]) => <div key={r} className="rounded-xl border border-[#E3E8F0] px-3.5 py-2.5"><div className="text-[14px] font-black text-[#0F1A30]">{l}{!ROLE_DESC[r] && <span className="ml-1.5 text-[10.5px] font-black px-1.5 py-0.5 rounded bg-[#EEF3FC] text-[#2D4C82]">직접 만든 역할</span>}</div><div className="text-[12px] text-[#7A879C]">{ROLE_DESC[r] || (ro.execKeys.includes(r) ? "임원 화면(경영 브리핑) — 메뉴 범위는 권한 관리 설정" : "메뉴 범위는 권한 관리 설정을 따릅니다")}</div></div>)}
        </div>
        <div className="mt-3 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3.5 py-2.5 text-[12.5px] text-[#5B6B85] leading-relaxed">
          역할 추가·이름 변경·메뉴 범위 수정은 <b className="text-[#0F1A30]">최고관리자 › 관리자메뉴 › 권한 관리</b>에서 합니다. 여기서 만든 역할은 직원 정보·인사발령·직원관리의 권한 목록에 바로 나타납니다. 부서·직책을 고르면 권한이 자동 추천됩니다(임원 → 임원 화면 역할, 경리/회계팀 → 경리, 인사팀 → 인사관리자, 과장 이상 → 관리자, 그 외 → 실무자).
        </div>
      </BookCard>
    </div>
  );
}

// ═════════════════ 사내 규정(취업규칙 등) ═════════════════
export { RULE_CATS };
export function CompanyRules({ company, canEdit = false }) {
  const [rows, setRows] = React.useState(null);
  const [cat, setCat] = React.useState("전체");
  const [open, setOpen] = React.useState(null);
  const [edit, setEdit] = React.useState(null);
  React.useEffect(() => { if (!company) return undefined; return onSnapshot(query(collection(db, "companyRules"), where("companyName", "==", company)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([])); }, [company]);
  // ⭐ 2026-10-31 회사가 아직 등록하지 않은 분류는 법령 기반 표준안을 보여 준다(인사관리자가 고쳐서 등록)
  const tpls = Object.keys(RULE_TEMPLATES).filter((c) => !(rows || []).some((r) => r.category === c)).map((c) => ({ id: `tpl:${c}`, tpl: true, category: c, title: c, body: fillCompany(RULE_TEMPLATES[c], company), effectiveDate: "", version: 0 }));
  const list = [...(rows || []), ...(rows === null ? [] : tpls)].filter((r) => cat === "전체" || r.category === cat).sort((a, b) => RULE_CATS.indexOf(a.category) - RULE_CATS.indexOf(b.category) || String(a.title).localeCompare(String(b.title)));
  const [busyAll, setBusyAll] = React.useState(false);
  const registerAll = async () => {
    if (!tpls.length || !window.confirm(`표준안 ${tpls.length}건을 우리 회사 규정으로 한 번에 등록할까요?\n(등록 후에도 각각 고칠 수 있습니다)`)) return;
    setBusyAll(true);
    try { for (const t of tpls) await addDoc(collection(db, "companyRules"), { companyName: company, title: t.title, category: t.category, body: t.body, effectiveDate: kstDay(), version: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || "" }); } finally { setBusyAll(false); }
  };
  const save = async () => {
    const e = edit; if (!e.title.trim() || !e.body.trim()) return alert("제목과 내용을 입력해 주세요.");
    const data = { companyName: company, title: e.title.trim(), category: e.category, body: e.body, effectiveDate: e.effectiveDate || "", version: e.id ? (Number(e.version) || 1) + 1 : 1, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || "" };
    if (e.id) await updateDoc(doc(db, "companyRules", e.id), data); else await addDoc(collection(db, "companyRules"), { ...data, createdAt: serverTimestamp() });
    setEdit(null);
  };
  const cur = open ? [...(rows || []), ...tpls].find((r) => r.id === open) : null;
  return (
    <div className="space-y-4">
      <BookHero en="COMPANY · RULES" title="사내 규정" desc="취업규칙·인사·복무·급여·휴가·출장·차량 안전·보안 규정 — 모든 직원이 볼 수 있습니다"
        right={canEdit && <button type="button" onClick={() => setEdit({ title: "", category: "취업규칙", body: "", effectiveDate: kstDay() })} className="h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black whitespace-nowrap">+ 규정 등록</button>}
        kpis={[["우리 회사 규정", `${(rows || []).length}건`], ["표준안(미등록)", `${tpls.length}건`, "법령 기반 기본안"], ["취업규칙", (rows || []).some((r) => r.category === "취업규칙") ? "등록됨" : "표준안", "10인 이상 신고 의무"]]} />
      {canEdit && tpls.length > 0 && (
        <div className="rounded-2xl border border-[#C9D6EE] bg-[#EEF3FC] px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="min-w-0 flex-1"><b className="text-[14px] text-[#0F1A30]">표준 규정 {tpls.length}건이 준비돼 있습니다</b><div className="text-[12.5px] text-[#5B6B85]">근로기준법·남녀고용평등법(육아휴직·출산휴가) 등을 바탕으로 만든 기본안입니다. 그대로 등록하거나 열어서 고친 뒤 등록하세요.</div></div>
          <button type="button" disabled={busyAll} onClick={registerAll} className="h-10 px-4 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black whitespace-nowrap disabled:opacity-50">{busyAll ? "등록 중…" : "표준안 한 번에 등록"}</button>
        </div>
      )}
      <div className="flex gap-1.5 overflow-x-auto pb-1">{["전체", ...RULE_CATS].map((c) => <Chip key={c} on={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}</div>
      {cur ? (
        <BookCard en={cur.category} title={cur.title} right={<div className="flex gap-1.5"><button type="button" onClick={() => setOpen(null)} className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B]">← 목록</button>{canEdit && <button type="button" onClick={() => setEdit(cur.tpl ? { title: cur.title, category: cur.category, body: cur.body, effectiveDate: kstDay() } : { ...cur })} className="h-9 px-3 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black">{cur.tpl ? "고쳐서 우리 회사 규정으로 등록" : "수정"}</button>}</div>}>
          {cur.tpl ? <div className="mb-3 rounded-xl bg-[#FFFBF2] border border-[#FEDF89] px-3.5 py-2.5 text-[12.5px] text-[#93370D] font-bold">표준안입니다 — 회사가 아직 등록하지 않아 법령 기반 기본안을 보여 드립니다. 시행 전 회사 사정(금액·기간 등)에 맞게 고쳐 주세요.</div>
            : <div className="text-[12px] text-[#7A879C] mb-3" style={{ fontFamily: MONO }}>v{cur.version || 1} · 시행 {cur.effectiveDate || "-"}</div>}
          <div className="rounded-2xl bg-[#FBFCFE] border border-[#E3E8F0] px-5 md:px-8 py-6 text-[15px] leading-[1.95] text-[#1F2A44] whitespace-pre-wrap">{cur.body}</div>
        </BookCard>
      ) : (
        <BookCard en="LIBRARY" title={`규정 ${list.length}건`} flush>
          {rows === null ? <div className="py-12 text-center text-[13px] font-bold text-[#9AA9C3]">불러오는 중…</div> : !list.length ? <div className="py-14 text-center text-[13.5px] font-bold text-[#9AA9C3]">등록된 규정이 없습니다{canEdit ? " · 오른쪽 위 [+ 규정 등록]" : ""}</div> : (
            <div className="divide-y divide-[#EEF2F8]">
              {list.map((r) => (
                <button key={r.id} type="button" onClick={() => setOpen(r.id)} className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-[#F7F9FC]">
                  <span className="w-11 h-11 rounded-2xl bg-[#0F1A30] text-white grid place-items-center text-[16px] shrink-0">§</span>
                  <span className="flex-1 min-w-0"><span className="block text-[15px] font-black text-[#0F1A30] truncate">{r.title}</span><span className="block text-[12px] text-[#7A879C]">{r.tpl ? <><span className="px-1.5 py-0.5 rounded bg-[#FFF4E5] text-[#B54708] text-[10.5px] font-black mr-1">표준안</span>{r.category} · 법령 기반 기본안</> : `${r.category} · v${r.version || 1} · 시행 ${r.effectiveDate || "-"}`}</span></span>
                  <span className="text-[#9AA9C3]">›</span>
                </button>
              ))}
            </div>
          )}
        </BookCard>
      )}
      {edit && (
        <Sheet side en="RULES · EDIT" title={edit.id ? "규정 수정" : "규정 등록"} onClose={() => setEdit(null)}
          footer={<>{edit.id && <button type="button" onClick={async () => { if (window.confirm("이 규정을 삭제할까요?")) { await deleteDoc(doc(db, "companyRules", edit.id)); setEdit(null); setOpen(null); } }} className="h-12 px-4 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#B42318]">삭제</button>}<button type="button" onClick={() => setEdit(null)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">취소</button><button type="button" onClick={save} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black">저장</button></>}>
          <div><Label>분류</Label><div className="flex flex-wrap gap-1.5">{RULE_CATS.map((c) => <Chip key={c} on={edit.category === c} onClick={() => setEdit((p) => ({ ...p, category: c, title: p.title || c, body: p.body || fillCompany(RULE_TEMPLATES[c], company) || "" }))}>{c}</Chip>)}</div></div>
          <div className="grid grid-cols-[1fr_170px] gap-2"><div><Label>제목</Label><input value={edit.title} onChange={(e) => setEdit((p) => ({ ...p, title: e.target.value }))} className={inp} /></div><div><Label>시행일</Label><input type="date" value={edit.effectiveDate} onChange={(e) => setEdit((p) => ({ ...p, effectiveDate: e.target.value }))} className={inp} /></div></div>
          <div><Label>내용 {RULE_TEMPLATES[edit.category] && !edit.body && <button type="button" onClick={() => setEdit((p) => ({ ...p, body: fillCompany(RULE_TEMPLATES[p.category], company) }))} className="ml-2 text-[12px] font-black text-[#2D4C82]">표준 양식 불러오기</button>}</Label><textarea value={edit.body} onChange={(e) => setEdit((p) => ({ ...p, body: e.target.value }))} rows={22} className="w-full rounded-xl border border-[#DCE3EE] bg-white px-4 py-3 text-[14.5px] leading-[1.85] outline-none focus:border-[#2D4C82]" /></div>
        </Sheet>
      )}
    </div>
  );
}

// ═════════════════ 인사관리부 허브 ═════════════════
export default function HrHub({ company, canManage, renderRecord, renderAttendance, me = {} }) {
  const [tab, setTab] = React.useState(() => { try { const v = sessionStorage.getItem("kpHrTab"); sessionStorage.removeItem("kpHrTab"); return v || "record"; } catch { return "record"; } });
  const [focusUid, setFocusUid] = React.useState(null);
  return (
    <KpSubNav code="HUMAN RESOURCES" title="인사관리부" icon="idcard" active={tab} onSelect={setTab}
      groups={[
        { label: "인사", items: [
          { key: "record", label: "인사 기록", en: "RECORDS", icon: "idcard" },
          { key: "edit", label: "직원 정보 · 퇴사", en: "STAFF BOARD", icon: "users" },
          { key: "register", label: "직원 등록", en: "REGISTER", icon: "user" },
        ] },
        { label: "근태", items: [
          { key: "attendance", label: "출근기록부", en: "ATTENDANCE", icon: "clock" },
          { key: "leave", label: "연차 관리", en: "ANNUAL LEAVE", icon: "flag" },
        ] },
        { label: "설정 · 규정", items: [
          { key: "settings", label: "직책·부서 설정", en: "SETTINGS", icon: "key" },
          { key: "rules", label: "사내 규정", en: "RULES", icon: "list" },
          { key: "obit", label: "부고 알림", en: "OBITUARY", icon: "bell" },
        ] },
      ]}>
      {tab === "record" && renderRecord?.(focusUid)}
      {tab === "register" && <StaffRegister company={company} onDone={(id) => { setFocusUid(id); setTab("record"); }} />}
      {(tab === "edit" || tab === "resign") && <StaffInfoBoard company={company} canManage={canManage} />}
      {tab === "leave" && <LeaveLedger company={company} canManage={canManage} />}
      {tab === "attendance" && renderAttendance?.()}
      {tab === "settings" && <HrSettingsPanel company={company} canManage={canManage} />}
      {tab === "rules" && <CompanyRules company={company} canEdit={canManage} />}
      {tab === "obit" && <ObituaryWriter company={company} me={me} onCancel={() => setTab("record")} onSaved={() => { alert("공지사항에 부고를 올렸습니다."); setTab("record"); }} />}
    </KpSubNav>
  );
}
