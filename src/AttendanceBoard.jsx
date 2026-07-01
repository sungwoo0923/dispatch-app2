import React, { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where, addDoc, arrayUnion, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
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

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

export default function AttendanceBoard({ userCompany, role, user }) {
  const isAdmin = ADMIN_ROLES.includes(role);
  const canApproveRequests = role === "totalMaster" || role === "hrManager";
  const canEditAttendance = role === "totalMaster";
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

  const [hiddenEmpUids, setHiddenEmpUids] = useState([]);
  const [showEmpFilter, setShowEmpFilter] = useState(false);
  const [empFilterSearch, setEmpFilterSearch] = useState("");
  const [checkInRequests, setCheckInRequests] = useState([]);
  const [showRequestPanel, setShowRequestPanel] = useState(false);
  const [requestingCheckIn, setRequestingCheckIn] = useState(false);

  // 출근 요청 시간 입력 모달
  const [showCheckInRequestModal, setShowCheckInRequestModal] = useState(false);
  const [requestCheckInTime, setRequestCheckInTime] = useState("");

  // 수정 요청 상태
  const [changeRequestCell, setChangeRequestCell] = useState(null);
  const [changeReqStatus, setChangeReqStatus] = useState("출근");
  const [changeReqTime, setChangeReqTime] = useState("09:00");
  const [changeReqCheckOut, setChangeReqCheckOut] = useState("");
  const [changeReqReason, setChangeReqReason] = useState("");
  const [submittingChangeReq, setSubmittingChangeReq] = useState(false);
  const [changeRequests, setChangeRequests] = useState([]);
  const [showChangeReqPanel, setShowChangeReqPanel] = useState(false);

  // PC 알림 큐
  const [pcNotifQueue, setPcNotifQueue] = useState([]);
  // 거절 사유 입력 (인라인)
  const [pcNotifRejectInput, setPcNotifRejectInput] = useState(""); // for banner inline reject
  const [pcNotifShowReject, setPcNotifShowReject] = useState(false);

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
      setHiddenEmpUids(data?.hiddenEmployees || []);
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

  const toggleHideEmp = async (uid) => {
    const next = hiddenEmpUids.includes(uid)
      ? hiddenEmpUids.filter(u => u !== uid)
      : [...hiddenEmpUids, uid];
    await setDoc(doc(db, "companySettings", company), { hiddenEmployees: next }, { merge: true });
  };


  // ─── 출근 요청 구독 ──────────────────────────────────────────
  useEffect(() => {
    if (!company) return;
    const q = isAdmin
      ? query(collection(db, "attendanceRequests"), where("companyName", "==", company), where("status", "==", "pending"))
      : (user?.uid ? query(collection(db, "attendanceRequests"), where("uid", "==", user.uid), where("status", "==", "pending")) : null);
    if (!q) return;
    const unsub = onSnapshot(q, snap => {
      setCheckInRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, [company, user?.uid, isAdmin]);

  // ─── 수정 요청 구독 ──────────────────────────────────────────
  useEffect(() => {
    if (!company) return;
    const q = canApproveRequests
      ? query(collection(db, "attendanceChangeRequests"), where("companyName", "==", company), where("status", "==", "pending"))
      : (user?.uid ? query(collection(db, "attendanceChangeRequests"), where("uid", "==", user.uid)) : null);
    if (!q) return;
    const unsub = onSnapshot(q, snap => {
      setChangeRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, [company, user?.uid, canApproveRequests]);

  // ─── PC 알림 구독 ───────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, "notifications"), where("toUid", "==", user.uid), where("read", "==", false));
    const unsub = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach(change => {
        if (change.type !== "added") return;
        const data = change.doc.data();
        setPcNotifQueue(prev => {
          if (prev.some(n => n.id === change.doc.id)) return prev;
          return [...prev, {
            id: change.doc.id,
            msg: data.msg || "",
            status: data.status || "",
            type: data.type || "",
            rejectionReason: data.rejectionReason || "",
            requestId: data.changeReqId || "",
            fromName: data.fromName || "",
            date: data.date || "",
            requestedStatus: data.requestedStatus || "",
            requestedCheckIn: data.requestedCheckIn || "",
            requestedCheckOut: data.requestedCheckOut || "",
          }];
        });
      });
    }, () => {});
    return () => unsub();
  }, [user?.uid]);

  const handleApproveRequest = async (req) => {
    await setDoc(doc(db, "attendance", `${req.date}_${req.uid}`), {
      uid: req.uid, name: req.name, date: req.date,
      month: req.date.slice(0, 7), companyName: company,
      status: "출근", checkInTime: req.requestedAt,
      source: "request_approved",
    }, { merge: true });
    await deleteDoc(doc(db, "attendanceRequests", req.id));
    await addDoc(collection(db, "notifications"), {
      toUid: req.uid, type: "attendance_result", status: "approved",
      msg: `[출근요청] ${req.date} 출근 요청이 승인되었습니다.`,
      read: false, createdAt: serverTimestamp(), companyName: company,
    });
  };

  const handleRejectRequest = async (req, rejectionReason) => {
    await deleteDoc(doc(db, "attendanceRequests", req.id));
    await addDoc(collection(db, "notifications"), {
      toUid: req.uid, type: "attendance_result", status: "rejected",
      rejectionReason: rejectionReason || "",
      msg: `[출근요청] ${req.date} 출근 요청이 거절되었습니다.`,
      read: false, createdAt: serverTimestamp(), companyName: company,
    });
  };

  const approveChangeRequest = async (req) => {
    await setDoc(doc(db, "attendance", `${req.date}_${req.uid}`), {
      uid: req.uid, name: req.name, date: req.date,
      month: req.date.slice(0, 7), companyName: company,
      status: req.requestedStatus,
      checkInTime: req.requestedCheckIn || null,
      checkOutTime: req.requestedCheckOut || null,
      source: "change_request_approved",
    }, { merge: true });
    await setDoc(doc(db, "attendanceChangeRequests", req.id), { status: "approved" }, { merge: true });
    await addDoc(collection(db, "notifications"), {
      toUid: req.uid, type: "attendance_result", status: "approved",
      msg: `[출근수정] ${req.date} 수정 요청이 승인되었습니다.`,
      read: false, createdAt: serverTimestamp(), companyName: company,
    });
  };

  const rejectChangeRequest = async (req, rejectionReason) => {
    await setDoc(doc(db, "attendanceChangeRequests", req.id), { status: "rejected", rejectionReason }, { merge: true });
    await addDoc(collection(db, "notifications"), {
      toUid: req.uid, type: "attendance_result", status: "rejected",
      rejectionReason,
      msg: `[출근수정] ${req.date} 수정 요청이 거절되었습니다.`,
      read: false, createdAt: serverTimestamp(), companyName: company,
    });
  };

  const submitChangeRequest = async () => {
    if (!changeRequestCell || !user?.uid) return;
    setSubmittingChangeReq(true);
    try {
      const checkInIso = changeReqStatus === "출근" && changeReqTime ? `${changeRequestCell.date}T${changeReqTime}:00` : null;
      const checkOutIso = changeReqStatus === "출근" && changeReqCheckOut ? `${changeRequestCell.date}T${changeReqCheckOut}:00` : null;
      const docRef = await addDoc(collection(db, "attendanceChangeRequests"), {
        uid: user.uid, name: changeRequestCell.emp.name || user.email,
        date: changeRequestCell.date,
        requestedStatus: changeReqStatus,
        requestedCheckIn: checkInIso,
        requestedCheckOut: checkOutIso,
        reason: changeReqReason,
        companyName: company,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      const admins = employees.filter(e =>
        role === "hrManager"
          ? e.role === "totalMaster"
          : (e.role === "totalMaster" || e.role === "hrManager")
      );
      for (const admin of admins) {
        await addDoc(collection(db, "notifications"), {
          toUid: admin.uid, type: "attendance_change_request",
          fromName: changeRequestCell.emp.name || user.email,
          date: changeRequestCell.date, requestedStatus: changeReqStatus,
          requestedCheckIn: checkInIso, requestedCheckOut: checkOutIso,
          changeReqId: docRef.id,
          companyName: company, read: false, createdAt: serverTimestamp(),
          msg: `[출근수정요청] ${changeRequestCell.emp.name || user.email}님이 ${changeRequestCell.date} 수정 요청을 했습니다.`,
        });
      }
      setChangeRequestCell(null);
      setChangeReqReason("");
    } finally {
      setSubmittingChangeReq(false);
    }
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

  const rejectedChangeMap = useMemo(() => {
    const m = {};
    changeRequests.filter(r => r.status === "rejected").forEach(r => { m[`${r.uid}_${r.date}`] = r.rejectionReason || "사유 없음"; });
    return m;
  }, [changeRequests]);

  const visibleEmployees = useMemo(() => {
    const base = isAdmin ? employees : employees.filter(e => e.uid === user?.uid);
    return base.filter(e => !hiddenEmpUids.includes(e.uid));
  }, [employees, isAdmin, user, hiddenEmpUids]);

  const resolveStatus = (uid, ds, name) => {
    const rec = recordMap[`${uid}_${ds}`];
    if (rec && rec.status) return { status: rec.status, rec };
    if (ds > todayDateStr) return { status: null, rec: null };
    if (isHoliday(ds, holidays)) return { status: "공휴일", rec: null };
    if (isWeekend(ds)) return { status: "휴무", rec: null };
    const leave = findApprovedLeaveForDate(schedules, uid, ds, name);
    if (leave) return { status: leave, rec: null };
    return { status: null, rec: null };
  };

  const isLate = (rec, emp) => {
    if (!rec?.checkInTime || !emp?.workStartTime) return false;
    const checkInMin = timeToMinutes(fmtTime(rec.checkInTime));
    const startMin = timeToMinutes(emp.workStartTime);
    if (checkInMin == null || startMin == null) return false;
    return checkInMin > startMin;
  };

  // 오늘 현재 사용자 출근 레코드
  const myTodayRec = user?.uid ? recordMap[`${user.uid}_${todayDateStr}`] : null;
  const myEmp = employees.find(e => e.uid === user?.uid);

  // ─── 출근 수정 저장 ──────────────────────────────────────────
  const saveEdit = async (status, checkInTime, checkOutTime, lateReason) => {
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
      lateReason: (status === "출근" && lateReason) ? lateReason : null,
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
              <button onClick={() => setShowEmpFilter(v => !v)}
                className={`px-3 py-1.5 rounded-lg border text-[13px] font-bold transition ${showEmpFilter ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "border-gray-200 text-[#1B2B4B] hover:bg-gray-50"}`}>
                직원 관리
              </button>
              {isAdmin && canApproveRequests && checkInRequests.length > 0 && (
                <button onClick={() => setShowRequestPanel(true)}
                  className="relative px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] font-bold text-[#1B2B4B] hover:bg-gray-50 transition">
                  출근요청
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#1B2B4B] text-white text-[10px] font-bold flex items-center justify-center">{checkInRequests.length}</span>
                </button>
              )}
              {canApproveRequests && changeRequests.filter(r => r.status === "pending").length > 0 && (
                <button onClick={() => setShowChangeReqPanel(true)}
                  className="relative px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] font-bold text-[#1B2B4B] hover:bg-gray-50 transition">
                  수정요청
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#1B2B4B] text-white text-[10px] font-bold flex items-center justify-center">
                    {changeRequests.filter(r => r.status === "pending").length}
                  </span>
                </button>
              )}
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

      {/* 출근 요청 모달 */}
      {showRequestPanel && canApproveRequests && (
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4" onClick={() => setShowRequestPanel(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="text-[16px] font-black text-[#1B2B4B]">출근 요청 <span className="ml-1 px-1.5 py-0.5 rounded bg-[#1B2B4B] text-white text-[12px]">{checkInRequests.length}</span></div>
              <button onClick={() => setShowRequestPanel(false)} className="text-gray-400 font-bold text-[20px]">×</button>
            </div>
            <div className="space-y-2">
              {checkInRequests.map(req => (
                <CheckInReqRow key={req.id} req={req} onApprove={handleApproveRequest} onReject={handleRejectRequest} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 수정 요청 모달 (hrManager/totalMaster) */}
      {showChangeReqPanel && canApproveRequests && (
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4" onClick={() => setShowChangeReqPanel(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="text-[16px] font-black text-[#1B2B4B]">수정 요청 <span className="ml-1 px-1.5 py-0.5 rounded bg-[#1B2B4B] text-white text-[12px]">{changeRequests.filter(r => r.status === "pending").length}</span></div>
              <button onClick={() => setShowChangeReqPanel(false)} className="text-gray-400 font-bold text-[20px]">×</button>
            </div>
            <div className="space-y-2">
              {changeRequests.filter(r => r.status === "pending").map(req => (
                <ChangeReqRow key={req.id} req={req} onApprove={approveChangeRequest} onReject={rejectChangeRequest} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 직원: 거절된 수정 요청 표시 */}
      {!canEditAttendance && changeRequests.filter(r => r.status === "rejected").length > 0 && (
        <div className="border border-gray-200 rounded-xl p-3 mb-4">
          <div className="text-[13px] font-bold text-[#1B2B4B] mb-2">거절된 수정 요청</div>
          {changeRequests.filter(r => r.status === "rejected").map(req => (
            <div key={req.id} className="bg-gray-50 rounded-lg px-3 py-2 mb-1.5">
              <div className="text-[12px] font-semibold text-gray-700">{req.date} · {req.requestedStatus}</div>
              <div className="text-[12px] text-gray-500">거절 사유: {req.rejectionReason || "사유 없음"}</div>
            </div>
          ))}
        </div>
      )}

      {/* 오늘 내 출퇴근 카드 (비관리자 / 당일만) */}
      {!isAdmin && myEmp && month === now.getMonth() + 1 && year === now.getFullYear() && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 flex items-center gap-4">
          <div className="flex-1">
            <div className="text-[13px] font-bold text-[#1B2B4B] mb-1">오늘 출퇴근</div>
            <div className="flex items-center gap-3 text-[13px] text-gray-600">
              <span>출근 : <span className="font-bold text-[#1B2B4B]">{myTodayRec?.checkInTime ? fmtTime(myTodayRec.checkInTime) : "미출근"}</span></span>
              <span>퇴근 : <span className="font-bold text-[#1B2B4B]">{myTodayRec?.checkOutTime ? fmtTime(myTodayRec.checkOutTime) : "-"}</span></span>
              {myTodayRec?.checkInTime && myEmp?.workStartTime && isLate(myTodayRec, myEmp) && (
                <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-500 text-[11px] font-bold">지각</span>
              )}
            </div>
            {myEmp?.workStartTime && (
              <div className="text-[11px] text-gray-400 mt-1">정규 근무: {myEmp.workStartTime} ~ {myEmp.workEndTime || "-"}</div>
            )}
          </div>
          <div className="flex flex-col gap-2 items-end">
            {myTodayRec?.status === "출근" && !myTodayRec?.checkOutTime && (
              <button onClick={handleCheckOut}
                className="px-4 py-2 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition">
                퇴근
              </button>
            )}
            {!myTodayRec?.status && !isWeekend(todayDateStr) && !isHoliday(todayDateStr, holidays) && (() => {
              const myPendingReq = checkInRequests.find(r => r.uid === user?.uid && r.date === todayDateStr);
              return myPendingReq ? (
                <div className="text-[12px] text-gray-600 font-bold px-3 py-1.5 bg-gray-100 rounded-lg border border-gray-200">요청 대기 중...</div>
              ) : (
                <button onClick={() => {
                  const n = new Date();
                  setRequestCheckInTime(String(n.getHours()).padStart(2, "0") + ":" + String(n.getMinutes()).padStart(2, "0"));
                  setShowCheckInRequestModal(true);
                }} disabled={requestingCheckIn}
                  className="px-4 py-2 rounded-lg border-2 border-[#1B2B4B] text-[#1B2B4B] text-[13px] font-bold hover:bg-[#1B2B4B] hover:text-white transition disabled:opacity-50">
                  {requestingCheckIn ? "요청 중..." : "출근 요청"}
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {/* 관리자용 오늘 내 출퇴근 버튼 */}
      {isAdmin && month === now.getMonth() + 1 && year === now.getFullYear() && (
        <div className="flex items-center justify-end gap-2 mb-3">
          {myTodayRec?.status === "출근" && !myTodayRec?.checkOutTime && (
            <button onClick={handleCheckOut}
              className="px-4 py-2 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition">
              내 퇴근 처리
            </button>
          )}
          {!myTodayRec?.status && !isWeekend(todayDateStr) && !isHoliday(todayDateStr, holidays) && (() => {
            const myPendingReq = checkInRequests.find(r => r.uid === user?.uid && r.date === todayDateStr);
            return myPendingReq ? (
              <div className="text-[12px] text-gray-600 font-bold px-3 py-1.5 bg-gray-100 rounded-lg border border-gray-200">출근 요청 대기 중...</div>
            ) : null;
          })()}
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
        {!canEditAttendance && <span className="ml-auto text-gray-400">최고관리자만 직접 수정 가능합니다.</span>}
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
                  const checkIn = rec?.checkInTime ? fmtTime(rec.checkInTime) : "";
                  const checkOut = rec?.checkOutTime ? fmtTime(rec.checkOutTime) : "";
                  const tooltipText = [
                    effStatus ? `상태: ${effStatus}` : "",
                    checkIn ? `출근: ${checkIn}` : "",
                    checkOut ? `퇴근: ${checkOut}` : "",
                    late ? "지각" : "",
                    rec?.lateReason ? `사유: ${rec.lateReason}` : "",
                  ].filter(Boolean).join(" · ");

                  const isOwnRecord = emp.uid === user?.uid;
                  const clickable = canEditAttendance || isOwnRecord;
                  const rejKey = `${emp.uid}_${ds}`;
                  const hasRejected = !!rejectedChangeMap[rejKey];

                  return (
                    <td key={d} className={`px-0.5 py-1.5 text-center border-b border-gray-50 ${ds === todayDateStr ? "bg-[#1B2B4B]/5" : ""}`}>
                      <button
                        disabled={!clickable}
                        onClick={() => {
                          if (!clickable) return;
                          if (canEditAttendance) {
                            setEditCell({ uid: emp.uid, name: emp.name || emp.email, date: ds, current: rec, workStartTime: emp.workStartTime });
                          } else if (isOwnRecord) {
                            const defaultTime = rec?.checkInTime ? fmtTime(rec.checkInTime) : "09:00";
                            const defaultCheckOut = rec?.checkOutTime ? fmtTime(rec.checkOutTime) : "";
                            setChangeReqStatus(effStatus || "출근");
                            setChangeReqTime(defaultTime);
                            setChangeReqCheckOut(defaultCheckOut);
                            setChangeReqReason("");
                            setChangeRequestCell({ emp, date: ds, status: effStatus, rec });
                          }
                        }}
                        className={`w-9 h-7 mx-auto rounded text-[11px] font-bold flex flex-col items-center justify-center relative ${colorCls || "bg-gray-50 text-gray-300"} ${clickable ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                        title={hasRejected ? `거절: ${rejectedChangeMap[rejKey]}` : tooltipText}
                      >
                        <span>{label || "·"}</span>
                        {late && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" title="지각" />}
                        {hasRejected && !late && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" title="수정요청 거절" />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PC 알림 배너 */}
      {pcNotifQueue.length > 0 && (() => {
        const notif = pcNotifQueue[0];
        const dismissPcNotif = async () => {
          try { await updateDoc(doc(db, "notifications", notif.id), { read: true }); } catch {}
          setPcNotifQueue(prev => prev.slice(1));
          setPcNotifShowReject(false);
          setPcNotifRejectInput("");
        };
        const isRequest = notif.type === "attendance_change_request" || notif.type === "attendance_check_in_request";
        // Find the actual request for inline approve/reject
        const reqForBanner = isRequest
          ? (notif.type === "attendance_change_request"
              ? changeRequests.find(r => r.id === notif.requestId)
              : checkInRequests.find(r => r.uid === notif.fromName))
          : null;
        return (
          <div className="fixed top-4 right-4 z-[99999] max-w-sm w-full">
            <div className="bg-[#1B2B4B] text-white rounded-xl shadow-2xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="text-[13px] font-semibold leading-snug flex-1">{notif.msg}</div>
                <button onClick={dismissPcNotif} className="text-white/60 hover:text-white font-bold text-[18px] leading-none shrink-0">×</button>
              </div>
              {pcNotifQueue.length > 1 && (
                <div className="text-[11px] text-white/50">외 {pcNotifQueue.length - 1}건</div>
              )}
              {isRequest && canApproveRequests && (
                <div className="space-y-2 pt-1">
                  {!pcNotifShowReject ? (
                    <div className="flex gap-2">
                      <button onClick={async () => {
                        if (notif.type === "attendance_change_request") {
                          const req = changeRequests.find(r => r.id === notif.requestId);
                          if (req) await approveChangeRequest(req);
                        } else {
                          const req = checkInRequests.find(r => r.uid === notif.fromName);
                          if (req) await handleApproveRequest(req);
                        }
                        await dismissPcNotif();
                      }} className="flex-1 py-1.5 rounded-lg border border-white/30 text-white text-[12px] font-bold hover:bg-white/10">승인</button>
                      <button onClick={() => { setPcNotifShowReject(true); setPcNotifRejectInput(""); }}
                        className="flex-1 py-1.5 rounded-lg border border-white/30 text-white/70 text-[12px] font-bold hover:bg-white/10">거절</button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <input type="text" placeholder="거절 사유" value={pcNotifRejectInput} onChange={e => setPcNotifRejectInput(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-white/30 bg-white/10 text-white text-[12px] placeholder-white/40 outline-none" />
                      <div className="flex gap-2">
                        <button onClick={() => { setPcNotifShowReject(false); setPcNotifRejectInput(""); }}
                          className="flex-1 py-1.5 rounded-lg border border-white/30 text-white/60 text-[12px] font-bold">취소</button>
                        <button onClick={async () => {
                          if (notif.type === "attendance_change_request") {
                            const req = changeRequests.find(r => r.id === notif.requestId);
                            if (req) await rejectChangeRequest(req, pcNotifRejectInput);
                          } else {
                            const req = checkInRequests.find(r => r.uid === notif.fromName);
                            if (req) await handleRejectRequest(req, pcNotifRejectInput);
                          }
                          await dismissPcNotif();
                        }} className="flex-1 py-1.5 rounded-lg bg-white/20 text-white text-[12px] font-bold">확인</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {notif.type === "attendance_result" && notif.rejectionReason && (
                <div className="text-[11px] text-white/60">거절 사유: {notif.rejectionReason}</div>
              )}
            </div>
          </div>
        );
      })()}

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

      {/* 수정 요청 모달 (비관리자 본인 레코드) */}
      {changeRequestCell && (
        <div className="fixed inset-0 z-[99999] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <div>
              <div className="text-[15px] font-bold text-[#1B2B4B]">수정 요청</div>
              <div className="text-[12px] text-gray-500">{changeRequestCell.date} · {changeRequestCell.emp.name}</div>
            </div>
            {(() => {
              const rejKey = changeRequestCell ? `${changeRequestCell.emp.uid}_${changeRequestCell.date}` : "";
              const rejReason = rejKey ? rejectedChangeMap[rejKey] : null;
              return rejReason ? (
                <div className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
                  <div className="text-[11px] font-bold text-gray-500 mb-0.5">이전 요청 거절 사유</div>
                  <div className="text-[12px] text-gray-700">{rejReason}</div>
                </div>
              ) : null;
            })()}
            <div>
              <div className="text-[12px] font-semibold text-gray-600 mb-2">상태</div>
              <select value={changeReqStatus} onChange={e => setChangeReqStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-[14px] font-bold text-[#1B2B4B] focus:border-[#1B2B4B] outline-none">
                {["출근","휴무","연차","오전반차","오후반차","외근","병가","경조사","조퇴"].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {changeReqStatus === "출근" && (
              <>
                <div>
                  <div className="text-[12px] font-semibold text-gray-600 mb-1">출근 시간</div>
                  <input type="time" value={changeReqTime} onChange={e => setChangeReqTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-[14px] font-bold text-[#1B2B4B] outline-none focus:border-[#1B2B4B]" />
                </div>
                <div>
                  <div className="text-[12px] font-semibold text-gray-600 mb-1">퇴근 시간 (선택)</div>
                  <input type="time" value={changeReqCheckOut} onChange={e => setChangeReqCheckOut(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-[14px] font-bold text-[#1B2B4B] outline-none focus:border-[#1B2B4B]" />
                </div>
              </>
            )}
            <div>
              <div className="text-[12px] font-semibold text-gray-600 mb-1">요청 사유</div>
              <input type="text" placeholder="변경 요청 사유를 입력하세요"
                value={changeReqReason} onChange={e => setChangeReqReason(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-[13px] text-[#1B2B4B] outline-none focus:border-[#1B2B4B]" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setChangeRequestCell(null)}
                className="flex-1 py-2.5 rounded-lg border border-gray-200 text-[13px] font-bold text-gray-600">취소</button>
              <button onClick={submitChangeRequest} disabled={submittingChangeReq}
                className="flex-1 py-2.5 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold disabled:opacity-50">
                {submittingChangeReq ? "요청 중..." : "요청"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 출근 요청 시간 입력 모달 */}
      {showCheckInRequestModal && (
        <div className="fixed inset-0 z-[99999] bg-black/40 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
            <div className="text-[15px] font-bold text-[#1B2B4B] mb-1">출근 요청</div>
            <div className="text-[12px] text-gray-500 mb-4">실제 출근한 시간을 입력하세요. 관리자 승인 후 출근 처리됩니다.</div>
            <div className="mb-4">
              <div className="text-[12px] font-semibold text-gray-600 mb-1">출근 시간</div>
              <input type="time" value={requestCheckInTime} onChange={e => setRequestCheckInTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 text-[15px] font-bold text-[#1B2B4B] outline-none focus:border-[#1B2B4B]" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowCheckInRequestModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-bold text-gray-600">취소</button>
              <button onClick={async () => {
                if (!requestCheckInTime) return;
                setRequestingCheckIn(true);
                try {
                  const [h, m] = requestCheckInTime.split(":").map(Number);
                  const dt = new Date(todayDateStr + "T00:00:00");
                  dt.setHours(h, m, 0, 0);
                  const myName = employees.find(e => e.uid === user?.uid)?.name || user?.email || "";
                  await addDoc(collection(db, "attendanceRequests"), {
                    uid: user.uid, name: myName, date: todayDateStr,
                    requestedAt: dt.toISOString(),
                    companyName: company, status: "pending",
                    createdAt: serverTimestamp(),
                  });
                  const admins = employees.filter(e =>
                    role === "hrManager"
                      ? e.role === "totalMaster"
                      : (e.role === "totalMaster" || e.role === "hrManager")
                  );
                  for (const admin of admins) {
                    await addDoc(collection(db, "notifications"), {
                      toUid: admin.uid, type: "attendance_check_in_request",
                      fromName: myName, date: todayDateStr,
                      companyName: company, read: false, createdAt: serverTimestamp(),
                      msg: `[출근요청] ${myName || user?.email}님이 ${todayDateStr} 출근 요청을 했습니다.`,
                    });
                  }
                  setShowCheckInRequestModal(false);
                } finally {
                  setRequestingCheckIn(false);
                }
              }} disabled={requestingCheckIn || !requestCheckInTime}
                className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold disabled:opacity-50">
                {requestingCheckIn ? "요청 중..." : "요청"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 근무시간 편집 모달 */}
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

      {/* 직원 표시 관리 모달 */}
      {showEmpFilter && isAdmin && (
        <div className="fixed inset-0 z-[99999] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-[#1B2B4B] px-5 py-4 flex items-center justify-between">
              <div className="text-white font-bold text-[15px]">직원 표시 관리</div>
              <button onClick={() => setShowEmpFilter(false)} className="text-white/70 hover:text-white font-bold text-[18px]">×</button>
            </div>
            <div className="px-4 py-3 border-b border-gray-100">
              <input type="text" placeholder="이름 검색..."
                value={empFilterSearch} onChange={e => setEmpFilterSearch(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] outline-none focus:border-[#1B2B4B]" />
            </div>
            <div className="px-4 py-2 max-h-96 overflow-y-auto divide-y divide-gray-50">
              {employees.filter(emp => !empFilterSearch || (emp.name || emp.email || "").includes(empFilterSearch)).map(emp => (
                <label key={emp.uid} className="flex items-center gap-3 py-2.5 cursor-pointer">
                  <input type="checkbox"
                    checked={!hiddenEmpUids.includes(emp.uid)}
                    onChange={() => toggleHideEmp(emp.uid)}
                    className="w-4 h-4 accent-[#1B2B4B]" />
                  <span className="flex-1 text-[14px] font-semibold text-gray-800">{emp.name || emp.email}</span>
                  {emp.workStartTime && <span className="text-[11px] text-gray-400">{emp.workStartTime}~{emp.workEndTime || "-"}</span>}
                </label>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setShowEmpFilter(false)}
                className="px-5 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CheckInReqRow({ req, onApprove, onReject }) {
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-bold text-[#1B2B4B]">{req.name}</div>
          <div className="text-[12px] text-gray-500">{req.date} · {fmtTime(req.requestedAt)} 출근 요청</div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button onClick={() => onApprove(req)} className="px-3 py-1 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-bold">승인</button>
          <button onClick={() => setShowRejectInput(v => !v)} className="px-3 py-1 rounded-lg border border-gray-200 text-gray-500 text-[12px] font-bold">거절</button>
        </div>
      </div>
      {showRejectInput && (
        <div className="mt-2 flex gap-1.5">
          <input type="text" placeholder="거절 사유" value={rejectReason} onChange={e => setRejectReason(e.target.value)}
            className="flex-1 px-2 py-1 rounded-lg border border-gray-200 text-[12px] outline-none focus:border-[#1B2B4B]" />
          <button onClick={() => onReject(req, rejectReason)}
            className="px-3 py-1 rounded-lg bg-gray-800 text-white text-[12px] font-bold">확인</button>
        </div>
      )}
    </div>
  );
}

function ChangeReqRow({ req, onApprove, onReject }) {
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-bold text-[#1B2B4B]">{req.name} · {req.date}</div>
          <div className="text-[12px] text-gray-500">
            {req.requestedStatus}{req.requestedCheckIn ? ` · ${req.requestedCheckIn.slice(11, 16)}` : ""}
            {req.requestedCheckOut ? ` ~ ${req.requestedCheckOut.slice(11, 16)}` : ""}
          </div>
          {req.reason && <div className="text-[11px] text-gray-400 mt-0.5">사유: {req.reason}</div>}
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button onClick={() => onApprove(req)} className="px-3 py-1 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-bold">승인</button>
          <button onClick={() => setShowRejectInput(v => !v)} className="px-3 py-1 rounded-lg border border-gray-200 text-gray-500 text-[12px] font-bold">거절</button>
        </div>
      </div>
      {showRejectInput && (
        <div className="mt-2 flex gap-1.5">
          <input type="text" placeholder="거절 사유" value={rejectReason} onChange={e => setRejectReason(e.target.value)}
            className="flex-1 px-2 py-1 rounded-lg border border-gray-200 text-[12px] outline-none focus:border-[#1B2B4B]" />
          <button onClick={() => onReject(req, rejectReason)}
            className="px-3 py-1 rounded-lg bg-gray-800 text-white text-[12px] font-bold">확인</button>
        </div>
      )}
    </div>
  );
}

function EditForm({ editCell, onSave, onCancel }) {
  const [status, setStatus] = useState(editCell.current?.status || "출근");
  const [time, setTime] = useState(editCell.current?.checkInTime ? fmtTime(editCell.current.checkInTime) : "09:00");
  const [checkOutTime, setCheckOutTime] = useState(editCell.current?.checkOutTime ? fmtTime(editCell.current.checkOutTime) : "");
  const [lateReason, setLateReason] = useState(editCell.current?.lateReason || "");
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
          {(() => {
            const [sh, sm] = (editCell.workStartTime || "09:00").split(":").map(Number);
            const [ch, cm] = time.split(":").map(Number);
            const isLateCheck = ch * 60 + cm > sh * 60 + sm;
            return isLateCheck ? (
              <div>
                <div className="text-[11px] text-gray-500 mb-1">지각 사유</div>
                <input type="text" placeholder="지각 사유를 입력하세요 (선택)"
                  value={lateReason} onChange={e => setLateReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[12px] outline-none focus:border-[#1B2B4B]" />
              </div>
            ) : null;
          })()}
        </>
      )}
      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-[13px] font-bold hover:bg-gray-50">취소</button>
        {editCell.current && (
          <button onClick={() => onSave(null, null, null)}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-500 text-[13px] font-bold hover:bg-gray-50">초기화</button>
        )}
        <button onClick={() => onSave(status, status === "출근" ? `${editCell.date}T${time}:00` : null, status === "출근" && checkOutTime ? `${editCell.date}T${checkOutTime}:00` : null, lateReason)}
          className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60]">저장</button>
      </div>
      {editCell.current?.history?.length > 0 && (
        <div className="pt-3 border-t border-gray-100">
          <div className="text-[12px] font-bold text-[#1B2B4B] mb-1.5">수정 이력</div>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {[...editCell.current.history].sort((a, b) => (b.editedAt || "").localeCompare(a.editedAt || "")).map((h, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] text-gray-500 bg-gray-50 rounded-lg px-2.5 py-1.5">
                <span className="font-semibold text-gray-600">
                  {h.status}{h.checkInTime ? ` · 출근${fmtTime(h.checkInTime)}` : ""}{h.checkOutTime ? ` · 퇴근${fmtTime(h.checkOutTime)}` : ""}
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
