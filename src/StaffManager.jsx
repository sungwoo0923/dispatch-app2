// ======================= src/StaffManager.jsx =======================
// 👥 직원 관리(관리자·마스터·경리·인사) — 직원 가입 승인·권한, 기사 가입 승인. PC·모바일 공용(KpSubNav: 휴대폰은 위쪽 가로 탭)
import React from "react";
import { doc, setDoc, getDocs, updateDoc, deleteDoc, query, where, collection, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db, DEFAULT_COMPANY } from "./firebase";
import KpSubNav from "./KpSubNav";

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
    if (!isMaster || r === u.role) return;
    setBusy(u.id);
    try { await setDoc(doc(db, "users", u.id), { role: r }, { merge: true }); } finally { setBusy(""); }
  };
  const L = lists[tab] || [];
  const isDriverTab = tab === "dpending" || tab === "drivers";
  const empty = { pending: "승인 대기 중인 직원이 없습니다", staff: "직원이 없습니다", left: "퇴사자가 없습니다", dpending: "가입 신청한 기사님이 없습니다", drivers: "승인된 기사님이 없습니다" }[tab];
  return (
    <KpSubNav code="ADMIN · STAFF" title="직원 관리" icon="users" active={tab} onSelect={setTab}
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
      <div className="grid grid-cols-3 gap-2 mb-3">
        {(isDriverTab
          ? [["가입 대기", lists.dpending.length], ["승인 기사", lists.drivers.length], ["전체", drivers.length]]
          : [["승인 대기", lists.pending.length], ["재직", lists.staff.length], ["퇴사", lists.left.length]]).map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-white border border-[#E3E8F0] px-3 py-2.5">
            <div className="text-[11.5px] font-bold text-[#7A879C]">{l}</div>
            <div className="text-[20px] font-black text-[#0F1A30] tabular-nums" style={{ fontFamily: MONO }}>{v}</div>
          </div>
        ))}
      </div>
      {users === null ? <Loading /> : L.length === 0 ? (
        <div className="py-16 text-center text-[13px] text-[#9AA9C3] font-bold">{empty}</div>
      ) : (
        <div className="space-y-2">
          {L.map((u) => (
            <div key={u.id} className="rounded-2xl bg-white border border-[#E3E8F0] px-3.5 py-3">
              <div className="flex items-center gap-3">
                <Avatar name={u.name || u.email} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[15px] font-black text-[#0F1A30] truncate">{u.name || "-"}</span>
                    {u.isMaster && <span className="px-1.5 h-[18px] rounded-md bg-[#0F1A30] text-white text-[10px] font-black grid place-items-center">마스터</span>}
                    {isDriverTab
                      ? u.carNo && <span className="px-1.5 h-[20px] rounded-md border border-[#0F1A30] text-[#0F1A30] text-[11.5px] font-black grid place-items-center">{u.carNo}</span>
                      : u.position && <span className="text-[12px] font-bold text-[#7A879C]">{u.position}</span>}
                  </div>
                  <div className="text-[12px] text-[#7A879C] truncate">
                    {isDriverTab ? [u.vehicleType, u.거주지, u.phone].filter(Boolean).join(" · ") : [u.team, u.email, u.phone].filter(Boolean).join(" · ")}
                  </div>
                  {isDriverTab && u.요청사항 && <div className="text-[11.5px] text-[#5B6B85] truncate">요청: {u.요청사항}</div>}
                </div>
              </div>
              {!isViewer && u.id !== myUid && tab !== "left" && (
                <div className="mt-2.5 flex gap-1.5">
                  {!u.approved && <button type="button" disabled={busy === u.id} onClick={() => reject(u)} className="h-9 px-3.5 rounded-xl text-[12.5px] font-black border border-[#DCE3EE] text-[#5B6B85] bg-white disabled:opacity-50">거절</button>}
                  <button type="button" disabled={busy === u.id} onClick={() => toggleApprove(u)}
                    className={`flex-1 h-9 rounded-xl text-[12.5px] font-black disabled:opacity-50 ${u.approved ? "border border-[#DCE3EE] text-[#3A4A66] bg-white" : "text-white bg-[#1B2B4B]"}`}>
                    {u.approved ? "승인 해제" : "승인"}
                  </button>
                </div>
              )}
              {!isDriverTab && tab !== "left" && (
                <div className="mt-2 flex gap-1 overflow-x-auto no-scrollbar">
                  {["admin", "hrManager", "user", "test", "viewer"].map((r) => {
                    const on = (u.role || "user") === r;
                    const can = isMaster && !u.isMaster && u.id !== myUid;
                    return (
                      <button key={r} type="button" disabled={!can || busy === u.id} onClick={() => changeRole(u, r)}
                        className={`shrink-0 h-7 px-2.5 rounded-lg text-[11.5px] font-black border ${on ? "bg-[#EEF3FC] border-[#2D4C82]/40 text-[#1B2B4B]" : "bg-white border-[#E3E8F0] text-[#9AA9C3]"} ${can ? "" : "cursor-default"}`}>
                        {ROLE_LABEL[r]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {!isMaster && !isDriverTab && <p className="text-[11.5px] text-[#9AA9C3] text-center pt-1">권한 변경은 마스터만 할 수 있습니다</p>}
        </div>
      )}
    </KpSubNav>
  );
}

