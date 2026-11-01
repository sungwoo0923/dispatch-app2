// ======================= src/HrHub.jsx =======================
// 🧑‍💼 인사관리부 허브(2026-10-31) — 인사관리자 상단 메뉴 [인사관리부] 안의 왼쪽 메뉴.
//  인사 기록(이력서·근태·인사발령) · 직원 등록(계정 없이 인사 기록) · 정보 수정(공문 없이 바로) · 출근기록부 ·
//  퇴사·권고사직 · 직책·부서 설정(회사별 추가·숨김) · 사내 규정(취업규칙 등)
import React from "react";
import { AddressField } from "./ResumeInputs";
import { addDoc, arrayUnion, collection, deleteDoc, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db, auth, DEFAULT_COMPANY } from "./firebase";
import KpSubNav from "./KpSubNav";
import { BookHero, BookCard, Chip, Sheet, MONO, HERO_BG } from "./OfficeBooks";
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
  admin: "운송 업무 전체 — 배차·운임·정산·매출·기사·거래처 관리 + 관리자메뉴(직원 승인 등). 임원 화면은 「임원 화면」 역할에서",
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
      <BookHero en="HR · REGISTER" title="직원 등록" desc="프로그램 계정이 없어도 인사 기록을 만들 수 있습니다 — 등록 후 인사관리 › 이력서를 채우세요" />
      {done && <div className="rounded-2xl bg-[#ECFDF3] border border-[#ABEFC6] px-4 py-3 flex items-center gap-3"><b className="text-[14px] text-[#067647]">✓ {done.name}님을 등록했습니다</b><button type="button" onClick={() => onDone?.(done.id)} className="ml-auto h-9 px-4 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black">이력서 작성하러 가기 ›</button></div>}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
        <BookCard en="PERSONAL" title="인적 사항">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>이름 *</Label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inp} /></div>
            <div><Label>생년월일</Label><input type="date" value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value })} className={inp} /></div>
            <div><Label>연락처</Label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={inp} placeholder="010-0000-0000" /></div>
            <div><Label>이메일(선택)</Label><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={inp} /></div>
            <div className="md:col-span-2"><Label>주소</Label><AddressField value={f.address} onChange={(v) => setF((p) => ({ ...p, address: v }))} /></div>
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
// ⭐ 2026-11-01 직원 정보·퇴사 화면 공용 조각 — 컴포넌트 밖에 둬야 입력 중 포커스가 안 풀린다
const avBg = (u) => (isExecProfile(u) ? "linear-gradient(135deg,#9A7425,#D7BC82)" : "linear-gradient(135deg,#1B2B4B,#2D4C82)");
const fi = "h-12 w-full px-3.5 rounded-xl border border-[#DCE3EE] bg-white text-[15px] font-semibold text-[#0F1A30] outline-none transition focus:border-[#2D4C82] focus:ring-4 focus:ring-[#2D4C82]/10 disabled:bg-[#F5F7FB] disabled:text-[#8A97AD] disabled:cursor-not-allowed";
const Eyebrow = ({ children, className = "" }) => <div className={`text-[10.5px] font-extrabold tracking-[0.24em] uppercase ${className}`} style={{ fontFamily: MONO }}>{children}</div>;
const Field = ({ label, hint, children, wide = false }) => (
  <label className={`block min-w-0 ${wide ? "col-span-2" : ""}`}>
    <span className="block text-[13px] font-bold text-[#3A4A66] mb-1.5">{label}</span>
    {children}
    {hint && <span className="block text-[12px] leading-snug text-[#7A879C] mt-1.5">{hint}</span>}
  </label>
);
const Section = ({ no, en, title, right, children }) => (
  <section className="rounded-2xl bg-white border border-[#E6EBF2] p-5">
    <div className="flex items-center gap-3 mb-4">
      <span className="text-[11px] font-extrabold text-[#2D4C82] tabular-nums" style={{ fontFamily: MONO }}>{no}</span>
      <div className="min-w-0">
        <Eyebrow className="text-[#7A8BAA] !text-[9.5px]">{en}</Eyebrow>
        <div className="text-[15.5px] font-black text-[#0F1A30] tracking-tight leading-tight">{title}</div>
      </div>
      <span className="flex-1 h-px bg-[#EEF1F6]" />
      {right}
    </div>
    {children}
  </section>
);
const Pill = ({ tone = "navy", children }) => {
  const c = { navy: "bg-[#EEF3FC] text-[#1B2B4B]", gray: "bg-[#F2F4F8] text-[#5B6B85]", sand: "bg-[#F6EEDC] text-[#6B5320]", amber: "bg-[#FFF4E5] text-[#B54708]", mute: "bg-[#F2F4F8] text-[#9AA9C3]" }[tone];
  return <span className={`inline-flex items-center h-[22px] px-2 rounded-md text-[11.5px] font-bold whitespace-nowrap ${c}`}>{children}</span>;
};
const Fact = ({ en, k, v, mono = false }) => (
  <div className="min-w-0 px-4 py-2.5 rounded-xl bg-white/[0.06] ring-1 ring-white/10">
    <div className="flex items-center gap-1.5"><Eyebrow className="text-[#8FB0F0] !text-[9.5px]">{en}</Eyebrow><span className="text-[11.5px] font-bold text-white/45">{k}</span></div>
    <div className={`mt-1 text-[15px] font-black text-white truncate ${mono ? "tabular-nums" : ""}`} style={mono ? { fontFamily: MONO } : undefined}>{v}</div>
  </div>
);
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
  const [flt, setFlt] = React.useState("all"); // all | leave | planned
  const active = all.filter((u) => u.employmentStatus !== "퇴사");
  const planned = active.filter((u) => u.resignPlan?.date);
  const left = all.filter((u) => u.employmentStatus === "퇴사").sort((a, b) => String(b.resignedAt || "").localeCompare(String(a.resignedAt || "")));
  const kw = q.trim();
  const match = (u) => !kw || [u.name, u.team, u.position, u.phone].some((v) => String(v || "").includes(kw));
  const groups = (() => { const g = {}; active.filter(match).forEach((u) => { const t = u.team || "미배정"; (g[t] = g[t] || []).push(u); }); return hr.teams.concat(["미배정"]).filter((t) => g[t]).map((t) => [t, g[t].sort((a, b) => hr.positionsFor(t).indexOf(b.position) - hr.positionsFor(t).indexOf(a.position) || String(a.name || "").localeCompare(String(b.name || ""), "ko"))]).concat(Object.keys(g).filter((t) => !hr.teams.includes(t) && t !== "미배정").map((t) => [t, g[t]])); })();
  const open = (u, m = "info") => {
    setSel(u); setMode(m);
    setF({ name: u.name || "", phone: u.phone || "", team: u.team || "", position: u.position || "", role: u.role || "user", employType: u.employType || "정규직", employmentStatus: u.employmentStatus || "재직", leaveFrom: u.leave?.from || kstDay(), leaveTo: u.leave?.to || "", leaveMemo: u.leave?.memo || "", hireDate: u.hireDate || "" });
    setR({ type: u.resignPlan?.type || "자진 퇴사", date: u.resignPlan?.date || kstDay(), reason: u.resignPlan?.reason || "", noticeDate: kstDay() });
    // ⭐ 2026-11-01 연차 계산은 userProfiles.hireDate를 쓰므로 그 값을 우선으로 보여준다
    setOrigHire(u.hireDate || "");
    getDoc(doc(db, "userProfiles", u.id)).then((ps) => {
      const h = ps.exists() ? ps.data().hireDate || "" : "";
      if (h) { setOrigHire(h); setF((p) => (p && p.hireDate === (u.hireDate || "") ? { ...p, hireDate: h } : p)); }
    }).catch(() => {});
  };
  const [origHire, setOrigHire] = React.useState("");
  // 입사일은 인사팀(인사관리자·경리+인사·인사 부서·최고관리자)만 — 보안 규칙(isHrStaff)과 같은 기준
  const meUid = auth.currentUser?.uid;
  const meDoc = all.find((u) => u.id === meUid) || {};
  const canHire = auth.currentUser?.email === "tjddnqkf@naver.com" || ["hrManager", "hrAcct", "totalMaster"].includes(meDoc.role || (typeof localStorage !== "undefined" ? localStorage.getItem("role") : "")) || /인사/.test(meDoc.team || "");
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
      const hireChanged = canHire && (origHire || "") !== (f.hireDate || "");
      if (hireChanged) ch.push(`입사일 ${origHire || "미등록"}→${f.hireDate || "미등록"}`);
      // ⭐ 2026-11-01 입사일은 여기(인사관리부 › 인사관리 › 직원관리)에서만 바꾼다 — 연차 계산용(userProfiles)과 인사 기록(users) 둘 다
      if (hireChanged) await setDoc(doc(db, "userProfiles", sel.id), { hireDate: f.hireDate || "", hireDateBy: auth.currentUser?.email || "", hireDateAt: serverTimestamp() }, { merge: true });
      await updateDoc(doc(db, "users", sel.id), { name: f.name.trim(), phone: f.phone.trim(), team: f.team, position: f.position, ...(sel.isMaster ? {} : { role }), ...(hireChanged ? { hireDate: f.hireDate || "" } : {}), employType: f.employType, employmentStatus: f.employmentStatus, leave: onLeave ? { type: f.employmentStatus, from: f.leaveFrom, to: f.leaveTo || "", memo: (f.leaveMemo || "").trim() } : null, ...(ch.length ? { personnelHistory: arrayUnion({ date: kstDay(), type: "정보 수정", detail: `${ch.join(" · ")} (공문 없음)` }) } : {}) });
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
  // ⭐ 2026-11-01 리디자인 — 왼쪽 직원 디렉터리(목록) / 오른쪽 상세 패널, 네이비 톤·모노 라벨·큰 글씨
  const leaveCnt = active.filter((u) => LEAVE_STATUSES.includes(u.employmentStatus)).length;
  const monthLeft = left.filter((u) => String(u.resignedAt || "").startsWith(kstDay().slice(0, 7))).length;
  const fltOk = (u) => flt === "all" || (flt === "leave" ? LEAVE_STATUSES.includes(u.employmentStatus) : !!u.resignPlan?.date);
  const shownGroups = groups.map(([t, us]) => [t, us.filter(fltOk)]).filter(([, us]) => us.length);
  const Row = ({ u }) => {
    const on = sel?.id === u.id;
    return (
      <button type="button" onClick={() => open(u)} className={`group relative w-full text-left flex items-center gap-3.5 pl-4 pr-4 py-3 transition ${on ? "bg-[#F1F5FC]" : "hover:bg-[#F8FAFD]"}`}>
        <span className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full transition ${on ? "bg-[#2D4C82]" : "bg-transparent"}`} />
        <span className="w-11 h-11 rounded-[14px] grid place-items-center text-[16px] font-black text-white shrink-0 shadow-[0_4px_10px_rgba(15,26,48,0.18)]" style={{ background: avBg(u) }}>{String(u.name || "?").slice(0, 1)}</span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-[15.5px] font-black text-[#0F1A30] truncate">{u.name || u.email}</span>
            <span className="text-[13px] font-semibold text-[#5B6B85] truncate">{u.position || "직책 없음"}</span>
          </span>
          <span className="mt-1 flex items-center gap-1.5 flex-wrap">
            <Pill>{ro.label(u.role)}</Pill>
            {u.employType && u.employType !== "정규직" && <Pill tone="gray">{u.employType}</Pill>}
            {LEAVE_STATUSES.includes(u.employmentStatus) && <Pill tone="sand">{u.employmentStatus}{u.leave?.to ? ` ~${String(u.leave.to).slice(2).replace(/-/g, ".")}` : ""}</Pill>}
            {u.resignPlan?.date && <Pill tone="amber">퇴사 예정</Pill>}
            {u.noAccount && <Pill tone="mute">계정 없음</Pill>}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[12.5px] font-bold text-[#3A4A66] tabular-nums" style={{ fontFamily: MONO }}>{tenureOf(u.hireDate) || "—"}</span>
          <span className="block text-[10px] font-bold tracking-[0.16em] text-[#A3AFC2]" style={{ fontFamily: MONO }}>{u.hireDate ? u.hireDate.replace(/-/g, ".") : "NO DATE"}</span>
        </span>
      </button>
    );
  };
  return (
    <div className="space-y-5">
      {/* 상단 — 제목 + 핵심 숫자 */}
      <div className="relative overflow-hidden rounded-[24px] text-white shadow-[0_18px_40px_rgba(15,26,48,0.22)]" style={{ background: HERO_BG }}>
        <div className="px-7 pt-5 pb-4 flex items-end justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <Eyebrow className="text-[#8FB0F0]">HR · Staff Board</Eyebrow>
            <div className="text-[25px] font-black tracking-tight mt-0.5 leading-tight">직원관리</div>
            <div className="text-[14px] text-white/60 mt-0.5">목록에서 직원을 고르면 오른쪽에서 정보·입사일 수정(공문 없이 바로)과 퇴사·권고사직을 처리합니다</div>
          </div>
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7A8BAA]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 부서 · 직책 · 연락처" className="h-11 w-[280px] pl-10 pr-4 rounded-xl bg-white text-[#0F1A30] text-[14.5px] font-semibold outline-none ring-4 ring-white/10 placeholder:text-[#9AA9C3]" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 border-t border-white/10">
          {[["Active", "재직", active.length, `${groups.length}개 부서`], ["On Leave", "휴직 · 육아휴직", leaveCnt, `육아휴직 ${active.filter((u) => u.employmentStatus === "육아휴직").length}명`], ["Planned", "퇴사 예정", planned.length, planned[0] ? `가장 빠른 날 ${planned.map((u) => u.resignPlan.date).sort()[0]}` : "예정 없음"], ["This Month", "이번 달 퇴사", monthLeft, `누적 퇴사 ${left.length}명`]].map(([en, k, n, sub], i) => (
            <div key={en} className={`px-7 py-3 ${i ? "md:border-l border-white/10" : ""} ${i % 2 ? "border-l border-white/10 md:border-l" : ""} ${i > 1 ? "border-t md:border-t-0 border-white/10" : ""}`}>
              <Eyebrow className="text-[#8FB0F0] !text-[9.5px]">{en}</Eyebrow>
              <div className="mt-1 flex items-baseline gap-1.5"><span className="text-[26px] leading-none font-black tabular-nums" style={{ fontFamily: MONO }}>{n}</span><span className="text-[13px] font-bold text-white/55">명</span><span className="ml-1 text-[13px] font-bold text-white/80">{k}</span></div>
              <div className="mt-0.5 text-[12.5px] text-white/50 truncate">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {!canManage && <div className="rounded-xl bg-[#FEF3F2] border border-[#FECDCA] px-4 py-3 text-[13.5px] font-bold text-[#B42318] flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#B42318]" />직책·부서·권한 변경과 퇴사 처리는 마스터·인사관리자만 할 수 있습니다</div>}

      {planned.length > 0 && (
        <div className="rounded-2xl border border-[#F5DDB0] bg-[#FFFBF3] px-5 py-2.5 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 shrink-0"><span className="w-2 h-2 rounded-full bg-[#F79009] animate-pulse" /><Eyebrow className="text-[#B54708]">Planned</Eyebrow><span className="text-[13.5px] font-black text-[#B54708]">퇴사 예정</span></div>
          <div className="flex flex-wrap gap-2">
            {planned.map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-xl bg-white border border-[#F5DDB0] pl-3.5 pr-1.5 py-1.5 shadow-[0_2px_6px_rgba(181,71,8,0.06)]">
                <span className="text-[14px] font-black text-[#0F1A30]">{u.name}</span>
                <span className="text-[12.5px] text-[#7A879C]">{u.resignPlan.type}</span>
                <span className="text-[12.5px] font-bold text-[#B54708] tabular-nums" style={{ fontFamily: MONO }}>{u.resignPlan.date}</span>
                {canManage && <><button type="button" onClick={() => cancelPlan(u)} className="h-8 px-2.5 rounded-lg text-[12.5px] font-bold text-[#5B6B85] hover:bg-[#F5F7FB]">취소</button><button type="button" onClick={() => open(u, "resign")} className="h-8 px-3 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black">퇴사 확정</button></>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ⭐ 2026-11-01 왼쪽 직원 목록 / 오른쪽 선택한 직원 정보 */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(360px,440px)_minmax(0,1fr)] gap-5 items-start">
        {/* ── 디렉터리 ── */}
        <div className="lg:sticky lg:top-0 min-w-0 rounded-[22px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)] overflow-hidden flex flex-col lg:max-h-[calc(100vh-250px)]">
          <div className="px-5 pt-4 pb-3 border-b border-[#EEF1F6] shrink-0">
            <div className="flex items-center justify-between">
              <div><Eyebrow className="text-[#4B6CB7]">Directory</Eyebrow><div className="text-[16px] font-black text-[#0F1A30]">직원 목록 <span className="text-[13px] font-bold text-[#7A879C] tabular-nums" style={{ fontFamily: MONO }}>{shownGroups.reduce((n, [, us]) => n + us.length, 0)}</span></div></div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#F2F5FA]">
              {[["all", "전체", active.length], ["leave", "휴직", leaveCnt], ["planned", "퇴사 예정", planned.length]].map(([k, l, n]) => (
                <button key={k} type="button" onClick={() => setFlt(k)} className={`h-9 rounded-lg text-[13px] font-bold transition flex items-center justify-center gap-1.5 ${flt === k ? "bg-white text-[#0F1A30] shadow-[0_1px_2px_rgba(16,24,40,0.08),0_4px_10px_rgba(16,24,40,0.06)]" : "text-[#5B6B85] hover:text-[#0F1A30]"}`}>{l}<span className={`text-[11px] tabular-nums ${flt === k ? "text-[#2D4C82]" : "text-[#9AA9C3]"}`} style={{ fontFamily: MONO }}>{n}</span></button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {!shownGroups.length && <div className="py-14 text-center text-[13.5px] font-bold text-[#9AA9C3]">{kw ? "검색 결과가 없습니다" : flt !== "all" ? "해당하는 직원이 없습니다" : "등록된 직원이 없습니다"}</div>}
            {shownGroups.map(([t, us]) => (
              <div key={t}>
                <div className="sticky top-0 z-[1] px-5 py-2 bg-[#F8FAFC]/95 backdrop-blur border-y border-[#EEF1F6] flex items-center gap-2">
                  <span className="text-[12.5px] font-black text-[#1B2B4B]">{t}</span>
                  <span className="text-[11px] font-bold text-[#9AA9C3] tabular-nums" style={{ fontFamily: MONO }}>{String(us.length).padStart(2, "0")}</span>
                </div>
                <div className="divide-y divide-[#F1F4F8]">{us.map((u) => <Row key={u.id} u={u} />)}</div>
              </div>
            ))}
            {/* 퇴사자 */}
            <div className="border-t border-[#EEF1F6]">
              <button type="button" onClick={() => setShowLeft(!showLeft)} className="w-full px-5 py-3.5 flex items-center gap-2 text-left hover:bg-[#F8FAFD]">
                <Eyebrow className="text-[#7A879C]">Former</Eyebrow>
                <span className="text-[14px] font-black text-[#0F1A30]">퇴사자</span>
                <span className="text-[12px] font-bold text-[#9AA9C3] tabular-nums" style={{ fontFamily: MONO }}>{left.length}</span>
                <span className="text-[12px] text-[#9AA9C3]">· 로그인 차단됨</span>
                <svg className="ml-auto text-[#9AA9C3]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showLeft ? "rotate(180deg)" : "none", transition: "transform .25s" }}><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {showLeft && <div className="divide-y divide-[#F1F4F8] border-t border-[#EEF1F6] bg-[#FBFCFE]">
                {!left.length ? <div className="py-8 text-center text-[13px] font-bold text-[#9AA9C3]">퇴사자가 없습니다</div> : left.map((u) => (
                  <div key={u.id} className="px-5 py-3 flex items-center gap-3">
                    <span className="w-10 h-10 rounded-[12px] bg-[#E9EDF4] text-[#5B6B85] grid place-items-center text-[14px] font-black shrink-0">{String(u.name || "?").slice(0, 1)}</span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5"><span className="text-[14.5px] font-black text-[#3A4A66] truncate">{u.name}</span>{u.resignType && <Pill tone="gray">{u.resignType}</Pill>}</span>
                      <span className="block text-[12px] text-[#7A879C] truncate"><span style={{ fontFamily: MONO }}>{u.resignedAt || "-"}</span>{u.team ? ` · ${u.team}` : ""}{u.resignReason ? ` · ${u.resignReason}` : ""}</span>
                    </span>
                    <button type="button" onClick={() => printResign(company, u, { type: u.resignType || "자진 퇴사", date: u.resignedAt || "", reason: u.resignReason || "" })} className="h-8 px-2.5 rounded-lg border border-[#DCE3EE] bg-white text-[12px] font-bold text-[#1B2B4B] hover:border-[#2D4C82]">인쇄</button>
                    {canManage && <button type="button" onClick={() => reinstate(u)} className="h-8 px-2.5 rounded-lg border border-[#DCE3EE] bg-white text-[12px] font-bold text-[#5B6B85] hover:border-[#2D4C82]">복직</button>}
                  </div>
                ))}
              </div>}
            </div>
          </div>
        </div>

        {/* ── 상세 패널 ── */}
        <div className="min-w-0">
        {sel && f && r ? (
          <div className="rounded-[22px] bg-[#F4F6FA] border border-[#E3E8F0] flex flex-col shadow-[0_1px_2px_rgba(16,24,40,0.04),0_18px_40px_rgba(15,26,48,0.10)]">
            <div className="relative px-6 pt-5 pb-5 text-white shrink-0 rounded-t-[21px]" style={{ background: HERO_BG }}>
              <div className="flex items-start gap-4">
                <span className="w-14 h-14 rounded-2xl grid place-items-center text-[22px] font-black shrink-0 ring-1 ring-white/25 shadow-[0_8px_20px_rgba(0,0,0,0.25)]" style={{ background: avBg(sel) }}>{String(sel.name || "?").slice(0, 1)}</span>
                <div className="min-w-0 flex-1">
                  <Eyebrow className="text-[#8FB0F0]">{`Employee · ${mode === "info" ? "Profile Edit" : "Resignation"}`}</Eyebrow>
                  <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="text-[24px] font-black tracking-tight leading-tight truncate">{sel.name || sel.email}</span>
                    <span className="h-6 px-2 rounded-md bg-white/12 ring-1 ring-white/15 text-[12px] font-bold flex items-center">{ro.label(sel.role)}</span>
                    {(sel.employmentStatus || "재직") !== "재직" && <span className="h-6 px-2 rounded-md bg-[#F6EEDC] text-[#6B5320] text-[12px] font-bold flex items-center">{sel.employmentStatus}</span>}
                    {sel.resignPlan?.date && <span className="h-6 px-2 rounded-md bg-[#FFF4E5] text-[#B54708] text-[12px] font-bold flex items-center">퇴사 예정 {sel.resignPlan.date}</span>}
                  </div>
                  <div className="mt-0.5 text-[13.5px] text-white/60 truncate">{[sel.email, sel.phone].filter(Boolean).join(" · ") || "연락처 미등록"}</div>
                </div>
                <button type="button" onClick={() => setSel(null)} className="w-9 h-9 rounded-xl bg-white/10 ring-1 ring-white/15 hover:bg-white/20 shrink-0 grid place-items-center" title="닫기"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
              </div>
              <div className="mt-4 grid grid-cols-2 xl:grid-cols-4 gap-2">
                <Fact en="Team" k="부서" v={sel.team || "미배정"} />
                <Fact en="Title" k="직책" v={sel.position || "미설정"} />
                <Fact en="Hired" k="입사일" v={origHire || "미등록"} mono />
                <Fact en="Tenure" k="근속" v={origHire ? tenureOf(origHire) || "1개월 미만" : "—"} mono />
              </div>
            </div>
            <div className="px-6 pt-4 shrink-0">
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white border border-[#E3E8F0]">
                {[["info", "정보 수정", "EDIT"], ["resign", "퇴사 · 권고사직", "RESIGN"]].map(([k, l, en]) => <button key={k} type="button" onClick={() => setMode(k)} disabled={sel.isMaster && k === "resign"} className={`h-11 rounded-lg text-[14.5px] font-black transition flex items-center justify-center gap-2 disabled:opacity-30 ${mode === k ? (k === "resign" ? "bg-[#B42318] text-white shadow-[0_6px_14px_rgba(180,35,24,0.25)]" : "bg-[#0F1A30] text-white shadow-[0_6px_14px_rgba(15,26,48,0.25)]") : "text-[#5B6B85] hover:text-[#0F1A30]"}`}><span className={`text-[9.5px] tracking-[0.2em] ${mode === k ? "text-white/55" : "text-[#A3AFC2]"}`} style={{ fontFamily: MONO }}>{en}</span>{l}</button>)}
              </div>
            </div>
            <fieldset disabled={!canManage} className="px-6 py-4 space-y-3.5 min-w-0">
            {mode === "info" ? (
              <>
                <Section no="01" en="Basic" title="기본 정보">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="이름"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={fi} /></Field>
                    <Field label="연락처"><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={`${fi} tabular-nums`} placeholder="010-0000-0000" /></Field>
                  </div>
                </Section>
                <Section no="02" en="Organization" title="소속 · 권한">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="부서"><select value={f.team} onChange={(e) => { const team = e.target.value; const position = hr.positionsFor(team).includes(f.position) ? f.position : ""; setF({ ...f, team, position, role: suggestFor({ team, position }, ro.execKeys) }); }} className={fi}><option value="">미배정</option>{hr.teams.map((t) => <option key={t}>{t}</option>)}</select></Field>
                    <Field label="직책"><select value={f.position} onChange={(e) => setF({ ...f, position: e.target.value, role: suggestFor({ team: f.team, position: e.target.value }, ro.execKeys) })} className={fi}><option value="">미설정</option>{[...new Set([...hr.positionsFor(f.team), f.position].filter(Boolean))].map((p) => <option key={p}>{p}</option>)}</select></Field>
                    <Field label="권한" hint={sel.isMaster ? "마스터 계정은 권한을 바꿀 수 없습니다" : ROLE_DESC[f.role] || (ro.execKeys.includes(f.role) ? "임원 화면(경영 브리핑) — 권한 관리에서 만든 역할" : "권한 관리에서 만든 역할 — 메뉴는 그 설정을 따릅니다")}><select value={f.role} disabled={sel.isMaster} onChange={(e) => setF({ ...f, role: e.target.value })} className={fi}>{[...ro.options, ...(ro.options.some(([k]) => k === f.role) ? [] : [[f.role, ro.label(f.role)]])].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                    <Field label="고용 형태"><select value={f.employType} onChange={(e) => setF({ ...f, employType: e.target.value })} className={fi}>{["정규직", "계약직", "수습", "파트타임", "일용직"].map((k) => <option key={k}>{k}</option>)}</select></Field>
                  </div>
                </Section>
                <Section no="03" en="Tenure" title="입사 · 근속" right={<span className={`inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11.5px] font-bold ${canHire ? "bg-[#EEF3FC] text-[#2D4C82]" : "bg-[#F2F4F8] text-[#7A879C]"}`}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" />{canHire ? <path d="M8 11V7a4 4 0 017.5-2" /> : <path d="M8 11V7a4 4 0 018 0v4" />}</svg>{canHire ? "인사팀 수정 가능" : "인사팀 전용"}</span>}>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="입사일" hint={f.hireDate ? "연차 · 퇴직금 계산 기준일" : "연차·퇴직금 계산 기준일 — 아직 등록되지 않았습니다"}><input type="date" value={f.hireDate} max={kstDay()} disabled={!canHire} onChange={(e) => setF({ ...f, hireDate: e.target.value })} className={`${fi} tabular-nums`} /></Field>
                    <Field label="근속" hint={canHire ? "입사일은 이 화면에서만 바꿀 수 있습니다" : "입사일은 인사팀만 바꿀 수 있습니다"}>
                      <div className="h-12 px-3.5 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] flex items-baseline gap-2 pt-3"><span className="text-[17px] font-black text-[#0F1A30] tabular-nums" style={{ fontFamily: MONO }}>{f.hireDate ? tenureOf(f.hireDate) || "1개월 미만" : "—"}</span>{f.hireDate && f.hireDate !== origHire && <span className="text-[11.5px] font-bold text-[#2D4C82]">변경됨</span>}</div>
                    </Field>
                  </div>
                </Section>
                <Section no="04" en="Status" title="재직 상태">
                  <div className="flex flex-wrap items-center gap-2">
                    {STATUS_OPTIONS.map((k) => <button key={k} type="button" onClick={() => setF({ ...f, employmentStatus: k })} className={`h-10 px-4 rounded-xl text-[14px] font-black border transition ${f.employmentStatus === k ? "bg-[#0F1A30] text-white border-[#0F1A30] shadow-[0_4px_12px_rgba(15,26,48,0.2)]" : "bg-white text-[#3A4A66] border-[#DCE3EE] hover:border-[#2D4C82]"}`}>{k}</button>)}
                    <span className="w-px h-7 bg-[#E3E8F0] mx-1" />
                    {[["퇴사", "자진 퇴사"], ["권고사직", "권고사직"]].map(([l, t]) => <button key={l} type="button" disabled={sel.isMaster} onClick={() => { setR((p) => ({ ...p, type: t })); setMode("resign"); }} className="h-10 px-4 rounded-xl text-[14px] font-black border border-[#FECDCA] bg-[#FFF6F5] text-[#B42318] hover:bg-[#FEF3F2] disabled:opacity-30 whitespace-nowrap">{l} →</button>)}
                  </div>
                  <div className="text-[12px] text-[#7A879C] mt-2">퇴사·권고사직을 누르면 퇴사 처리 화면으로 넘어갑니다(퇴직일·사유·합의서 인쇄 · 확정 시 로그인 차단)</div>
                  {LEAVE_STATUSES.includes(f.employmentStatus) && (
                    <div className="mt-4 rounded-xl bg-[#F7F9FC] border border-[#E3E8F0] p-4 space-y-3">
                      <div className="flex items-center gap-2"><Eyebrow className="text-[#4B6CB7]">{f.employmentStatus === "육아휴직" ? "Parental Leave" : f.employmentStatus === "출산휴가" ? "Maternity Leave" : "Leave of Absence"}</Eyebrow><span className="text-[13px] font-black text-[#1B2B4B]">{f.employmentStatus} 기간</span></div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="시작일"><input type="date" value={f.leaveFrom} onChange={(e) => setF({ ...f, leaveFrom: e.target.value })} className={`${fi} tabular-nums`} /></Field>
                        <Field label="복직 예정일"><input type="date" value={f.leaveTo} onChange={(e) => setF({ ...f, leaveTo: e.target.value })} className={`${fi} tabular-nums`} /></Field>
                      </div>
                      {f.leaveFrom && f.leaveTo && <div className="flex items-baseline gap-2 text-[#1B2B4B]"><span className="text-[20px] font-black tabular-nums" style={{ fontFamily: MONO }}>{Math.max(0, Math.round((new Date(f.leaveTo) - new Date(f.leaveFrom)) / 864e5) + 1)}</span><span className="text-[13px] font-bold">일</span><span className="text-[13px] text-[#7A879C]">· 약 {(Math.max(0, (new Date(f.leaveTo) - new Date(f.leaveFrom)) / 864e5 + 1) / 30.44).toFixed(1)}개월</span></div>}
                      <input value={f.leaveMemo} onChange={(e) => setF({ ...f, leaveMemo: e.target.value })} className={fi} placeholder={f.employmentStatus === "육아휴직" ? "자녀 이름·생년월일, 전자결재 문서번호 등" : "사유·메모"} />
                      {f.employmentStatus === "육아휴직" && <div className="rounded-lg bg-white border border-[#E3E8F0] px-3.5 py-3 text-[12.5px] text-[#5B6B85] leading-relaxed">만 8세 이하(초2 이하) 자녀 · 최대 1년(부모 모두 3개월 이상 쓰면 1년 6개월) · 휴직 30일 전 신청 · 휴직 기간도 근속·연차 산정에 포함 · 복귀 시 같은 업무(같은 수준 임금) — 급여는 고용센터에서 지급(회사는 확인서 제출)</div>}
                      {f.employmentStatus === "출산휴가" && <div className="rounded-lg bg-white border border-[#E3E8F0] px-3.5 py-3 text-[12.5px] text-[#5B6B85] leading-relaxed">출산 전후 90일(다태아 120일) · 출산 후 45일(다태아 60일) 이상 · 최초 60일(다태아 75일) 유급</div>}
                    </div>
                  )}
                </Section>
                <div className="px-1 text-[12.5px] text-[#7A879C]">변경 내역은 인사 이력에 남습니다. 공문(인사발령)을 남기려면 인사관리 › 인사발령을 쓰세요.</div>
              </>
            ) : (
              <>
                <Section no="01" en="Type" title="퇴사 구분">
                  <div className="flex flex-wrap gap-2">{RETIRE_REASONS.map((x) => <button key={x} type="button" onClick={() => setR({ ...r, type: x })} className={`h-10 px-4 rounded-xl text-[14px] font-black border transition ${r.type === x ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3A4A66] border-[#DCE3EE] hover:border-[#2D4C82]"}`}>{x}</button>)}</div>
                  {r.type === "권고사직" && <div className="mt-3 rounded-lg bg-[#EEF3FC] border border-[#C9D6EE] px-3.5 py-3 text-[13px] text-[#1B2B4B] leading-relaxed">권고사직은 근로자 동의(합의서)가 필요하고 실업급여 대상(비자발적 이직)입니다. 경리에게 이직확인서 제출이 안내됩니다.</div>}
                  {r.type === "해고" && <div className="mt-3 rounded-lg bg-[#FEF3F2] border border-[#FECDCA] px-3.5 py-3 text-[13px] text-[#B42318] leading-relaxed">해고는 정당한 사유와 30일 전 서면 통지가 필요합니다(근로기준법 23·26·27조). 노무 검토 후 진행하세요.</div>}
                </Section>
                <Section no="02" en="Schedule" title="일정">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="퇴직일(마지막 근무일)" hint={r.date > kstDay() ? "미래 날짜 — [예정 등록] 후 그날 확정" : "오늘 이전 — 바로 퇴사 확정"}><input type="date" value={r.date} onChange={(e) => setR({ ...r, date: e.target.value })} className={`${fi} tabular-nums`} /></Field>
                    <Field label="통보일"><input type="date" value={r.noticeDate} onChange={(e) => setR({ ...r, noticeDate: e.target.value })} className={`${fi} tabular-nums`} /></Field>
                  </div>
                </Section>
                <Section no="03" en="Reason" title="사유" right={<button type="button" onClick={() => printResign(company, sel, r)} className="h-8 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[12.5px] font-black text-[#1B2B4B] hover:border-[#2D4C82] flex items-center gap-1.5"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="7" rx="1" /></svg>{r.type === "권고사직" ? "권고사직 합의서 인쇄" : "퇴직 확인서 인쇄"}</button>}>
                  <textarea value={r.reason} onChange={(e) => setR({ ...r, reason: e.target.value })} rows={4} className={`${fi} h-auto py-3 leading-relaxed`} placeholder="퇴사 사유를 적어 주세요(인사 이력·퇴직 정산에 남습니다)" />
                </Section>
                <div className="rounded-xl bg-white border border-[#E6EBF2] px-4 py-3 text-[12.5px] text-[#5B6B85] leading-relaxed flex gap-2.5"><span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#B42318] shrink-0" />퇴사 확정 즉시 이 계정은 로그인할 수 없습니다(로그인 시 "퇴사 처리된 계정" 안내 후 차단). 퇴사 예정 상태에서는 그날까지 로그인됩니다.</div>
              </>
            )}
            </fieldset>
            {canManage && <div className="sticky bottom-0 z-[2] shrink-0 px-6 py-4 bg-white/95 backdrop-blur border-t border-[#E3E8F0] rounded-b-[21px] flex gap-2 shadow-[0_-8px_20px_rgba(15,26,48,0.06)]">{mode === "info"
              ? <><button type="button" onClick={() => setSel(null)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14.5px] font-bold text-[#3A4A66] hover:bg-[#F5F7FB]">취소</button><button type="button" disabled={busy} onClick={saveInfo} className="flex-1 h-12 rounded-xl bg-[#0F1A30] hover:bg-[#1B2B4B] text-white text-[15px] font-black disabled:opacity-50 shadow-[0_8px_18px_rgba(15,26,48,0.22)]">{busy ? "저장 중…" : "바로 저장 (공문 없음)"}</button></>
              : <><button type="button" onClick={() => setSel(null)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14.5px] font-bold text-[#3A4A66] hover:bg-[#F5F7FB]">취소</button>{r.date > kstDay() && <button type="button" disabled={busy} onClick={() => applyResign(false)} className="h-12 px-4 rounded-xl border border-[#0F1A30] bg-white text-[14.5px] font-black text-[#0F1A30]">예정 등록</button>}<button type="button" disabled={busy} onClick={() => applyResign(true)} className="flex-1 h-12 rounded-xl bg-[#B42318] hover:bg-[#9A1C13] text-white text-[15px] font-black disabled:opacity-50 shadow-[0_8px_18px_rgba(180,35,24,0.25)]">지금 퇴사 확정</button></>}</div>}
          </div>
        ) : (
          <div className="rounded-[22px] border border-[#E3E8F0] bg-white py-24 px-8 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)]" style={{ backgroundImage: "radial-gradient(#E3E8F0 1px, transparent 1px)", backgroundSize: "18px 18px" }}>
            <div className="mx-auto w-16 h-16 rounded-2xl grid place-items-center text-white shadow-[0_12px_28px_rgba(15,26,48,0.25)]" style={{ background: HERO_BG }}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0" /><path d="M16 4.5a3.5 3.5 0 010 7M21.5 20a6.5 6.5 0 00-4-6" /></svg></div>
            <Eyebrow className="text-[#4B6CB7] mt-5">Select an employee</Eyebrow>
            <div className="text-[18px] font-black text-[#0F1A30] mt-1">왼쪽 목록에서 직원을 선택하세요</div>
            <div className="text-[13.5px] text-[#7A879C] mt-1.5">정보 수정 · 입사일 · 휴직 기간 · 퇴사 처리를 여기서 합니다</div>
          </div>
        )}
        </div>
      </div>
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
  const Pill = ({ v, onX, base }) => <span className="inline-flex items-center gap-1.5 h-9 pl-3.5 pr-1.5 rounded-full bg-white border border-[#DCE3EE] text-[13.5px] font-black text-[#0F1A30]">{v}{base && <span className="text-[10px] font-bold text-[#9AA9C3]">기본</span>}{canManage && onX && <button type="button" onClick={onX} className="w-6 h-6 rounded-full hover:bg-[#FEF3F2] text-[#9AA9C3] hover:text-[#B42318]">✕</button>}</span>;
  return (
    <div className="space-y-4">
      <BookHero en="HR · SETTINGS" title="직책 · 부서 · 권한 설정" desc="기본 부서·직책은 그대로 두고, 우리 회사에 필요한 부서·직책을 추가합니다(추가한 것만 뺄 수 있음) — 인사관리자·마스터만 바꿀 수 있습니다" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BookCard en="DEPARTMENTS" title={`부서 ${hr.teams.length}개`}>
          <div className="flex flex-wrap gap-1.5">{hr.teams.map((v) => <Pill key={v} v={v} base={TEAM_OPTIONS.includes(v)} onX={TEAM_OPTIONS.includes(v) ? null : () => removeTeam(v)} />)}</div>
          {canManage && <div className="mt-3 flex gap-2"><input value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTeam()} className={inp} placeholder="새 부서 (예: 영업팀, 물류센터)" /><button type="button" onClick={addTeam} className="h-11 px-4 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black whitespace-nowrap">+ 추가</button></div>}
          <div className="mt-2 text-[11.5px] text-[#9AA9C3]">「기본」 표시가 있는 부서·직책은 뺄 수 없고, 직접 추가한 것만 ✕로 뺄 수 있습니다</div>
        </BookCard>
        <BookCard en="POSITIONS" title="직책">
          <div className="text-[12px] font-black text-[#4B6CB7] mb-1.5">임원 직책 (부서 임원 전용)</div>
          <div className="flex flex-wrap gap-1.5 mb-3">{hr.exec.map((v) => <Pill key={v} v={v} base={EXEC_POSITION_OPTIONS.includes(v)} onX={EXEC_POSITION_OPTIONS.includes(v) ? null : () => removePos(v)} />)}</div>
          <div className="text-[12px] font-black text-[#4B6CB7] mb-1.5">일반 직책</div>
          <div className="flex flex-wrap gap-1.5">{hr.normal.map((v) => <Pill key={v} v={v} base={POSITION_OPTIONS.includes(v)} onX={POSITION_OPTIONS.includes(v) ? null : () => removePos(v)} />)}</div>
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
      <div className="flex gap-1.5 overflow-x-auto pb-1">{["전체", ...RULE_CATS].map((c) => <Chip key={c} on={cat === c} onClick={() => {
        setCat(c);
        // ⭐ 2026-11-01 규정을 보고 있다가 위 분류를 누르면 그 분류 규정으로 바로 바뀐다(전체면 목록으로)
        if (c === "전체") { setOpen(null); return; }
        const first = [...(rows || []), ...tpls].filter((r) => r.category === c).sort((a, b) => !!a.tpl - !!b.tpl)[0];
        setOpen(first ? first.id : null);
      }}>{c}</Chip>)}</div>
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
// ⭐ 2026-11-01 [인사관리] 하위 항목 — HRManagementPage 안쪽 화면(view)과 1:1
const REC_VIEWS = [
  { view: "이력서", label: "이력서", en: "RESUME", icon: "file" },
  { view: "근태/근속", label: "근태 · 근속", en: "ATTENDANCE", icon: "clock" },
  { view: "인사발령", label: "인사발령", en: "ORDER", icon: "stamp", manage: true },
  { view: "인사발령 이력", label: "인사발령 이력", en: "HISTORY", icon: "history" },
];
const REC_FIRST = `rec:${REC_VIEWS[0].view}`;
export default function HrHub({ company, canManage, renderRecord, renderAttendance, me = {} }) {
  const [tab, setTabRaw] = React.useState(() => { try { const v = sessionStorage.getItem("kpHrTab"); sessionStorage.removeItem("kpHrTab"); return !v || v === "record" ? REC_FIRST : v; } catch { return REC_FIRST; } });
  const setTab = (k) => setTabRaw(k === "record" ? REC_FIRST : k);
  const recView = tab.startsWith("rec:") ? tab.slice(4) : null;
  const [focusUid, setFocusUid] = React.useState(null);
  // ⭐ 2026-11-01 직원이 직접 작성·제출한 이력서 중 인사팀이 아직 안 본 수 → [인사 기록] 숫자
  const [newResumes, setNewResumes] = React.useState(0);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "hrResumes"), where("companyName", "==", company), where("hrSeen", "==", false)), (sn) => setNewResumes(sn.size), () => setNewResumes(0));
  }, [company]);
  return (
    <KpSubNav code="HUMAN RESOURCES" title="인사관리부" icon="idcard" active={tab} onSelect={setTab}
      groups={[
        { label: "인사", items: [
          { key: "record", label: "인사관리", en: "PERSONNEL", icon: "idcard", badge: newResumes, badgeTitle: "새로 제출된 이력서",
            // ⭐ 2026-11-01 직원 정보·퇴사 → "직원관리"로 이름을 바꿔 인사관리 안 맨 앞에
            children: [{ key: "edit", label: "직원관리", en: "STAFF", icon: "users" }, ...REC_VIEWS.filter((x) => !x.manage || canManage).map((x) => ({ key: `rec:${x.view}`, label: x.label, en: x.en, icon: x.icon }))] },
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
      {recView && (() => { const el = renderRecord?.(focusUid, recView); return React.isValidElement(el) ? React.cloneElement(el, { view: recView }) : el; })()}
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
