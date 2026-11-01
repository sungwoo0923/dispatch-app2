import React, { useEffect, useMemo, useState } from "react";
import { workWindow } from "./autoAttendance";
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where, addDoc, arrayUnion, getDocs } from "firebase/firestore";
import { geocodeAddress } from "./tmapFareCalc";
import { db, DEFAULT_COMPANY } from "./firebase";
import { isTMUser } from "./staffFilter";
import { RadiusEditor, officeRadii, DEFAULT_IN_RADIUS, DEFAULT_OUT_RADIUS } from "./attendanceQuick";
import { ATTENDANCE_STATUS_COLOR, isWeekend, findApprovedLeaveForDate, isHoliday, getHolidayLabel, KR_NATIONAL_HOLIDAYS, approvalLeaveOn, hrLeaveOn } from "./attendanceUtils";
import { useCustomRoles } from "./customRoles";
import {
  APPROVER_GROUP_LABEL, isHrStaffUser, isExecUser, canApproveAttendanceReq, canEditAttendanceOf, markNotifSeen,
  approveChangeReq, rejectChangeReq, approveCheckInReq, rejectCheckInReq, submitChangeReq, submitCheckInReq,
} from "./attendanceApproval";

// ⭐ 2026-11-01 출근기록부 리디자인 — 네이비 히어로 + 오늘 KPI + 월간 그리드(이름 고정 · 오늘 강조 · 공휴일 빨간색+명칭)
//  권한: 출·퇴근 기록 직접 수정은 인사팀만(최고관리자 포함), 본인 기록은 누구나 "수정 요청" → 인사팀 승인
//        인사팀 본인 요청은 임원에게(임원 1명 승인으로 종결) — 로직은 attendanceApproval.js
const ADMIN_ROLES = ["totalMaster", "admin"];
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const LEAVE_SET = new Set(["연차", "오전반차", "오후반차", "병가", "경조사", "휴직", "육아휴직", "출산휴가"]);
const WORK_SET = new Set(["출근", "외근", "조퇴"]);
const STATUS_OPTIONS = ["출근", "휴무", "연차", "오전반차", "오후반차", "외근", "병가", "경조사", "조퇴"];
const SHORT = { 오전반차: "오전", 오후반차: "오후", 육아휴직: "육아", 출산휴가: "출산", 공휴일: "휴일" };
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

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

const btnCls = (on) => `h-10 px-3.5 rounded-xl border text-[13.5px] font-bold transition inline-flex items-center gap-1.5 whitespace-nowrap ${on ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white border-[#DCE3EE] text-[#1B2B4B] hover:border-[#2D4C82]"}`;
const inputCls = "h-10 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82] bg-white";

