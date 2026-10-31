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

const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const inp = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";
const Label = ({ children }) => <div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">{children}</div>;
const ROLE_KEYS = ["admin", "hrManager", "test", "user", "viewer"];
const ROLE_DESC = {
  admin: "배차·정산·매출·관리자메뉴 등 전체 업무(임원은 이 권한으로 고정)",
  hrManager: "인사관리부 화면 — 인사 기록·발령·근태·입퇴사·직원 승인",
  test: "경리 화면 — 정산·회계·자금·비품·퇴직 정산",
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
  const blank = { name: "", phone: "", email: "", team: "", position: "", hireDate: kstDay(), birthDate: "", address: "", employType: "정규직", memo: "" };
  const [f, setF] = React.useState(blank);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(null);
  const save = async () => {
    if (!f.name.trim()) return alert("이름을 입력해 주세요.");
    setBusy(true);
    try {
      const role = suggestRole({ team: f.team, position: f.position });
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
            <div className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3 py-2 text-[12px] text-[#5B6B85]">권한: <b className="text-[#0F1A30]">{ROLE_NAME[suggestRole({ team: f.team, position: f.position })]}</b> (부서·직책 기준) · 계정이 없으므로 로그인은 안 됩니다</div>
            <button type="button" disabled={busy} onClick={save} className="w-full h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50">{busy ? "등록 중…" : "직원 등록"}</button>
          </div>
        </BookCard>
      </div>
    </div>
  );
}

// ═════════════════ 정보 수정(공문 없이 바로) ═════════════════
export function HrDirectEdit({ company, canManage }) {
  const staff = useStaff(company).filter((u) => u.employmentStatus !== "퇴사");
  const hr = useHrOptions(company);
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState(null);
  const [f, setF] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const pick = (u) => { setSel(u); setF({ name: u.name || "", phone: u.phone || "", team: u.team || "", position: u.position || "", role: u.role || "user", employType: u.employType || "정규직", employmentStatus: u.employmentStatus || "재직" }); };
  const exec = f && isExecProfile(f);
  const save = async () => {
    if (!sel || !f) return;
    setBusy(true);
    try {
      const role = exec ? "admin" : f.role;
      const changes = [];
      if ((sel.team || "") !== f.team) changes.push(`부서 ${sel.team || "미배정"}→${f.team || "미배정"}`);
      if ((sel.position || "") !== f.position) changes.push(`직책 ${sel.position || "-"}→${f.position || "-"}`);
      if ((sel.role || "") !== role && !sel.isMaster) changes.push(`권한 ${ROLE_NAME[sel.role] || sel.role}→${ROLE_NAME[role]}`);
      await updateDoc(doc(db, "users", sel.id), { name: f.name.trim(), phone: f.phone.trim(), team: f.team, position: f.position, ...(sel.isMaster ? {} : { role }), employType: f.employType, employmentStatus: f.employmentStatus, ...(changes.length ? { personnelHistory: arrayUnion({ date: kstDay(), type: "정보 수정", detail: `${changes.join(" · ")} (공문 없음)` }) } : {}) });
      setSel(null); setF(null);
    } catch (e) { alert(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const list = staff.filter((u) => !q.trim() || [u.name, u.team, u.position, u.phone].some((v) => String(v || "").includes(q.trim()))).sort((a, b) => String(a.team || "").localeCompare(String(b.team || "")) || String(a.name || "").localeCompare(String(b.name || ""), "ko"));
  return (
    <div className="space-y-4">
      <BookHero en="HR · DIRECT EDIT" title="정보 수정" desc="부서·직책·권한·연락처를 공문(인사발령) 없이 바로 고칩니다 — 변경 내역은 인사 이력에 남습니다" />
      {!canManage && <div className="rounded-2xl bg-[#FEF3F2] border border-[#FECDCA] px-4 py-3 text-[13px] font-bold text-[#B42318]">직책·부서·권한 변경은 마스터·인사관리자만 할 수 있습니다</div>}
      <BookCard en="STAFF" title={`재직 직원 ${list.length}명`} right={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·부서·직책 검색" className="h-9 w-[200px] px-3 rounded-lg border border-[#DCE3EE] text-[13px] outline-none" />} flush>
        <div className="divide-y divide-[#EEF2F8]">
          {list.map((u) => (
            <button key={u.id} type="button" disabled={!canManage} onClick={() => pick(u)} className="w-full text-left px-4 py-2.5 flex items-center gap-3 enabled:hover:bg-[#F7F9FC]">
              <Avatar name={u.name} />
              <span className="flex-1 min-w-0"><span className="block text-[14.5px] font-black text-[#0F1A30] truncate">{u.name || u.email}{u.noAccount && <span className="ml-1.5 text-[10.5px] font-black text-[#9AA9C3]">계정 없음</span>}</span><span className="block text-[12px] text-[#7A879C] truncate">{[u.team || "미배정", u.position, ROLE_NAME[u.role]].filter(Boolean).join(" · ")}</span></span>
              {canManage && <span className="text-[12.5px] font-black text-[#2D4C82]">수정 ›</span>}
            </button>
          ))}
        </div>
      </BookCard>
      {sel && f && (
        <Sheet side en="HR · EDIT" title={`${sel.name || sel.email} 정보 수정`} onClose={() => setSel(null)}
          footer={<><button type="button" onClick={() => setSel(null)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">취소</button><button type="button" disabled={busy} onClick={save} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50">{busy ? "저장 중…" : "바로 저장(공문 없음)"}</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>이름</Label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inp} /></div>
            <div><Label>연락처</Label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={inp} /></div>
            <div><Label>부서</Label><select value={f.team} onChange={(e) => { const team = e.target.value; const position = hr.positionsFor(team).includes(f.position) ? f.position : ""; setF({ ...f, team, position, role: suggestRole({ team, position }) }); }} className={inp}><option value="">미배정</option>{hr.teams.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div><Label>직책</Label><select value={f.position} onChange={(e) => setF({ ...f, position: e.target.value, role: suggestRole({ team: f.team, position: e.target.value }) })} className={inp}><option value="">미설정</option>{[...new Set([...hr.positionsFor(f.team), f.position].filter(Boolean))].map((p) => <option key={p}>{p}</option>)}</select></div>
            <div><Label>권한</Label><select value={exec ? "admin" : f.role} disabled={exec || sel.isMaster} onChange={(e) => setF({ ...f, role: e.target.value })} className={`${inp} disabled:bg-[#F5F8FD] disabled:text-[#9AA9C3]`}>{ROLE_KEYS.map((r) => <option key={r} value={r}>{ROLE_NAME[r]}</option>)}</select><div className="text-[11.5px] text-[#7A879C] mt-1">{sel.isMaster ? "마스터 계정은 관리자 고정" : exec ? "임원은 관리자 고정" : ROLE_DESC[f.role]}</div></div>
            <div><Label>고용 형태</Label><select value={f.employType} onChange={(e) => setF({ ...f, employType: e.target.value })} className={inp}>{["정규직", "계약직", "수습", "파트타임", "일용직"].map((k) => <option key={k}>{k}</option>)}</select></div>
            <div><Label>재직 상태</Label><div className="flex gap-1.5">{["재직", "휴직"].map((k) => <Chip key={k} on={f.employmentStatus === k} onClick={() => setF({ ...f, employmentStatus: k })}>{k}</Chip>)}</div></div>
          </div>
          <div className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3 py-2.5 text-[12.5px] text-[#5B6B85]">공문을 남기려면 인사 기록 › 인사발령을 쓰세요. 퇴사는 [퇴사·권고사직] 메뉴에서 처리합니다.</div>
        </Sheet>
      )}
    </div>
  );
}

// ═════════════════ 퇴사·권고사직 ═════════════════
export function ResignDesk({ company, canManage }) {
  const staff = useStaff(company);
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState(null);
  const [f, setF] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const active = staff.filter((u) => u.employmentStatus !== "퇴사");
  const planned = active.filter((u) => u.resignPlan?.date);
  const left = staff.filter((u) => u.employmentStatus === "퇴사").sort((a, b) => String(b.resignedAt || "").localeCompare(String(a.resignedAt || "")));
  const open = (u) => { setSel(u); setF({ type: u.resignPlan?.type || "자진 퇴사", date: u.resignPlan?.date || kstDay(), reason: u.resignPlan?.reason || "", noticeDate: kstDay() }); };
  const apply = async (confirmNow) => {
    if (!sel || !f) return;
    if (!f.reason.trim()) return alert("사유를 적어 주세요.");
    const now = confirmNow || f.date <= kstDay();
    if (!window.confirm(now ? `${sel.name}님을 ${f.type}(퇴사) 처리할까요?\n퇴사 처리하면 로그인이 바로 막히고, 경리 › 퇴직 정산에 올라갑니다.` : `${sel.name}님 ${f.type} 예정(${f.date})으로 등록할까요?\n그날 [퇴사 확정]을 누르면 퇴사 처리됩니다.`)) return;
    setBusy(true);
    try {
      if (now) {
        await updateDoc(doc(db, "users", sel.id), { employmentStatus: "퇴사", resignedAt: f.date, resignType: f.type, resignReason: f.reason.trim(), resignPlan: null, personnelHistory: arrayUnion({ date: kstDay(), type: f.type, detail: `퇴직일 ${f.date} · ${f.reason.trim()}` }) });
        await setDoc(doc(db, "retireCases", sel.id), { companyName: company, uid: sel.id, name: sel.name || "", team: sel.team || "", position: sel.position || "", reason: f.type, lastDay: f.date, createdBy: auth.currentUser?.email || "", createdAt: serverTimestamp() }, { merge: true });
      } else {
        await updateDoc(doc(db, "users", sel.id), { resignPlan: { type: f.type, date: f.date, reason: f.reason.trim(), noticeDate: f.noticeDate, by: auth.currentUser?.email || "" }, personnelHistory: arrayUnion({ date: kstDay(), type: `${f.type} 통보`, detail: `퇴직 예정일 ${f.date}` }) });
      }
      setSel(null);
    } catch (e) { alert(`처리 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const cancelPlan = async (u) => { if (window.confirm(`${u.name}님 퇴사 예정을 취소할까요?`)) await updateDoc(doc(db, "users", u.id), { resignPlan: null, personnelHistory: arrayUnion({ date: kstDay(), type: "퇴사 예정 취소", detail: "" }) }); };
  const reinstate = async (u) => { if (window.confirm(`${u.name}님을 복직 처리할까요?`)) await updateDoc(doc(db, "users", u.id), { employmentStatus: "재직", resignedAt: null, personnelHistory: arrayUnion({ date: kstDay(), type: "복직", detail: "" }) }); };
  const printNotice = (u, plan) => printResign(company, u, plan);
  const list = active.filter((u) => !q.trim() || [u.name, u.team, u.position].some((v) => String(v || "").includes(q.trim())));
  return (
    <div className="space-y-4">
      <BookHero en="HR · OFFBOARDING" title="퇴사 · 권고사직" desc="퇴사·권고사직·계약 만료를 처리하면 로그인이 차단되고 경리 › 퇴직 정산으로 넘어갑니다"
        kpis={[["재직", `${active.length}명`], ["퇴사 예정", `${planned.length}명`], ["이번 달 퇴사", `${left.filter((u) => String(u.resignedAt || "").startsWith(kstDay().slice(0, 7))).length}명`], ["누적 퇴사", `${left.length}명`]]} />
      {planned.length > 0 && (
        <BookCard en="PLANNED" title="퇴사 예정" flush>
          <div className="divide-y divide-[#EEF2F8]">
            {planned.map((u) => (
              <div key={u.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                <Avatar name={u.name} />
                <span className="flex-1 min-w-0"><span className="block text-[14.5px] font-black text-[#0F1A30]">{u.name} <span className="text-[12px] font-bold text-[#7A879C]">{u.team} · {u.position}</span></span><span className="block text-[12px] text-[#7A879C]">{u.resignPlan.type} · 퇴직 예정 <b style={{ fontFamily: MONO }}>{u.resignPlan.date}</b> · {u.resignPlan.reason}</span></span>
                <button type="button" onClick={() => printNotice(u, u.resignPlan)} className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B]">{u.resignPlan.type === "권고사직" ? "합의서 인쇄" : "확인서 인쇄"}</button>
                {canManage && <button type="button" onClick={() => cancelPlan(u)} className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-bold text-[#5B6B85]">예정 취소</button>}
                {canManage && <button type="button" onClick={() => { open(u); }} className="h-9 px-3.5 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black">퇴사 확정</button>}
              </div>
            ))}
          </div>
        </BookCard>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BookCard en="STAFF" title="재직 직원" right={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색" className="h-9 w-[150px] px-3 rounded-lg border border-[#DCE3EE] text-[13px] outline-none" />} flush>
          <div className="divide-y divide-[#EEF2F8] max-h-[520px] overflow-y-auto">
            {list.map((u) => (
              <div key={u.id} className="px-4 py-2.5 flex items-center gap-3">
                <Avatar name={u.name} />
                <span className="flex-1 min-w-0"><span className="block text-[14px] font-black text-[#0F1A30] truncate">{u.name || u.email}</span><span className="block text-[12px] text-[#7A879C] truncate">{[u.team, u.position].filter(Boolean).join(" · ")}</span></span>
                {canManage && !u.isMaster && <button type="button" onClick={() => open(u)} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] font-black text-[#B42318]">퇴사 처리</button>}
              </div>
            ))}
          </div>
        </BookCard>
        <BookCard en="LEFT" title="퇴사자" flush>
          {!left.length ? <div className="py-10 text-center text-[13px] font-bold text-[#9AA9C3]">퇴사자가 없습니다</div> : (
            <div className="divide-y divide-[#EEF2F8] max-h-[520px] overflow-y-auto">
              {left.map((u) => (
                <div key={u.id} className="px-4 py-2.5 flex items-center gap-3">
                  <Avatar name={u.name} />
                  <span className="flex-1 min-w-0"><span className="block text-[14px] font-black text-[#0F1A30] truncate">{u.name} {u.resignType && <span className="text-[11px] font-black px-1.5 py-0.5 rounded bg-[#F3F6FA] text-[#5B6B85]">{u.resignType}</span>}</span><span className="block text-[12px] text-[#7A879C] truncate" style={{ fontFamily: MONO }}>{u.resignedAt || "-"} · {u.team || ""}</span></span>
                  <button type="button" onClick={() => printNotice(u, { type: u.resignType || "자진 퇴사", date: u.resignedAt || "", reason: u.resignReason || "" })} className="h-8 px-2.5 rounded-lg border border-[#DCE3EE] text-[12px] font-bold text-[#1B2B4B]">인쇄</button>
                  {canManage && <button type="button" onClick={() => reinstate(u)} className="h-8 px-2.5 rounded-lg border border-[#DCE3EE] text-[12px] font-bold text-[#5B6B85]">복직</button>}
                </div>
              ))}
            </div>
          )}
        </BookCard>
      </div>
      {sel && f && (
        <Sheet side en="HR · RESIGNATION" title={`${sel.name} 퇴사 처리`} onClose={() => setSel(null)}
          footer={<><button type="button" onClick={() => setSel(null)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">취소</button>{f.date > kstDay() && <button type="button" disabled={busy} onClick={() => apply(false)} className="h-12 px-4 rounded-xl border border-[#0F1A30] bg-white text-[14px] font-black text-[#0F1A30]">예정 등록</button>}<button type="button" disabled={busy} onClick={() => apply(true)} className="flex-1 h-12 rounded-xl bg-[#B42318] text-white text-[15px] font-black disabled:opacity-50">지금 퇴사 확정</button></>}>
          <div><Label>구분</Label><div className="flex flex-wrap gap-1.5">{RETIRE_REASONS.map((r) => <Chip key={r} on={f.type === r} onClick={() => setF({ ...f, type: r })}>{r}</Chip>)}</div></div>
          {f.type === "권고사직" && <div className="rounded-xl bg-[#EEF3FC] border border-[#C9D6EE] px-3 py-2.5 text-[12.5px] text-[#1B2B4B] leading-relaxed">권고사직은 근로자 동의(합의서)가 필요하고, 실업급여 수급 대상(비자발적 이직)입니다. 경리에게 이직확인서 제출이 안내됩니다.</div>}
          {f.type === "해고" && <div className="rounded-xl bg-[#FEF3F2] border border-[#FECDCA] px-3 py-2.5 text-[12.5px] text-[#B42318] leading-relaxed">해고는 정당한 사유와 30일 전 서면 통지(해고예고)가 필요합니다(근로기준법 23·26·27조). 노무 검토 후 진행하세요.</div>}
          <div className="grid grid-cols-2 gap-3">
            <div><Label>퇴직일(마지막 근무일)</Label><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={inp} /></div>
            <div><Label>통보일</Label><input type="date" value={f.noticeDate} onChange={(e) => setF({ ...f, noticeDate: e.target.value })} className={inp} /></div>
          </div>
          <div><Label>사유</Label><textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} rows={4} className={`${inp} h-auto py-2`} placeholder="예: 경영상 사유로 인한 인원 조정 / 개인 사정" /></div>
          <button type="button" onClick={() => printNotice(sel, f)} className="w-full h-11 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-black text-[#1B2B4B]">{f.type === "권고사직" ? "권고사직 합의서 인쇄" : "퇴직 확인서 인쇄"}</button>
        </Sheet>
      )}
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
    setF({ name: u.name || "", phone: u.phone || "", team: u.team || "", position: u.position || "", role: u.role || "user", employType: u.employType || "정규직", employmentStatus: u.employmentStatus || "재직" });
    setR({ type: u.resignPlan?.type || "자진 퇴사", date: u.resignPlan?.date || kstDay(), reason: u.resignPlan?.reason || "", noticeDate: kstDay() });
  };
  const exec = f && isExecProfile(f);
  const saveInfo = async () => {
    setBusy(true);
    try {
      const role = exec ? "admin" : f.role;
      const ch = [];
      if ((sel.team || "") !== f.team) ch.push(`부서 ${sel.team || "미배정"}→${f.team || "미배정"}`);
      if ((sel.position || "") !== f.position) ch.push(`직책 ${sel.position || "-"}→${f.position || "-"}`);
      if ((sel.role || "") !== role && !sel.isMaster) ch.push(`권한 ${ROLE_NAME[sel.role] || sel.role}→${ROLE_NAME[role]}`);
      await updateDoc(doc(db, "users", sel.id), { name: f.name.trim(), phone: f.phone.trim(), team: f.team, position: f.position, ...(sel.isMaster ? {} : { role }), employType: f.employType, employmentStatus: f.employmentStatus, ...(ch.length ? { personnelHistory: arrayUnion({ date: kstDay(), type: "정보 수정", detail: `${ch.join(" · ")} (공문 없음)` }) } : {}) });
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
        <span className="text-[10.5px] font-black px-1.5 py-0.5 rounded-md bg-[#EEF3FC] text-[#1B2B4B]">{ROLE_NAME[u.role] || u.role}</span>
        {u.employType && u.employType !== "정규직" && <span className="text-[10.5px] font-black px-1.5 py-0.5 rounded-md bg-[#F3F6FA] text-[#5B6B85]">{u.employType}</span>}
        {u.employmentStatus === "휴직" && <span className="text-[10.5px] font-black px-1.5 py-0.5 rounded-md bg-[#F3E7CC] text-[#6B5320]">휴직</span>}
        {u.noAccount && <span className="text-[10.5px] font-black px-1.5 py-0.5 rounded-md bg-[#F3F6FA] text-[#9AA9C3]">계정 없음</span>}
        <span className="ml-auto text-[11px] font-bold text-[#9AA9C3] tabular-nums" style={{ fontFamily: MONO }}>{tenureOf(u.hireDate)}</span>
      </div>
    </button>
  );
  return (
    <div className="space-y-4">
      <BookHero en="HR · STAFF BOARD" title="직원 정보 · 퇴사" desc="카드를 누르면 정보 수정(공문 없이 바로)과 퇴사·권고사직 처리를 한 곳에서 합니다"
        kpis={[["재직", `${active.length}명`, `${groups.length}개 부서`], ["휴직", `${active.filter((u) => u.employmentStatus === "휴직").length}명`], ["퇴사 예정", `${planned.length}명`], ["이번 달 퇴사", `${left.filter((u) => String(u.resignedAt || "").startsWith(kstDay().slice(0, 7))).length}명`]]}
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
              <div><Label>부서</Label><select value={f.team} onChange={(e) => { const team = e.target.value; const position = hr.positionsFor(team).includes(f.position) ? f.position : ""; setF({ ...f, team, position, role: suggestRole({ team, position }) }); }} className={inp}><option value="">미배정</option>{hr.teams.map((t) => <option key={t}>{t}</option>)}</select></div>
              <div><Label>직책</Label><select value={f.position} onChange={(e) => setF({ ...f, position: e.target.value, role: suggestRole({ team: f.team, position: e.target.value }) })} className={inp}><option value="">미설정</option>{[...new Set([...hr.positionsFor(f.team), f.position].filter(Boolean))].map((p) => <option key={p}>{p}</option>)}</select></div>
              <div><Label>권한</Label><select value={exec ? "admin" : f.role} disabled={exec || sel.isMaster} onChange={(e) => setF({ ...f, role: e.target.value })} className={`${inp} disabled:bg-[#F5F8FD] disabled:text-[#9AA9C3]`}>{ROLE_KEYS.map((x) => <option key={x} value={x}>{ROLE_NAME[x]}</option>)}</select><div className="text-[11.5px] text-[#7A879C] mt-1">{sel.isMaster ? "마스터 계정은 관리자 고정" : exec ? "임원은 관리자 고정" : ROLE_DESC[f.role]}</div></div>
              <div><Label>고용 형태</Label><select value={f.employType} onChange={(e) => setF({ ...f, employType: e.target.value })} className={inp}>{["정규직", "계약직", "수습", "파트타임", "일용직"].map((k) => <option key={k}>{k}</option>)}</select></div>
              <div className="col-span-2"><Label>재직 상태</Label><div className="flex gap-1.5">{["재직", "휴직"].map((k) => <Chip key={k} on={f.employmentStatus === k} onClick={() => setF({ ...f, employmentStatus: k })}>{k}</Chip>)}</div></div>
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
          <div className="mt-2 text-[11.5px] text-[#9AA9C3]">「임원」 부서는 임원 화면과 연결돼 있어 뺄 수 없습니다</div>
        </BookCard>
        <BookCard en="POSITIONS" title="직책">
          <div className="text-[12px] font-black text-[#4B6CB7] mb-1.5">임원 직책 (부서 임원 전용 · 관리자 권한 고정)</div>
          <div className="flex flex-wrap gap-1.5 mb-3">{hr.exec.map((v) => <Pill key={v} v={v} base={EXEC_POSITION_OPTIONS.includes(v)} onX={["대표"].includes(v) ? null : () => removePos(v)} />)}</div>
          <div className="text-[12px] font-black text-[#4B6CB7] mb-1.5">일반 직책</div>
          <div className="flex flex-wrap gap-1.5">{hr.normal.map((v) => <Pill key={v} v={v} base={POSITION_OPTIONS.includes(v)} onX={() => removePos(v)} />)}</div>
          {canManage && <div className="mt-3 flex gap-2 items-center"><input value={p} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPos()} className={inp} placeholder="새 직책 (예: 실장, 소장)" /><Chip on={pe} onClick={() => setPe(!pe)}>임원 직책</Chip><button type="button" onClick={addPos} className="h-11 px-4 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black whitespace-nowrap">+ 추가</button></div>}
        </BookCard>
      </div>
      <BookCard en="ROLES" title="권한(프로그램 사용 범위)">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {ROLE_KEYS.map((r) => <div key={r} className="rounded-xl border border-[#E3E8F0] px-3.5 py-2.5"><div className="text-[14px] font-black text-[#0F1A30]">{ROLE_NAME[r]}</div><div className="text-[12px] text-[#7A879C]">{ROLE_DESC[r]}</div></div>)}
        </div>
        <div className="mt-3 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3.5 py-2.5 text-[12.5px] text-[#5B6B85] leading-relaxed">
          권한은 화면·보안 규칙과 연결된 <b className="text-[#0F1A30]">프로그램 기능 범위</b>라 회사에서 새로 만들거나 지울 수 없고, 직원마다 위 5가지 중에서 지정합니다. 부서·직책을 고르면 권한이 자동 추천됩니다(임원 → 관리자, 경리/회계팀 → 경리, 인사팀 → 인사관리자, 과장 이상 → 관리자, 그 외 → 실무자).
        </div>
      </BookCard>
    </div>
  );
}

// ═════════════════ 사내 규정(취업규칙 등) ═════════════════
export const RULE_CATS = ["취업규칙", "인사규정", "복무규정", "급여·수당 규정", "휴가 규정", "출장·경비 규정", "차량·운행 안전 규정", "보안·개인정보 규정", "경조사 규정", "기타"];
const RULE_TEMPLATES = {
  취업규칙: "제1장 총칙\n 제1조(목적) 이 규칙은 회사와 직원의 근로조건 및 복무에 관한 사항을 정함을 목적으로 한다.\n 제2조(적용 범위) 이 규칙은 회사에 근무하는 모든 직원에게 적용한다.\n\n제2장 채용 및 근로계약\n 제3조(채용) …\n 제4조(수습기간) 신규 채용자는 3개월의 수습기간을 둘 수 있다.\n\n제3장 근로시간 및 휴게\n 제5조(근로시간) 1일 8시간, 1주 40시간을 원칙으로 한다.\n 제6조(휴게) 4시간 근무 시 30분, 8시간 근무 시 1시간의 휴게시간을 준다.\n\n제4장 휴일·휴가\n 제7조(연차유급휴가) 근로기준법 제60조에 따른다.\n\n제5장 임금\n 제8조(임금 지급) 매월 ○일에 통화로 직접 그 전액을 지급한다.\n\n제6장 퇴직\n 제9조(퇴직금) 1년 이상 근속한 직원에게 퇴직급여보장법에 따라 지급한다.\n\n제7장 징계\n 제10조(징계 사유·종류) …\n\n부칙\n 이 규칙은 ____년 __월 __일부터 시행한다.\n\n※ 상시 10명 이상 사업장은 취업규칙을 작성해 관할 고용노동지청에 신고해야 합니다(근로기준법 제93조).",
  "차량·운행 안전 규정": "제1조(목적) 회사 차량 및 운송 업무의 안전 운행 기준을 정한다.\n제2조(운행 전 점검) 타이어·제동장치·적재 상태를 확인한다.\n제3조(과적·과속 금지) …\n제4조(사고 처리) 사고 즉시 회사에 보고하고 기사관리 › 과태료·사고 서류에 등록한다.",
};
export function CompanyRules({ company, canEdit = false }) {
  const [rows, setRows] = React.useState(null);
  const [cat, setCat] = React.useState("전체");
  const [open, setOpen] = React.useState(null);
  const [edit, setEdit] = React.useState(null);
  React.useEffect(() => { if (!company) return undefined; return onSnapshot(query(collection(db, "companyRules"), where("companyName", "==", company)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([])); }, [company]);
  const list = (rows || []).filter((r) => cat === "전체" || r.category === cat).sort((a, b) => RULE_CATS.indexOf(a.category) - RULE_CATS.indexOf(b.category) || String(a.title).localeCompare(String(b.title)));
  const save = async () => {
    const e = edit; if (!e.title.trim() || !e.body.trim()) return alert("제목과 내용을 입력해 주세요.");
    const data = { companyName: company, title: e.title.trim(), category: e.category, body: e.body, effectiveDate: e.effectiveDate || "", version: e.id ? (Number(e.version) || 1) + 1 : 1, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || "" };
    if (e.id) await updateDoc(doc(db, "companyRules", e.id), data); else await addDoc(collection(db, "companyRules"), { ...data, createdAt: serverTimestamp() });
    setEdit(null);
  };
  const cur = open ? (rows || []).find((r) => r.id === open) : null;
  return (
    <div className="space-y-4">
      <BookHero en="COMPANY · RULES" title="사내 규정" desc="취업규칙·인사·복무·급여·휴가·출장·차량 안전·보안 규정 — 모든 직원이 볼 수 있습니다"
        right={canEdit && <button type="button" onClick={() => setEdit({ title: "", category: "취업규칙", body: "", effectiveDate: kstDay() })} className="h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black whitespace-nowrap">+ 규정 등록</button>}
        kpis={[["등록 규정", `${(rows || []).length}건`], ["취업규칙", (rows || []).some((r) => r.category === "취업규칙") ? "등록됨" : "미등록", "10인 이상 신고 의무"]]} />
      <div className="flex gap-1.5 overflow-x-auto pb-1">{["전체", ...RULE_CATS].map((c) => <Chip key={c} on={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}</div>
      {cur ? (
        <BookCard en={cur.category} title={cur.title} right={<div className="flex gap-1.5"><button type="button" onClick={() => setOpen(null)} className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B]">← 목록</button>{canEdit && <button type="button" onClick={() => setEdit({ ...cur })} className="h-9 px-3 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black">수정</button>}</div>}>
          <div className="text-[12px] text-[#7A879C] mb-3" style={{ fontFamily: MONO }}>v{cur.version || 1} · 시행 {cur.effectiveDate || "-"}</div>
          <div className="rounded-2xl bg-[#FBFCFE] border border-[#E3E8F0] px-5 md:px-8 py-6 text-[15px] leading-[1.95] text-[#1F2A44] whitespace-pre-wrap">{cur.body}</div>
        </BookCard>
      ) : (
        <BookCard en="LIBRARY" title={`규정 ${list.length}건`} flush>
          {rows === null ? <div className="py-12 text-center text-[13px] font-bold text-[#9AA9C3]">불러오는 중…</div> : !list.length ? <div className="py-14 text-center text-[13.5px] font-bold text-[#9AA9C3]">등록된 규정이 없습니다{canEdit ? " · 오른쪽 위 [+ 규정 등록]" : ""}</div> : (
            <div className="divide-y divide-[#EEF2F8]">
              {list.map((r) => (
                <button key={r.id} type="button" onClick={() => setOpen(r.id)} className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-[#F7F9FC]">
                  <span className="w-11 h-11 rounded-2xl bg-[#0F1A30] text-white grid place-items-center text-[16px] shrink-0">§</span>
                  <span className="flex-1 min-w-0"><span className="block text-[15px] font-black text-[#0F1A30] truncate">{r.title}</span><span className="block text-[12px] text-[#7A879C]">{r.category} · v{r.version || 1} · 시행 {r.effectiveDate || "-"}</span></span>
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
          <div><Label>분류</Label><div className="flex flex-wrap gap-1.5">{RULE_CATS.map((c) => <Chip key={c} on={edit.category === c} onClick={() => setEdit((p) => ({ ...p, category: c, title: p.title || c, body: p.body || RULE_TEMPLATES[c] || "" }))}>{c}</Chip>)}</div></div>
          <div className="grid grid-cols-[1fr_170px] gap-2"><div><Label>제목</Label><input value={edit.title} onChange={(e) => setEdit((p) => ({ ...p, title: e.target.value }))} className={inp} /></div><div><Label>시행일</Label><input type="date" value={edit.effectiveDate} onChange={(e) => setEdit((p) => ({ ...p, effectiveDate: e.target.value }))} className={inp} /></div></div>
          <div><Label>내용 {RULE_TEMPLATES[edit.category] && !edit.body && <button type="button" onClick={() => setEdit((p) => ({ ...p, body: RULE_TEMPLATES[p.category] }))} className="ml-2 text-[12px] font-black text-[#2D4C82]">표준 양식 불러오기</button>}</Label><textarea value={edit.body} onChange={(e) => setEdit((p) => ({ ...p, body: e.target.value }))} rows={22} className="w-full rounded-xl border border-[#DCE3EE] bg-white px-4 py-3 text-[14.5px] leading-[1.85] outline-none focus:border-[#2D4C82]" /></div>
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
