import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import { ATTENDANCE_STATUS_COLOR, isWeekend, isHoliday, findApprovedLeaveForDate } from "../attendanceUtils";

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export default function MobileAttendanceBoard({ userCompany, currentUser }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [myUserDoc, setMyUserDoc] = useState(null);
  const [checkingOut, setCheckingOut] = useState(false);

  const company = userCompany || localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "";
  const uid = currentUser?.uid;
  const myName = myUserDoc?.name || currentUser?.displayName || currentUser?.name || currentUser?.email?.split("@")[0] || "";

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, "users", uid), snap => {
      setMyUserDoc(snap.exists() ? snap.data() : null);
    }, () => {});
    return () => unsub();
  }, [uid]);

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "attendance"), where("uid", "==", uid), where("month", "==", monthStr));
    const unsub = onSnapshot(q, snap => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, [uid, monthStr]);

  useEffect(() => {
    if (!company) return;
    const unsub = onSnapshot(collection(db, "schedules"), snap => {
      setSchedules(snap.docs.map(d => d.data()).filter(s => (s.companyName || "돌캐") === company));
    }, () => {});
    return () => unsub();
  }, [company]);

  useEffect(() => {
    if (!company) return;
    const q = query(collection(db, "holidays"), where("companyName", "==", company));
    const unsub = onSnapshot(q, snap => {
      setHolidays(snap.docs.map(d => d.data()));
    }, () => {});
    return () => unsub();
  }, [company]);

  const recordMap = useMemo(() => {
    const m = {};
    records.forEach(r => { m[r.date] = r; });
    return m;
  }, [records]);

  const numDays = daysInMonth(year, month);
  const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todayRec = recordMap[todayDateStr];

  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= numDays; d++) cells.push(d);

  const resolveStatus = (ds) => {
    const rec = recordMap[ds];
    if (rec && rec.status) return { status: rec.status, rec };
    if (ds > todayDateStr) return { status: null, rec: null };
    if (isHoliday(ds, holidays)) return { status: "공휴일", rec: null };
    if (isWeekend(ds)) return { status: "휴무", rec: null };
    const leave = findApprovedLeaveForDate(schedules, uid, ds, myName);
    if (leave) return { status: leave, rec: null };
    return { status: null, rec: null };
  };

  const isLate = (rec) => {
    if (!rec?.checkInTime || !myUserDoc?.workStartTime) return false;
    const [ch, cm] = rec.checkInTime.slice(11, 16).split(":").map(Number);
    const [sh, sm] = myUserDoc.workStartTime.split(":").map(Number);
    return ch * 60 + cm > sh * 60 + sm;
  };

  const handleCheckOut = async () => {
    if (!uid || !todayRec) return;
    setCheckingOut(true);
    try {
      await setDoc(doc(db, "attendance", `${todayDateStr}_${uid}`), {
        checkOutTime: new Date().toISOString(),
        uid, name: myName, date: todayDateStr,
        month: todayDateStr.slice(0, 7), companyName: company,
      }, { merge: true });
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <div className="px-3 py-3 space-y-3 pb-24">
      {/* 오늘 출퇴근 현황 카드 */}
      {month === now.getMonth() + 1 && year === now.getFullYear() && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-[13px] font-bold text-[#1B2B4B] mb-2">오늘 출퇴근</div>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3 text-[13px]">
                <span className="text-gray-500">출근</span>
                <span className="font-bold text-[#1B2B4B]">{todayRec?.checkInTime ? todayRec.checkInTime.slice(11, 16) : "미출근"}</span>
                {todayRec?.checkInTime && isLate(todayRec) && (
                  <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-500 text-[11px] font-bold">지각</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[13px]">
                <span className="text-gray-500">퇴근</span>
                <span className="font-bold text-[#1B2B4B]">{todayRec?.checkOutTime ? todayRec.checkOutTime.slice(11, 16) : "-"}</span>
              </div>
              {myUserDoc?.workStartTime && (
                <div className="text-[11px] text-gray-400">정규: {myUserDoc.workStartTime} ~ {myUserDoc.workEndTime || "-"}</div>
              )}
            </div>
            {todayRec?.status === "출근" && !todayRec?.checkOutTime && (
              <button onClick={handleCheckOut} disabled={checkingOut}
                className="px-5 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold disabled:opacity-50">
                {checkingOut ? "처리 중..." : "퇴근"}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }}
            className="w-8 h-8 rounded-lg border border-gray-200 text-[#1B2B4B] font-bold">‹</button>
          <div className="text-[15px] font-black text-[#1B2B4B]">{year}년 {month}월</div>
          <button onClick={() => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }}
            className="w-8 h-8 rounded-lg border border-gray-200 text-[#1B2B4B] font-bold">›</button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
            <div key={w} className={`text-center text-[11px] font-bold py-1 ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-gray-400"}`}>{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const { status, rec } = resolveStatus(ds);
            const colorCls = status ? (ATTENDANCE_STATUS_COLOR[status] || "bg-gray-100 text-gray-500") : "bg-gray-50 text-gray-300";
            const label = status ? (status.length > 2 ? status.slice(0, 2) : status) : "";
            const late = status === "출근" && isLate(rec);
            const tooltip = [
              status || "",
              rec?.checkInTime ? `출근 ${rec.checkInTime.slice(11, 16)}` : "",
              rec?.checkOutTime ? `퇴근 ${rec.checkOutTime.slice(11, 16)}` : "",
            ].filter(Boolean).join(" · ");
            return (
              <div key={i} className={`rounded-lg flex flex-col items-center justify-center py-1.5 relative ${ds === todayDateStr ? "ring-2 ring-[#1B2B4B]" : ""}`}
                title={tooltip}>
                <div className="text-[11px] font-bold text-gray-500 mb-0.5">{d}</div>
                <div className={`w-full mx-0.5 rounded text-[9px] font-bold py-1 text-center ${colorCls}`}>{label || "·"}</div>
                {late && <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-gray-500 flex-wrap px-1">
        {Object.entries({
          "출근": ATTENDANCE_STATUS_COLOR["출근"], "휴무": ATTENDANCE_STATUS_COLOR["휴무"],
          "공휴일": ATTENDANCE_STATUS_COLOR["공휴일"], "연차": ATTENDANCE_STATUS_COLOR["연차"],
          "외근": ATTENDANCE_STATUS_COLOR["외근"], "병가": ATTENDANCE_STATUS_COLOR["병가"]
        }).map(([label, cls]) => (
          <div key={label} className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded ${cls.split(" ")[0]}`} />
            {label}
          </div>
        ))}
        <span className="ml-auto text-[10px] text-gray-400">지각: 빨간 점</span>
      </div>
    </div>
  );
}