export default function AttendanceBoard({ userCompany, role, user }) {
  const todayDateStr = kstToday();
  const todayY = Number(todayDateStr.slice(0, 4));
  const todayM = Number(todayDateStr.slice(5, 7));
  const [year, setYear] = useState(todayY);
  const [month, setMonth] = useState(todayM);
  const [employees, setEmployees] = useState([]);
  // ⭐ 2026-11-01 누구나 전 직원 출근·일정을 보고, [전체 | 내 기록] 토글로 본인 줄만
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [recordsAll, setRecords] = useState([]);
  const [tmUids, setTmUids] = useState(() => new Set());
  // ⭐ 최고관리자의 예전 출근 기록도 보이지 않게
  const records = useMemo(() => recordsAll.filter(r => !tmUids.has(r.uid)), [recordsAll, tmUids]);
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
  const [radiusInput, setRadiusInputRaw] = useState({ inM: DEFAULT_IN_RADIUS, outM: DEFAULT_OUT_RADIUS }); // ⭐ 회사별 자동 출퇴근 반경
  const radiusDirtyRef = React.useRef(false);
  const setRadiusInput = setRadiusInputRaw;
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
  const [pendingCompanyChangeReqs, setPendingCompanyChangeReqs] = useState([]);
  const [myChangeReqs, setMyChangeReqs] = useState([]);
  const [showChangeReqPanel, setShowChangeReqPanel] = useState(false);

  // PC 알림 큐
  const [pcNotifQueue, setPcNotifQueue] = useState([]);
  const [pcNotifRejectInput, setPcNotifRejectInput] = useState("");
  const [pcNotifShowReject, setPcNotifShowReject] = useState(false);

  const company = userCompany || localStorage.getItem("userCompany") || "";
  const customRoles = useCustomRoles(company);

  // ─── 데이터 구독 ───────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "schedules"), snap => {
      setSchedules(snap.docs.map(d => d.data()).filter(s => (s.companyName || DEFAULT_COMPANY) === company));
    }, () => {});
    return () => unsub();
  }, [company]);

  useEffect(() => {
    const q = query(collection(db, "users"), where("companyName", "==", company));
    const unsub = onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
      setTmUids(new Set(all.filter(isTMUser).map(u => u.uid)));
      // ★ 최고관리자·기사·화주는 출근기록부에서 제외, 퇴사자는 퇴사한 달까지만
      setEmployees(all.filter(u => u.approved !== false && !isTMUser(u) && !["driver", "shipper", "cafeUser"].includes(u.role)));
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
      if (!radiusDirtyRef.current) setRadiusInput(officeRadii(data?.officeLocation)); // 고치는 중엔 덮어쓰지 않음
      setHiddenEmpUids(data?.hiddenEmployees || []);
    }, () => {});
    return () => unsub();
  }, [company]);

  // ─── 권한 ─────────────────────────────────────────────────
  const myEmp = employees.find(e => e.uid === user?.uid);
  const myName = myEmp?.name || user?.displayName || user?.email || "";
  const meProfile = useMemo(() => ({ ...(myEmp || {}), uid: user?.uid, name: myName, role }), [myEmp, user?.uid, myName, role]);
  // ⭐ 2026-11-01 인사팀(인사관리자·통합인사·인사 부서) — 직원 기록 직접 수정 · 직원 관리/출근지/공휴일 관리
  const isHrStaff = role === "totalMaster" || isHrStaffUser(myEmp || {}, role);
  const isExecMe = isExecUser(meProfile, customRoles);
  const isAdmin = ADMIN_ROLES.includes(role) || isHrStaff;
  const mayApprove = isHrStaff || isExecMe || role === "admin";
  const canEditCell = (uid) => canEditAttendanceOf(uid, meProfile, role);
  const canApprove = (req) => canApproveAttendanceReq(req, meProfile, role, customRoles, employees);

  // 🏢 출근지가 비어 있으면 운송사가 가입할 때 입력한 회사 주소로 기본 설정(언제든 아래 패널에서 수정)
  const [companyAddr, setCompanyAddr] = useState("");
  const autoOfficeRef = React.useRef("");
  useEffect(() => {
    if (!company) return;
    let alive = true;
    getDocs(query(collection(db, "transportApplications"), where("companyName", "==", company))).then((snap) => {
      const apps = snap.docs.map((d) => d.data());
      const a = apps.find((x) => x.type === "신규" && x.address) || apps.find((x) => x.address);
      if (alive) setCompanyAddr(String(a?.address || "").trim());
    }).catch(() => {});
    return () => { alive = false; };
  }, [company]);
  useEffect(() => {
    if (!isAdmin || !company || !companyAddr || officeLocation || autoOfficeRef.current === company) return;
    autoOfficeRef.current = company;
    geocodeAddress(companyAddr).then((c) => {
      // ⭐ 2026-11-01 좌표 함수는 경도를 lon으로 준다(예전엔 lng만 읽어 경도가 비고 자동 설정도 안 됐다)
      const lngV = c?.lng ?? c?.lon;
      if (!c?.lat || !lngV) return;
      setDoc(doc(db, "companySettings", company), { officeLocation: { lat: Number(c.lat), lng: Number(lngV), address: companyAddr, auto: true } }, { merge: true }).catch(() => {});
    }).catch(() => {});
  }, [isAdmin, company, companyAddr, officeLocation]);
  const [findingAddr, setFindingAddr] = useState(false);
  const findByAddress = async (addr) => {
    const a = String(addr || "").trim();
    if (!a) return alert("주소를 입력해 주세요.");
    setFindingAddr(true);
    try {
      const c = await geocodeAddress(a);
      if (!c?.lat) return alert("주소로 위치를 찾지 못했습니다. 도로명 주소로 다시 입력해 주세요.");
      setOfficeInput({ lat: String(c.lat), lng: String(c.lng ?? c.lon ?? ""), address: a });
    } finally { setFindingAddr(false); }
  };

  // ─── 출근지 저장 ────────────────────────────────────────────
  const saveOfficeLocation = async () => {
    const lat = parseFloat(officeInput.lat);
    const lng = parseFloat(officeInput.lng);
    if (isNaN(lat) || isNaN(lng)) { alert("올바른 위도/경도를 입력해주세요."); return; }
    const r = officeRadii({ radius: radiusInput.inM, outRadius: radiusInput.outM });
    setSavingOffice(true);
    await setDoc(doc(db, "companySettings", company), {
      officeLocation: { lat, lng, address: officeInput.address || "", radius: r.inM, outRadius: r.outM }
    }, { merge: true });
    radiusDirtyRef.current = false;
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

  // ─── 🔗 2026-11-01 전자결재 근태(승인) — 연차·반차·병가·외근·출장·경조사·육아휴직 등을 출근기록부에 표시 ───
  //  관리자·인사는 회사 전체, 그 밖의 직원은 보안 규칙상 본인이 참여한 결재만 읽을 수 있어 본인 것만
  const [leaveAprs, setLeaveAprs] = useState([]);
  useEffect(() => {
    if (!company || !user?.uid) return undefined;
    const q = isAdmin
      ? query(collection(db, "approvals"), where("company", "==", company), where("cat", "==", "leave"))
      : query(collection(db, "approvals"), where("participants", "array-contains", user.uid));
    return onSnapshot(q, (snap) => setLeaveAprs(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.cat === "leave" && a.status === "approved")), () => setLeaveAprs([]));
  }, [company, user?.uid, isAdmin]);

  // ─── 출근 요청 구독 (승인 가능자: 회사 전체 / 직원: 본인) ─────────
  useEffect(() => {
    if (!company) return;
    const q = (isAdmin || mayApprove)
      ? query(collection(db, "attendanceRequests"), where("companyName", "==", company), where("status", "==", "pending"))
      : (user?.uid ? query(collection(db, "attendanceRequests"), where("uid", "==", user.uid), where("status", "==", "pending")) : null);
    if (!q) return;
    const unsub = onSnapshot(q, snap => {
      setCheckInRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, [company, user?.uid, isAdmin, mayApprove]);

  // ─── 수정 요청 구독 — 승인할 것(회사 대기건) + 내가 올린 것 ─────────
  useEffect(() => {
    if (!company || !mayApprove) { setPendingCompanyChangeReqs([]); return undefined; }
    return onSnapshot(query(collection(db, "attendanceChangeRequests"), where("companyName", "==", company), where("status", "==", "pending")),
      snap => setPendingCompanyChangeReqs(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
  }, [company, mayApprove]);
  useEffect(() => {
    if (!company || !user?.uid) return undefined;
    return onSnapshot(query(collection(db, "attendanceChangeRequests"), where("uid", "==", user.uid)),
      snap => setMyChangeReqs(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => (r.companyName || company) === company)), () => {});
  }, [company, user?.uid]);

  const approvableChange = useMemo(() => pendingCompanyChangeReqs.filter(canApprove), // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingCompanyChangeReqs, meProfile, role, customRoles, employees]);
  const approvableCheckIn = useMemo(() => checkInRequests.filter(canApprove), // eslint-disable-next-line react-hooks/exhaustive-deps
    [checkInRequests, meProfile, role, customRoles, employees]);
  const myPendingChange = myChangeReqs.filter(r => r.status === "pending");
  const myRejectedChange = myChangeReqs.filter(r => r.status === "rejected");

  // ─── PC 알림 구독 — 근태 알림만, 한 번 보여 주면 알림 문서에 "읽음" 저장(탭을 옮겨도 다시 안 뜸) ───
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, "notifications"), where("toUid", "==", user.uid), where("read", "==", false));
    const unsub = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach(change => {
        if (change.type !== "added") return;
        const data = change.doc.data();
        if (!String(data.type || "").startsWith("attendance_")) return;
        // ⭐ 2026-11-01 보이는 순간 읽음 처리 — 예전엔 ×를 눌러야만 읽음이라 탭을 옮겼다 오면 "승인되었습니다"가 또 떴다
        markNotifSeen(change.doc.id);
        setPcNotifQueue(prev => {
          if (prev.some(n => n.id === change.doc.id)) return prev;
          return [...prev, {
            id: change.doc.id,
            msg: data.msg || "",
            status: data.status || "",
            type: data.type || "",
            rejectionReason: data.rejectionReason || "",
            changeReqId: data.changeReqId || "",
            checkInReqId: data.checkInReqId || "",
            fromName: data.fromName || "",
            fromUid: data.fromUid || "",
            date: data.date || "",
          }];
        });
      });
    }, () => {});
    return () => unsub();
  }, [user?.uid]);

  const approver = { uid: user?.uid, name: myName };
  const runDecision = async (fn) => {
    try {
      const ok = await fn();
      if (ok === false) alert("이미 다른 승인자가 처리한 요청입니다.");
    } catch (e) { alert(`처리하지 못했습니다: ${e?.message || e}`); }
  };
  const handleApproveRequest = (req) => runDecision(() => approveCheckInReq(req, approver, company));
  const handleRejectRequest = (req, reason) => runDecision(() => rejectCheckInReq(req, approver, company, reason));
  const approveChangeRequest = (req) => runDecision(() => approveChangeReq(req, approver, company));
  const rejectChangeRequest = (req, reason) => runDecision(() => rejectChangeReq(req, approver, company, reason));

  const submitChangeRequest = async () => {
    if (!changeRequestCell || !user?.uid) return;
    setSubmittingChangeReq(true);
    try {
      const checkInIso = changeReqStatus === "출근" && changeReqTime ? `${changeRequestCell.date}T${changeReqTime}:00` : null;
      const checkOutIso = changeReqStatus === "출근" && changeReqCheckOut ? `${changeRequestCell.date}T${changeReqCheckOut}:00` : null;
      const r = await submitChangeReq({
        requester: { ...meProfile, name: changeRequestCell.emp.name || myName }, date: changeRequestCell.date,
        status: changeReqStatus, checkIn: checkInIso, checkOut: checkOutIso, reason: changeReqReason,
        company, employees, customRoles,
      });
      if (!r.count) alert("승인할 담당자가 없어 요청만 저장했습니다. 인사팀·임원 지정 여부를 확인해 주세요.");
      setChangeRequestCell(null);
      setChangeReqReason("");
    } catch (e) {
      alert(`요청하지 못했습니다: ${e?.message || e}`);
    } finally {
      setSubmittingChangeReq(false);
    }
  };

  // ─── 오늘 퇴근 처리 ─────────────────────────────────────────
  const handleCheckOut = async () => {
    if (!user?.uid) return;
    const checkOutTime = new Date().toISOString();
    await setDoc(doc(db, "attendance", `${todayDateStr}_${user.uid}`), {
      checkOutTime, checkOutSource: "manual",
      uid: user.uid, name: myName, date: todayDateStr,
      month: todayDateStr.slice(0, 7), companyName: company,
    }, { merge: true });
  };

  // ─── 테이블 계산 ─────────────────────────────────────────────
  const numDays = daysInMonth(year, month);
  const dayList = Array.from({ length: numDays }, (_, i) => i + 1);
  const dsOf = (d) => `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const recordMap = useMemo(() => {
    const m = {};
    records.forEach(r => { m[`${r.uid}_${r.date}`] = r; });
    return m;
  }, [records]);

  const rejectedChangeMap = useMemo(() => {
    const m = {};
    myRejectedChange.forEach(r => { m[`${r.uid}_${r.date}`] = r.rejectionReason || "사유 없음"; });
    return m;
  }, [myRejectedChange]);
  const pendingChangeMap = useMemo(() => {
    const m = {};
    myPendingChange.forEach(r => { m[`${r.uid}_${r.date}`] = r; });
    return m;
  }, [myPendingChange]);

  const activeEmployees = useMemo(() => {
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    return employees
      .filter(e => !hiddenEmpUids.includes(e.uid) && !(e.employmentStatus === "퇴사" && String(e.resignedAt || "0000") < monthStart))
      .sort((a, b) => (a.uid === user?.uid ? -1 : b.uid === user?.uid ? 1 : String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""), "ko")));
  }, [employees, hiddenEmpUids, year, month, user?.uid]);

  const visibleEmployees = useMemo(() => {
    const kw = search.trim();
    return activeEmployees.filter(e => (!mineOnly || e.uid === user?.uid) && (!kw || `${e.name || ""} ${e.email || ""} ${e.team || ""}`.includes(kw)));
  }, [activeEmployees, mineOnly, search, user?.uid]);

  const resolveStatus = (uid, ds, name) => {
    const rec = recordMap[`${uid}_${ds}`];
    if (rec && rec.status) return { status: rec.status, rec };
    if (ds > todayDateStr) return { status: null, rec: null };
    if (isHoliday(ds, holidays)) return { status: "공휴일", rec: null };
    if (isWeekend(ds)) return { status: "휴무", rec: null };
    const leave = findApprovedLeaveForDate(schedules, uid, ds, name) || approvalLeaveOn(leaveAprs, uid, ds) || hrLeaveOn(employees.find((e) => e.uid === uid), ds);
    if (leave) return { status: leave, rec: null };
    return { status: null, rec: null };
  };

  const isLate = (rec, emp) => {
    if (!rec?.checkInTime || !emp?.workStartTime) return false;
    const checkInMin = timeToMinutes(fmtTime(rec.checkInTime));
    // ⭐ 2026-11-02 오전반차는 출근시간 +4시간이 출근 기준
    const startMin = (rec.status === "오전반차" || rec.halfDay === "오전반차") ? workWindow(emp, "오전반차").start : timeToMinutes(emp.workStartTime);
    if (checkInMin == null || startMin == null) return false;
    return checkInMin > startMin;
  };

  // 오늘 현재 사용자 출근 레코드
  const myTodayRec = user?.uid ? recordMap[`${user.uid}_${todayDateStr}`] : null;
  const isCurMonth = month === todayM && year === todayY;
  const todayOff = isWeekend(todayDateStr) || isHoliday(todayDateStr, holidays);

  // ─── 오늘 KPI (보고 있는 달과 무관하게 오늘 기준 · 숨김 직원 제외) ───
  const [todayRecs, setTodayRecs] = useState([]);
  useEffect(() => {
    if (!company) return undefined;
    if (isCurMonth) { setTodayRecs([]); return undefined; }
    return onSnapshot(query(collection(db, "attendance"), where("companyName", "==", company), where("date", "==", todayDateStr)),
      snap => setTodayRecs(snap.docs.map(d => d.data())), () => setTodayRecs([]));
  }, [company, isCurMonth, todayDateStr]);
  const kpi = useMemo(() => {
    const recOf = (uid) => (isCurMonth ? recordMap[`${uid}_${todayDateStr}`] : todayRecs.find(r => r.uid === uid));
    const monthStart = `${todayDateStr.slice(0, 7)}-01`;
    const staff = employees.filter(e => !hiddenEmpUids.includes(e.uid) && !(e.employmentStatus === "퇴사" && String(e.resignedAt || "0000") < monthStart));
    let present = 0, late = 0, leave = 0, outside = 0, absent = 0;
    staff.forEach(e => {
      const rec = recOf(e.uid);
      let st = rec?.status || null;
      if (!st && !todayOff) st = findApprovedLeaveForDate(schedules, e.uid, todayDateStr, e.name || e.email) || approvalLeaveOn(leaveAprs, e.uid, todayDateStr) || hrLeaveOn(e, todayDateStr);
      if (st && WORK_SET.has(st)) { present++; if (st === "외근") outside++; if (st === "출근" && isLate(rec, e)) late++; }
      else if (st && LEAVE_SET.has(st)) leave++;
      else if (!st && !todayOff) absent++;
    });
    const base = staff.length - leave;
    return { total: staff.length, present, late, leave, outside, absent, rate: base > 0 ? Math.round((present / base) * 100) : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, hiddenEmpUids, recordMap, todayRecs, isCurMonth, todayDateStr, todayOff, schedules, leaveAprs]);

  // ─── 출근 수정 저장 (인사팀) ─────────────────────────────────
  const saveEdit = async (status, checkInTime, checkOutTime, lateReason) => {
    if (!editCell) return;
    const { uid, name, date } = editCell;
    if (!canEditCell(uid)) { alert("출·퇴근 기록 직접 수정은 인사팀만 가능합니다. (본인 기록은 수정 요청)"); return; }
    const editorName = myName || "인사팀";
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

  // ─── 월간 집계(직원별) ─────────────────────────────────────────
  const monthAgg = useMemo(() => {
    const out = {};
    visibleEmployees.forEach(emp => {
      const counts = {};
      let lateCount = 0;
      dayList.forEach(d => {
        const ds = dsOf(d);
        if (ds > todayDateStr) return;
        const { status, rec } = resolveStatus(emp.uid, ds, emp.name || emp.email);
        if (!status) return;
        counts[status] = (counts[status] || 0) + 1;
        if (status === "출근" && rec && isLate(rec, emp)) lateCount++;
      });
      const work = ["출근", "외근", "조퇴"].reduce((s, k) => s + (counts[k] || 0), 0);
      const leave = [...LEAVE_SET].reduce((s, k) => s + (counts[k] || 0), 0);
      out[emp.uid] = { counts, lateCount, work, leave };
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEmployees, dayList.length, year, month, recordMap, schedules, holidays, todayDateStr, employees, leaveAprs]);
  const summaryData = summaryEmp ? (monthAgg[summaryEmp.uid] || (() => {
    const counts = {}; let lateCount = 0;
    dayList.forEach(d => { const ds = dsOf(d); if (ds > todayDateStr) return; const { status, rec } = resolveStatus(summaryEmp.uid, ds, summaryEmp.name || summaryEmp.email); if (!status) return; counts[status] = (counts[status] || 0) + 1; if (status === "출근" && rec && isLate(rec, summaryEmp)) lateCount++; });
    return { counts, lateCount };
  })()) : null;

  const monthHolidays = dayList.map(d => dsOf(d)).filter(ds => isHoliday(ds, holidays)).map(ds => [ds, getHolidayLabel(ds, holidays)]);
  const openCell = (emp, ds, effStatus, rec) => {
    if (ds > todayDateStr && !canEditCell(emp.uid)) return;
    if (canEditCell(emp.uid)) {
      setEditCell({ uid: emp.uid, name: emp.name || emp.email, date: ds, current: rec, workStartTime: emp.workStartTime });
    } else if (emp.uid === user?.uid) {
      setChangeReqStatus(effStatus && STATUS_OPTIONS.includes(effStatus) ? effStatus : "출근");
      setChangeReqTime(rec?.checkInTime ? fmtTime(rec.checkInTime) : (emp.workStartTime || "09:00"));
      setChangeReqCheckOut(rec?.checkOutTime ? fmtTime(rec.checkOutTime) : "");
      setChangeReqReason("");
      setChangeRequestCell({ emp, date: ds, status: effStatus, rec });
    }
  };
  const goMonth = (delta) => {
    let y = year, m = month + delta;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    setYear(y); setMonth(m);
  };
  const myApproverLabel = APPROVER_GROUP_LABEL[(isHrStaffUser(myEmp || {}, role)) ? "exec" : "hr"];
  const pendingApprovalCount = approvableChange.length + approvableCheckIn.length;
  const todayWd = WD[new Date(todayDateStr + "T00:00:00").getDay()];

  // ─── 렌더링 ──────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-4 bg-[#F5F7FB] min-h-full text-[14px]">
      {/* 히어로 — 제목 · 월 이동 · 오늘 KPI */}
      <section className="relative overflow-hidden rounded-[22px] text-white shadow-[0_10px_30px_rgba(15,26,48,0.18)]" style={{ background: "linear-gradient(135deg,#0F1A30 0%,#1B2B4B 58%,#2D4C82 100%)" }}>
        <div className="absolute inset-0 pointer-events-none opacity-[0.07]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative px-5 md:px-7 pt-5 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11.5px] font-extrabold tracking-[0.3em] text-[#9FB4DA]" style={{ fontFamily: MONO }}>ATTENDANCE · {year}.{String(month).padStart(2, "0")}</div>
              <h2 className="mt-1.5 text-[26px] md:text-[28px] font-black tracking-tight">출근기록부</h2>
              <div className="mt-1 text-[13.5px] text-white/65 font-semibold">
                {company || "회사"} · 직원 {activeEmployees.length}명 · 오늘 <span style={{ fontFamily: MONO }}>{todayDateStr.replace(/-/g, ".")}</span> ({todayWd}){todayOff && <span className="ml-1.5 text-[#FFB4A8]">{getHolidayLabel(todayDateStr, holidays) || "주말"}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1.5 bg-white/[0.08] border border-white/15 rounded-2xl p-1.5">
              <button onClick={() => goMonth(-1)} aria-label="이전 달" className="w-10 h-10 rounded-xl hover:bg-white/10 text-[18px] font-black">‹</button>
              <div className="px-2 text-center min-w-[120px]">
                <div className="text-[18px] font-black tabular-nums" style={{ fontFamily: MONO }}>{year}.{String(month).padStart(2, "0")}</div>
                <div className="text-[11px] text-white/55 font-bold">{year}년 {month}월</div>
              </div>
              <button onClick={() => goMonth(1)} aria-label="다음 달" className="w-10 h-10 rounded-xl hover:bg-white/10 text-[18px] font-black">›</button>
              {!isCurMonth && <button onClick={() => { setYear(todayY); setMonth(todayM); }} className="ml-1 h-10 px-3 rounded-xl bg-white text-[#0F1A30] text-[13px] font-black">오늘</button>}
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
            {[
              { k: "TODAY · IN", l: "오늘 출근", v: kpi.present, u: "명", sub: kpi.outside ? `외근 ${kpi.outside}명 포함` : `전체 ${kpi.total}명` },
              { k: "LATE", l: "지각", v: kpi.late, u: "명", sub: "정규 출근시간 이후", warn: kpi.late > 0 },
              { k: "LEAVE", l: "휴가", v: kpi.leave, u: "명", sub: "연차·반차·병가·경조사·휴직" },
              { k: "ABSENT", l: "미출근", v: todayOff ? "—" : kpi.absent, u: todayOff ? "" : "명", sub: todayOff ? "오늘은 휴일입니다" : "기록·휴가 없음", warn: !todayOff && kpi.absent > 0 },
              { k: "RATE", l: "출근율", v: todayOff ? "—" : kpi.rate, u: todayOff ? "" : "%", sub: "휴가자 제외 기준", bar: todayOff ? null : kpi.rate },
            ].map(t => (
              <div key={t.k} className="rounded-2xl bg-white/[0.07] border border-white/[0.12] px-4 py-3 min-w-0 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-bold text-white/70 whitespace-nowrap">{t.l}</span>
                  <span className="text-[9.5px] font-extrabold tracking-[0.2em] text-white/35" style={{ fontFamily: MONO }}>{t.k}</span>
                </div>
                <div className={`mt-1 text-[30px] leading-none font-black tabular-nums ${t.warn ? "text-[#FFB4A8]" : ""}`} style={{ fontFamily: MONO }}>
                  {t.v}<span className="ml-1 text-[14px] font-bold text-white/55">{t.u}</span>
                </div>
                {t.bar != null ? (
                  <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-[#7FB0FF]" style={{ width: `${Math.min(100, t.bar)}%` }} /></div>
                ) : (
                  <div className="mt-1.5 text-[11.5px] text-white/45 font-semibold truncate">{t.sub}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 툴바 — [전체 | 내 기록] · 검색 · 관리 버튼 · 결재 대기 */}
      <section className="flex flex-wrap items-center gap-2.5 bg-white rounded-2xl border border-[#E3E8F0] px-3.5 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="inline-flex p-1 rounded-xl bg-[#EEF1F6]" role="tablist" aria-label="보기 범위">
          {[[false, "전체"], [true, "내 기록"]].map(([v, l]) => (
            <button key={l} role="tab" aria-selected={mineOnly === v} onClick={() => setMineOnly(v)}
              className={`h-9 px-4 rounded-lg text-[13.5px] font-black transition ${mineOnly === v ? "bg-white text-[#0F1A30] shadow-[0_1px_3px_rgba(15,26,48,0.15)]" : "text-[#5B6B85] hover:text-[#0F1A30]"}`}>{l}</button>
          ))}
        </div>
        <div className="relative">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="이름·부서 검색" className={`${inputCls} w-[180px] pl-9`} />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A97AD]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </div>
        {(myPendingChange.length > 0 || checkInRequests.some(r => r.uid === user?.uid)) && (
          <span className="h-9 px-3 rounded-xl bg-[#FFF4D6] border border-[#E7D3A1] text-[#6B5320] text-[12.5px] font-black inline-flex items-center">
            내 요청 {myPendingChange.length + checkInRequests.filter(r => r.uid === user?.uid).length}건 · {myApproverLabel} 승인 대기
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {pendingApprovalCount > 0 && (
            <>
              {approvableCheckIn.length > 0 && (
                <button onClick={() => setShowRequestPanel(true)} className="h-10 px-3.5 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black inline-flex items-center gap-2">
                  출근 요청 <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#FFB4A8] text-[#0F1A30] text-[12px] font-black inline-flex items-center justify-center">{approvableCheckIn.length}</span>
                </button>
              )}
              {approvableChange.length > 0 && (
                <button onClick={() => setShowChangeReqPanel(true)} className="h-10 px-3.5 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black inline-flex items-center gap-2">
                  수정 요청 <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#FFB4A8] text-[#0F1A30] text-[12px] font-black inline-flex items-center justify-center">{approvableChange.length}</span>
                </button>
              )}
            </>
          )}
          {isAdmin && (
            <>
              <button onClick={() => setShowEmpFilter(v => !v)} className={btnCls(showEmpFilter)}>직원 관리</button>
              <button onClick={() => { if (!showOfficePanel && officeLocation && !officeInput.lat) setOfficeInput({ lat: String(officeLocation.lat ?? ""), lng: String(officeLocation.lng ?? ""), address: officeLocation.address || "" }); setShowOfficePanel(v => !v); setShowHolidayPanel(false); }}
                className={btnCls(showOfficePanel)}>출근지 설정</button>
              <button onClick={() => { setShowHolidayPanel(v => !v); setShowOfficePanel(false); }} className={btnCls(showHolidayPanel)}>공휴일 관리</button>
            </>
          )}
        </div>
      </section>

      {/* 출근지 설정 패널 */}
      {isAdmin && showOfficePanel && (
        <section className="bg-white rounded-2xl border border-[#E3E8F0] p-5">
          <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8A97AD]" style={{ fontFamily: MONO }}>OFFICE · GEOFENCE</div>
          <div className="text-[16px] font-black text-[#0F1A30] mb-3">출근지 설정</div>
          {officeLocation && (
            <div className="mb-3 px-3.5 py-2.5 rounded-xl bg-[#EEF3FC] border border-[#D5E0F3] text-[13.5px] text-[#1B2B4B]">
              <span className="font-black">현재 출근지</span> · {officeLocation.address || `${officeLocation.lat}, ${officeLocation.lng}`}
              <span className="ml-2 text-[12px] text-[#5B6B85]" style={{ fontFamily: MONO }}>({officeLocation.lat?.toFixed?.(5)}, {officeLocation.lng?.toFixed?.(5)})</span>
            </div>
          )}
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <input type="text" placeholder="주소로 찾기 (예: 인천 서구 완정로 10)"
                value={officeInput.address} onChange={e => setOfficeInput(p => ({ ...p, address: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") findByAddress(officeInput.address); }}
                className={`${inputCls} flex-1 min-w-[240px]`} />
              <button onClick={() => findByAddress(officeInput.address)} disabled={findingAddr}
                className="h-10 px-4 rounded-xl bg-[#1B2B4B] text-white text-[13.5px] font-bold disabled:opacity-50 whitespace-nowrap">{findingAddr ? "찾는 중..." : "주소로 위치 찾기"}</button>
              {companyAddr && (
                <button onClick={() => findByAddress(companyAddr)} disabled={findingAddr} className={btnCls(false)}>가입 주소로</button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={getCurrentLocation} disabled={gettingLocation}
                className="h-10 px-4 rounded-xl bg-[#1B2B4B] text-white text-[13.5px] font-bold disabled:opacity-50 whitespace-nowrap">
                {gettingLocation ? "위치 가져오는 중..." : "현재 위치로 가져오기"}
              </button>
              <span className="text-[12.5px] text-[#8A97AD]">관리자가 사무실에 있을 때 눌러주세요</span>
            </div>
            <div className="text-[12.5px] font-bold text-[#5B6B85] mt-1">또는 직접 입력</div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <div className="text-[12px] text-[#8A97AD] mb-1">위도 (Latitude)</div>
                <input type="number" step="0.000001" placeholder="예: 37.566826"
                  value={officeInput.lat} onChange={e => setOfficeInput(p => ({ ...p, lat: e.target.value }))}
                  className={`${inputCls} w-40`} />
              </label>
              <label className="block">
                <div className="text-[12px] text-[#8A97AD] mb-1">경도 (Longitude)</div>
                <input type="number" step="0.000001" placeholder="예: 126.977829"
                  value={officeInput.lng} onChange={e => setOfficeInput(p => ({ ...p, lng: e.target.value }))}
                  className={`${inputCls} w-40`} />
              </label>
              <label className="block flex-1 min-w-[200px]">
                <div className="text-[12px] text-[#8A97AD] mb-1">장소명 (선택)</div>
                <input type="text" placeholder="예: 본사 사무실"
                  value={officeInput.address} onChange={e => setOfficeInput(p => ({ ...p, address: e.target.value }))}
                  className={`${inputCls} w-full`} />
              </label>
            </div>
            <RadiusEditor value={radiusInput} onChange={(v) => { radiusDirtyRef.current = true; setRadiusInputRaw(v); }} />
            <div className="text-[12px] text-[#8A97AD]">출근지 반경 {officeRadii({ radius: radiusInput.inM, outRadius: radiusInput.outM }).inM}m 이내 도착 시 모바일 자동 출근 · {officeRadii({ radius: radiusInput.inM, outRadius: radiusInput.outM }).outM}m 이탈 시 자동 퇴근 (앱이 켜져 있을 때 · 안 되면 상단 출근/퇴근 버튼)</div>
            <div className="flex gap-2">
              <button onClick={saveOfficeLocation} disabled={savingOffice || (!officeInput.lat && !officeInput.lng)}
                className="h-10 px-5 rounded-xl bg-[#1B2B4B] text-white text-[13.5px] font-bold disabled:opacity-40">
                {savingOffice ? "저장 중..." : "저장"}
              </button>
              <button onClick={() => setShowOfficePanel(false)} className={btnCls(false)}>닫기</button>
            </div>
          </div>
        </section>
      )}

      {/* 공휴일 관리 패널 */}
      {isAdmin && showHolidayPanel && (
        <section className="bg-white rounded-2xl border border-[#E3E8F0] p-5">
          <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8A97AD]" style={{ fontFamily: MONO }}>HOLIDAYS · {year}</div>
          <div className="text-[16px] font-black text-[#0F1A30] mb-2">대한민국 법정공휴일 <span className="text-[13px] font-bold text-[#8A97AD]">({year}년, 자동 반영)</span></div>
          <div className="flex flex-wrap gap-2 mb-5">
            {(KR_NATIONAL_HOLIDAYS[year] || []).map(([d, label]) => (
              <div key={d} className="px-2.5 py-1.5 rounded-lg bg-[#FFF1F1] border border-[#F6D2D2] text-[13px] font-bold text-[#C0352F]">
                <span style={{ fontFamily: MONO }}>{d.slice(5).replace("-", ".")}</span> · {label}
              </div>
            ))}
            {!(KR_NATIONAL_HOLIDAYS[year] || []).length && (
              <div className="text-[13px] text-[#8A97AD]">{year}년 법정공휴일 데이터가 아직 등록되지 않았습니다.</div>
            )}
          </div>
          <div className="text-[15px] font-black text-[#0F1A30] mb-2">회사 지정 휴일 추가</div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input type="date" value={newHolidayDate} onChange={e => setNewHolidayDate(e.target.value)} className={inputCls} />
            <input type="text" placeholder="명칭 (예: 창립기념일)" value={newHolidayLabel} onChange={e => setNewHolidayLabel(e.target.value)} className={`${inputCls} flex-1 max-w-xs`} />
            <button onClick={addHoliday} className="h-10 px-5 rounded-xl bg-[#1B2B4B] text-white text-[13.5px] font-bold">추가</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {holidays.filter(h => String(h.date || "").startsWith(`${year}-`)).sort((a, b) => a.date.localeCompare(b.date)).map(h => (
              <div key={h.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F5F7FB] border border-[#E3E8F0] text-[13px] font-bold text-[#3A4A66]">
                <span style={{ fontFamily: MONO }}>{h.date}</span> · {h.label}
                <button onClick={() => removeHoliday(h.id)} aria-label="삭제" className="text-[#8A97AD] hover:text-[#C0352F] font-black ml-1">×</button>
              </div>
            ))}
            {!holidays.filter(h => String(h.date || "").startsWith(`${year}-`)).length && (
              <div className="text-[13px] text-[#8A97AD]">등록된 회사 지정 휴일이 없습니다.</div>
            )}
          </div>
        </section>
      )}

      {/* 오늘 내 출퇴근 + 거절된 요청 */}
      {(isCurMonth && myEmp) || myRejectedChange.length > 0 ? (
        <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {isCurMonth && myEmp && (
            <div className="bg-white rounded-2xl border border-[#E3E8F0] px-5 py-4 flex flex-wrap items-center gap-4">
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8A97AD]" style={{ fontFamily: MONO }}>MY TODAY</div>
                <div className="text-[15px] font-black text-[#0F1A30]">오늘 내 출퇴근</div>
              </div>
              <div className="flex items-center gap-5">
                <div><div className="text-[12px] font-bold text-[#8A97AD]">출근</div><div className="text-[20px] font-black text-[#0F1A30] tabular-nums" style={{ fontFamily: MONO }}>{myTodayRec?.checkInTime ? fmtTime(myTodayRec.checkInTime) : (myTodayRec?.status && myTodayRec.status !== "출근" ? myTodayRec.status : "--:--")}</div></div>
                <div><div className="text-[12px] font-bold text-[#8A97AD]">퇴근</div><div className="text-[20px] font-black text-[#0F1A30] tabular-nums" style={{ fontFamily: MONO }}>{myTodayRec?.checkOutTime ? fmtTime(myTodayRec.checkOutTime) : "--:--"}</div></div>
                {myTodayRec?.checkInTime && isLate(myTodayRec, myEmp) && <span className="px-2.5 py-1 rounded-full bg-[#FFF1F1] text-[#C0352F] text-[12px] font-black">지각</span>}
                {myEmp?.workStartTime && <div className="text-[12.5px] text-[#8A97AD] font-semibold">정규 {myEmp.workStartTime} ~ {myEmp.workEndTime || "-"}</div>}
              </div>
              <div className="ml-auto flex items-center gap-2">
                {(myTodayRec?.status === "출근" || myTodayRec?.checkInTime) && !myTodayRec?.checkOutTime && (
                  <button onClick={handleCheckOut} className="h-10 px-5 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-black hover:bg-[#243a60] transition">퇴근</button>
                )}
                {!myTodayRec?.status && !todayOff && (() => {
                  const myPendingReq = checkInRequests.find(r => r.uid === user?.uid && r.date === todayDateStr);
                  return myPendingReq ? (
                    <div className="h-10 px-4 rounded-xl bg-[#F5F7FB] border border-[#E3E8F0] text-[13px] font-black text-[#5B6B85] inline-flex items-center">출근 요청 승인 대기 중</div>
                  ) : (
                    <button onClick={() => {
                      const n = new Date();
                      setRequestCheckInTime(String(n.getHours()).padStart(2, "0") + ":" + String(n.getMinutes()).padStart(2, "0"));
                      setShowCheckInRequestModal(true);
                    }} disabled={requestingCheckIn}
                      className="h-10 px-4 rounded-xl border-2 border-[#1B2B4B] text-[#1B2B4B] text-[13.5px] font-black hover:bg-[#1B2B4B] hover:text-white transition disabled:opacity-50">
                      {requestingCheckIn ? "요청 중..." : "출근 요청"}
                    </button>
                  );
                })()}
              </div>
            </div>
          )}
          {myRejectedChange.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#F6D2D2] px-5 py-4">
              <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#C0352F]/70" style={{ fontFamily: MONO }}>REJECTED</div>
              <div className="text-[15px] font-black text-[#0F1A30] mb-2">거절된 수정 요청</div>
              <div className="flex flex-wrap gap-2">
                {myRejectedChange.slice(0, 6).map(req => (
                  <div key={req.id} className="px-3 py-2 rounded-xl bg-[#FFF8F8] border border-[#F6D2D2]">
                    <div className="text-[13px] font-black text-[#3A4A66]"><span style={{ fontFamily: MONO }}>{req.date}</span> · {req.requestedStatus}</div>
                    <div className="text-[12.5px] text-[#8A5A57]">사유: {req.rejectionReason || "사유 없음"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : null}

      {/* 범례(칩) + 이번 달 휴일 + 권한 안내 */}
      <section className="flex flex-wrap items-center gap-2">
        {["출근", "외근", "연차", "오전반차", "오후반차", "병가", "경조사", "조퇴", "휴무"].map(s => (
          <span key={s} className={`h-7 px-2.5 rounded-lg text-[12.5px] font-black inline-flex items-center ${ATTENDANCE_STATUS_COLOR[s]}`}>{s}</span>
        ))}
        <span className="h-7 px-2.5 rounded-lg text-[12.5px] font-black inline-flex items-center bg-[#FFF1F1] text-[#C0352F] border border-[#F6D2D2]">공휴일</span>
        <span className="h-7 px-2.5 rounded-lg text-[12.5px] font-black inline-flex items-center gap-1.5 bg-white border border-[#E3E8F0] text-[#3A4A66]"><span className="w-2 h-2 rounded-full bg-[#E5484D]" />지각</span>
        <span className="h-7 px-2.5 rounded-lg text-[12.5px] font-black inline-flex items-center gap-1.5 bg-white border border-[#E3E8F0] text-[#3A4A66]"><span className="w-2 h-2 rounded-full bg-[#E5A93B]" />요청 대기</span>
        <span className="h-7 px-2.5 rounded-lg text-[12.5px] font-black inline-flex items-center gap-1.5 bg-[#FFF4D6] border border-[#E7D3A1] text-[#6B5320]">내 기록</span>
        {monthHolidays.map(([ds, label]) => (
          <span key={ds} className="h-7 px-2.5 rounded-lg text-[12.5px] font-bold inline-flex items-center bg-[#FFF1F1] text-[#C0352F]"><span style={{ fontFamily: MONO }}>{ds.slice(5).replace("-", ".")}</span>&nbsp;{label}</span>
        ))}
        <span className="ml-auto text-[13px] font-semibold text-[#5B6B85]">
          {isHrStaff
            ? "인사팀 권한 · 직원 칸을 눌러 출·퇴근 기록을 직접 수정합니다 (본인 기록은 임원 승인 요청)"
            : "출·퇴근 기록 직접 수정은 인사팀만 가능 · 내 칸을 눌러 수정 요청"}
          {isAdmin && " · 이름을 누르면 월간 요약"}
        </span>
      </section>

      {/* 출근기록 그리드 */}
      <section className="bg-white rounded-2xl border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.05)] overflow-hidden">
        <div className="overflow-auto max-h-[72vh]">
          <table className="border-separate border-spacing-0 w-full text-[13px]" style={{ minWidth: 184 + numDays * 40 + 150 }}>
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-[4] bg-[#F8FAFD] px-4 py-2.5 text-left border-b border-r border-[#E3E8F0] min-w-[184px] w-[184px]">
                  <div className="text-[10.5px] font-extrabold tracking-[0.22em] text-[#8A97AD]" style={{ fontFamily: MONO }}>STAFF</div>
                  <div className="text-[14px] font-black text-[#0F1A30]">이름 <span className="text-[12px] font-bold text-[#8A97AD]">{visibleEmployees.length}명</span></div>
                </th>
                {dayList.map(d => {
                  const ds = dsOf(d);
                  const wd = new Date(ds + "T00:00:00").getDay();
                  const hLabel = getHolidayLabel(ds, holidays);
                  const isToday = ds === todayDateStr;
                  const red = !!hLabel || wd === 0;
                  return (
                    <th key={d} title={hLabel ? `공휴일 · ${hLabel}` : wd === 0 ? "일요일" : wd === 6 ? "토요일" : ""}
                      className={`sticky top-0 z-[2] px-0.5 pt-2 pb-1.5 text-center border-b border-[#E3E8F0] min-w-[40px] align-top ${isToday ? "bg-[#0F1A30] text-white" : red ? "bg-[#FFF5F5] text-[#D23F3F]" : wd === 6 ? "bg-[#F4F7FF] text-[#2D5BD8]" : "bg-[#F8FAFD] text-[#3A4A66]"}`}>
                      <div className="text-[15px] font-black leading-none tabular-nums" style={{ fontFamily: MONO }}>{d}</div>
                      <div className={`mt-1 text-[11px] font-bold ${isToday ? "text-white/70" : "opacity-80"}`}>{WD[wd]}</div>
                      {hLabel && <div className={`mt-0.5 mx-auto max-w-[38px] line-clamp-2 break-all text-[9.5px] font-black leading-[1.15] ${isToday ? "text-[#FFB4A8]" : "text-[#D23F3F]"}`}>{hLabel}</div>}
                    </th>
                  );
                })}
                {[["출근", "WORK"], ["지각", "LATE"], ["휴가", "LEAVE"]].map(([l, k], i) => (
                  <th key={k} className={`sticky top-0 z-[2] bg-[#F8FAFD] px-1.5 py-2 text-center border-b border-[#E3E8F0] min-w-[50px] ${i === 0 ? "border-l" : ""}`}>
                    <div className="text-[9.5px] font-extrabold tracking-[0.16em] text-[#8A97AD]" style={{ fontFamily: MONO }}>{k}</div>
                    <div className="text-[12.5px] font-black text-[#0F1A30]">{l}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleEmployees.length === 0 && (
                <tr><td colSpan={numDays + 4} className="py-16 text-center text-[14px] text-[#8A97AD] font-semibold">{search ? "검색 결과가 없습니다." : "표시할 직원이 없습니다."}</td></tr>
              )}
              {visibleEmployees.map(emp => {
                const me = emp.uid === user?.uid;
                const agg = monthAgg[emp.uid] || { work: 0, lateCount: 0, leave: 0 };
                return (
                  <tr key={emp.uid} className={`group ${me ? "bg-[#FFFBEF]" : "hover:bg-[#F8FAFD]"}`}>
                    <td
                      className={`sticky left-0 z-[1] px-4 py-2 text-left border-r border-b border-[#EEF1F6] whitespace-nowrap ${me ? "bg-[#FFF4D6] shadow-[inset_4px_0_0_#B88A2E]" : "bg-white group-hover:bg-[#F8FAFD]"} ${isAdmin ? "cursor-pointer" : ""}`}
                      onClick={() => isAdmin && setSummaryEmp(emp)}
                      title={isAdmin ? "월간 요약 보기" : ""}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[14.5px] font-black ${me ? "text-[#6B5320]" : "text-[#0F1A30]"}`}>{emp.name || emp.email}</span>
                        {me && <span className="text-[10.5px] font-black px-1.5 py-0.5 rounded bg-[#B88A2E] text-white">나</span>}
                      </div>
                      <div className="mt-0.5 text-[11.5px] font-semibold text-[#8A97AD] truncate max-w-[156px]">
                        {[emp.team, emp.position].filter(Boolean).join(" · ") || "부서 미지정"}
                        <span className="ml-1.5 tabular-nums" style={{ fontFamily: MONO }}>{emp.workStartTime ? `${emp.workStartTime}~${emp.workEndTime || "?"}` : ""}</span>
                      </div>
                    </td>
                    {dayList.map(d => {
                      const ds = dsOf(d);
                      const wd = new Date(ds + "T00:00:00").getDay();
                      const holiday = isHoliday(ds, holidays);
                      const { status: effStatus, rec } = resolveStatus(emp.uid, ds, emp.name || emp.email);
                      const late = effStatus === "출근" && isLate(rec, emp);
                      const checkIn = rec?.checkInTime ? fmtTime(rec.checkInTime) : "";
                      const checkOut = rec?.checkOutTime ? fmtTime(rec.checkOutTime) : "";
                      const key = `${emp.uid}_${ds}`;
                      const hasRejected = !!rejectedChangeMap[key];
                      const pending = pendingChangeMap[key];
                      const editable = canEditCell(emp.uid);
                      const clickable = editable || (me && ds <= todayDateStr);
                      const isToday = ds === todayDateStr;
                      const past = ds < todayDateStr;
                      const missing = !effStatus && (past || isToday) && !holiday && wd !== 0 && wd !== 6;
                      const tooltip = [
                        holiday ? `공휴일: ${getHolidayLabel(ds, holidays)}` : "",
                        effStatus ? `상태: ${effStatus}` : (missing ? "기록 없음" : ""),
                        checkIn ? `출근 ${checkIn}` : "", checkOut ? `퇴근 ${checkOut}` : "",
                        late ? "지각" : "", rec?.lateReason ? `사유: ${rec.lateReason}` : "",
                        pending ? `수정 요청 대기(${pending.requestedStatus})` : "",
                        hasRejected ? `요청 거절: ${rejectedChangeMap[key]}` : "",
                        editable ? "클릭: 기록 수정" : (me && clickable ? "클릭: 수정 요청" : ""),
                      ].filter(Boolean).join(" · ");
                      let chipCls; let text;
                      if (effStatus === "출근") { chipCls = late ? "bg-[#1B2B4B] text-[#FFC9C2] ring-1 ring-inset ring-[#E5484D]/70" : "bg-[#1B2B4B] text-white"; text = checkIn ? checkIn.replace(/^0/, "") : "출근"; }
                      else if (effStatus === "공휴일") { chipCls = "bg-[#FFF1F1] text-[#D23F3F]"; text = "휴일"; }
                      else if (effStatus === "휴무") { chipCls = wd === 6 ? "bg-[#EEF3FF] text-[#8FA6D9]" : "bg-[#FFF3F3] text-[#E0A0A0]"; text = "휴무"; }
                      else if (effStatus) { chipCls = ATTENDANCE_STATUS_COLOR[effStatus] || "bg-gray-100 text-gray-500"; text = SHORT[effStatus] || (effStatus.length > 2 ? effStatus.slice(0, 2) : effStatus); }
                      else if (missing) { chipCls = "bg-white text-[#C3CAD6] border border-dashed border-[#D5DCE6]"; text = "—"; }
                      else { chipCls = "bg-transparent text-transparent"; text = ""; }
                      return (
                        <td key={d} className={`px-[3px] py-1.5 text-center border-b border-[#EEF1F6] ${isToday ? "bg-[#2D4C82]/[0.09] border-x border-x-[#2D4C82]/25" : (holiday || wd === 0) ? "bg-[#FFF8F8]" : wd === 6 ? "bg-[#F7F9FF]" : ""}`}>
                          <button
                            type="button"
                            disabled={!clickable}
                            onClick={() => clickable && openCell(emp, ds, effStatus, rec)}
                            className={`w-full min-w-[34px] h-9 rounded-lg text-[12px] font-black tabular-nums flex items-center justify-center relative transition ${chipCls} ${clickable ? "cursor-pointer hover:brightness-110 hover:ring-2 hover:ring-[#2D4C82]/30" : "cursor-default"}`}
                            style={effStatus === "출근" && checkIn ? { fontFamily: MONO, fontSize: 11.5, letterSpacing: "-0.04em" } : undefined}
                            title={tooltip}
                          >
                            {text}
                            {late && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#E5484D] ring-2 ring-white" />}
                            {pending && !late && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#E5A93B] ring-2 ring-white" />}
                            {hasRejected && !late && !pending && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#E5484D] ring-2 ring-white" />}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-1.5 text-center border-b border-l border-[#EEF1F6] text-[14px] font-black text-[#0F1A30] tabular-nums" style={{ fontFamily: MONO }}>{agg.work}</td>
                    <td className={`px-1.5 text-center border-b border-[#EEF1F6] text-[14px] font-black tabular-nums ${agg.lateCount ? "text-[#E5484D]" : "text-[#C3CAD6]"}`} style={{ fontFamily: MONO }}>{agg.lateCount}</td>
                    <td className={`px-1.5 text-center border-b border-[#EEF1F6] text-[14px] font-black tabular-nums ${agg.leave ? "text-[#7C5CC4]" : "text-[#C3CAD6]"}`} style={{ fontFamily: MONO }}>{agg.leave}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 출근 요청 모달 (승인 가능자) */}
      {showRequestPanel && approvableCheckIn.length > 0 && (
        <Modal title="출근 요청" eyebrow="CHECK-IN · REQUESTS" count={approvableCheckIn.length} onClose={() => setShowRequestPanel(false)}>
          <div className="space-y-2">
            {approvableCheckIn.map(req => (
              <CheckInReqRow key={req.id} req={req} onApprove={handleApproveRequest} onReject={handleRejectRequest} />
            ))}
          </div>
        </Modal>
      )}

      {/* 수정 요청 모달 (승인 가능자) */}
      {showChangeReqPanel && approvableChange.length > 0 && (
        <Modal title="수정 요청" eyebrow="CHANGE · REQUESTS" count={approvableChange.length} onClose={() => setShowChangeReqPanel(false)}>
          <div className="text-[12.5px] text-[#5B6B85] mb-2">여러 명에게 간 요청은 먼저 승인한 1명의 결정으로 반영·종결됩니다.</div>
          <div className="space-y-2">
            {approvableChange.map(req => (
              <ChangeReqRow key={req.id} req={req} onApprove={approveChangeRequest} onReject={rejectChangeRequest} />
            ))}
          </div>
        </Modal>
      )}

      {/* PC 알림 배너 — 오른쪽 위 */}
      {pcNotifQueue.length > 0 && (() => {
        const notif = pcNotifQueue[0];
        const dismissPcNotif = () => {
          markNotifSeen(notif.id);
          setPcNotifQueue(prev => prev.slice(1));
          setPcNotifShowReject(false);
          setPcNotifRejectInput("");
        };
        const isRequest = notif.type === "attendance_change_request" || notif.type === "attendance_check_in_request";
        const reqForBanner = isRequest
          ? (notif.type === "attendance_change_request"
              ? approvableChange.find(r => r.id === notif.changeReqId)
              : approvableCheckIn.find(r => r.id === notif.checkInReqId || (!notif.checkInReqId && r.date === notif.date && r.name === notif.fromName)))
          : null;
        const tone = notif.status === "approved" ? "#3FB37F" : notif.status === "rejected" ? "#E5484D" : "#7FB0FF";
        return (
          <div className="fixed top-4 right-4 z-[99999] max-w-sm w-[calc(100%-2rem)]">
            <div className="bg-[#0F1A30] text-white rounded-2xl shadow-2xl p-4 space-y-2.5 border border-white/10" style={{ boxShadow: `inset 4px 0 0 ${tone}, 0 20px 40px rgba(15,26,48,0.35)` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10.5px] font-extrabold tracking-[0.22em] text-white/45" style={{ fontFamily: MONO }}>ATTENDANCE · {isRequest ? "REQUEST" : notif.status === "approved" ? "APPROVED" : notif.status === "rejected" ? "REJECTED" : "NOTICE"}</div>
                  <div className="mt-1 text-[14px] font-bold leading-snug">{notif.msg}</div>
                </div>
                <button onClick={dismissPcNotif} aria-label="닫기" className="text-white/60 hover:text-white font-bold text-[20px] leading-none shrink-0">×</button>
              </div>
              {pcNotifQueue.length > 1 && <div className="text-[12px] text-white/50">외 {pcNotifQueue.length - 1}건</div>}
              {isRequest && reqForBanner && (
                <div className="space-y-2 pt-1">
                  {!pcNotifShowReject ? (
                    <div className="flex gap-2">
                      <button onClick={async () => {
                        if (notif.type === "attendance_change_request") await approveChangeRequest(reqForBanner);
                        else await handleApproveRequest(reqForBanner);
                        dismissPcNotif();
                      }} className="flex-1 h-9 rounded-lg bg-white text-[#0F1A30] text-[13px] font-black">승인</button>
                      <button onClick={() => { setPcNotifShowReject(true); setPcNotifRejectInput(""); }}
                        className="flex-1 h-9 rounded-lg border border-white/30 text-white/80 text-[13px] font-bold hover:bg-white/10">거절</button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <input type="text" placeholder="거절 사유" value={pcNotifRejectInput} onChange={e => setPcNotifRejectInput(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-white/30 bg-white/10 text-white text-[13px] placeholder-white/40 outline-none" />
                      <div className="flex gap-2">
                        <button onClick={() => { setPcNotifShowReject(false); setPcNotifRejectInput(""); }}
                          className="flex-1 h-9 rounded-lg border border-white/30 text-white/60 text-[13px] font-bold">취소</button>
                        <button onClick={async () => {
                          if (notif.type === "attendance_change_request") await rejectChangeRequest(reqForBanner, pcNotifRejectInput);
                          else await handleRejectRequest(reqForBanner, pcNotifRejectInput);
                          dismissPcNotif();
                        }} className="flex-1 h-9 rounded-lg bg-white/20 text-white text-[13px] font-black">거절 확정</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {isRequest && !reqForBanner && <div className="text-[12px] text-white/50">이미 처리됐거나 승인 권한이 없는 요청입니다.</div>}
              {notif.type === "attendance_result" && notif.rejectionReason && (
                <div className="text-[12.5px] text-white/65">거절 사유: {notif.rejectionReason}</div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 출근 수정 모달 (인사팀) */}
      {editCell && (
        <Modal title={`${editCell.name} · ${editCell.date}`} eyebrow="EDIT · HR ONLY" onClose={() => setEditCell(null)} narrow>
          <div className="text-[13px] text-[#5B6B85] mb-3">출근 상태 및 시간을 직접 수정합니다. 수정 이력이 남습니다.</div>
          <EditForm editCell={editCell} onSave={saveEdit} onCancel={() => setEditCell(null)} />
        </Modal>
      )}

      {/* 수정 요청 모달 (본인 기록) */}
      {changeRequestCell && (
        <Modal title="수정 요청" eyebrow="CHANGE · REQUEST" onClose={() => setChangeRequestCell(null)} narrow>
          <div className="space-y-4">
            <div className="text-[13px] text-[#5B6B85]"><span style={{ fontFamily: MONO }}>{changeRequestCell.date}</span> · {changeRequestCell.emp.name} — <b className="text-[#1B2B4B]">{myApproverLabel}</b> 승인 후 반영됩니다.</div>
            {(() => {
              const rejReason = rejectedChangeMap[`${changeRequestCell.emp.uid}_${changeRequestCell.date}`];
              return rejReason ? (
                <div className="px-3 py-2 rounded-xl bg-[#FFF8F8] border border-[#F6D2D2]">
                  <div className="text-[12px] font-bold text-[#8A5A57] mb-0.5">이전 요청 거절 사유</div>
                  <div className="text-[13px] text-[#3A4A66]">{rejReason}</div>
                </div>
              ) : null;
            })()}
            <div>
              <div className="text-[13px] font-bold text-[#3A4A66] mb-1.5">상태</div>
              <select value={changeReqStatus} onChange={e => setChangeReqStatus(e.target.value)} className={`${inputCls} w-full`}>
                {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {changeReqStatus === "출근" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <div className="text-[13px] font-bold text-[#3A4A66] mb-1">출근 시간</div>
                  <input type="time" value={changeReqTime} onChange={e => setChangeReqTime(e.target.value)} className={`${inputCls} w-full`} />
                </label>
                <label className="block">
                  <div className="text-[13px] font-bold text-[#3A4A66] mb-1">퇴근 시간 (선택)</div>
                  <input type="time" value={changeReqCheckOut} onChange={e => setChangeReqCheckOut(e.target.value)} className={`${inputCls} w-full`} />
                </label>
              </div>
            )}
            <label className="block">
              <div className="text-[13px] font-bold text-[#3A4A66] mb-1">요청 사유</div>
              <input type="text" placeholder="변경 요청 사유를 입력하세요" value={changeReqReason} onChange={e => setChangeReqReason(e.target.value)} className={`${inputCls} w-full`} />
            </label>
            <div className="flex gap-2">
              <button onClick={() => setChangeRequestCell(null)} className="flex-1 h-11 rounded-xl border border-[#DCE3EE] text-[14px] font-bold text-[#5B6B85]">취소</button>
              <button onClick={submitChangeRequest} disabled={submittingChangeReq} className="flex-1 h-11 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-black disabled:opacity-50">
                {submittingChangeReq ? "요청 중..." : "요청"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 출근 요청 시간 입력 모달 */}
      {showCheckInRequestModal && (
        <Modal title="출근 요청" eyebrow="CHECK-IN · REQUEST" onClose={() => setShowCheckInRequestModal(false)} narrow>
          <div className="text-[13px] text-[#5B6B85] mb-4">실제 출근한 시간을 입력하세요. <b className="text-[#1B2B4B]">{myApproverLabel}</b> 승인 후 출근 처리됩니다.</div>
          <label className="block mb-4">
            <div className="text-[13px] font-bold text-[#3A4A66] mb-1">출근 시간</div>
            <input type="time" value={requestCheckInTime} onChange={e => setRequestCheckInTime(e.target.value)} className={`${inputCls} w-full h-11 text-[16px]`} />
          </label>
          <div className="flex gap-2">
            <button onClick={() => setShowCheckInRequestModal(false)} className="flex-1 h-11 rounded-xl border border-[#DCE3EE] text-[14px] font-bold text-[#5B6B85]">취소</button>
            <button onClick={async () => {
              if (!requestCheckInTime) return;
              setRequestingCheckIn(true);
              try {
                const [h, m] = requestCheckInTime.split(":").map(Number);
                const dt = new Date(todayDateStr + "T00:00:00");
                dt.setHours(h, m, 0, 0);
                const r = await submitCheckInReq({ requester: meProfile, date: todayDateStr, requestedAt: dt.toISOString(), company, employees, customRoles });
                if (!r.count) alert("승인할 담당자가 없어 요청만 저장했습니다. 인사팀·임원 지정 여부를 확인해 주세요.");
                setShowCheckInRequestModal(false);
              } catch (e) {
                alert(`요청하지 못했습니다: ${e?.message || e}`);
              } finally {
                setRequestingCheckIn(false);
              }
            }} disabled={requestingCheckIn || !requestCheckInTime}
              className="flex-1 h-11 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-black disabled:opacity-50">
              {requestingCheckIn ? "요청 중..." : "요청"}
            </button>
          </div>
        </Modal>
      )}

      {/* 근무시간 편집 모달 */}
      {editScheduleEmp && (
        <div className="fixed inset-0 bg-black/50 z-[999999] flex items-center justify-center p-4" onClick={() => setEditScheduleEmp(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5" onClick={e => e.stopPropagation()}>
            <div className="text-[16px] font-black text-[#0F1A30] mb-1">{editScheduleEmp.name || editScheduleEmp.email}</div>
            <div className="text-[13px] text-[#8A97AD] mb-4">정규 근무시간을 설정합니다.</div>
            <div className="space-y-3">
              <label className="block">
                <div className="text-[13px] font-bold text-[#3A4A66] mb-1.5">출근 시간</div>
                <input type="time" value={editWorkStart} onChange={e => setEditWorkStart(e.target.value)} className={`${inputCls} w-full`} />
              </label>
              <label className="block">
                <div className="text-[13px] font-bold text-[#3A4A66] mb-1.5">퇴근 시간</div>
                <input type="time" value={editWorkEnd} onChange={e => setEditWorkEnd(e.target.value)} className={`${inputCls} w-full`} />
              </label>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditScheduleEmp(null)} className="flex-1 h-10 rounded-xl border border-[#DCE3EE] text-[#5B6B85] text-[13.5px] font-bold">취소</button>
                <button onClick={() => saveWorkSchedule(editScheduleEmp.uid)} className="flex-1 h-10 rounded-xl bg-[#1B2B4B] text-white text-[13.5px] font-black">저장</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 월간 요약 팝업 */}
      {summaryEmp && summaryData && (
        <Modal title={summaryEmp.name || summaryEmp.email} eyebrow={`SUMMARY · ${year}.${String(month).padStart(2, "0")}`} onClose={() => setSummaryEmp(null)} narrow>
          <div className="mb-4 px-3.5 py-3 rounded-xl bg-[#F5F7FB] border border-[#E3E8F0] flex items-center justify-between">
            <div>
              <div className="text-[12.5px] font-bold text-[#8A97AD]">정규 근무시간</div>
              <div className="text-[15px] font-black text-[#0F1A30] mt-0.5 tabular-nums" style={{ fontFamily: MONO }}>{summaryEmp.workStartTime || "-"} ~ {summaryEmp.workEndTime || "-"}</div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); setEditWorkStart(summaryEmp.workStartTime || "09:00"); setEditWorkEnd(summaryEmp.workEndTime || "18:00"); setEditScheduleEmp(summaryEmp); }} className={btnCls(false)}>설정</button>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {Object.keys(ATTENDANCE_STATUS_COLOR).map(key => (
              summaryData.counts[key] ? (
                <div key={key} className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-[#E3E8F0]">
                  <span className={`px-2 py-0.5 rounded-md text-[12px] font-black ${ATTENDANCE_STATUS_COLOR[key]}`}>{key}</span>
                  <span className="text-[16px] font-black text-[#0F1A30] tabular-nums" style={{ fontFamily: MONO }}>{summaryData.counts[key]}<span className="text-[12px] text-[#8A97AD] ml-0.5">일</span></span>
                </div>
              ) : null
            ))}
            {summaryData.lateCount > 0 && (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-[#F6D2D2] bg-[#FFF8F8]">
                <span className="text-[13px] font-black text-[#C0352F]">지각</span>
                <span className="text-[16px] font-black text-[#C0352F] tabular-nums" style={{ fontFamily: MONO }}>{summaryData.lateCount}<span className="text-[12px] ml-0.5">회</span></span>
              </div>
            )}
            {Object.keys(summaryData.counts).length === 0 && (
              <div className="col-span-2 text-[13px] text-[#8A97AD] text-center py-3">기록이 없습니다.</div>
            )}
          </div>
          <button onClick={() => setSummaryEmp(null)} className="w-full h-11 rounded-xl border border-[#DCE3EE] text-[#5B6B85] text-[14px] font-bold hover:bg-[#F5F7FB]">닫기</button>
        </Modal>
      )}

      {/* 직원 표시 관리 모달 */}
      {showEmpFilter && isAdmin && (
        <Modal title="직원 표시 관리" eyebrow="STAFF · VISIBILITY" onClose={() => setShowEmpFilter(false)}>
          <input type="text" placeholder="이름 검색..." value={empFilterSearch} onChange={e => setEmpFilterSearch(e.target.value)} className={`${inputCls} w-full mb-2`} />
          <div className="max-h-96 overflow-y-auto divide-y divide-[#EEF1F6]">
            {employees.filter(emp => !empFilterSearch || (emp.name || emp.email || "").includes(empFilterSearch)).map(emp => (
              <label key={emp.uid} className="flex items-center gap-3 py-2.5 cursor-pointer">
                <input type="checkbox" checked={!hiddenEmpUids.includes(emp.uid)} onChange={() => toggleHideEmp(emp.uid)} className="w-4 h-4 accent-[#1B2B4B]" />
                <span className="flex-1 text-[14.5px] font-bold text-[#0F1A30]">{emp.name || emp.email}<span className="ml-2 text-[12px] font-semibold text-[#8A97AD]">{[emp.team, emp.position].filter(Boolean).join(" · ")}</span></span>
                {emp.workStartTime && <span className="text-[12px] text-[#8A97AD] tabular-nums" style={{ fontFamily: MONO }}>{emp.workStartTime}~{emp.workEndTime || "-"}</span>}
              </label>
            ))}
          </div>
          <div className="pt-3 flex justify-end">
            <button onClick={() => setShowEmpFilter(false)} className="h-10 px-5 rounded-xl bg-[#1B2B4B] text-white text-[13.5px] font-black">확인</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// 공용 모달 — 네이비 헤더 + mono 라벨
function Modal({ title, eyebrow, count, onClose, narrow = false, children }) {
  return (
    <div className="fixed inset-0 bg-[#0F1A30]/45 z-[99999] flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${narrow ? "max-w-sm" : "max-w-md"} overflow-hidden`} onClick={e => e.stopPropagation()}>
        <div className="bg-[#0F1A30] px-5 py-3.5 flex items-center justify-between">
          <div className="min-w-0">
            {eyebrow && <div className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#9FB4DA]" style={{ fontFamily: MONO }}>{eyebrow}</div>}
            <div className="text-white font-black text-[16px] truncate">{title}{count != null && <span className="ml-2 px-2 py-0.5 rounded-full bg-white/15 text-[12px]">{count}</span>}</div>
          </div>
          <button onClick={onClose} aria-label="닫기" className="text-white/70 hover:text-white font-bold text-[22px] leading-none">×</button>
        </div>
        <div className="p-5 max-h-[78vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function ReqRowShell({ title, sub, reason, group, onApprove, onReject }) {
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="bg-[#F5F7FB] border border-[#E3E8F0] rounded-xl px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[14px] font-black text-[#0F1A30]">{title}</div>
          <div className="text-[13px] text-[#3A4A66] font-semibold tabular-nums">{sub}</div>
          {reason && <div className="text-[12.5px] text-[#8A97AD] mt-0.5">사유: {reason}</div>}
          {group && <div className="mt-1 inline-block text-[11px] font-black px-1.5 py-0.5 rounded bg-white border border-[#E3E8F0] text-[#5B6B85]">{APPROVER_GROUP_LABEL[group] || group} 승인 건</div>}
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button disabled={busy} onClick={async () => { setBusy(true); try { await onApprove(); } finally { setBusy(false); } }} className="h-9 px-3.5 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-black disabled:opacity-50">{busy ? "…" : "승인"}</button>
          <button onClick={() => setShowRejectInput(v => !v)} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] bg-white text-[#5B6B85] text-[13px] font-bold">거절</button>
        </div>
      </div>
      {showRejectInput && (
        <div className="mt-2 flex gap-1.5">
          <input type="text" placeholder="거절 사유" value={rejectReason} onChange={e => setRejectReason(e.target.value)} className="flex-1 h-9 px-3 rounded-lg border border-[#DCE3EE] text-[13px] outline-none focus:border-[#2D4C82]" />
          <button disabled={busy} onClick={async () => { setBusy(true); try { await onReject(rejectReason); } finally { setBusy(false); } }} className="h-9 px-3.5 rounded-lg bg-[#0F1A30] text-white text-[13px] font-black">확인</button>
        </div>
      )}
    </div>
  );
}

function CheckInReqRow({ req, onApprove, onReject }) {
  return <ReqRowShell title={req.name} sub={`${req.date} · ${fmtTime(req.requestedAt)} 출근 요청`} group={req.approverGroup} onApprove={() => onApprove(req)} onReject={(r) => onReject(req, r)} />;
}

function ChangeReqRow({ req, onApprove, onReject }) {
  const sub = `${req.date} · ${req.requestedStatus}${req.requestedCheckIn ? ` ${String(req.requestedCheckIn).slice(11, 16)}` : ""}${req.requestedCheckOut ? ` ~ ${String(req.requestedCheckOut).slice(11, 16)}` : ""}`;
  return <ReqRowShell title={req.name} sub={sub} reason={req.reason} group={req.approverGroup} onApprove={() => onApprove(req)} onReject={(r) => onReject(req, r)} />;
}

function EditForm({ editCell, onSave, onCancel }) {
  const [status, setStatus] = useState(editCell.current?.status || "출근");
  const [time, setTime] = useState(editCell.current?.checkInTime ? fmtTime(editCell.current.checkInTime) : (editCell.workStartTime || "09:00"));
  const [checkOutTime, setCheckOutTime] = useState(editCell.current?.checkOutTime ? fmtTime(editCell.current.checkOutTime) : "");
  const [lateReason, setLateReason] = useState(editCell.current?.lateReason || "");
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[13px] font-bold text-[#3A4A66] mb-1.5">상태</div>
        <div className="grid grid-cols-3 gap-1.5">
          {STATUS_OPTIONS.map(o => (
            <button key={o} onClick={() => setStatus(o)}
              className={`h-9 rounded-lg text-[13px] font-bold border transition ${status === o ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-[#5B6B85] border-[#DCE3EE] hover:border-[#2D4C82]"}`}>
              {o}
            </button>
          ))}
        </div>
      </div>
      {status === "출근" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <div className="text-[13px] font-bold text-[#3A4A66] mb-1.5">출근 시간</div>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className={`${inputCls} w-full`} />
            </label>
            <label className="block">
              <div className="text-[13px] font-bold text-[#3A4A66] mb-1.5">퇴근 시간 (선택)</div>
              <input type="time" value={checkOutTime} onChange={e => setCheckOutTime(e.target.value)} className={`${inputCls} w-full`} />
            </label>
          </div>
          {(() => {
            const [sh, sm] = (editCell.workStartTime || "09:00").split(":").map(Number);
            const [ch, cm] = (time || "00:00").split(":").map(Number);
            const isLateCheck = ch * 60 + cm > sh * 60 + sm;
            return isLateCheck ? (
              <label className="block">
                <div className="text-[12.5px] text-[#C0352F] font-bold mb-1">지각 사유</div>
                <input type="text" placeholder="지각 사유를 입력하세요 (선택)" value={lateReason} onChange={e => setLateReason(e.target.value)} className={`${inputCls} w-full`} />
              </label>
            ) : null;
          })()}
        </>
      )}
      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} className="flex-1 h-11 rounded-xl border border-[#DCE3EE] text-[#5B6B85] text-[14px] font-bold hover:bg-[#F5F7FB]">취소</button>
        {editCell.current && (
          <button onClick={() => onSave(null, null, null)} className="flex-1 h-11 rounded-xl border border-[#DCE3EE] text-[#5B6B85] text-[14px] font-bold hover:bg-[#F5F7FB]">초기화</button>
        )}
        <button onClick={() => onSave(status, status === "출근" ? `${editCell.date}T${time}:00` : null, status === "출근" && checkOutTime ? `${editCell.date}T${checkOutTime}:00` : null, lateReason)}
          className="flex-1 h-11 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-black hover:bg-[#243a60]">저장</button>
      </div>
      {editCell.current?.history?.length > 0 && (
        <div className="pt-3 border-t border-[#EEF1F6]">
          <div className="text-[13px] font-black text-[#0F1A30] mb-1.5">수정 이력</div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {[...editCell.current.history].sort((a, b) => (b.editedAt || "").localeCompare(a.editedAt || "")).map((h, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-[12px] text-[#5B6B85] bg-[#F5F7FB] rounded-lg px-2.5 py-1.5">
                <span className="font-bold text-[#3A4A66]">
                  {h.status}{h.checkInTime ? ` · 출근${fmtTime(h.checkInTime)}` : ""}{h.checkOutTime ? ` · 퇴근${fmtTime(h.checkOutTime)}` : ""}
                </span>
                <span className="whitespace-nowrap">{h.editedByName || "관리자"} · {(h.editedAt || "").slice(0, 16).replace("T", " ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
