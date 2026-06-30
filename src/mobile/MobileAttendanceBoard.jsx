import React, { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import { ATTENDANCE_STATUS_COLOR, isWeekend, findApprovedLeaveForDate } from "../attendanceUtils";

const ADMIN_ROLES = ["totalMaster", "admin"];

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export default function MobileAttendanceBoard({ userCompany, role, currentUser, cardVersionB = false }) {
  const isAdmin = ADMIN_ROLES.includes(role);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [editCell, setEditCell] = useState(null);

  const company = userCompany || localStorage.getItem("userCompany") || "";

  useEffect(() => {
    const q = query(collection(db, "users"), where("companyName", "==", company));
    const unsub = onSnapshot(q, snap => {
      setEmployees(snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.approved !== false));
    }, () => {});
    return () => unsub();
  }, [company]);

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  useEffect(() => {
    const q = query(collection(db, "attendance"), where("companyName", "==", company), where("month", "==", monthStr));
    const unsub = onSnapshot(q, snap => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, [company, monthStr]);

  useEffect(() => {
    const q = query(collection(db, "schedules"), where("companyName", "==", company));
    const unsub = onSnapshot(q, snap => {
      setSchedules(snap.docs.map(d => d.data()));
    }, () => {});
    return () => unsub();
  }, [company]);

  const numDays = daysInMonth(year, month);
  const dayList = Array.from({ length: numDays }, (_, i) => i + 1);

  const recordMap = useMemo(() => {
    const m = {};
    records.forEach(r => { m[`${r.uid}_${r.date}`] = r; });
    return m;
  }, [records]);

  const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const saveEdit = async (status, time) => {
    if (!editCell) return;
    const { uid, name, date } = editCell;
    if (status === null) {
      await deleteDoc(doc(db, "attendance", `${date}_${uid}`));
      setEditCell(null);
      return;
    }
    await setDoc(doc(db, "attendance", `${date}_${uid}`), {
      uid, name, date, month: date.slice(0, 7),
      status, checkInTime: time || null,
      source: "manual", editedBy: currentUser?.uid || "", editedAt: new Date().toISOString(),
      companyName: company,
    }, { merge: true });
    setEditCell(null);
  };

  return (
    <div className="px-3 py-3 space-y-3 pb-24">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }}
            className="w-7 h-7 rounded-lg border border-gray-200 text-[#1B2B4B] font-bold">‹</button>
          <div className="text-[13px] font-bold text-[#1B2B4B]">{year}년 {month}월</div>
          <button onClick={() => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }}
            className="w-7 h-7 rounded-lg border border-gray-200 text-[#1B2B4B] font-bold">›</button>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-500 flex-wrap">
          {Object.entries({ "출근": ATTENDANCE_STATUS_COLOR["출근"], "휴무": ATTENDANCE_STATUS_COLOR["휴무"], "연차/반차": ATTENDANCE_STATUS_COLOR["연차"], "외근/병가 등": ATTENDANCE_STATUS_COLOR["외근"] }).map(([label, cls]) => (
            <div key={label} className="flex items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded ${cls.split(" ")[0]}`} />
              {label}
            </div>
          ))}
        </div>
        {!isAdmin && <div className="text-[10px] text-gray-400 mt-1">관리자만 출근 시간을 수정할 수 있습니다.</div>}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white px-2 py-2 text-left text-gray-500 font-bold border-b border-r border-gray-100 min-w-[70px]">이름</th>
              {dayList.map(d => {
                const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                const wd = new Date(ds + "T00:00:00").getDay();
                return (
                  <th key={d} className={`px-1 py-2 text-center font-bold border-b border-gray-100 min-w-[26px] ${wd === 0 ? "text-red-400" : wd === 6 ? "text-blue-400" : "text-gray-400"} ${ds === todayDateStr ? "bg-[#1B2B4B]/5" : ""}`}>
                    {d}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp.uid}>
                <td className="sticky left-0 bg-white px-2 py-1.5 text-left font-semibold text-gray-700 border-r border-b border-gray-50 whitespace-nowrap">{emp.name || emp.email}</td>
                {dayList.map(d => {
                  const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  const rec = recordMap[`${emp.uid}_${ds}`];
                  let derivedStatus = null;
                  if (!rec && ds <= todayDateStr) {
                    derivedStatus = findApprovedLeaveForDate(schedules, emp.uid, ds);
                    if (!derivedStatus) derivedStatus = isWeekend(ds) ? "휴무" : "출근";
                  }
                  const effStatus = rec?.status || derivedStatus;
                  const label = effStatus ? (effStatus.length > 2 ? effStatus.slice(0, 2) : effStatus) : "";
                  const colorCls = effStatus ? (ATTENDANCE_STATUS_COLOR[effStatus] || "bg-gray-100 text-gray-500") : "";
                  return (
                    <td key={d} className={`px-0.5 py-1.5 text-center border-b border-gray-50 ${ds === todayDateStr ? "bg-[#1B2B4B]/5" : ""}`}>
                      <button
                        disabled={!isAdmin}
                        onClick={() => isAdmin && setEditCell({ uid: emp.uid, name: emp.name || emp.email, date: ds, current: rec })}
                        className={`w-6 h-5 mx-auto rounded text-[9px] font-bold flex items-center justify-center ${colorCls || "bg-gray-50 text-gray-300"}`}
                      >
                        {label || "·"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editCell && (
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-end justify-center" onClick={() => setEditCell(null)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="text-[15px] font-black text-[#1B2B4B] mb-1">{editCell.name} · {editCell.date}</div>
            <div className="text-[12px] text-gray-400 mb-4">출근 상태 및 시간을 수정합니다.</div>
            <MobileEditForm editCell={editCell} onSave={saveEdit} onCancel={() => setEditCell(null)} cardVersionB={cardVersionB} />
          </div>
        </div>
      )}
    </div>
  );
}

function MobileEditForm({ editCell, onSave, onCancel, cardVersionB }) {
  const [status, setStatus] = useState(editCell.current?.status || "출근");
  const [time, setTime] = useState(editCell.current?.checkInTime ? editCell.current.checkInTime.slice(11, 16) : "09:00");
  const options = ["출근", "휴무", "연차", "오전반차", "오후반차", "외근", "병가", "경조사", "조퇴"];
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[12px] font-bold text-[#1B2B4B] mb-1.5">상태</div>
        <div className="grid grid-cols-3 gap-1.5">
          {options.map(o => (
            <button key={o} onClick={() => setStatus(o)}
              className={`py-2 rounded-lg text-[11px] font-bold border transition ${status === o ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-500 border-gray-200"}`}>
              {o}
            </button>
          ))}
        </div>
      </div>
      {status === "출근" && (
        <div>
          <div className="text-[12px] font-bold text-[#1B2B4B] mb-1.5">출근 시간</div>
          <input type="time" value={time} onChange={e => setTime(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-[14px] font-bold text-[#1B2B4B] outline-none" />
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-[13px] font-bold">취소</button>
        {editCell.current && (
          <button onClick={() => onSave(null, null)} className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-500 text-[13px] font-bold">미출근</button>
        )}
        <button onClick={() => onSave(status, status === "출근" ? `${editCell.date}T${time}:00` : null)}
          className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold">저장</button>
      </div>
    </div>
  );
}
