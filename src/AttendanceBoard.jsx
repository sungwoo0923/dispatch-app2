import React, { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where, addDoc } from "firebase/firestore";
import { db } from "./firebase";
import { ATTENDANCE_STATUS_COLOR, LEAVE_TYPE_LABEL, isWeekend, findApprovedLeaveForDate, isHoliday } from "./attendanceUtils";

const ADMIN_ROLES = ["totalMaster", "admin"];

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export default function AttendanceBoard({ userCompany, role, user }) {
  const isAdmin = ADMIN_ROLES.includes(role);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [editCell, setEditCell] = useState(null); // { uid, name, date }
  const [schedules, setSchedules] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [summaryEmp, setSummaryEmp] = useState(null); // 더블클릭 요약 팝업 대상
  const [showHolidayPanel, setShowHolidayPanel] = useState(false);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayLabel, setNewHolidayLabel] = useState("");

  const company = userCompany || localStorage.getItem("userCompany") || "";

  useEffect(() => {
    const q = query(collection(db, "schedules"), where("companyName", "==", company));
    const unsub = onSnapshot(q, snap => {
      setSchedules(snap.docs.map(d => d.data()));
    }, () => {});
    return () => unsub();
  }, [company]);

  useEffect(() => {
    const q = query(collection(db, "users"), where("companyName", "==", company));
    const unsub = onSnapshot(q, snap => {
      setEmployees(snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.approved !== false));
    }, () => {});
    return () => unsub();
  }, [company]);

  useEffect(() => {
    const q = query(collection(db, "holidays"), where("companyName", "==", company));
    const unsub = onSnapshot(q, snap => {
      setHolidays(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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

  const numDays = daysInMonth(year, month);
  const dayList = Array.from({ length: numDays }, (_, i) => i + 1);

  const recordMap = useMemo(() => {
    const m = {};
    records.forEach(r => { m[`${r.uid}_${r.date}`] = r; });
    return m;
  }, [records]);

  const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // 본인 기준 행 노출 범위 — 관리자/최고관리자는 전체, 그 외는 본인만
  const visibleEmployees = useMemo(() => {
    if (isAdmin) return employees;
    return employees.filter(e => e.uid === user?.uid);
  }, [employees, isAdmin, user]);

  // 해당 직원의 특정 날짜 실제 상태 산출 — 휴가/외근 일정이 있으면 자동기록(출근 등)보다 항상 우선
  const resolveStatus = (uid, ds) => {
    const rec = recordMap[`${uid}_${ds}`];
    const leave = findApprovedLeaveForDate(schedules, uid, ds);
    if (leave) return { status: leave, rec };
    if (rec) return { status: rec.status, rec };
    if (ds > todayDateStr) return { status: null, rec: null };
    if (isHoliday(ds, holidays)) return { status: "공휴일", rec: null };
    if (isWeekend(ds)) return { status: "휴무", rec: null };
    return { status: "출근", rec: null };
  };

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
      source: "manual", editedBy: user?.uid || "", editedAt: new Date().toISOString(),
      companyName: company,
    }, { merge: true });
    setEditCell(null);
  };

  const addHoliday = async () => {
    if (!newHolidayDate) return;
    await addDoc(collection(db, "holidays"), {
      date: newHolidayDate, label: newHolidayLabel || "공휴일", companyName: company,
    });
    setNewHolidayDate("");
    setNewHolidayLabel("");
  };

  const removeHoliday = async (id) => {
    await deleteDoc(doc(db, "holidays", id));
  };

  // 더블클릭 요약 — 조회 중인 월 기준 출근/연차/오전반차/오후반차/외근/병가/경조사/조퇴 일수 집계
  const summaryData = useMemo(() => {
    if (!summaryEmp) return null;
    const counts = {};
    dayList.forEach(d => {
      const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (ds > todayDateStr) return;
      const { status } = resolveStatus(summaryEmp.uid, ds);
      if (!status) return;
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
  }, [summaryEmp, dayList, year, month, recordMap, schedules, holidays, todayDateStr]);

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[22px] font-black text-[#1B2B4B]">출근기록부</h2>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button onClick={() => setShowHolidayPanel(v => !v)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] font-bold text-[#1B2B4B] hover:bg-gray-50">공휴일 관리</button>
          )}
          <button onClick={() => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }}
            className="w-9 h-9 rounded-lg border border-gray-200 text-[#1B2B4B] font-bold hover:bg-gray-50 text-[15px]">‹</button>
          <div className="text-[16px] font-bold text-[#1B2B4B] w-28 text-center">{year}년 {month}월</div>
          <button onClick={() => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }}
            className="w-9 h-9 rounded-lg border border-gray-200 text-[#1B2B4B] font-bold hover:bg-gray-50 text-[15px]">›</button>
        </div>
      </div>

      {isAdmin && showHolidayPanel && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
          <div className="text-[14px] font-bold text-[#1B2B4B] mb-2">공휴일 관리 ({company})</div>
          <div className="flex items-center gap-2 mb-3">
            <input type="date" value={newHolidayDate} onChange={e => setNewHolidayDate(e.target.value)}
              className="px-3 py-2 rounded-lg border-2 border-gray-200 text-[13px] font-bold text-[#1B2B4B] outline-none" />
            <input type="text" placeholder="명칭 (예: 지방선거일)" value={newHolidayLabel} onChange={e => setNewHolidayLabel(e.target.value)}
              className="px-3 py-2 rounded-lg border-2 border-gray-200 text-[13px] font-medium text-[#1B2B4B] outline-none flex-1 max-w-xs" />
            <button onClick={addHoliday} className="px-4 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold">추가</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {holidays.filter(h => h.date.startsWith(`${year}-`)).sort((a, b) => a.date.localeCompare(b.date)).map(h => (
              <div key={h.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-600">
                {h.date} · {h.label}
                <button onClick={() => removeHoliday(h.id)} className="text-gray-400 hover:text-red-500 font-bold ml-1">×</button>
              </div>
            ))}
            {holidays.filter(h => h.date.startsWith(`${year}-`)).length === 0 && (
              <div className="text-[12px] text-gray-400">{year}년 등록된 공휴일이 없습니다.</div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-3 text-[13px] text-gray-600 flex-wrap">
        {Object.entries({
          "출근": ATTENDANCE_STATUS_COLOR["출근"], "휴무": ATTENDANCE_STATUS_COLOR["휴무"], "공휴일": ATTENDANCE_STATUS_COLOR["공휴일"],
          "연차": ATTENDANCE_STATUS_COLOR["연차"], "오전/오후반차": ATTENDANCE_STATUS_COLOR["오전반차"],
          "외근": ATTENDANCE_STATUS_COLOR["외근"], "병가": ATTENDANCE_STATUS_COLOR["병가"], "경조사": ATTENDANCE_STATUS_COLOR["경조사"], "조퇴": ATTENDANCE_STATUS_COLOR["조퇴"],
        }).map(([label, cls]) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-3.5 h-3.5 rounded ${cls.split(" ")[0]}`} />
            {label}
          </div>
        ))}
        {!isAdmin && <span className="ml-auto text-gray-400">관리자만 출근 시간을 수정할 수 있습니다.{employees.length !== visibleEmployees.length ? " 본인 기록만 표시됩니다." : ""}</span>}
        {isAdmin && <span className="ml-auto text-gray-400">이름을 더블클릭하면 월간 요약을 볼 수 있습니다.</span>}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="border-collapse w-full text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white px-3 py-2.5 text-left text-gray-500 font-bold border-b border-r border-gray-100 min-w-[96px]">이름</th>
              {dayList.map(d => {
                const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                const wd = new Date(ds + "T00:00:00").getDay();
                const holiday = isHoliday(ds, holidays);
                return (
                  <th key={d} className={`px-1.5 py-2.5 text-center font-bold border-b border-gray-100 min-w-[38px] ${holiday ? "text-red-500" : wd === 0 ? "text-red-400" : wd === 6 ? "text-blue-400" : "text-gray-400"} ${ds === todayDateStr ? "bg-[#1B2B4B]/5" : ""}`}>
                    {d}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleEmployees.map(emp => (
              <tr key={emp.uid}>
                <td
                  className={`sticky left-0 bg-white px-3 py-2 text-left font-semibold text-gray-700 border-r border-b border-gray-50 whitespace-nowrap ${isAdmin ? "cursor-pointer hover:text-[#1B2B4B]" : ""}`}
                  onDoubleClick={() => isAdmin && setSummaryEmp(emp)}
                >
                  {emp.name || emp.email}
                </td>
                {dayList.map(d => {
                  const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  const { status: effStatus, rec } = resolveStatus(emp.uid, ds);
                  const label = effStatus ? (effStatus.length > 2 ? effStatus.slice(0, 2) : effStatus) : "";
                  const colorCls = effStatus ? (ATTENDANCE_STATUS_COLOR[effStatus] || "bg-gray-100 text-gray-500") : "";
                  return (
                    <td key={d} className={`px-0.5 py-1.5 text-center border-b border-gray-50 ${ds === todayDateStr ? "bg-[#1B2B4B]/5" : ""}`}>
                      <button
                        disabled={!isAdmin}
                        onClick={() => isAdmin && setEditCell({ uid: emp.uid, name: emp.name || emp.email, date: ds, current: rec })}
                        className={`w-8 h-7 mx-auto rounded text-[11px] font-bold flex items-center justify-center ${colorCls || "bg-gray-50 text-gray-300"} ${isAdmin ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                        title={rec ? `${rec.status}${rec.checkInTime ? " · " + rec.checkInTime.slice(11, 16) : ""}` : ""}
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
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4" onClick={() => setEditCell(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="text-[16px] font-black text-[#1B2B4B] mb-1">{editCell.name} · {editCell.date}</div>
            <div className="text-[13px] text-gray-400 mb-4">출근 상태 및 시간을 수정합니다.</div>
            <EditForm editCell={editCell} onSave={saveEdit} onCancel={() => setEditCell(null)} />
          </div>
        </div>
      )}

      {summaryEmp && summaryData && (
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4" onClick={() => setSummaryEmp(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="text-[16px] font-black text-[#1B2B4B] mb-1">{summaryEmp.name || summaryEmp.email}</div>
            <div className="text-[13px] text-gray-400 mb-4">{year}년 {month}월 출근 요약</div>
            <div className="space-y-2">
              {Object.keys(ATTENDANCE_STATUS_COLOR).map(key => (
                summaryData[key] ? (
                  <div key={key} className="flex items-center justify-between px-3 py-2 rounded-xl border border-gray-100">
                    <span className="text-[13px] font-bold text-[#1B2B4B]">{key}</span>
                    <span className="text-[14px] font-black text-[#1B2B4B]">{summaryData[key]}일</span>
                  </div>
                ) : null
              ))}
              {Object.keys(summaryData).length === 0 && (
                <div className="text-[13px] text-gray-400 text-center py-2">기록이 없습니다.</div>
              )}
            </div>
            <button onClick={() => setSummaryEmp(null)} className="w-full mt-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-[13px] font-bold hover:bg-gray-50">닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditForm({ editCell, onSave, onCancel }) {
  const [status, setStatus] = useState(editCell.current?.status || "출근");
  const [time, setTime] = useState(editCell.current?.checkInTime ? editCell.current.checkInTime.slice(11, 16) : "09:00");
  const options = ["출근", "휴무", "연차", "오전반차", "오후반차", "외근", "병가", "경조사", "조퇴"];
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[13px] font-bold text-[#1B2B4B] mb-1.5">상태</div>
        <div className="grid grid-cols-3 gap-1.5">
          {options.map(o => (
            <button key={o} onClick={() => setStatus(o)}
              className={`py-2 rounded-lg text-[12px] font-bold border transition ${status === o ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-500 border-gray-200 hover:border-[#1B2B4B]/40"}`}>
              {o}
            </button>
          ))}
        </div>
      </div>
      {status === "출근" && (
        <div>
          <div className="text-[13px] font-bold text-[#1B2B4B] mb-1.5">출근 시간</div>
          <input type="time" value={time} onChange={e => setTime(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-[14px] font-bold text-[#1B2B4B] focus:border-[#1B2B4B] outline-none" />
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-[13px] font-bold hover:bg-gray-50">취소</button>
        {editCell.current && (
          <button onClick={() => onSave(null, null)}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-500 text-[13px] font-bold hover:bg-gray-50">미출근(초기화)</button>
        )}
        <button onClick={() => onSave(status, status === "출근" ? `${editCell.date}T${time}:00` : null)}
          className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60]">저장</button>
      </div>
    </div>
  );
}
