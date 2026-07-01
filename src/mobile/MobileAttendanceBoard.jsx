import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, setDoc, where, addDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { ATTENDANCE_STATUS_COLOR, isWeekend, isHoliday, findApprovedLeaveForDate } from "../attendanceUtils";

const ADMIN_ROLES = ["totalMaster", "admin"];

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

export default function MobileAttendanceBoard({ userCompany, role, currentUser }) {
  const isAdmin = ADMIN_ROLES.includes(role);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [myUserDoc, setMyUserDoc] = useState(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkInRequests, setCheckInRequests] = useState([]);
  const [requestingCheckIn, setRequestingCheckIn] = useState(false);
  const [showRequestPanel, setShowRequestPanel] = useState(false);

  // 출근 요청 시간 모달
  const [showCheckInRequestModal, setShowCheckInRequestModal] = useState(false);
  const [requestCheckInTime, setRequestCheckInTime] = useState("");

  // 모바일 날짜 셀 편집 (hrManager 권한용)
  const [mobileEditCell, setMobileEditCell] = useState(null);
  const [mobileEditStatus, setMobileEditStatus] = useState("출근");
  const [mobileEditTime, setMobileEditTime] = useState("09:00");
  const [mobileEditCheckOut, setMobileEditCheckOut] = useState("");
  const [mobileEditLateReason, setMobileEditLateReason] = useState("");
  const [savingMobileEdit, setSavingMobileEdit] = useState(false);

  // 출근지 설정
  const [officeLocation, setOfficeLocation] = useState(null);
  const [showOfficePanel, setShowOfficePanel] = useState(false);
  const [officeInput, setOfficeInput] = useState({ lat: "", lng: "", address: "" });
  const [savingOffice, setSavingOffice] = useState(false);
  const [gettingLoc, setGettingLoc] = useState(false);

  const company = userCompany || localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "";
  const uid = currentUser?.uid;
  const myName = myUserDoc?.name || currentUser?.displayName || currentUser?.name || currentUser?.email?.split("@")[0] || "";

  const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

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

  // 출근지 구독
  useEffect(() => {
    if (!company) return;
    const unsub = onSnapshot(doc(db, "companySettings", company), snap => {
      const data = snap.data();
      setOfficeLocation(data?.officeLocation || null);
      if (data?.officeLocation) {
        setOfficeInput({ lat: String(data.officeLocation.lat), lng: String(data.officeLocation.lng), address: data.officeLocation.address || "" });
      }
    }, () => {});
    return () => unsub();
  }, [company]);

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
    if (!navigator.geolocation) { alert("위치 기능을 지원하지 않습니다."); return; }
    setGettingLoc(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setOfficeInput({ lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6), address: "현재 위치" }); setGettingLoc(false); },
      () => { alert("위치 정보를 가져올 수 없습니다."); setGettingLoc(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // 출근 요청 구독 (관리자: 회사 전체, 직원: 내 요청)
  useEffect(() => {
    if (!company) return;
    const q = isAdmin
      ? query(collection(db, "attendanceRequests"), where("companyName", "==", company), where("status", "==", "pending"))
      : (uid ? query(collection(db, "attendanceRequests"), where("uid", "==", uid), where("status", "==", "pending")) : null);
    if (!q) return;
    const unsub = onSnapshot(q, snap => {
      setCheckInRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, [company, uid, isAdmin]);

  const handleApproveRequest = async (req) => {
    await setDoc(doc(db, "attendance", `${req.date}_${req.uid}`), {
      uid: req.uid, name: req.name, date: req.date,
      month: req.date.slice(0, 7), companyName: company,
      status: "출근", checkInTime: req.requestedAt,
      source: "request_approved",
    }, { merge: true });
    await deleteDoc(doc(db, "attendanceRequests", req.id));
  };

  const handleRejectRequest = async (req) => {
    await deleteDoc(doc(db, "attendanceRequests", req.id));
  };

  const recordMap = useMemo(() => {
    const m = {};
    records.forEach(r => { m[r.date] = r; });
    return m;
  }, [records]);

  const numDays = daysInMonth(year, month);
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
    const [ch, cm] = fmtTime(rec.checkInTime).split(":").map(Number);
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

  const saveMobileEdit = async () => {
    if (!mobileEditCell || !uid) return;
    setSavingMobileEdit(true);
    try {
      const { date } = mobileEditCell;
      const checkInIso = mobileEditStatus === "출근" && mobileEditTime ? `${date}T${mobileEditTime}:00` : null;
      const checkOutIso = mobileEditStatus === "출근" && mobileEditCheckOut ? `${date}T${mobileEditCheckOut}:00` : null;
      await setDoc(doc(db, "attendance", `${date}_${uid}`), {
        uid, name: myName, date, month: date.slice(0, 7), companyName: company,
        status: mobileEditStatus || null,
        checkInTime: checkInIso,
        checkOutTime: checkOutIso,
        lateReason: mobileEditLateReason || null,
        source: "manual_mobile",
      }, { merge: true });
      setMobileEditCell(null);
    } finally {
      setSavingMobileEdit(false);
    }
  };

  const canEditAttendance = role === "totalMaster" || role === "hrManager";

  return (
    <div className="px-3 py-3 space-y-3 pb-24">
      {/* 관리자: 출근지 설정 */}
      {isAdmin && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[13px] font-bold text-[#1B2B4B]">출근지 설정</div>
              {officeLocation ? (
                <div className="text-[11px] text-blue-600 mt-0.5">{officeLocation.address || `${officeLocation.lat?.toFixed(5)}, ${officeLocation.lng?.toFixed(5)}`}</div>
              ) : (
                <div className="text-[11px] text-gray-400 mt-0.5">미설정 — 설정 후 GPS 자동 출근 활성화</div>
              )}
            </div>
            <button onClick={() => setShowOfficePanel(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold border transition ${showOfficePanel ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "border-gray-200 text-[#1B2B4B]"}`}>
              {showOfficePanel ? "닫기" : "설정"}
            </button>
          </div>
          {showOfficePanel && (
            <div className="border-t border-gray-100 pt-3 space-y-2">
              <button onClick={getCurrentLocation} disabled={gettingLoc}
                className="w-full py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold disabled:opacity-50">
                {gettingLoc ? "위치 가져오는 중..." : "현재 위치를 출근지로 설정"}
              </button>
              <div className="text-[11px] text-gray-400 text-center">또는 직접 입력</div>
              <div className="flex gap-2 min-w-0">
                <input type="number" step="0.000001" placeholder="위도"
                  value={officeInput.lat} onChange={e => setOfficeInput(p => ({ ...p, lat: e.target.value }))}
                  className="min-w-0 flex-1 w-0 px-2 py-2 rounded-xl border-2 border-gray-200 text-[12px] font-bold text-[#1B2B4B] outline-none focus:border-[#1B2B4B]" />
                <input type="number" step="0.000001" placeholder="경도"
                  value={officeInput.lng} onChange={e => setOfficeInput(p => ({ ...p, lng: e.target.value }))}
                  className="min-w-0 flex-1 w-0 px-2 py-2 rounded-xl border-2 border-gray-200 text-[12px] font-bold text-[#1B2B4B] outline-none focus:border-[#1B2B4B]" />
              </div>
              <input type="text" placeholder="장소명 (예: 본사 사무실)"
                value={officeInput.address} onChange={e => setOfficeInput(p => ({ ...p, address: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-[12px] text-[#1B2B4B] outline-none focus:border-[#1B2B4B]" />
              <div className="text-[10px] text-gray-400">반경 100m 이내 진입 시 자동 출근 · 300m 이탈 시 자동 퇴근</div>
              <button onClick={saveOfficeLocation} disabled={savingOffice}
                className="w-full py-2.5 rounded-xl border border-[#1B2B4B] text-[#1B2B4B] text-[13px] font-bold disabled:opacity-40">
                {savingOffice ? "저장 중..." : "저장"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 관리자: 출근 요청 처리 패널 */}
      {isAdmin && checkInRequests.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3">
          <button onClick={() => setShowRequestPanel(v => !v)}
            className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[#1B2B4B]">출근 요청</span>
              <span className="px-2 py-0.5 rounded-full bg-[#1B2B4B] text-white text-[11px] font-bold">{checkInRequests.length}건</span>
            </div>
            <span className="text-gray-400 text-[12px]">{showRequestPanel ? "접기" : "펼치기"}</span>
          </button>
          {showRequestPanel && (
            <div className="border-t border-gray-100 mt-3 pt-3 space-y-2">
              {checkInRequests.map(req => (
                <div key={req.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                  <div>
                    <div className="text-[13px] font-bold text-[#1B2B4B]">{req.name}</div>
                    <div className="text-[11px] text-gray-500">{req.date} · 요청 {fmtTime(req.requestedAt)}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleApproveRequest(req)}
                      className="px-3 py-1.5 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-bold">승인</button>
                    <button onClick={() => handleRejectRequest(req)}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-[12px] font-bold">거절</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 오늘 출퇴근 현황 카드 */}
      {month === now.getMonth() + 1 && year === now.getFullYear() && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-[13px] font-bold text-[#1B2B4B] mb-2">오늘 출퇴근</div>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3 text-[13px]">
                <span className="text-gray-500">출근</span>
                <span className="font-bold text-[#1B2B4B]">{todayRec?.checkInTime ? fmtTime(todayRec.checkInTime) : "미출근"}</span>
                {todayRec?.checkInTime && isLate(todayRec) && (
                  <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-500 text-[11px] font-bold">지각</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[13px]">
                <span className="text-gray-500">퇴근</span>
                <span className="font-bold text-[#1B2B4B]">{todayRec?.checkOutTime ? fmtTime(todayRec.checkOutTime) : "-"}</span>
              </div>
              {myUserDoc?.workStartTime && (
                <div className="text-[11px] text-gray-400">정규: {myUserDoc.workStartTime} ~ {myUserDoc.workEndTime || "-"}</div>
              )}
            </div>
            <div className="flex flex-col gap-2 items-end">
              {todayRec?.status === "출근" && !todayRec?.checkOutTime && (
                <button onClick={handleCheckOut} disabled={checkingOut}
                  className="px-5 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold disabled:opacity-50">
                  {checkingOut ? "처리 중..." : "퇴근"}
                </button>
              )}
              {!todayRec?.status && !isWeekend(todayDateStr) && !isHoliday(todayDateStr, holidays) && (
                (() => {
                  const myPendingReq = checkInRequests.find(r => r.uid === uid && r.date === todayDateStr);
                  return myPendingReq ? (
                    <div className="text-[12px] text-gray-600 font-bold px-3 py-2 bg-gray-100 rounded-xl">요청 대기 중...</div>
                  ) : (
                    <button onClick={() => {
                      const n = new Date();
                      setRequestCheckInTime(String(n.getHours()).padStart(2, "0") + ":" + String(n.getMinutes()).padStart(2, "0"));
                      setShowCheckInRequestModal(true);
                    }} disabled={requestingCheckIn}
                      className="px-4 py-2.5 rounded-xl border-2 border-[#1B2B4B] text-[#1B2B4B] text-[12px] font-bold disabled:opacity-50">
                      {requestingCheckIn ? "요청 중..." : "출근 요청"}
                    </button>
                  );
                })()
              )}
            </div>
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
              rec?.checkInTime ? `출근 ${fmtTime(rec.checkInTime)}` : "",
              rec?.checkOutTime ? `퇴근 ${fmtTime(rec.checkOutTime)}` : "",
            ].filter(Boolean).join(" · ");
            const isPastOrToday = ds <= todayDateStr;
            return (
              <div key={i} className={`rounded-lg flex flex-col items-center justify-center py-1.5 relative ${ds === todayDateStr ? "ring-2 ring-[#1B2B4B]" : ""} ${isPastOrToday && canEditAttendance ? "cursor-pointer active:bg-gray-50" : ""}`}
                title={tooltip}
                onClick={() => {
                  if (!isPastOrToday || !canEditAttendance) return;
                  setMobileEditCell({ date: ds, status, rec });
                  setMobileEditStatus(status || "출근");
                  setMobileEditTime(rec?.checkInTime ? fmtTime(rec.checkInTime) : "09:00");
                  setMobileEditCheckOut(rec?.checkOutTime ? fmtTime(rec.checkOutTime) : "");
                  setMobileEditLateReason(rec?.lateReason || "");
                }}>
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

      {/* 출근 요청 시간 입력 모달 */}
      {showCheckInRequestModal && (
        <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center px-4">
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
                  await addDoc(collection(db, "attendanceRequests"), {
                    uid, name: myName, date: todayDateStr,
                    requestedAt: dt.toISOString(),
                    companyName: company, status: "pending",
                    createdAt: serverTimestamp(),
                  });
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

      {/* 모바일 날짜 편집 모달 (hrManager/totalMaster) */}
      {mobileEditCell && (
        <div className="fixed inset-0 z-[9999] bg-black/40 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-5 pb-8 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[15px] font-bold text-[#1B2B4B]">{mobileEditCell.date}</div>
                <div className="text-[12px] text-gray-500">출근 상태 및 시간을 수정합니다.</div>
              </div>
              <button onClick={() => setMobileEditCell(null)} className="text-gray-400 text-[20px] font-bold">×</button>
            </div>
            <div>
              <div className="text-[12px] font-semibold text-gray-600 mb-2">상태</div>
              <div className="grid grid-cols-4 gap-1.5">
                {["출근", "휴무", "연차", "오전반차", "오후반차", "외근", "병가", "경조사", "조퇴"].map(s => (
                  <button key={s} onClick={() => setMobileEditStatus(s)}
                    className={`py-2 rounded-xl text-[12px] font-bold transition ${mobileEditStatus === s ? "bg-[#1B2B4B] text-white" : "bg-gray-100 text-gray-600"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {mobileEditStatus === "출근" && (
              <>
                <div>
                  <div className="text-[12px] font-semibold text-gray-600 mb-1">출근 시간</div>
                  <input type="time" value={mobileEditTime} onChange={e => setMobileEditTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 text-[15px] font-bold text-[#1B2B4B] outline-none focus:border-[#1B2B4B]" />
                </div>
                <div>
                  <div className="text-[12px] font-semibold text-gray-600 mb-1">퇴근 시간 (선택)</div>
                  <input type="time" value={mobileEditCheckOut} onChange={e => setMobileEditCheckOut(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 text-[15px] font-bold text-[#1B2B4B] outline-none focus:border-[#1B2B4B]" />
                </div>
                {(() => {
                  const [sh, sm] = (myUserDoc?.workStartTime || "09:00").split(":").map(Number);
                  const [ch, cm] = mobileEditTime.split(":").map(Number);
                  const isLateCheck = ch * 60 + cm > sh * 60 + sm;
                  return isLateCheck ? (
                    <div>
                      <div className="text-[12px] font-semibold text-gray-600 mb-1">지각 사유</div>
                      <input type="text" placeholder="지각 사유를 입력하세요 (선택)"
                        value={mobileEditLateReason} onChange={e => setMobileEditLateReason(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 text-[13px] text-[#1B2B4B] outline-none focus:border-[#1B2B4B]" />
                    </div>
                  ) : null;
                })()}
              </>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setMobileEditCell(null)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-[14px] font-bold text-gray-600">취소</button>
              <button onClick={saveMobileEdit} disabled={savingMobileEdit}
                className="flex-2 px-8 py-3 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-bold disabled:opacity-50">
                {savingMobileEdit ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
