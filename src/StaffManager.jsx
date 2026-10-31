// ======================= src/StaffManager.jsx =======================
// 👥 직원 관리(관리자·마스터·경리·인사) — 직원 가입 승인·권한, 기사 가입 승인. PC·모바일 공용(KpSubNav: 휴대폰은 위쪽 가로 탭)
import React from "react";
import { doc, setDoc, getDocs, updateDoc, deleteDoc, query, where, collection, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db, DEFAULT_COMPANY } from "./firebase";
import KpSubNav from "./KpSubNav";
import { Sheet } from "./OfficeBooks";
import { isExecProfile } from "./hrConstants";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
function Loading() {
  return <div className="py-24 flex flex-col items-center gap-3 text-[#7A879C]"><span className="w-6 h-6 border-[3px] border-[#DCE3EE] border-t-[#1B2B4B] rounded-full animate-spin" /><span className="text-[12.5px] font-bold">불러오는 중…</span></div>;
}
// ── 직원 관리(관리자·마스터) — PC 관리자메뉴의 직원 승인·권한을 휴대폰에서 ──
const ROLE_LABEL = { admin: "관리자", hrManager: "인사관리자", user: "실무자", test: "경리/회계", viewer: "조회전용", totalMaster: "최고관리자" };
// 승인 대기 직원·기사 수(메뉴 숫자)
export function usePendingSignups(company, enabled = true) {
  const [n, setN] = React.useState({ staff: 0, drivers: 0 });
  React.useEffect(() => {
    if (!enabled || !company) return undefined;
    return onSnapshot(collection(db, "users"), (s) => {
      let staff = 0; let drivers = 0;
      s.docs.forEach((d) => {
        const u = d.data();
        if (u.approved !== false || u.employmentStatus === "퇴사" || (u.companyName || DEFAULT_COMPANY) !== company) return;
        if (u.role === "driver") drivers += 1;
        else if (!["shipper", "cafeUser", "totalMaster"].includes(u.role)) staff += 1;
      });
      setN({ staff, drivers });
    }, () => setN({ staff: 0, drivers: 0 }));
  }, [company, enabled]);
  return n;
}

function Avatar({ name }) {
  return <span className="w-10 h-10 rounded-xl bg-[#1B2B4B] text-white grid place-items-center text-[14px] font-black shrink-0">{String(name || "?").slice(0, 1)}</span>;
}

