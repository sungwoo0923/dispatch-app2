// ⭐ 2026-11-01 근태 요청 결재함 — 나에게 온 출근기록 수정·출근 요청을 승인/거절
//  임원 화면(결재함)에는 출근기록부 메뉴가 없어서, 인사팀 본인 요청을 임원이 여기서 처리한다.
//  처리할 요청이 없으면 아무것도 그리지 않는다.
import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { useCustomRoles } from "./customRoles";
import {
  APPROVER_GROUP_LABEL, approveChangeReq, approveCheckInReq, canApproveAttendanceReq, rejectChangeReq, rejectCheckInReq,
} from "./attendanceApproval";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const hm = (iso) => {
  if (!iso) return "";
  const s = String(iso);
  if (/T\d\d:\d\d/.test(s) && !s.endsWith("Z")) return s.slice(11, 16);
  const d = new Date(s);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function useAttendanceInbox(company, me, role) {
  const customRoles = useCustomRoles(company);
  const [staff, setStaff] = useState([]);
  const [changeReqs, setChangeReqs] = useState([]);
  const [checkInReqs, setCheckInReqs] = useState([]);
  useEffect(() => {
    if (!company) return undefined;
    const u1 = onSnapshot(query(collection(db, "users"), where("companyName", "==", company)), (s) => setStaff(s.docs.map((d) => ({ uid: d.id, ...d.data() }))), () => {});
    const u2 = onSnapshot(query(collection(db, "attendanceChangeRequests"), where("companyName", "==", company), where("status", "==", "pending")), (s) => setChangeReqs(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setChangeReqs([]));
    const u3 = onSnapshot(query(collection(db, "attendanceRequests"), where("companyName", "==", company), where("status", "==", "pending")), (s) => setCheckInReqs(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setCheckInReqs([]));
    return () => { u1(); u2(); u3(); };
  }, [company]);
  const meFull = useMemo(() => ({ ...(staff.find((s) => s.uid === me?.uid) || {}), ...me }), [staff, me]);
  const can = (r) => canApproveAttendanceReq(r, meFull, role || meFull.role, customRoles, staff);
  return { change: changeReqs.filter(can), checkIn: checkInReqs.filter(can), staff };
}

export default function AttendanceApprovalInbox({ company, me, role }) {
  const { change, checkIn } = useAttendanceInbox(company, me, role);
  const [busy, setBusy] = useState("");
  const [rejectFor, setRejectFor] = useState("");
  const [reason, setReason] = useState("");
  const total = change.length + checkIn.length;
  if (!total) return null;
  const approver = { uid: me?.uid, name: me?.name || "" };
  const run = async (id, fn) => {
    setBusy(id);
    try { const ok = await fn(); if (ok === false) alert("이미 다른 승인자가 처리한 요청입니다."); }
    catch (e) { alert(`처리하지 못했습니다: ${e?.message || e}`); }
    finally { setBusy(""); setRejectFor(""); setReason(""); }
  };
  const rows = [
    ...change.map((r) => ({ kind: "change", r, title: `${r.date} · ${r.requestedStatus}${r.requestedCheckIn ? ` ${hm(r.requestedCheckIn)}` : ""}${r.requestedCheckOut ? ` ~ ${hm(r.requestedCheckOut)}` : ""}` })),
    ...checkIn.map((r) => ({ kind: "checkin", r, title: `${r.date} · 출근 ${hm(r.requestedAt)}` })),
  ];
  return (
    <div className="rounded-[20px] border border-[#DCE3EE] bg-white overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center justify-between px-4 py-3 bg-[#0F1A30] text-white">
        <div>
          <div className="text-[10.5px] font-extrabold tracking-[0.28em] text-[#9FB4DA]" style={{ fontFamily: MONO }}>ATTENDANCE · REQUESTS</div>
          <div className="text-[15px] font-black mt-0.5">근태 요청 결재 <span className="ml-1 px-2 py-0.5 rounded-full bg-white/15 text-[12px]">{total}건</span></div>
        </div>
        <div className="text-[12px] text-white/60 text-right">먼저 승인한 1명의 결정으로 반영·종결됩니다</div>
      </div>
      <div className="divide-y divide-[#EEF1F6]">
        {rows.map(({ kind, r, title }) => (
          <div key={`${kind}_${r.id}`} className="px-4 py-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`px-2 py-0.5 rounded-md text-[11.5px] font-black ${kind === "change" ? "bg-[#EEF3FC] text-[#2D4C82]" : "bg-[#F3E7CC] text-[#6B5320]"}`}>{kind === "change" ? "기록 수정" : "출근 요청"}</span>
              <span className="text-[14.5px] font-black text-[#0F1A30]">{r.name}</span>
              <span className="text-[13.5px] font-bold text-[#3A4A66] tabular-nums">{title}</span>
              {r.approverGroup && <span className="text-[11.5px] font-bold text-[#8A97AD]">→ {APPROVER_GROUP_LABEL[r.approverGroup] || r.approverGroup} 승인</span>}
              <div className="ml-auto flex gap-1.5">
                <button disabled={!!busy} onClick={() => run(r.id, () => (kind === "change" ? approveChangeReq(r, approver, company) : approveCheckInReq(r, approver, company)))}
                  className="h-9 px-4 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-black disabled:opacity-50">{busy === r.id ? "처리 중…" : "승인"}</button>
                <button disabled={!!busy} onClick={() => { setRejectFor(rejectFor === r.id ? "" : r.id); setReason(""); }}
                  className="h-9 px-4 rounded-lg border border-[#DCE3EE] text-[#5B6B85] text-[13px] font-black">거절</button>
              </div>
            </div>
            {r.reason && <div className="mt-1 text-[12.5px] text-[#5B6B85]">사유: {r.reason}</div>}
            {rejectFor === r.id && (
              <div className="mt-2 flex gap-1.5">
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="거절 사유" className="flex-1 h-9 px-3 rounded-lg border border-[#DCE3EE] text-[13px] outline-none focus:border-[#2D4C82]" />
                <button disabled={!!busy} onClick={() => run(r.id, () => (kind === "change" ? rejectChangeReq(r, approver, company, reason) : rejectCheckInReq(r, approver, company, reason)))}
                  className="h-9 px-4 rounded-lg bg-[#0F1A30] text-white text-[13px] font-black">거절 확정</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
