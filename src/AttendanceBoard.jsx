import React, { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where, addDoc, arrayUnion, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { ATTENDANCE_STATUS_COLOR, LEAVE_TYPE_LABEL, isWeekend, findApprovedLeaveForDate, isHoliday, KR_NATIONAL_HOLIDAYS } from "./attendanceUtils";

const ADMIN_ROLES = ["totalMaster", "admin"];

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export default function AttendanceBoard({ userCompany, role, user }) {
  const isAdmin = ADMIN_ROLES.includes(role);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [editCell, setEditCell] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [summaryEmp, setSummaryEmp] = useState(null);
  const [showHolidayPanel, setShowHolidayPanel] = useState(false);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayLabel, setNewHolidayLabel] = useState("");

  // 출근지 설정
  const [officeLocation, setOfficeLocation] = useState(null);
  const [showOfficePanel, setShowOfficePanel] = useState(false);
  const [officeInput, setOfficeInput] = useState({ lat: "", lng: "", address: "" });
  const [savingOffice, setSavingOffice] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  // 직원별 근무시간 편집
  const [editScheduleEmp, setEditScheduleEmp] = useState(null);
  const [editWorkStart, setEditWorkStart] = useState("09:00");
  const [editWorkEnd, setEditWorkEnd] = useState("18:00");


  const company = userCompany || localStorage.getItem("userCompany") || "";
  const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // ─── 데이터 구독 ───────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "schedules"), snap => {
      setSchedules(snap.docs.map(d => d.data()).filter(s => (s.companyName || "돌캐") === company));
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

  // 출근지 설정 구독
  useEffect(() => {
    if (!company) return;
    const unsub = onSnapshot(doc(db, "companySettings", company), snap => {
      const data = snap.data();
      setOfficeLocation(data?.officeLocation || null);
    }, () => {});
    return () => unsub();
  }, [company]);

  // ─── 출근지 저장 ────────────────────────────────────────────
  const saveOfficeLocation = async () => {
    const lat = parseFloat(officeInput.lat);
    const lng = parseFloat(officeInput.lng);
    if (isNaN(lat) || isNaN(lng)) { alert("올바른 위도/경도를 입력해주세요."); return; }
    setSavingOffice(true);
    await setDoc(doc(db, "companySettings", company), {
      officeLocation: { lat, lng, address: officeInput.address || "" }
    }, { merge: true });
    setSavingOffice(false);
    setShowOfficePanel(false);
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) { alert("이 브라우저는 위치 기능을 지원하지 않습니다."); return; }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setOfficeInput({ lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6), address: "현재 위치" });
        setGettingLocation(false);
      },
      () => { alert("위치 정보를 가져올 수 없습니다."); setGettingLocation(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // ─── 직원별 근무시간 저장 ───────────────────────────────────
  const saveWorkSchedule = async (uid) => {
    await setDoc(doc(db, "users", uid), { workStartTime: editWorkStart, workEndTime: editWorkEnd }, { merge: true });
    setEditScheduleEmp(null);
  };


  // ─── 오늘 퇴근 처리 ─────────────────────────────────────────
  const handleCheckOut = async () => {
    if (!user?.uid) return;
    const checkOutTime = new Date().toISOString();
    const myName = employees.find(e => e.uid === user?.uid)?.name || user?.email || "";
    await setDoc(doc(db, "attendance", `${todayDateStr}_${user.uid}`), {
      checkOutTime,
      uid: user.uid, name: myName, date: todayDateStr,
      month: todayDateStr.slice(0, 7), companyName: company,
    }, { merge: true });
  };

  // ─── 테이블 계산 ─────────────────────────────────────────────
  const numDays = daysInMonth(year, month);
  const dayList = Array.from({ length: numDays }, (_, i) => i + 1);

  const recordMap = useMemo(() => {
    const m = {};
    records.forEach(r => { m[`${r.uid}_${r.date}`] = r; });
    return m;
  }, [records]);

  const visibleEmployees = useMemo(() => {
    if (isAdmin) return employees;
    return employees.filter(e => e.uid === user?.uid);
  }, [employees, isAdmin, user]);

  const resolveStatus = (uid, ds, name) => {
    const rec = recordMap[`${uid}_${ds}`];
    if (rec && rec.status) return { status: rec.status, rec };
    if (ds > todayDateStr) return { status: null, rec: null };
    if (isHoliday(ds, holidays)) return { status: "공휴일", rec: null };
    if (isWeekend(ds)) return { status: "휴무", rec: null };
    const leave = findApprovedLeaveForDate(schedules, uid, ds, name);
    if (leave) return { status: leave, rec: null };
    // 기록 없으면 미출근으로 표시 (과거 날짜만)
    return { status: null, rec: null };
  };

  const isLate = (rec, emp) => {
    if (!rec?.checkInTime || !emp?.workStartTime) return false;
    const checkInMin = timeToMinutes(rec.checkInTime.slice(11, 16));
    const startMin = timeToMinutes(emp.workStartTime);
    if (checkInMin == null || startMin == null) return false;
    return checkInMin > startMin;
  };

  // 오늘 현재 사용자 출근 레코드
  const myTodayRec = user?.uid ? recordMap[`${user.uid}_${todayDateStr}`] : null;
  const myEmp = employees.find(e => e.uid === user?.uid);

  // ─── 출근 수정 저장 ──────────────────────────────────────────
  const saveEdit = async (status, checkInTime, checkOutTime) => {
    if (!editCell) return;
    const { uid, name, date } = editCell;
    const editorName = employees.find(e => e.uid === user?.uid)?.name || user?.email || "관리자";
    const historyEntry = {
      status: status === null ? "미출근(초기화)" : status,
      checkInTime: checkInTime || null,
      checkOutTime: checkOutTime || null,
      editedByName: editorName,
      editedAt: new Date().toISOString(),
    };
    if (status === null) {
      await setDoc(doc(db, "attendance", `${date}_${uid}`), {
        uid, name, date, month: date.slice(0, 7),
        status: null, checkInTime: null, checkOutTime: null, source: "manual",
        editedBy: user?.uid || "", editedByName: editorName, editedAt: new Date().toISOString(),
        companyName: company,
        history: arrayUnion(historyEntry),
      }, { merge: true });
      setEditCell(null);
      return;
    }
    await setDoc(doc(db, "attendance", `${date}_${uid}`), {
      uid, name, date, month: date.slice(0, 7),
      status, checkInTime: checkInTime || null, checkOutTime: checkOutTime || null,
      source: "manual", editedBy: user?.uid || "", editedByName: editorName, editedAt: new Date().toISOString(),
      companyName: company,
      history: arrayUnion(historyEntry),
    }, { merge: true });
    setEditCell(null);
  };

  // ─── 공휴일 관리 ─────────────────────────────────────────────
  const addHoliday = async () => {
    if (!newHolidayDate) return;
    await addDoc(collection(db, "holidays"), {
      date: newHolidayDate, label: newHolidayLabel || "공휴일", companyName: company,
    });
    setNewHolidayDate("");
    setNewHolidayLabel("");
  };
  const removeHoliday = async (id) => { await deleteDoc(doc(db, "holidays", id)); };

  // ─── 월간 요약 ────────────────────────────────────────────────
  const summaryData = useMemo(() => {
    if (!summaryEmp) return null;
    const counts = {};
    let lateCount = 0;
    dayList.forEach(d => {
      const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (ds > todayDateStr) return;
      const { status, rec } = resolveStatus(summaryEmp.uid, ds, summaryEmp.name || summaryEmp.email);
      if (!status) return;
      counts[status] = (counts[status] || 0) + 1;
      if (status === "출근" && rec && isLate(rec, summaryEmp)) lateCount++;
    });
    return { counts, lateCount };
  }, [summaryEmp, dayList, year, month, recordMap, schedules, holidays, todayDateStr, employees]);

  // ─── 렌더링 ──────────────────────────────────────────────────
  return (
    <div className="p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[22px] font-black text-[#1B2B4B]">출근기록부</h2>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <button onClick={() => { setShowOfficePanel(v => !v); setShowHolidayPanel(false); }}
                className={`px-3 py-1.5 rounded-lg border text-[13px] font-bold transition ${showOfficePanel ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "border-gray-200 text-[#1B2B4B] hover:bg-gray-50"}`}>
                출근지 설정
              </button>
              <button onClick={() => { setShowHolidayPanel(v => !v); setShowOfficePanel(false); }}
                className={`px-3 py-1.5 rounded-lg border text-[13px] font-bold transition ${showHolidayPanel ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "border-gray-200 text-[#1B2B4B] hover:bg-gray-50"}`}>
                공휴일 관리
              </button>
            </>
          )}
          <button onClick={() => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }}
            className="w-9 h-9 rounded-lg border border-gray-200 text-[#1B2B4B] font-bold hover:bg-gray-50 text-[15px]">‹</button>
          <div className="text-[16px] font-bold text-[#1B2B4B] w-28 text-center">{year}년 {month}월</div>
          <button onClick={() => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }}
            className="w-9 h-9 rounded-lg border border-gray-200 text-[#1B2B4B] font-bold hover:bg-gray-50 text-[15px]">›</button>
        </div>
      </div>

      {/* 출근지 설정 패널 */}
      {isAdmin && showOfficePanel && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
          <div className="text-[14px] font-bold text-[#1B2B4B] mb-3">출근지 설정</div>
          {officeLocation && (
            <div className="mb-3 px-3 py-2 rounded-xl bg-blue-50 border border-blue-100 text-[13px] text-blue-700">
              <span className="font-bold">현재 출근지:</span> {officeLocation.address || `${officeLocation.lat}, ${officeLocation.lng}`}
              <span className="ml-2 text-[12px] text-blue-500">({officeLocation.lat?.toFixed(5)}, {officeLocation.lng?.toFixed(5)})</span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button onClick={getCurrentLocation} disabled={gettingLocation}
                className="px-3 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold disabled:opacity-50 whitespace-nowrap">
                {gettingLocation ? "위치 가져오는 중..." : "현재 위치로 가져오기"}
              </button>
              <span className="text-[12px] text-gray-400">관리자가 사무실에 있을 때 눌러주세요</span>
            </div>
            <div className="text-[12px] font-bold text-gray-500 mt-1">또는 직접 입력</div>
            <div className="flex items-center gap-2">
              <div>
                <div className="text-[11px] text-gray-400 mb-1">위도 (Latitude)</div>
                <input type="number" step="0.000001" placeholder="예: 37.566826"
                  value={officeInput.lat} onChange={e => setOfficeInput(p => ({ ...p, lat: e.target.value }))}
                  className="px-3 py-2 rounded-lg border-2 border-gray-200 text-[13px] font-bold text-[#1B2B4B] outline-none w-36 focus:border-[#1B2B4B]" />
              </div>
              <div>
                <div className="text-[11px] text-gray-400 mb-1">경도 (Longitude)</div>
                <input type="number" step="0.000001" placeholder="예: 126.977829"
                  value={officeInput.lng} onChange={e => setOfficeInput(p => ({ ...p, lng: e.target.value }))}
                  className="px-3 py-2 rounded-lg border-2 border-gray-200 text-[13px] font-bold text-[#1B2B4B] outline-none w-36 focus:border-[#1B2B4B]" />
              </div>
              <div className="flex-1">
                <div className="text-[11px] text-gray-400 mb-1">장소명 (선택)</div>
                <input type="text" placeholder="예: 본사 사무실"
                  value={officeInput.address} onChange={e => setOfficeInput(p => ({ ...p, address: e.target.value }))}
                  className="px-3 py-2 rounded-lg border-2 border-gray-200 text-[13px] font-medium text-[#1B2B4B] outline-none w-full focus:border-[#1B2B4B]" />
              </div>
            </div>
            <div className="text-[11px] text-gray-400">출근지 반경 100m 이내 도착 시 모바일 자동 출근 · 300m 이탈 시 자동 퇴근</div>
            <div className="flex gap-2">
              <button onClick={saveOfficeLocation} disabled={savingOffice || (!officeInput.lat && !officeInput.lng)}
                className="px-4 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold disabled:opacity-40">
                {savingOffice ? "저장 중..." : "저장"}
              </button>
              <button onClick={() => setShowOfficePanel(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-500 text-[13px] font-bold">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 공휴일 관리 패널 */}
      {isAdmin && showHolidayPanel && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
          <div className="text-[14px] font-bold text-[#1B2B4B] mb-1">대한민국 법정공휴일 ({year}년, 자동 반영)</div>
          <div className="flex flex-wrap gap-2 mb-4">
            {(KR_NATIONAL_HOLIDAYS[year] || []).map(([d, label]) => (
              <div key={d} className="px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-100 text-[12px] font-semibold text-red-600">
                {d} · {label}
              </div>
            ))}
            {!(KR_NATIONAL_HOLIDAYS[year] || []).length && (
              <div className="text-[12px] text-gray-400">{year}년 법정공휴일 데이터가 아직 등록되지 않았습니다.</div>
            )}
          </div>
          <div className="text-[14px] font-bold text-[#1B2B4B] mb-2">회사 지정 휴일 추가</div>
          <div className="flex items-center gap-2 mb-3">
            <input type="date" value={newHolidayDate} onChange={e => setNewHolidayDate(e.target.value)}
              className="px-3 py-2 rounded-lg border-2 border-gray-200 text-[13px] font-bold text-[#1B2B4B] outline-none" />
            <input type="text" placeholder="명칭 (예: 창립기념일)" value={newHolidayLabel} onChange={e => setNewHolidayLabel(e.target.value)}
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
            {!holidays.filter(h => h.date.startsWith(`${year}-`)).length && (
              <div className="text-[12px] text-gray-400">등록된 회사 지정 휴일이 없습니다.</div>
            )}
          </div>
        </div>
      )}

      {/* 오늘 내 출퇴근 카드 (비관리자 / 당일만) */}
      {!isAdmin && myEmp && month === now.getMonth() + 1 && year === now.getFullYear() && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 flex items-center gap-4">
          <div className="flex-1">
            <div className="text-[13px] font-bold text-[#1B2B4B] mb-1">오늘 출퇴근</div>
            <div className="flex items-center gap-3 text-[13px] text-gray-600">
              <span>출근 : <span className="font-bold text-[#1B2B4B]">{myTodayRec?.checkInTime ? myTodayRec.checkInTime.slice(11, 16) : "미출근"}</span></span>
              <span>퇴근 : <span className="font-bold text-[#1B2B4B]">{myTodayRec?.checkOutTime ? myTodayRec.checkOutTime.slice(11, 16) : "-"}</span></span>
              {myTodayRec?.checkInTime && myEmp?.workStartTime && isLate(myTodayRec, myEmp) && (
                <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-500 text-[11px] font-bold">지각</span>
              )}
            </div>
            {myEmp?.workStartTime && (
              <div className="text-[11px] text-gray-400 mt-1">정규 근무: {myEmp.workStartTime} ~ {myEmp.workEndTime || "-"}</div>
            )}
          </div>
          {myTodayRec?.status === "출근" && !myTodayRec?.checkOutTime && (
            <button onClick={handleCheckOut}
              className="px-4 py-2 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition">
              퇴근
            </button>
          )}
        </div>
      )}

      {/* 관리자용 오늘 내 퇴근 버튼 */}
      {isAdmin && myTodayRec?.status === "출근" && !myTodayRec?.checkOutTime && month === now.getMonth() + 1 && year === now.getFullYear() && (
        <div className="flex items-center justify-end mb-3">
          <button onClick={handleCheckOut}
            className="px-4 py-2 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition">
            내 퇴근 처리
          </button>
        </div>
      )}

      {/* 범례 */}
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
        {!isAdmin && <span className="ml-auto text-gray-400">관리자만 출근 시간을 수정할 수 있습니다.</span>}
        {isAdmin && <span className="ml-auto text-gray-400">이름을 더블클릭하면 월간 요약을 볼 수 있습니다.</span>}
      </div>

      {/* 출근기록 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="border-collapse w-full text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white px-3 py-2.5 text-left text-gray-500 font-bold border-b border-r border-gray-100 min-w-[96px]">이름</th>
              <th className="px-2 py-2.5 text-center font-bold border-b border-gray-100 text-gray-400 min-w-[56px] text-[11px]">근무시간</th>
              {dayList.map(d => {
                const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                const wd = new Date(ds + "T00:00:00").getDay();
                const holiday = isHoliday(ds, holidays);
                return (
                  <th key={d} className={`px-1.5 py-2.5 text-center font-bold border-b border-gray-100 min-w-[42px] ${holiday ? "text-red-500" : wd === 0 ? "text-red-400" : wd === 6 ? "text-blue-400" : "text-gray-400"} ${ds === todayDateStr ? "bg-[#1B2B4B]/5" : ""}`}>
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
                <td className="px-2 py-2 text-center border-b border-gray-50 text-[11px] text-gray-400 whitespace-nowrap">
                  {emp.workStartTime ? `${emp.workStartTime}~${emp.workEndTime || "?"}` : "-"}
                </td>
                {dayList.map(d => {
                  const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  const { status: effStatus, rec } = resolveStatus(emp.uid, ds, emp.name || emp.email);
                  const label = effStatus ? (effStatus.length > 2 ? effStatus.slice(0, 2) : effStatus) : "";
                  const colorCls = effStatus ? (ATTENDANCE_STATUS_COLOR[effStatus] || "bg-gray-100 text-gray-500") : "";
                  const late = effStatus === "출근" && isLate(rec, emp);
                  const checkIn = rec?.checkInTime ? rec.checkInTime.slice(11, 16) : "";
                  const checkOut = rec?.checkOutTime ? rec.checkOutTime.slice(11, 16) : "";
                  const tooltipText = [
                    effStatus ? `상태: ${effStatus}` : "",
                    checkIn ? `출근: ${checkIn}` : "",
                    checkOut ? `퇴근: ${checkOut}` : "",
                    late ? "지각" : "",
                  ].filter(Boolean).join(" · ");
                  return (
                    <td key={d} className={`px-0.5 py-1.5 text-center border-b border-gray-50 ${ds === todayDateStr ? "bg-[#1B2B4B]/5" : ""}`}>
                      <button
                        disabled={!isAdmin}
                        onClick={() => isAdmin && setEditCell({ uid: emp.uid, name: emp.name || emp.email, date: ds, current: rec })}
                        className={`w-9 h-7 mx-auto rounded text-[11px] font-bold flex flex-col items-center justify-center relative ${colorCls || "bg-gray-50 text-gray-300"} ${isAdmin ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                        title={tooltipText}
                      >
                        <span>{label || "·"}</span>
                        {late && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" title="지각" />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 출근 수정 모달 */}
      {editCell && (
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4" onClick={() => setEditCell(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="text-[16px] font-black text-[#1B2B4B] mb-1">{editCell.name} · {editCell.date}</div>
            <div className="text-[13px] text-gray-400 mb-4">출근 상태 및 시간을 수정합니다.</div>
            <EditForm editCell={editCell} onSave={saveEdit} onCancel={() => setEditCell(null)} />
          </div>
        </div>
      )}

      {/* 근무시간 편집 모달 - 월간요약 팝업보다 높은 z-index */}
      {editScheduleEmp && (
        <div className="fixed inset-0 bg-black/50 z-[999999] flex items-center justify-center p-4" onClick={() => setEditScheduleEmp(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5" onClick={e => e.stopPropagation()}>
            <div className="text-[15px] font-black text-[#1B2B4B] mb-1">{editScheduleEmp.name || editScheduleEmp.email}</div>
            <div className="text-[12px] text-gray-400 mb-4">정규 근무시간을 설정합니다.</div>
            <div className="space-y-3">
              <div>
                <div className="text-[12px] font-bold text-[#1B2B4B] mb-1.5">출근 시간</div>
                <input type="time" value={editWorkStart} onChange={e => setEditWorkStart(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-[14px] font-bold text-[#1B2B4B] focus:border-[#1B2B4B] outline-none" />
              </div>
              <div>
                <div className="text-[12px] font-bold text-[#1B2B4B] mb-1.5">퇴근 시간</div>
                <input type="time" value={editWorkEnd} onChange={e => setEditWorkEnd(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-[14px] font-bold text-[#1B2B4B] focus:border-[#1B2B4B] outline-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditScheduleEmp(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-[13px] font-bold">취소</button>
                <button onClick={() => saveWorkSchedule(editScheduleEmp.uid)} className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold">저장</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 월간 요약 팝업 */}
      {summaryEmp && summaryData && (
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4" onClick={() => setSummaryEmp(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="text-[16px] font-black text-[#1B2B4B] mb-0.5">{summaryEmp.name || summaryEmp.email}</div>
            <div className="text-[13px] text-gray-400 mb-4">{year}년 {month}월 출근 요약</div>

            {/* 근무시간 설정 */}
            <div className="mb-4 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-[12px] font-bold text-gray-500">정규 근무시간</div>
                <div className="text-[13px] font-bold text-[#1B2B4B] mt-0.5">
                  {summaryEmp.workStartTime || "-"} ~ {summaryEmp.workEndTime || "-"}
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setEditWorkStart(summaryEmp.workStartTime || "09:00"); setEditWorkEnd(summaryEmp.workEndTime || "18:00"); setEditScheduleEmp(summaryEmp); }}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold text-[#1B2B4B] hover:bg-gray-100">
                설정
              </button>
            </div>

            {/* 통계 */}
            <div className="space-y-2 mb-4">
              {Object.keys(ATTENDANCE_STATUS_COLOR).map(key => (
                summaryData.counts[key] ? (
                  <div key={key} className="flex items-center justify-between px-3 py-2 rounded-xl border border-gray-100">
                    <span className="text-[13px] font-bold text-[#1B2B4B]">{key}</span>
                    <span className="text-[14px] font-black text-[#1B2B4B]">{summaryData.counts[key]}일</span>
                  </div>
                ) : null
              ))}
              {summaryData.lateCount > 0 && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl border border-red-100 bg-red-50">
                  <span className="text-[13px] font-bold text-red-500">지각</span>
                  <span className="text-[14px] font-black text-red-500">{summaryData.lateCount}회</span>
                </div>
              )}
              {Object.keys(summaryData.counts).length === 0 && (
                <div className="text-[13px] text-gray-400 text-center py-2">기록이 없습니다.</div>
              )}
            </div>
            <button onClick={() => setSummaryEmp(null)} className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-500 text-[13px] font-bold hover:bg-gray-50">닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditForm({ editCell, onSave, onCancel }) {
  const [status, setStatus] = useState(editCell.current?.status || "출근");
  const [time, setTime] = useState(editCell.current?.checkInTime ? editCell.current.checkInTime.slice(11, 16) : "09:00");
  const [checkOutTime, setCheckOutTime] = useState(editCell.current?.checkOutTime ? editCell.current.checkOutTime.slice(11, 16) : "");
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
        <>
          <div>
            <div className="text-[13px] font-bold text-[#1B2B4B] mb-1.5">출근 시간</div>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-[14px] font-bold text-[#1B2B4B] focus:border-[#1B2B4B] outline-none" />
          </div>
          <div>
            <div className="text-[13px] font-bold text-[#1B2B4B] mb-1.5">퇴근 시간 (선택)</div>
            <input type="time" value={checkOutTime} onChange={e => setCheckOutTime(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-[14px] font-bold text-[#1B2B4B] focus:border-[#1B2B4B] outline-none" />
          </div>
        </>
      )}
      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-[13px] font-bold hover:bg-gray-50">취소</button>
        {editCell.current && (
          <button onClick={() => onSave(null, null, null)}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-500 text-[13px] font-bold hover:bg-gray-50">초기화</button>
        )}
        <button onClick={() => onSave(status, status === "출근" ? `${editCell.date}T${time}:00` : null, status === "출근" && checkOutTime ? `${editCell.date}T${checkOutTime}:00` : null)}
          className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60]">저장</button>
      </div>
      {editCell.current?.history?.length > 0 && (
        <div className="pt-3 border-t border-gray-100">
          <div className="text-[12px] font-bold text-[#1B2B4B] mb-1.5">수정 이력</div>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {[...editCell.current.history].sort((a, b) => (b.editedAt || "").localeCompare(a.editedAt || "")).map((h, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] text-gray-500 bg-gray-50 rounded-lg px-2.5 py-1.5">
                <span className="font-semibold text-gray-600">
                  {h.status}{h.checkInTime ? ` · 출근${h.checkInTime.slice(11, 16)}` : ""}{h.checkOutTime ? ` · 퇴근${h.checkOutTime.slice(11, 16)}` : ""}
                </span>
                <span>{h.editedByName || "관리자"} · {(h.editedAt || "").slice(0, 16).replace("T", " ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