export default function StaffManager({ company, role, myUid, initialTab = "pending" }) {
  const [users, setUsers] = React.useState(null);
  const [tab, setTab] = React.useState(initialTab);
  const [busy, setBusy] = React.useState("");
  const [q, setQ] = React.useState("");
  const [menuOpen, setMenuOpen] = React.useState(null);
  const [viewResign, setViewResign] = React.useState(null);
  const [resigns, setResigns] = React.useState([]);
  const [retire, setRetire] = React.useState({});
  React.useEffect(() => { if (!company) return undefined; return onSnapshot(query(collection(db, "approvals"), where("company", "==", company)), (s) => setResigns(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.form === "resign")), () => setResigns([])); }, [company]);
  React.useEffect(() => { if (!company) return undefined; return onSnapshot(query(collection(db, "retireCases"), where("companyName", "==", company)), (s) => { const m = {}; s.docs.forEach((d) => { m[d.id] = d.data(); }); setRetire(m); }, () => setRetire({})); }, [company]);
  React.useEffect(() => onSnapshot(collection(db, "users"), (s) => setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setUsers([])), []);
  const me = (users || []).find((u) => u.id === myUid);
  const isTotal = role === "totalMaster";
  const isMaster = isTotal || me?.isMaster === true;
  const isViewer = role === "viewer";
  const mine = (users || []).filter((u) => (u.companyName || DEFAULT_COMPANY) === company);
  const staff = mine.filter((u) => !["driver", "shipper", "cafeUser", "totalMaster"].includes(u.role));
  const drivers = mine.filter((u) => u.role === "driver");
  const active = staff.filter((u) => u.employmentStatus !== "퇴사");
  const lists = {
    pending: active.filter((u) => !u.approved),
    staff: active.filter((u) => u.approved),
    left: staff.filter((u) => u.employmentStatus === "퇴사"),
    dpending: drivers.filter((u) => u.approved === false),
    drivers: drivers.filter((u) => u.approved !== false),
  };
  // PC 관리자메뉴 toggleApprove와 같은 처리(가입 신청서 상태도 같이 맞춘다)
  const toggleApprove = async (u) => {
    if (isViewer) return alert("조회전용 권한으로는 수정할 수 없습니다.");
    const next = !u.approved;
    const who = u.name || u.이름 || u.email;
    if (!window.confirm(next ? `"${who}"님을 승인할까요?` : `"${who}"님의 승인을 해제할까요?\n해제하면 로그인이 막힙니다.`)) return;
    setBusy(u.id);
    try {
      await setDoc(doc(db, "users", u.id), { approved: next }, { merge: true });
      if (u.role === "driver") {
        // PC 지입차관리 › 기사 등록 관리와 같은 처리
        await updateDoc(doc(db, "drivers", u.id), { approved: next }).catch(() => {});
      } else {
        const t = await getDocs(query(collection(db, "transportApplications"), where("userId", "==", u.id))).catch(() => null);
        for (const d of t?.docs || []) await updateDoc(doc(db, "transportApplications", d.id), { status: next ? "approved" : "pending", processedAt: serverTimestamp() }).catch(() => {});
      }
    } finally { setBusy(""); }
  };
  const reject = async (u) => {
    if (isViewer) return;
    if (!window.confirm(`"${u.name || u.email}"님의 가입 신청을 거절할까요?\n신청 정보가 삭제됩니다.`)) return;
    setBusy(u.id);
    try {
      await deleteDoc(doc(db, "users", u.id));
      if (u.role === "driver") await deleteDoc(doc(db, "drivers", u.id)).catch(() => {});
    } catch (e) { alert(e.message); } finally { setBusy(""); }
  };
  const changeRole = async (u, r) => {
    if (!(isMaster || role === "hrManager") || r === u.role || isExecProfile(u)) return;
    setBusy(u.id);
    try { await setDoc(doc(db, "users", u.id), { role: r }, { merge: true }); } finally { setBusy(""); }
  };
  const kw = q.trim();
  const match = (u) => !kw || [u.name, u.email, u.phone, u.team, u.position, u.carNo].some((v) => String(v || "").includes(kw));
  const L = (lists[tab] || []).filter(match);
  const isDriverTab = tab === "dpending" || tab === "drivers";
  const canRole = (isMaster || role === "hrManager") && !isViewer;
  const empty = { pending: "승인 대기 중인 직원이 없습니다", staff: "직원이 없습니다", left: "퇴사자가 없습니다", dpending: "가입 신청한 기사님이 없습니다", drivers: "승인된 기사님이 없습니다" }[tab];
  // 재직 직원 — 팀별로
  const teamGroups = (() => {
    const g = {}; L.forEach((u) => { const t = u.team || "미배정"; (g[t] = g[t] || []).push(u); });
    const order = ["임원", "운영팀", "운송팀", "경리/회계팀", "인사팀", "개발팀", "법무팀"];
    return Object.entries(g).sort((x, y) => { const a = order.indexOf(x[0]); const c = order.indexOf(y[0]); return (a < 0 ? 99 : a) - (c < 0 ? 99 : c) || x[0].localeCompare(y[0]); })
      .map(([t, us]) => [t, us.sort((x, y) => String(x.name || "").localeCompare(String(y.name || ""), "ko"))]);
  })();
  const resignOf = (uid) => resigns.filter((a) => a.drafterUid === uid).sort((x, y) => (y.createdAt?.seconds || 0) - (x.createdAt?.seconds || 0))[0];
  const leftGroups = (() => {
    const g = {}; L.forEach((u) => { const k = String(u.resignedAt || retire[u.id]?.lastDay || "").slice(0, 7) || "날짜 미상"; (g[k] = g[k] || []).push(u); });
    return Object.entries(g).sort((x, y) => y[0].localeCompare(x[0]));
  })();
  const Row = ({ u }) => {
    const open = menuOpen === u.id;
    const r = retire[u.id];
    const rs = resignOf(u.id);
    return (
      <div className="relative flex items-center gap-3 px-3.5 md:px-4 py-2.5 hover:bg-[#F8FAFD]">
        <Avatar name={u.name || u.email} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[14.5px] font-black text-[#0F1A30] truncate">{u.name || "-"}</span>
            {isDriverTab ? u.carNo && <span className="px-1.5 h-[20px] rounded-md border border-[#0F1A30] text-[#0F1A30] text-[11.5px] font-black grid place-items-center" style={{ fontFamily: MONO }}>{u.carNo}</span>
              : u.position && <span className="text-[12.5px] font-bold text-[#5B6B85]">{u.position}</span>}
            {u.isMaster && <span className="px-1.5 h-[18px] rounded-md bg-[#0F1A30] text-white text-[10px] font-black grid place-items-center">마스터</span>}
            {!isDriverTab && tab !== "left" && <span className="px-1.5 h-[18px] rounded-md bg-[#EEF3FC] text-[#1B2B4B] text-[10.5px] font-black grid place-items-center">{ROLE_LABEL[u.role] || u.role}</span>}
            {tab === "left" && u.resignType && <span className="px-1.5 h-[18px] rounded-md bg-[#F3F6FA] text-[#5B6B85] text-[10.5px] font-black grid place-items-center">{u.resignType}</span>}
          </div>
          <div className="text-[12px] text-[#7A879C] truncate">
            {isDriverTab ? [u.vehicleType, u.거주지, u.phone].filter(Boolean).join(" · ") : tab === "left" ? [u.team, u.resignedAt && `퇴사 ${u.resignedAt}`, u.phone].filter(Boolean).join(" · ") : [u.email, u.phone].filter(Boolean).join(" · ")}
          </div>
        </div>
        {tab === "left" ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`h-7 px-2.5 rounded-lg text-[11.5px] font-black grid place-items-center whitespace-nowrap ${r?.steps?.severance?.done ? "bg-[#ECFDF3] text-[#067647]" : r ? "bg-[#FFF4E5] text-[#B54708]" : "bg-[#F3F6FA] text-[#7A879C]"}`}>{r?.steps?.severance?.done ? "퇴직금 지급" : r ? (Number(r.severance) > 0 ? "퇴직금 미지급" : "정산 중") : "정산 전"}</span>
            <button type="button" disabled={!rs} onClick={() => setViewResign(rs)} className="h-7 px-2.5 rounded-lg border border-[#DCE3EE] text-[11.5px] font-black text-[#1B2B4B] disabled:opacity-35 whitespace-nowrap">사직서</button>
          </div>
        ) : !u.approved ? (
          !isViewer && u.id !== myUid && <div className="flex gap-1.5 shrink-0">
            <button type="button" disabled={busy === u.id} onClick={() => reject(u)} className="h-8 px-3 rounded-lg text-[12px] font-black border border-[#DCE3EE] text-[#5B6B85] bg-white">거절</button>
            <button type="button" disabled={busy === u.id} onClick={() => toggleApprove(u)} className="h-8 px-3.5 rounded-lg text-[12px] font-black text-white bg-[#1B2B4B]">승인</button>
          </div>
        ) : (!isViewer && u.id !== myUid && (
          <div className="relative shrink-0">
            <button type="button" onClick={() => setMenuOpen(open ? null : u.id)} className="w-8 h-8 rounded-lg border border-[#DCE3EE] text-[#5B6B85] font-black">⋯</button>
            {open && (
              <div className="absolute right-0 top-9 z-20 w-[210px] rounded-xl bg-white border border-[#E3E8F0] shadow-[0_12px_30px_rgba(15,26,48,0.18)] p-1.5">
                {!isDriverTab && canRole && !u.isMaster && !isExecProfile(u) && (
                  <>
                    <div className="px-2 pt-1 pb-1 text-[10.5px] font-black text-[#9AA9C3]">권한 변경</div>
                    {["admin", "hrManager", "user", "test", "viewer"].map((rk) => (
                      <button key={rk} type="button" onClick={() => { setMenuOpen(null); changeRole(u, rk); }} className={`w-full text-left px-2.5 h-8 rounded-lg text-[12.5px] font-bold ${u.role === rk ? "bg-[#EEF3FC] text-[#1B2B4B]" : "text-[#3A4A66] hover:bg-[#F5F8FD]"}`}>{u.role === rk ? "✓ " : ""}{ROLE_LABEL[rk]}</button>
                    ))}
                    <div className="h-px bg-[#EEF2F8] my-1" />
                  </>
                )}
                {!isDriverTab && isExecProfile(u) && <div className="px-2.5 py-1.5 text-[11.5px] text-[#7A879C]">임원은 관리자 권한 고정</div>}
                <button type="button" onClick={() => { setMenuOpen(null); toggleApprove(u); }} className="w-full text-left px-2.5 h-8 rounded-lg text-[12.5px] font-bold text-[#B42318] hover:bg-[#FEF3F2]">승인 해제(로그인 차단)</button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };
  return (
    <KpSubNav code="ADMIN · STAFF" title="직원 관리" icon="users" active={tab} onSelect={(k) => { setTab(k); setMenuOpen(null); }}
      groups={[
        { label: "직원", items: [
          { key: "pending", label: "직원 승인 대기", en: "PENDING", icon: "hourglass", badge: lists.pending.length },
          { key: "staff", label: "재직 직원", en: "STAFF", icon: "users" },
          { key: "left", label: "퇴사자", en: "LEFT", icon: "user" },
        ] },
        { label: "기사관리", items: [
          { key: "dpending", label: "기사 가입 승인", en: "DRIVER SIGNUP", icon: "truck", badge: lists.dpending.length },
          { key: "drivers", label: "승인된 기사", en: "DRIVERS", icon: "idcard" },
        ] },
      ]}>
      <div className="flex flex-col md:flex-row md:items-center gap-2 mb-3">
        <div className="grid grid-cols-3 gap-2 md:w-[420px]">
          {(isDriverTab
            ? [["가입 대기", lists.dpending.length], ["승인 기사", lists.drivers.length], ["전체", drivers.length]]
            : [["승인 대기", lists.pending.length], ["재직", lists.staff.length], ["퇴사", lists.left.length]]).map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-white border border-[#E3E8F0] px-3 py-2">
              <div className="text-[11.5px] font-bold text-[#7A879C]">{l}</div>
              <div className="text-[19px] font-black text-[#0F1A30] tabular-nums" style={{ fontFamily: MONO }}>{v}</div>
            </div>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={isDriverTab ? "기사명·차량번호·전화 검색" : "이름·부서·직책·이메일·전화 검색"} className="md:ml-auto h-11 w-full md:w-[300px] px-3.5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] outline-none focus:border-[#2D4C82]" />
      </div>
      {users === null ? <Loading /> : L.length === 0 ? (
        <div className="py-16 text-center text-[13px] text-[#9AA9C3] font-bold">{kw ? "검색 결과가 없습니다" : empty}</div>
      ) : tab === "staff" ? (
        <div className="space-y-3">
          {teamGroups.map(([t, us]) => (
            <div key={t} className="rounded-2xl bg-white border border-[#E3E8F0] overflow-visible">
              <div className="px-4 py-2.5 border-b border-[#EEF1F6] flex items-center gap-2 bg-[#F7F9FC] rounded-t-2xl">
                <span className="w-1.5 h-4 rounded-full bg-[#1B2B4B]" />
                <span className="text-[14px] font-black text-[#0F1A30]">{t}</span>
                <span className="text-[12px] font-black text-[#7A879C] tabular-nums" style={{ fontFamily: MONO }}>{us.length}명</span>
              </div>
              <div className="divide-y divide-[#F1F4F9]">{us.map((u) => <Row key={u.id} u={u} />)}</div>
            </div>
          ))}
        </div>
      ) : tab === "left" ? (
        <div className="space-y-3">
          {leftGroups.map(([m, us]) => (
            <div key={m} className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#EEF1F6] flex items-center gap-2 bg-[#F7F9FC]">
                <span className="text-[13.5px] font-black text-[#0F1A30]" style={{ fontFamily: MONO }}>{m.replace("-", ".")}</span>
                <span className="text-[12px] font-bold text-[#7A879C]">퇴사 {us.length}명</span>
              </div>
              <div className="divide-y divide-[#F1F4F9]">{us.map((u) => <Row key={u.id} u={u} />)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-[#E3E8F0] divide-y divide-[#F1F4F9]">{L.map((u) => <Row key={u.id} u={u} />)}</div>
      )}
      {!canRole && !isDriverTab && tab === "staff" && <p className="text-[11.5px] text-[#9AA9C3] text-center pt-2">권한 변경은 마스터·인사관리자만 할 수 있습니다</p>}
      {viewResign && (
        <Sheet side en="RESIGNATION · 사직서" title={`${viewResign.drafter?.name || ""} 사직서`} onClose={() => setViewResign(null)}
          footer={<button type="button" onClick={() => setViewResign(null)} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black">닫기</button>}>
          <div className="rounded-2xl bg-white border border-[#E3E8F0] p-5">
            <div className="text-center text-[24px] font-black tracking-[0.5em] text-[#0F1A30] pb-3 border-b-2 border-[#0F1A30]">사 직 서</div>
            <div className="mt-4 grid grid-cols-[110px_1fr] gap-y-2 text-[14px]">
              {[["문서번호", viewResign.docNo], ["성명", viewResign.drafter?.name], ["소속", [viewResign.drafter?.team, viewResign.drafter?.position].filter(Boolean).join(" · ")], ["입사일", viewResign.data?.hire], ["퇴직 희망일", viewResign.data?.last], ["결재 상태", { approved: "결재 완료", pending: "진행 중", rejected: "반려" }[viewResign.status] || viewResign.status]].map(([k, v]) => (
                <React.Fragment key={k}><span className="font-black text-[#5B6B85]">{k}</span><span className="font-bold text-[#0F1A30]">{v || "-"}</span></React.Fragment>
              ))}
            </div>
            <div className="mt-4 text-[13px] font-black text-[#5B6B85]">사직 사유</div>
            <div className="mt-1 rounded-xl bg-[#F7F9FC] border border-[#EEF1F6] p-3 text-[14px] whitespace-pre-wrap">{viewResign.data?.reason || "-"}</div>
            <div className="mt-3 text-[13px] font-black text-[#5B6B85]">인수인계 계획</div>
            <div className="mt-1 rounded-xl bg-[#F7F9FC] border border-[#EEF1F6] p-3 text-[14px] whitespace-pre-wrap">{viewResign.data?.handover || "-"}</div>
            {viewResign.data?.assets && <><div className="mt-3 text-[13px] font-black text-[#5B6B85]">반납 자산</div><div className="mt-1 text-[14px]">{viewResign.data.assets}</div></>}
          </div>
        </Sheet>
      )}
    </KpSubNav>
  );
}
