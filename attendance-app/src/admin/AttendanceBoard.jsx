import { useEffect, useMemo, useRef, useState } from "react";
import { collection, query, where, onSnapshot, doc, setDoc, getDoc, getDocs, updateDoc, addDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import {
  ClipboardCheck,
  FileSpreadsheet,
  RefreshCw,
  Pencil,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Check,
  X as XIcon,
  Trash2,
  CalendarRange,
  CheckCircle2,
  Zap,
  Moon,
  CalendarCheck,
  Stethoscope,
  XCircle,
  Wand2,
  Printer,
  Eraser,
  Upload,
} from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import DraggableTh from "../components/DraggableTh";
import ColumnVisibilityButton from "../components/ColumnVisibilityButton";
import MiniMonthCalendar from "../components/MiniMonthCalendar";
import { useColumnPrefs } from "../hooks/useColumnPrefs";
import { downloadCsv } from "../utils/exportCsv";
import { toDateKey, toMonthKey, formatTime, formatDate, attendanceDocId, calculateAge } from "../utils/dateUtils";
import { computeCheckInStatus } from "../utils/attendanceStatus";
import { calcLeaveBalance } from "../utils/leave";
import { isKrHoliday } from "../utils/holidaysKR";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  SHIFT_TYPE_OPTIONS,
  NATIONALITY_OPTIONS,
  COUNTRY_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
} from "../constants/hr";
import SmsButton from "../components/SmsButton";
import { daysInMonth, WEEKDAY_LABELS, leaveStatusOn } from "../utils/statsShared";

// 월별 스케줄표 셀/일괄편집에서 고를 수 있는 근태 상태 — 출근·특근은
// attendance 컬렉션에, 나머지는 leaves 컬렉션(type=키)에 기록한다.
const GRID_STATUS_OPTIONS = [
  { key: "출근", label: "출근", desc: "정상 출근으로 표시", icon: CheckCircle2, tone: "bg-primary text-white" },
  { key: "특근", label: "특근", desc: "휴일/추가 근무", icon: Zap, tone: "bg-indigo-500 text-white" },
  { key: "휴무", label: "휴무", desc: "무급 휴무일", icon: Moon, tone: "bg-slate-500 text-white" },
  { key: "연차", label: "연차", desc: "연차 1일 사용", icon: CalendarCheck, tone: "bg-amber-500 text-white" },
  { key: "오전반차", label: "오전반차", desc: "연차 0.5일 사용", icon: CalendarCheck, tone: "bg-amber-400 text-white" },
  { key: "오후반차", label: "오후반차", desc: "연차 0.5일 사용", icon: CalendarCheck, tone: "bg-amber-400 text-white" },
  { key: "병가", label: "병가", desc: "질병으로 인한 휴가", icon: Stethoscope, tone: "bg-purple-500 text-white" },
  { key: "결근", label: "결근", desc: "무단/사유 결근", icon: XCircle, tone: "bg-danger text-white" },
];
const GRID_CELL_META = {
  출근: { label: "출", className: "bg-primary text-white font-semibold" },
  지각: { label: "지", className: "bg-primary/70 text-white font-semibold" },
  특근: { label: "특", className: "bg-indigo-500 text-white font-semibold" },
  휴무: { label: "휴", className: "bg-slate-200 text-slate-600" },
  "관리자 처리": { label: "휴", className: "bg-slate-200 text-slate-600" },
  연차: { label: "연", className: "bg-amber-100 text-amber-700 font-semibold" },
  오전반차: { label: "오전", className: "bg-amber-100 text-amber-700 text-[9px] font-semibold" },
  오후반차: { label: "오후", className: "bg-amber-100 text-amber-700 text-[9px] font-semibold" },
  병가: { label: "병", className: "bg-purple-100 text-purple-700 font-semibold" },
  결근: { label: "결", className: "bg-red-50 text-danger" },
  "": { label: "", className: "text-slate-300" },
  // 입사 전/퇴사 후 — 근무 대상 기간이 아니므로 결근과 구분되는 통짜 회색으로 표시하고 집계에서 뺀다.
  OUT: { label: "", className: "bg-slate-200/70" },
};
// 입사일부터 오늘(혹은 기준일)까지 근속일수 — "D+n" 형태로 표시한다.
function daysSinceHire(hireDate, todayKey) {
  if (!hireDate) return null;
  const start = new Date(`${hireDate}T00:00:00`);
  const end = new Date(`${todayKey}T00:00:00`);
  return Math.floor((end - start) / 86400000) + 1;
}
// 다음 달(YYYY-MM) 키 — 일괄편집 기본값으로 쓴다.
function nextMonthKey(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const VIEW_OPTIONS = ["출근현황", "휴무현황", "수정현황", "변경요청"];
const CHANGE_REQUEST_STATUS_TONE = { pending: "warning", approved: "success", rejected: "danger" };
const CHANGE_REQUEST_STATUS_LABEL = { pending: "승인대기", approved: "승인됨", rejected: "반려됨" };
const EDIT_STATUS_OPTIONS = ["출근", "지각", "조퇴", "출근전", "결근"];

const EMPTY_FILTERS = {
  siteId: "",
  vendorId: "",
  shiftType: "",
  employmentType: "",
  team: "",
  position: "",
  nationality: "",
  country: "",
  name: "",
  phone: "",
};

export default function AttendanceBoard() {
  const { profile, user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [companyName, setCompanyName] = useState("");
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [edits, setEdits] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNote, setRejectNote] = useState("");

  // 출근현황 센터 드롭다운을 바꿀 때 화면 중앙에 잠깐 깜빡였다 사라지는
  // 안내 배너 — 어느 센터로 조회 중인지 즉시 눈에 띄게 알려준다.
  const [centerBanner, setCenterBanner] = useState(null);
  const centerBannerTimerRef = useRef(null);
  const flashCenterBanner = (siteId) => {
    const label = siteId ? siteName_(siteId) : "전체 센터";
    setCenterBanner(`${label}로 조회했습니다`);
    clearTimeout(centerBannerTimerRef.current);
    centerBannerTimerRef.current = setTimeout(() => setCenterBanner(null), 2000);
  };
  useEffect(() => () => clearTimeout(centerBannerTimerRef.current), []);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  // 출근현황 탭 검색창: 이름 입력 + 세부검색(드롭다운) 값을 바로 filters에
  // 반영하지 않고 이 초안(draft)에 모아뒀다가 검색 버튼을 눌러야만 실제
  // 목록/월별 스케줄표에 적용되도록 한다 — 초기화는 즉시 전체를 보여준다.
  const [searchDraft, setSearchDraft] = useState(EMPTY_FILTERS);
  const [detailSearchOpen, setDetailSearchOpen] = useState(false);
  const applyAttendanceSearch = () => {
    setFilters(searchDraft);
    setAttendancePage(1);
  };
  const resetAttendanceSearch = () => {
    setSearchDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setAttendancePage(1);
    setDetailSearchOpen(false);
  };
  const [range, setRange] = useState({ start: toDateKey(), end: toDateKey() });
  const [view, setView] = useState("출근현황");
  const [selected, setSelected] = useState(() => new Set());
  const [editField, setEditField] = useState("checkInTime");
  const [editTime, setEditTime] = useState("");
  const [editReason, setEditReason] = useState("");
  const [statusAction, setStatusAction] = useState("출근전");
  const [detail, setDetail] = useState(null);
  const [detailEditMode, setDetailEditMode] = useState(false);
  const [detailForm, setDetailForm] = useState({ checkInTime: "", checkOutTime: "", status: "", reason: "" });

  // 출근현황 근로자 목록 더블클릭 — 예전엔 근로자목록 메뉴로 이동시켰지만,
  // 관리자가 화면 이동 없이 출근현황에서 바로 확인/수정할 수 있도록
  // 외부인력은 간단 정보 팝업, 자사 근로자는 제자리 수정 팝업을 띄운다.
  const [externalInfoTarget, setExternalInfoTarget] = useState(null);
  const [quickEditTarget, setQuickEditTarget] = useState(null);
  const [quickEditForm, setQuickEditForm] = useState(null);
  const [quickEditSaving, setQuickEditSaving] = useState(false);

  // 도급팀이 실제로 쓰던 엑셀 휴무계획표(근로자 x 1~31일 달력형 표)를
  // 참고해, 출근현황 메뉴 하단에 같은 형태의 월별 스케줄표를 추가한다.
  // 출근현황(카드 목록)과 별개로 한 달 전체를 한눈에 보고 셀 단위로
  // 바로 수정할 수 있게 하는 것이 목적이라, 별도의 월/데이터 상태로 관리한다.
  const [leaveMonth, setLeaveMonth] = useState(toMonthKey());
  const [leaveSearch, setLeaveSearch] = useState("");
  // 출근현황 근무자 목록 리스트 페이지네이션(10명씩) — 필터가 바뀌면 1페이지로.
  const [attendancePage, setAttendancePage] = useState(1);
  const [gridMonth, setGridMonth] = useState(toMonthKey());
  const [gridAttendance, setGridAttendance] = useState([]);
  const [gridLeaves, setGridLeaves] = useState([]);
  const [gridRemarks, setGridRemarks] = useState([]);
  // 스케줄등록(Schedule.jsx) 각 현황과 연동하기 위해 이 달의 schedules 문서도
  // 함께 구독한다 — writeDayStatus가 그리드에 상태를 찍을 때마다 같은
  // uid+date의 schedules 문서도 같이 갱신해, 스케줄등록 메뉴가 매일 그
  // 날짜에 맞는 상태(출근확정/휴무/대기)로 자동 반영되게 한다.
  const [gridSchedules, setGridSchedules] = useState([]);
  const [gridEditCell, setGridEditCell] = useState(null);
  const [gridSaving, setGridSaving] = useState(false);
  // 일괄편집(다음달 스케줄 미리 채우기): 대상 근로자/월을 고르고, 상태별로
  // 날짜를 찍어 지정한 뒤 저장하면 지정한 날짜는 그 상태로, 나머지는 전부
  // 출근으로 한번에 채운다. 중간에 스케줄이 바뀌어도 저장 후 낱개 셀 수정은
  // 그대로 가능하다.
  const [bulkTarget, setBulkTarget] = useState(null);
  const [bulkMonth, setBulkMonth] = useState(nextMonthKey(toMonthKey()));
  const [bulkActiveStatus, setBulkActiveStatus] = useState("휴무");
  const [bulkDayMap, setBulkDayMap] = useState({});
  const [bulkSaving, setBulkSaving] = useState(false);

  // 업체에서 보내주는 출근기록부(엑셀) 업로드 — 이름+전화번호로 등록된
  // 근로자와 매칭되는 행만 그 달의 그리드에 반영하고, 매칭되지 않는 행은
  // 건너뛴다.
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    getDoc(doc(db, "companies", profile.companyId)).then((s) => setCompanyName(s.data()?.name || ""));
    const unsubs = [
      onSnapshot(
        query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")),
        // 삭제(탈퇴)된 근로자는 걸러내야 한다 — 안 그러면 근로자목록에서 이미
        // 삭제한 계정의 옛 출근기록이 출근현황에 계속 남아있게 된다.
        (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => !e.deleted))
      ),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (snap) =>
        setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "vendors"), where("companyId", "==", profile.companyId)), (snap) =>
        setVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "departments"), where("companyId", "==", profile.companyId)), (snap) =>
        setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "positions"), where("companyId", "==", profile.companyId)), (snap) =>
        setPositions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(
        collection(db, "attendance"),
        where("companyId", "==", profile.companyId),
        where("date", ">=", range.start),
        where("date", "<=", range.end)
      ),
      (snap) => setAttendance(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId, range.start, range.end]);

  useEffect(() => {
    if (!profile?.companyId || view !== "출근현황") return;
    const unsubAtt = onSnapshot(
      query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("month", "==", gridMonth)),
      (snap) => setGridAttendance(snap.docs.map((d) => d.data()))
    );
    const unsubLeaves = onSnapshot(
      query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("status", "==", "approved")),
      (snap) => setGridLeaves(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubRemarks = onSnapshot(
      query(collection(db, "scheduleRemarks"), where("companyId", "==", profile.companyId), where("month", "==", gridMonth)),
      (snap) => setGridRemarks(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const monthStart = `${gridMonth}-01`;
    const monthEnd = `${gridMonth}-31`;
    const unsubSchedules = onSnapshot(
      query(
        collection(db, "schedules"),
        where("companyId", "==", profile.companyId),
        where("date", ">=", monthStart),
        where("date", "<=", monthEnd)
      ),
      (snap) => setGridSchedules(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubAtt();
      unsubLeaves();
      unsubRemarks();
      unsubSchedules();
    };
  }, [profile?.companyId, view, gridMonth]);

  useEffect(() => {
    if (!profile?.companyId || view !== "휴무현황") return;
    const unsub = onSnapshot(
      query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("status", "==", "approved")),
      (snap) => setLeaves(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId, view]);

  useEffect(() => {
    if (!profile?.companyId || view !== "수정현황") return;
    const unsub = onSnapshot(
      query(collection(db, "attendanceEdits"), where("companyId", "==", profile.companyId)),
      (snap) => setEdits(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId, view]);

  useEffect(() => {
    if (!profile?.companyId || view !== "변경요청") return;
    const unsub = onSnapshot(
      query(collection(db, "attendanceChangeRequests"), where("companyId", "==", profile.companyId)),
      (snap) => setChangeRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId, view]);

  const sortedChangeRequests = useMemo(
    () => [...changeRequests].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
    [changeRequests]
  );

  // 휴무현황: 선택한 달과 겹치는 휴가만, 이름으로 간단 검색.
  const monthLeaves = useMemo(() => {
    const monthStart = `${leaveMonth}-01`;
    const monthEnd = `${leaveMonth}-31`;
    return leaves
      .filter((lv) => lv.startDate <= monthEnd && (lv.endDate || lv.startDate) >= monthStart)
      .filter((lv) => !leaveSearch.trim() || lv.name?.includes(leaveSearch.trim()))
      .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  }, [leaves, leaveMonth, leaveSearch]);

  // 종류별 뱃지 톤 + 기간의 실제 일수(달력일 기준) — 휴무현황 표에 함께 쓴다.
  const LEAVE_TYPE_TONE = { 연차: "primary", 오전반차: "primary", 오후반차: "primary", 병가: "warning", 휴무: "muted", 결근: "danger" };
  const leaveDayCount = (lv) => {
    const start = new Date(`${lv.startDate}T00:00:00`);
    const end = new Date(`${lv.endDate || lv.startDate}T00:00:00`);
    const days = Math.round((end - start) / 86400000) + 1;
    return lv.type === "오전반차" || lv.type === "오후반차" ? 0.5 : Math.max(days, 1);
  };
  const monthLeaveTypeTotals = useMemo(() => {
    const totals = {};
    for (const lv of monthLeaves) totals[lv.type] = (totals[lv.type] || 0) + leaveDayCount(lv);
    return totals;
  }, [monthLeaves]);

  // 출근시각이 수정될 때마다 지각 여부를 스케줄 출근예정시각 기준으로
  // 다시 계산한다 — 안 그러면 관리자가 지각 전 시간으로 고쳐도, 또는
  // 근로자의 시간 변경요청을 승인해도 상태는 체크인 당시의 "지각"에
  // 그대로 머물러 있게 된다.
  const recomputeCheckInStatus = async (uid, date, checkInIso) => {
    if (!checkInIso) return null;
    const snap = await getDocs(
      query(
        collection(db, "schedules"),
        where("companyId", "==", profile.companyId),
        where("uid", "==", uid),
        where("date", "==", date)
      )
    );
    const startTime = snap.docs[0]?.data()?.startTime;
    if (!startTime) return null;
    return computeCheckInStatus(startTime, new Date(checkInIso));
  };

  const approveChangeRequest = async (req) => {
    const newIso = `${req.date}T${req.requestedTime}:00`;
    const updates = { [req.field]: newIso, source: "manual" };
    if (req.field === "checkInTime") {
      const newStatus = await recomputeCheckInStatus(req.uid, req.date, newIso);
      if (newStatus) updates.status = newStatus;
    }
    await updateDoc(doc(db, "attendance", req.attendanceId), updates);
    await addDoc(collection(db, "attendanceEdits"), {
      companyId: profile.companyId,
      uid: req.uid,
      name: req.name,
      date: req.date,
      field: req.fieldLabel,
      oldValue: req.currentTime || "-",
      newValue: req.requestedTime,
      reason: `근로자 변경요청 승인 (${req.reason})`,
      editedAt: serverTimestamp(),
      editedBy: user?.uid || null,
    });
    await updateDoc(doc(db, "attendanceChangeRequests", req.id), {
      status: "approved",
      decidedAt: serverTimestamp(),
      decidedBy: user?.uid || null,
    });
    await addDoc(collection(db, "notifications"), {
      companyId: profile.companyId,
      uid: req.uid,
      title: "출근기록 변경 요청이 승인되었습니다",
      message: `${formatDate(req.date)} ${req.fieldLabel} → ${req.requestedTime}`,
      link: "/history",
      read: false,
      createdAt: serverTimestamp(),
    });
  };

  const rejectChangeRequest = async () => {
    if (!rejectTarget) return;
    await updateDoc(doc(db, "attendanceChangeRequests", rejectTarget.id), {
      status: "rejected",
      adminNote: rejectNote.trim(),
      decidedAt: serverTimestamp(),
      decidedBy: user?.uid || null,
    });
    await addDoc(collection(db, "notifications"), {
      companyId: profile.companyId,
      uid: rejectTarget.uid,
      title: "출근기록 변경 요청이 반려되었습니다",
      message: `${formatDate(rejectTarget.date)} ${rejectTarget.fieldLabel}${rejectNote.trim() ? ` · ${rejectNote.trim()}` : ""}`,
      link: "/history",
      read: false,
      createdAt: serverTimestamp(),
    });
    setRejectTarget(null);
    setRejectNote("");
  };

  const deleteLeave = async (lv) => {
    if (!(await confirm(`${lv.name || ""} 근로자의 휴무 기록을 삭제하시겠습니까?`, "delete"))) return;
    await deleteDoc(doc(db, "leaves", lv.id));
    toast.success("삭제되었습니다");
  };

  const deleteEdit = async (e) => {
    if (!(await confirm("이 수정 내역을 삭제하시겠습니까?", "delete"))) return;
    await deleteDoc(doc(db, "attendanceEdits", e.id));
    toast.success("삭제되었습니다");
  };

  const deleteChangeRequest = async (r) => {
    if (!(await confirm("이 변경 요청을 삭제하시겠습니까?", "delete"))) return;
    await deleteDoc(doc(db, "attendanceChangeRequests", r.id));
    toast.success("삭제되었습니다");
  };

  const employeeByUid = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";
  // 센터를 "전체"로 두고 볼 때는 이름순보다 센터별로 묶어서 보는 게 더
  // 쓸모 있어 센터명 우선 정렬로 바꾸고, 특정 센터를 골랐을 때는(전부 같은
  // 센터이므로) 그냥 이름순으로 둔다.
  const rosterSortCompare = (a, b) => {
    if (!filters.siteId) {
      const siteCmp = siteName_(a.workSiteId).localeCompare(siteName_(b.workSiteId));
      if (siteCmp !== 0) return siteCmp;
    }
    return (a.name || "").localeCompare(b.name || "");
  };
  const vendorName_ = (id) => vendors.find((v) => v.id === id)?.name || "-";
  // 외부인력(인력사무소가 배정한 근로자)은 소속업체 개념이 vendors
  // 컬렉션이 아니라 그 인력사무소 자체이므로, 소속업체 컬럼에는 vendorId
  // 대신 agencyName을 보여준다.
  const vendorOrAgencyName_ = (emp) =>
    emp?.employmentType === "외부인력" ? emp.agencyName || "-" : vendorName_(emp?.vendorId);

  const [sort, setSort] = useState({ key: "date", dir: "asc" });
  const ATTENDANCE_SORT_ACCESSORS = {
    name: (row) => row.emp?.name || "",
    team: (row) => row.emp?.team || "",
    position: (row) => row.emp?.position || "",
    checkIn: (row) => row.record?.checkInTime || "",
    checkOut: (row) => row.record?.checkOutTime || "",
    date: (row) => row.record?.date || "",
    company: () => companyName,
    site: (row) => row.record?.siteName || siteName_(row.emp?.workSiteId),
    shiftType: (row) => row.emp?.shiftType || "",
    employmentType: (row) => row.emp?.employmentType || "",
    gender: (row) => row.emp?.gender || "",
    nationality: (row) => row.emp?.nationality || "",
    country: (row) => row.emp?.country || "",
    status: (row) => row.record?.status || "미출근",
  };

  const rows = useMemo(() => {
    const accessor = ATTENDANCE_SORT_ACCESSORS[sort.key] || ((row) => row.record?.date || "");
    const dir = sort.dir === "desc" ? -1 : 1;
    return attendance
      .map((a) => ({ record: a, emp: employeeByUid.get(a.uid) }))
      .filter(({ emp }) => Boolean(emp))
      .filter(({ emp }) => {
        if (filters.siteId && emp.workSiteId !== filters.siteId) return false;
        if (filters.vendorId && emp.vendorId !== filters.vendorId) return false;
        if (filters.shiftType && emp.shiftType !== filters.shiftType) return false;
        if (filters.employmentType && emp.employmentType !== filters.employmentType) return false;
        if (filters.team && emp.team !== filters.team) return false;
        if (filters.position && emp.position !== filters.position) return false;
        if (filters.nationality && emp.nationality !== filters.nationality) return false;
        if (filters.country && emp.country !== filters.country) return false;
        if (filters.name && !emp.name?.includes(filters.name)) return false;
        if (filters.phone && !emp.phone?.includes(filters.phone)) return false;
        return true;
      })
      .sort((x, y) => {
        const av = accessor(x);
        const bv = accessor(y);
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
      });
  }, [attendance, employeeByUid, filters, sort]);

  // 오늘 출근한 근로자를 슬라이드 카드로 보여주는 부분 — 별도 조회 없이
  // 이미 화면에 있는 rows(현재 range 조건에 맞는 출퇴근 기록) 중 오늘
  // 날짜 것만 뽑아 재사용한다.
  const todayKeyForCards = toDateKey();
  const todayCardRows = useMemo(() => rows.filter(({ record }) => record.date === todayKeyForCards), [rows, todayKeyForCards]);

  // 출근현황 근무자 목록 리스트 — 출근 기록이 있는 사람만이 아니라 등록된
  // 근로자 전원이 항상 나와야 한다. 오늘 출근 기록이 있으면 같이 붙여서
  // 보여주되(카드 배지용) 목록 자체는 근로자 기준으로 만든다.
  const attendanceRoster = useMemo(() => {
    return employees
      .filter((emp) => (emp.employmentStatus || "재직") !== "퇴사")
      .filter((emp) => {
        if (filters.siteId && emp.workSiteId !== filters.siteId) return false;
        if (filters.vendorId && emp.vendorId !== filters.vendorId) return false;
        if (filters.shiftType && emp.shiftType !== filters.shiftType) return false;
        if (filters.employmentType && emp.employmentType !== filters.employmentType) return false;
        if (filters.team && emp.team !== filters.team) return false;
        if (filters.position && emp.position !== filters.position) return false;
        if (filters.nationality && emp.nationality !== filters.nationality) return false;
        if (filters.country && emp.country !== filters.country) return false;
        if (filters.name && !emp.name?.includes(filters.name)) return false;
        if (filters.phone && !emp.phone?.includes(filters.phone)) return false;
        return true;
      })
      .map((emp) => ({ emp, record: attendance.find((a) => a.uid === emp.id && a.date === todayKeyForCards) || null }))
      .sort((a, b) => rosterSortCompare(a.emp, b.emp));
  }, [employees, filters, attendance, todayKeyForCards]);

  const ATTENDANCE_PAGE_SIZE = 10;
  const attendanceTotalPages = Math.max(1, Math.ceil(attendanceRoster.length / ATTENDANCE_PAGE_SIZE));
  const attendancePageClamped = Math.min(attendancePage, attendanceTotalPages);
  const pagedAttendanceRows = attendanceRoster.slice(
    (attendancePageClamped - 1) * ATTENDANCE_PAGE_SIZE,
    attendancePageClamped * ATTENDANCE_PAGE_SIZE
  );

  // ─────────────────────────────────────────────────────────────
  // 월별 스케줄표(달력형 그리드) — 도급팀이 실제로 쓰던 엑셀 휴무계획표를
  // 참고해 근로자 x 1~31일 표로 한 달 근태를 한눈에 보고, 셀을 눌러 바로
  // 정정할 수 있게 한다. 위 출근현황(카드/표)과는 별도 데이터(gridMonth
  // 전체)로 동작한다.
  const gridEmployees = useMemo(
    () =>
      employees
        .filter((emp) => (emp.employmentStatus || "재직") !== "퇴사")
        .filter((emp) => {
          if (filters.siteId && emp.workSiteId !== filters.siteId) return false;
          if (filters.vendorId && emp.vendorId !== filters.vendorId) return false;
          if (filters.shiftType && emp.shiftType !== filters.shiftType) return false;
          if (filters.employmentType && emp.employmentType !== filters.employmentType) return false;
          if (filters.team && emp.team !== filters.team) return false;
          if (filters.position && emp.position !== filters.position) return false;
          if (filters.nationality && emp.nationality !== filters.nationality) return false;
          if (filters.country && emp.country !== filters.country) return false;
          if (filters.name && !emp.name?.includes(filters.name)) return false;
          if (filters.phone && !emp.phone?.includes(filters.phone)) return false;
          return true;
        })
        .sort(rosterSortCompare),
    [employees, filters]
  );
  const gridNumDays = daysInMonth(gridMonth);
  const gridDayList = Array.from({ length: gridNumDays }, (_, i) => i + 1);
  const gridTodayKey = toDateKey();
  const gridWeekdayFor = (day) => WEEKDAY_LABELS[new Date(`${gridMonth}-${String(day).padStart(2, "0")}T00:00:00`).getDay()];

  // 하루치 상태 하나를 결정한다 — 출근기록(attendance) > 휴가기록(leaves,
  // 이 회사의 승인된 모든 유형: 휴무/연차/반차/병가/결근/경조사/외근 등) >
  // 미래 날짜(빈칸) > 과거인데 아무 기록도 없으면 결근으로 간주하는 순서.
  // 월별 스케줄표(gridMonth 고정)와 근로자별 스케줄 일괄편집(임의의 달)이
  // 모두 이 로직을 공유해야 "이미 출근/휴무로 찍힌 날짜"가 두 화면에서
  // 항상 똑같이 보인다 — 그래서 emp/attendance/leaves를 인자로 받는 순수
  // 함수로 뽑아두고, 각 화면은 자신의 데이터 소스만 다르게 넘긴다.
  const resolveDayStatus = (uid, emp, dateKey, attendanceList, leavesList) => {
    if (emp?.hireDate && dateKey < emp.hireDate) return "OUT";
    if (emp?.resignDate && dateKey > emp.resignDate) return "OUT";
    const att = attendanceList.find((a) => a.uid === uid && a.date === dateKey);
    if (att && (att.status === "출근" || att.status === "지각" || att.status === "특근")) return att.status;
    const leave = leaveStatusOn(leavesList, [], uid, dateKey);
    if (leave) return leave.type;
    if (dateKey > gridTodayKey) return "";
    return "결근";
  };
  const gridDayStatus = (uid, day) => {
    const dateKey = `${gridMonth}-${String(day).padStart(2, "0")}`;
    return resolveDayStatus(uid, employeeByUid.get(uid), dateKey, gridAttendance, gridLeaves);
  };
  const gridCellMeta = (statusKey) => GRID_CELL_META[statusKey] || (statusKey ? { label: statusKey.slice(0, 1), className: "bg-slate-100 text-slate-600" } : GRID_CELL_META[""]);

  // 근로자 1명의 이번 gridMonth 한 달 합계 — 우측 요약열(출근/결근/휴무/연차/
  // 만근/특근/병결)에 그대로 쓰인다.
  const gridEmployeeMonthSummary = (uid) => {
    let present = 0;
    let absent = 0;
    let off = 0;
    let annual = 0;
    let overtime = 0;
    let sick = 0;
    let scheduledDays = 0; // 입사~퇴사(재직) 구간에 속하는 날짜 수 = 만근 시 기준 일수.
    for (const day of gridDayList) {
      const status = gridDayStatus(uid, day);
      if (status === "OUT") continue; // 입사 전/퇴사 후는 집계 대상이 아니다.
      scheduledDays += 1;
      if (status === "출근" || status === "지각") present += 1;
      else if (status === "특근") overtime += 1;
      else if (status === "연차") annual += 1;
      else if (status === "오전반차" || status === "오후반차") annual += 0.5;
      else if (status === "병가") sick += 1;
      else if (status === "결근") absent += 1;
      else if (status) off += 1; // 휴무/관리자 처리/경조사/외근 등
    }
    // 만근 = 결근 없이 재직 구간 전체를 채웠을 때의 총 근무 대상 일수
    // (예: 이번 달 14일 입사자라면 14~31일 = 18일이 만근 일수).
    const fullAttendance = absent === 0 && scheduledDays > 0 ? scheduledDays : 0;
    return { present, absent, off, annual, overtime, sick, fullAttendance };
  };

  // 하루치 출근 인원수 — 그 날짜 열 맨 아래 "합계" 행에 쓰인다.
  const gridDailyHeadcount = (day) =>
    gridEmployees.filter((emp) => ["출근", "지각", "특근"].includes(gridDayStatus(emp.id, day))).length;

  // 근로자 전원의 이번 달 요약 합계 — 요약열 맨 아래 "합계" 행에 쓰인다.
  const gridMonthGrandTotal = () => {
    const total = { present: 0, absent: 0, off: 0, annual: 0, overtime: 0, sick: 0, fullAttendance: 0 };
    for (const emp of gridEmployees) {
      const s = gridEmployeeMonthSummary(emp.id);
      total.present += s.present;
      total.absent += s.absent;
      total.off += s.off;
      total.annual += s.annual;
      total.overtime += s.overtime;
      total.sick += s.sick;
      total.fullAttendance += s.fullAttendance;
    }
    return total;
  };

  // 입사일 이후 사용한 연차(연차/반차) 누적 — 좌측 고정열의 "연차"는 이번 달
  // 만이 아니라 올해 누적 사용량을 보여줘야 한 눈에 잔여 연차를 가늠할 수 있다.
  const gridCumulativeUsedLeave = (emp) => {
    const empLeaves = gridLeaves.filter((l) => l.uid === emp.id);
    return calcLeaveBalance({
      hireDate: emp.hireDate,
      leaves: empLeaves,
      today: gridTodayKey,
      careerYears: Number(emp.careerYears) || 0,
    }).used;
  };

  // 좌측 고정열의 "잔여연차" — 입사일 기준 근로기준법 산정 부여일수에서
  // 올해 누적 사용량을 뺀 실제 남은 연차 일수.
  const gridRemainingLeave = (emp) => {
    const empLeaves = gridLeaves.filter((l) => l.uid === emp.id);
    return calcLeaveBalance({
      hireDate: emp.hireDate,
      leaves: empLeaves,
      today: gridTodayKey,
      careerYears: Number(emp.careerYears) || 0,
    }).remaining;
  };

  const gridRemarkFor = (uid) => gridRemarks.find((r) => r.uid === uid)?.text || "";
  const saveGridRemark = async (uid, text) => {
    try {
      await setDoc(
        doc(db, "scheduleRemarks", `${gridMonth}_${uid}`),
        { companyId: profile.companyId, uid, month: gridMonth, text, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (err) {
      toast.error(`비고 저장에 실패했습니다: ${err.code || err.message}`);
    }
  };

  const openGridCell = (emp, day) => {
    const dateKey = `${gridMonth}-${String(day).padStart(2, "0")}`;
    setGridEditCell({ uid: emp.id, name: emp.name, day, dateKey, current: gridDayStatus(emp.id, day) });
  };

  // 하루치 상태를 실제 문서에 반영 — 출근/특근은 attendance 문서 하나,
  // 그 외(휴무/연차/반차/병가/결근)는 leaves 문서 하나로 남기고, statusKey가
  // 빈 문자열이면 두 컬렉션 모두에서 그 날짜 기록을 지워 "미정" 상태로 되돌린다.
  // 월별 스케줄표에 찍은 상태를 스케줄등록(Schedule.jsx) 각 현황과 그대로
  // 맞춰준다 — 출근/특근은 출근확정, 휴무 계열(휴무/연차/반차/병가)은 휴무,
  // 결근/미정은 손대지 않고 대기 상태를 유지한다(별도 "결근" 인원현황이
  // 없으므로). 같은 uid+date의 schedules 문서가 이미 있으면 그 상태만
  // 갱신하고, 없으면 새로 만든다.
  const syncScheduleStatus = async (emp, uid, name, dateKey, statusKey) => {
    if (!emp) return;
    let targetStatus = null;
    if (statusKey === "출근" || statusKey === "특근") targetStatus = "출근확정";
    else if (["휴무", "연차", "오전반차", "오후반차", "병가"].includes(statusKey)) targetStatus = "휴무";
    if (!targetStatus) return; // 결근/미정(빈 값)은 스케줄등록 상태를 건드리지 않는다.
    const existing = gridSchedules.find((s) => s.uid === uid && s.date === dateKey);
    if (existing) {
      if (existing.status !== targetStatus) await updateDoc(doc(db, "schedules", existing.id), { status: targetStatus }).catch(() => {});
    } else {
      await addDoc(collection(db, "schedules"), {
        companyId: profile.companyId,
        uid,
        name,
        date: dateKey,
        startTime: "09:00",
        endTime: "18:00",
        siteId: emp.workSiteId || null,
        siteName: siteName_(emp.workSiteId),
        status: targetStatus,
        createdAt: serverTimestamp(),
      }).catch(() => {});
    }
  };

  const writeDayStatus = async (uid, name, dateKey, statusKey) => {
    const oldLeaves = gridLeaves.filter(
      (l) => l.uid === uid && l.status === "approved" && dateKey >= l.startDate && dateKey <= (l.endDate || l.startDate)
    );
    for (const l of oldLeaves) await deleteDoc(doc(db, "leaves", l.id)).catch(() => {});
    if (statusKey === "출근" || statusKey === "특근") {
      await setDoc(
        doc(db, "attendance", attendanceDocId(uid, dateKey)),
        {
          uid,
          name,
          companyId: profile.companyId,
          date: dateKey,
          month: dateKey.slice(0, 7),
          status: statusKey,
          checkInTime: `${dateKey}T09:00:00`,
          source: "manual",
        },
        { merge: true }
      );
    } else {
      await deleteDoc(doc(db, "attendance", attendanceDocId(uid, dateKey))).catch(() => {});
      if (statusKey) {
        await addDoc(collection(db, "leaves"), {
          companyId: profile.companyId,
          uid,
          name,
          type: statusKey,
          startDate: dateKey,
          endDate: dateKey,
          status: "approved",
          source: "schedule",
          createdAt: serverTimestamp(),
        });
      }
    }
    await syncScheduleStatus(employeeByUid.get(uid), uid, name, dateKey, statusKey);
  };

  const gridApplyStatus = async (statusKey) => {
    if (!gridEditCell) return;
    setGridSaving(true);
    try {
      await writeDayStatus(gridEditCell.uid, gridEditCell.name, gridEditCell.dateKey, statusKey);
      toast.success(`${statusKey}(으)로 표시했습니다`);
      setGridEditCell(null);
    } catch (err) {
      toast.error(`저장에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setGridSaving(false);
    }
  };

  const gridClearDay = async () => {
    if (!gridEditCell) return;
    setGridSaving(true);
    try {
      await writeDayStatus(gridEditCell.uid, gridEditCell.name, gridEditCell.dateKey, "");
      toast.success("기록을 지웠습니다");
      setGridEditCell(null);
    } catch (err) {
      toast.error(`저장에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setGridSaving(false);
    }
  };

  // ── 근로자별 스케줄 일괄편집 ──────────────────────────────
  // 빈 달력에서 새로 계획을 짜는 용도만이 아니라, 이미 지나간/진행 중인
  // 달을 열었을 때도 그 근로자가 실제로 언제 출근했고 언제 쉬었는지가
  // 달력에 그대로 보여야 한다 — 그래서 모달을 열 때 해당 월의 실제
  // 출근/휴가 기록을 먼저 조회해 bulkDayMap을 채워두고, 이후 사용자가
  // 날짜를 다시 눌러 바꾸면 그 값이 그대로 저장된다. 아직 상태가 정해지지
  // 않은 미래 날짜만 "지정하지 않으면 출근으로 채운다"는 기존 편의가 남는다.
  const [bulkPrefillLoading, setBulkPrefillLoading] = useState(false);

  const loadBulkPrefill = async (emp, monthKey) => {
    setBulkPrefillLoading(true);
    try {
      let attList = gridAttendance;
      let leavesList = gridLeaves;
      if (monthKey !== gridMonth) {
        const [attSnap, leavesSnap] = await Promise.all([
          getDocs(query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("month", "==", monthKey))),
          getDocs(query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("status", "==", "approved"))),
        ]);
        attList = attSnap.docs.map((d) => d.data());
        leavesList = leavesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
      const numDays = daysInMonth(monthKey);
      const map = {};
      for (let day = 1; day <= numDays; day += 1) {
        const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
        const status = resolveDayStatus(emp.id, emp, dateKey, attList, leavesList);
        if (status && status !== "OUT") map[day] = status;
      }
      setBulkDayMap(map);
    } finally {
      setBulkPrefillLoading(false);
    }
  };

  const openBulkEdit = (emp) => {
    setBulkTarget(emp);
    setBulkMonth(gridMonth);
    setBulkActiveStatus("휴무");
    setBulkDayMap({});
    loadBulkPrefill(emp, gridMonth);
  };
  const changeBulkMonth = (monthKey) => {
    setBulkMonth(monthKey);
    setBulkDayMap({});
    if (bulkTarget) loadBulkPrefill(bulkTarget, monthKey);
  };
  const bulkNumDays = bulkTarget ? daysInMonth(bulkMonth) : 0;
  const bulkDayCells = Array.from({ length: bulkNumDays }, (_, i) => {
    const day = i + 1;
    const dateKey = `${bulkMonth}-${String(day).padStart(2, "0")}`;
    const isOut = (bulkTarget?.hireDate && dateKey < bulkTarget.hireDate) || (bulkTarget?.resignDate && dateKey > bulkTarget.resignDate);
    const assigned = bulkDayMap[day];
    const meta = assigned ? GRID_STATUS_OPTIONS.find((o) => o.key === assigned) : null;
    const wd = WEEKDAY_LABELS[new Date(`${dateKey}T00:00:00`).getDay()];
    const holiday = isKrHoliday(dateKey) || wd === "일";
    const weekendClass = holiday ? "text-danger" : wd === "토" ? "text-primary" : "text-ink";
    return {
      day,
      disabled: isOut,
      className: isOut
        ? "bg-slate-200/70 text-slate-300"
        : meta
        ? `${meta.tone} ring-2 ring-offset-1 ring-primary/40`
        : `${holiday ? "bg-red-50" : "bg-slate-50"} ${weekendClass} hover:bg-slate-100`,
    };
  });
  const toggleBulkDay = (day) => {
    setBulkDayMap((m) => {
      const next = { ...m };
      if (next[day] === bulkActiveStatus) delete next[day];
      else next[day] = bulkActiveStatus;
      return next;
    });
  };
  const bulkSave = async () => {
    if (!bulkTarget) return;
    setBulkSaving(true);
    try {
      // 지정하지 않은 날짜는 "미래 날짜"만 출근으로 채워야 한다("이 달 전체
      // 초기화"로 bulkDayMap을 통째로 비운 뒤 그대로 저장하면, 과거 날짜까지
      // 전부 출근으로 채워지던 버그 — 오늘 이전 날짜는 지정된 값이 없으면
      // 건드리지 않고 건너뛴다.
      const todayKey = toDateKey();
      for (let day = 1; day <= bulkNumDays; day += 1) {
        const dateKey = `${bulkMonth}-${String(day).padStart(2, "0")}`;
        if ((bulkTarget.hireDate && dateKey < bulkTarget.hireDate) || (bulkTarget.resignDate && dateKey > bulkTarget.resignDate)) continue;
        const assigned = bulkDayMap[day];
        if (!assigned && dateKey < todayKey) continue;
        const statusKey = assigned || "출근";
        await writeDayStatus(bulkTarget.id, bulkTarget.name, dateKey, statusKey);
      }
      toast.success(`${bulkTarget.name} 근로자의 ${bulkMonth} 스케줄을 저장했습니다`);
      setBulkTarget(null);
    } catch (err) {
      toast.error(`저장에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setBulkSaving(false);
    }
  };

  // 이번 달에 등록해둔 스케줄을 통째로 지워야 할 때(엑셀 대량업로드로
  // 잘못 채워졌거나, 처음부터 다시 짤 때)를 위한 초기화 — writeDayStatus로
  // 하루하루 지우면 출근/휴가 기록만 지워지고 schedules(스케줄등록) 문서는
  // 상태가 낡은 채로 남으므로, 세 컬렉션 모두 이 근로자의 이번 달 문서를
  // 직접 지운다.
  const [bulkResetting, setBulkResetting] = useState(false);
  const resetBulkMonth = async () => {
    if (!bulkTarget) return;
    if (!(await confirm(`${bulkTarget.name} 근로자의 ${bulkMonth} 스케줄을 전부 초기화하시겠습니까? 출근/휴가/스케줄등록 기록이 모두 삭제됩니다.`, "delete")))
      return;
    setBulkResetting(true);
    try {
      const monthStart = `${bulkMonth}-01`;
      const monthEnd = `${bulkMonth}-31`;
      const [attSnap, leavesSnap, schedSnap] = await Promise.all([
        getDocs(
          query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("uid", "==", bulkTarget.id), where("month", "==", bulkMonth))
        ),
        getDocs(query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("uid", "==", bulkTarget.id))),
        getDocs(
          query(
            collection(db, "schedules"),
            where("companyId", "==", profile.companyId),
            where("uid", "==", bulkTarget.id),
            where("date", ">=", monthStart),
            where("date", "<=", monthEnd)
          )
        ),
      ]);
      const deletes = [
        ...attSnap.docs.map((d) => deleteDoc(doc(db, "attendance", d.id))),
        ...leavesSnap.docs.filter((d) => d.data().startDate >= monthStart && d.data().startDate <= monthEnd).map((d) => deleteDoc(doc(db, "leaves", d.id))),
        ...schedSnap.docs.map((d) => deleteDoc(doc(db, "schedules", d.id))),
      ];
      await Promise.all(deletes);
      setBulkDayMap({});
      toast.success(`${bulkTarget.name} 근로자의 ${bulkMonth} 스케줄을 초기화했습니다`);
    } catch (err) {
      toast.error(`초기화에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setBulkResetting(false);
    }
  };

  // ── 인쇄/파일저장 ──────────────────────────────────────────────
  const printGrid = () => {
    document.body.setAttribute("data-print-target", "1");
    const cleanup = () => {
      document.body.removeAttribute("data-print-target");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  };
  const exportGridCsv = () => {
    const header = [
      "순번",
      "이름",
      "연락처",
      "소속업체",
      "D-DAY",
      "입사일",
      "퇴사일",
      "잔여연차",
      "근무구분",
      ...gridDayList.map((d) => `${d}일(${gridWeekdayFor(d)})`),
      "출근",
      "결근",
      "휴무",
      "연차",
      "만근",
      "특근",
      "병결",
      "비고",
    ];
    const rows = gridEmployees.map((emp, i) => {
      const summary = gridEmployeeMonthSummary(emp.id);
      const dday = daysSinceHire(emp.hireDate, gridTodayKey);
      return [
        i + 1,
        emp.name || "",
        emp.phone || "",
        vendorOrAgencyName_(emp),
        dday != null ? `D+${dday}` : "-",
        emp.hireDate || "-",
        emp.resignDate || "-",
        gridRemainingLeave(emp),
        emp.shiftType || "-",
        ...gridDayList.map((d) => gridCellMeta(gridDayStatus(emp.id, d)).label || ""),
        summary.present,
        summary.absent,
        summary.off,
        summary.annual,
        summary.fullAttendance,
        summary.overtime,
        summary.sick,
        gridRemarkFor(emp.id),
      ];
    });
    downloadCsv(`월별스케줄표_${gridMonth}.csv`, header, rows);
  };

  // 업체가 보내주는 출근기록부 엑셀 업로드 — 이름+전화번호가 등록된
  // 근로자와 일치하는 행만 이번 gridMonth 그리드에 반영한다. 매칭 안 되는
  // 행은 그 행만 건너뛰고 나머지는 정상 반영한다.
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const { parseAttendanceRecordFile } = await import("../utils/attendanceRecordImport");
      const { error, matched, unmatched } = await parseAttendanceRecordFile(file, employees);
      if (error) {
        toast.error(error);
        return;
      }
      for (const row of matched) {
        const dayEntries = Object.entries(row.dayMarks);
        for (const [day, statusKey] of dayEntries) {
          const dateKey = `${gridMonth}-${String(day).padStart(2, "0")}`;
          await writeDayStatus(row.uid, row.name, dateKey, statusKey);
        }
        // 일자별 연차 표기가 하나도 없는데 연차 합계만 있는 경우, 정확한
        // 날짜를 알 수 없으므로 이번 달 1일부터 합계만큼 연차로 기록해둔다.
        const hasDayLeave = dayEntries.some(([, s]) => ["연차", "오전반차", "오후반차"].includes(s));
        if (!hasDayLeave && row.leaveTotal > 0) {
          const start = new Date(`${gridMonth}-01T00:00:00`);
          const end = new Date(start.getTime() + (row.leaveTotal - 1) * 86400000);
          await addDoc(collection(db, "leaves"), {
            companyId: profile.companyId,
            uid: row.uid,
            name: row.name,
            type: "연차",
            startDate: toDateKey(start),
            endDate: toDateKey(end),
            status: "approved",
            source: "schedule",
            reason: "출근기록부 업로드",
            createdAt: serverTimestamp(),
          });
        }
      }
      setImportResult({ matchedCount: matched.length, unmatched });
      if (matched.length > 0) toast.success(`${matched.length}명의 기록을 반영했습니다`);
      if (unmatched.length > 0) toast.error(`${unmatched.length}명은 등록된 근로자와 일치하지 않아 제외했습니다`);
    } catch (err) {
      toast.error(`업로드 처리에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const attendanceColumns = [
    {
      key: "status",
      label: "근무상태",
      render: ({ record: r }) => (
        <Badge tone={r.status === "출근" ? "success" : r.status === "지각" || r.status === "조퇴" ? "warning" : "danger"}>
          {r.status || "미출근"}
        </Badge>
      ),
    },
    {
      key: "phone",
      label: "연락처",
      render: ({ emp }) => (
        <span className="inline-flex items-center gap-1">
          {emp.phone || "-"}
          {emp.phone && <SmsButton phone={emp.phone} />}
        </span>
      ),
    },
    { key: "company", label: "사업자", render: () => companyName },
    { key: "site", label: "센터", render: ({ record: r, emp }) => r.siteName || siteName_(emp.workSiteId) },
    { key: "team", label: "부서", render: ({ emp }) => emp.team || "-" },
    { key: "position", label: "직급", render: ({ emp }) => emp.position || "-" },
    {
      key: "checkIn",
      label: "출근시간",
      render: ({ record: r }) => {
        if (!r.checkInTime) return "-";
        return <span className={r.status === "지각" ? "font-semibold text-danger" : undefined}>{formatTime(r.checkInTime)}</span>;
      },
    },
    { key: "checkOut", label: "퇴근시간", render: ({ record: r }) => (r.checkOutTime ? formatTime(r.checkOutTime) : "-") },
    { key: "date", label: "근무일", render: ({ record: r }) => formatDate(r.date) },
    { key: "shiftType", label: "근무구분", render: ({ emp }) => emp.shiftType || "-" },
    { key: "employmentType", label: "근무형태", render: ({ emp }) => emp.employmentType || "-" },
    { key: "gender", label: "성별", render: ({ emp }) => emp.gender || "-" },
    { key: "nationality", label: "외/내국인", render: ({ emp }) => emp.nationality || "-" },
    { key: "country", label: "국적", render: ({ emp }) => emp.country || "-" },
    { key: "insurance", label: "4대보험", render: ({ emp }) => (emp.insuranceApplied === "Y" ? "Y" : "N") },
    { key: "workLocation", label: "근무위치", render: ({ emp }) => emp.workLocation || "-" },
    { key: "note", label: "근무비고", render: ({ emp }) => emp.note || "-" },
    {
      key: "checkInType",
      label: "출근유형",
      render: ({ record: r }) => (r.checkInTime ? (r.source === "manual" ? "수동" : "자동") : "-"),
    },
    {
      key: "checkOutType",
      label: "퇴근유형",
      render: ({ record: r }) => (r.checkOutTime ? (r.source === "manual" ? "수동" : "자동") : "-"),
    },
  ];
  const {
    visibleColumns: visibleAttendanceColumns,
    hidden: hiddenAttendanceColumns,
    moveColumn: moveAttendanceColumn,
    toggleColumn: toggleAttendanceColumn,
    columns: attendanceColumnsOrdered,
  } = useColumnPrefs("attendanceMain", attendanceColumns);

  const openDetail = (row) => {
    setDetail(row);
    setDetailEditMode(false);
    setDetailForm({
      checkInTime: row.record.checkInTime ? row.record.checkInTime.slice(11, 16) : "",
      checkOutTime: row.record.checkOutTime ? row.record.checkOutTime.slice(11, 16) : "",
      status: row.record.status || "출근전",
      reason: "",
    });
  };
  const closeDetail = () => {
    setDetail(null);
    setDetailEditMode(false);
  };

  const saveDetailEdit = async () => {
    if (!detail || !detailForm.reason.trim()) return;
    const { record: r } = detail;
    const updates = {};
    const editLogs = [];
    const prevCheckIn = r.checkInTime ? r.checkInTime.slice(11, 16) : "";
    const prevCheckOut = r.checkOutTime ? r.checkOutTime.slice(11, 16) : "";
    if (detailForm.checkInTime && detailForm.checkInTime !== prevCheckIn) {
      updates.checkInTime = `${r.date}T${detailForm.checkInTime}:00`;
      editLogs.push({ field: "출근시각", oldValue: prevCheckIn || "-", newValue: detailForm.checkInTime });
    }
    if (detailForm.checkOutTime && detailForm.checkOutTime !== prevCheckOut) {
      updates.checkOutTime = `${r.date}T${detailForm.checkOutTime}:00`;
      editLogs.push({ field: "퇴근시각", oldValue: prevCheckOut || "-", newValue: detailForm.checkOutTime });
    }
    const statusChangedManually = detailForm.status !== (r.status || "출근전");
    if (statusChangedManually) {
      updates.status = detailForm.status;
      editLogs.push({ field: "상태", oldValue: r.status || "출근전", newValue: detailForm.status });
    } else if (updates.checkInTime) {
      // 관리자가 상태는 그대로 둔 채 출근시각만 고친 경우 — 스케줄
      // 출근예정시각 기준으로 지각 여부를 다시 계산해 반영한다.
      const newStatus = await recomputeCheckInStatus(r.uid, r.date, updates.checkInTime);
      if (newStatus && newStatus !== r.status) {
        updates.status = newStatus;
        editLogs.push({ field: "상태", oldValue: r.status || "출근전", newValue: newStatus });
      }
    }
    if (Object.keys(updates).length === 0) {
      closeDetail();
      return;
    }
    updates.source = "manual";
    await updateDoc(doc(db, "attendance", r.id), updates);
    for (const log of editLogs) {
      await addDoc(collection(db, "attendanceEdits"), {
        companyId: profile.companyId,
        uid: r.uid,
        name: r.name,
        date: r.date,
        field: log.field,
        oldValue: log.oldValue,
        newValue: log.newValue,
        reason: detailForm.reason,
        editedAt: serverTimestamp(),
        editedBy: user?.uid || null,
      });
    }
    closeDetail();
  };

  const openRosterRow = (emp) => {
    if (emp.employmentType === "외부인력") {
      setExternalInfoTarget(emp);
      return;
    }
    setQuickEditTarget(emp);
    setQuickEditForm({
      name: emp.name || "",
      phone: emp.phone || "",
      gender: emp.gender || "",
      workSiteId: emp.workSiteId || "",
      vendorId: emp.vendorId || "",
      team: emp.team || "",
      position: emp.position || "",
      shiftType: emp.shiftType || "",
      employmentType: emp.employmentType || "",
      employmentStatus: emp.employmentStatus || "재직",
      hireDate: emp.hireDate || "",
    });
  };
  const closeQuickEdit = () => {
    setQuickEditTarget(null);
    setQuickEditForm(null);
  };
  const saveQuickEdit = async () => {
    if (!quickEditTarget || !quickEditForm) return;
    if (!quickEditForm.name.trim()) {
      toast.error("이름을 입력해주세요");
      return;
    }
    setQuickEditSaving(true);
    try {
      await updateDoc(doc(db, "users", quickEditTarget.id), { ...quickEditForm });
      toast.success("저장되었습니다");
      closeQuickEdit();
    } catch {
      toast.error("저장에 실패했습니다");
    } finally {
      setQuickEditSaving(false);
    }
  };

  const toggleSelected = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAll = () => setSelected((s) => (s.size === rows.length ? new Set() : new Set(rows.map((r) => r.record.id))));

  // 출근시간/퇴근시간 select + time + 사유 + 적용: an admin correction to a
  // worker's recorded time, required to include a reason, logged to
  // attendanceEdits so it shows up under the 수정현황 sub-view.
  const applyTimeEdit = async () => {
    if (!editTime || !editReason.trim()) return;
    const fieldLabel = editField === "checkInTime" ? "출근시각" : "퇴근시각";
    for (const id of selected) {
      const row = rows.find((r) => r.record.id === id);
      if (!row) continue;
      const oldValue = row.record[editField];
      const newIso = `${row.record.date}T${editTime}:00`;
      await updateDoc(doc(db, "attendance", id), { [editField]: newIso, source: "manual" });
      await addDoc(collection(db, "attendanceEdits"), {
        companyId: profile.companyId,
        uid: row.record.uid,
        name: row.record.name,
        date: row.record.date,
        field: fieldLabel,
        oldValue: oldValue ? formatTime(oldValue) : "-",
        newValue: editTime,
        reason: editReason,
        editedAt: serverTimestamp(),
        editedBy: user?.uid || null,
      });
    }
    setEditTime("");
    setEditReason("");
  };

  const applyStatus = async () => {
    for (const id of selected) await updateDoc(doc(db, "attendance", id), { status: statusAction });
    setSelected(new Set());
  };

  // 출근현황(메인) 표에는 다른 3개 서브탭(휴무현황/수정현황/변경요청)과 달리
  // 행 삭제 기능이 없었다 — 탈퇴 처리 등으로 더 이상 의미 없는 출퇴근
  // 기록을 관리자가 직접 정리할 방법이 없어서, 체크박스로 선택한 기록을
  // 한 번에 지울 수 있게 한다.
  const deleteSelectedAttendance = async () => {
    if (selected.size === 0) return;
    if (!(await confirm(`선택한 출근기록 ${selected.size}건을 삭제하시겠습니까?`, "delete"))) return;
    for (const id of selected) await deleteDoc(doc(db, "attendance", id));
    setSelected(new Set());
    toast.success("삭제되었습니다");
  };

  const exportCsv = () => {
    const headers = ["이름", "출근시간", "퇴근시간", "근무일", "사업자", "센터", "근무구분", "근무형태", "전화번호", "성별"];
    const rowsOut = rows.map(({ record: r, emp }) => [
      r.name,
      r.checkInTime ? formatTime(r.checkInTime) : "-",
      r.checkOutTime ? formatTime(r.checkOutTime) : "-",
      formatDate(r.date),
      companyName,
      r.siteName || siteName_(emp.workSiteId),
      emp.shiftType || "-",
      emp.employmentType || "-",
      emp.phone || "-",
      emp.gender || "-",
    ]);
    downloadCsv(`출근현황_${range.start}~${range.end}`, headers, rowsOut);
  };

  const lateCount = attendanceRoster.filter(({ record }) => record?.status === "지각").length;
  const earlyLeaveCount = attendanceRoster.filter(({ record }) => record?.status === "조퇴").length;

  return (
    <div className="space-y-6">
      {centerBanner && (
        <div
          key={centerBanner}
          className="animate-center-banner pointer-events-none fixed left-1/2 top-1/2 z-[999] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-ink/85 px-6 py-4 text-center text-base font-semibold text-white shadow-2xl"
        >
          {centerBanner}
        </div>
      )}
      <Panel icon={ClipboardCheck} title="출근현황">
        <div className="mb-4 flex w-fit flex-nowrap gap-1 overflow-x-auto overscroll-x-contain rounded-lg bg-slate-100 p-1">
          {VIEW_OPTIONS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium ${
                view === v ? "bg-white text-primary shadow-sm" : "text-muted"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {(view === "수정현황" || view === "변경요청") && (
        <Card className="mb-4 space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">사업자</span>
              <select disabled className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-muted">
                <option>{companyName || "-"}</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.siteId}
                onChange={(e) => setFilters((f) => ({ ...f, siteId: e.target.value }))}
              >
                <option value="">전체</option>
                {workSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">소속업체</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.vendorId}
                onChange={(e) => setFilters((f) => ({ ...f, vendorId: e.target.value }))}
              >
                <option value="">전체</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">근무구분</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.shiftType}
                onChange={(e) => setFilters((f) => ({ ...f, shiftType: e.target.value }))}
              >
                <option value="">전체</option>
                {SHIFT_TYPE_OPTIONS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">근무형태</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.employmentType}
                onChange={(e) => setFilters((f) => ({ ...f, employmentType: e.target.value }))}
              >
                <option value="">전체</option>
                {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">부서</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.team}
                onChange={(e) => setFilters((f) => ({ ...f, team: e.target.value }))}
              >
                <option value="">전체</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">직급</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.position}
                onChange={(e) => setFilters((f) => ({ ...f, position: e.target.value }))}
              >
                <option value="">전체</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">외/내국인구분</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.nationality}
                onChange={(e) => setFilters((f) => ({ ...f, nationality: e.target.value }))}
              >
                <option value="">전체</option>
                {NATIONALITY_OPTIONS.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">국가구분</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.country}
                onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value }))}
              >
                <option value="">전체</option>
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">이름</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.name}
                onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">전화번호</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.phone}
                onChange={(e) => setFilters((f) => ({ ...f, phone: e.target.value }))}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">출근일자</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  value={range.start}
                  onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
                />
                <span className="text-muted">~</span>
                <input
                  type="date"
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  value={range.end}
                  onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
                />
              </div>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50"
                title="새로고침"
                onClick={() => setFilters(EMPTY_FILTERS)}
              >
                <RefreshCw size={16} />
              </button>
              <Button>검색</Button>
            </div>
          </div>
        </Card>
        )}

        {view === "출근현황" && (
          <>
            <Card className="mb-3 space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
                  value={filters.siteId}
                  onChange={(e) => {
                    const siteId = e.target.value;
                    setFilters((f) => ({ ...f, siteId }));
                    setSearchDraft((f) => ({ ...f, siteId }));
                    setAttendancePage(1);
                    flashCenterBanner(siteId);
                  }}
                >
                  <option value="">전체 센터</option>
                  {workSites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <div className="flex flex-1 min-w-[220px] items-center overflow-hidden rounded-lg border border-slate-200 focus-within:border-primary">
                  <input
                    className="w-full px-3 py-2 text-sm outline-none"
                    value={searchDraft.name}
                    onChange={(e) => setSearchDraft((f) => ({ ...f, name: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && applyAttendanceSearch()}
                    placeholder="이름으로 검색"
                  />
                  <button
                    type="button"
                    onClick={applyAttendanceSearch}
                    className="flex shrink-0 items-center gap-1 bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark"
                  >
                    검색
                  </button>
                </div>
                <Button size="sm" variant="outline" onClick={resetAttendanceSearch}>
                  <RefreshCw size={13} /> 초기화
                </Button>
                <Button
                  size="sm"
                  variant={detailSearchOpen ? "primary" : "outline"}
                  onClick={() => setDetailSearchOpen((v) => !v)}
                >
                  세부검색 {detailSearchOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </Button>
              </div>

              {detailSearchOpen && (
                <div className="space-y-3 border-t border-slate-100 pt-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
                      <select
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={searchDraft.siteId}
                        onChange={(e) => setSearchDraft((f) => ({ ...f, siteId: e.target.value }))}
                      >
                        <option value="">전체</option>
                        {workSites.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">소속업체</span>
                      <select
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={searchDraft.vendorId}
                        onChange={(e) => setSearchDraft((f) => ({ ...f, vendorId: e.target.value }))}
                      >
                        <option value="">전체</option>
                        {vendors.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">근무구분</span>
                      <select
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={searchDraft.shiftType}
                        onChange={(e) => setSearchDraft((f) => ({ ...f, shiftType: e.target.value }))}
                      >
                        <option value="">전체</option>
                        {SHIFT_TYPE_OPTIONS.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">근무형태</span>
                      <select
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={searchDraft.employmentType}
                        onChange={(e) => setSearchDraft((f) => ({ ...f, employmentType: e.target.value }))}
                      >
                        <option value="">전체</option>
                        {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">부서</span>
                      <select
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={searchDraft.team}
                        onChange={(e) => setSearchDraft((f) => ({ ...f, team: e.target.value }))}
                      >
                        <option value="">전체</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">직급</span>
                      <select
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={searchDraft.position}
                        onChange={(e) => setSearchDraft((f) => ({ ...f, position: e.target.value }))}
                      >
                        <option value="">전체</option>
                        {positions.map((p) => (
                          <option key={p.id} value={p.name}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">외/내국인구분</span>
                      <select
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={searchDraft.nationality}
                        onChange={(e) => setSearchDraft((f) => ({ ...f, nationality: e.target.value }))}
                      >
                        <option value="">전체</option>
                        {NATIONALITY_OPTIONS.map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">국가구분</span>
                      <select
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={searchDraft.country}
                        onChange={(e) => setSearchDraft((f) => ({ ...f, country: e.target.value }))}
                      >
                        <option value="">전체</option>
                        {COUNTRY_OPTIONS.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">전화번호</span>
                      <input
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={searchDraft.phone}
                        onChange={(e) => setSearchDraft((f) => ({ ...f, phone: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" onClick={applyAttendanceSearch}>
                      검색
                    </Button>
                  </div>
                </div>
              )}
            </Card>
            <p className="mb-2 text-xs text-muted">
              총 {attendanceRoster.length}명 · <span className="text-danger">지각 {lateCount}</span> · <span className="text-warning">조퇴 {earlyLeaveCount}</span>
            </p>

            <div key={attendancePage} className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5" style={{ animation: "fadeInUp 0.35s ease" }}>
              <table className="w-full min-w-[900px] text-center text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-muted">
                    <th className="px-3 py-3 font-semibold">순번</th>
                    <th className="px-3 py-3 font-semibold">이름</th>
                    <th className="px-3 py-3 font-semibold">연락처</th>
                    <th className="px-3 py-3 font-semibold">소속업체</th>
                    <th className="px-3 py-3 font-semibold">센터</th>
                    <th className="px-3 py-3 font-semibold">입사일</th>
                    <th className="px-3 py-3 font-semibold">국적</th>
                    <th className="px-3 py-3 font-semibold">성별</th>
                    <th className="px-3 py-3 font-semibold">나이</th>
                    <th className="px-3 py-3 font-semibold">부서</th>
                    <th className="px-3 py-3 font-semibold">근무구분</th>
                    <th className="px-3 py-3 font-semibold">직급</th>
                    <th className="px-3 py-3 font-semibold">재직상태</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedAttendanceRows.map(({ emp, record: r }, i) => (
                    <tr
                      key={emp.id}
                      onDoubleClick={() => openRosterRow(emp)}
                      title="더블클릭하여 상세/수정 팝업 열기"
                      className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-100"
                    >
                      <td className="px-3 py-3 text-muted">{(attendancePageClamped - 1) * ATTENDANCE_PAGE_SIZE + i + 1}</td>
                      <td className="px-3 py-3 text-ink">{emp.name}</td>
                      <td className="px-3 py-3 text-ink">
                        <span className="inline-flex items-center gap-1">
                          {emp.phone || "-"}
                          {emp.phone && <SmsButton phone={emp.phone} />}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-ink">{vendorOrAgencyName_(emp)}</td>
                      <td className="px-3 py-3 text-ink">{siteName_(emp.workSiteId)}</td>
                      <td className="px-3 py-3 text-ink">{emp.hireDate || "-"}</td>
                      <td className="px-3 py-3 text-ink">{emp.country || (emp.nationality === "내국인" ? "대한민국" : "-")}</td>
                      <td className="px-3 py-3 text-ink">{emp.gender || "-"}</td>
                      <td className="px-3 py-3 text-ink">{calculateAge(emp.residentNumberFront) ?? "-"}</td>
                      <td className="px-3 py-3 text-ink">{emp.team || "-"}</td>
                      <td className="px-3 py-3 text-ink">{emp.shiftType || "-"}</td>
                      <td className="px-3 py-3 text-ink">{emp.position || "-"}</td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => r && openDetail({ record: r, emp })}
                          disabled={!r}
                          title={r ? "클릭하여 출퇴근 상세보기" : ""}
                        >
                          <Badge tone={r ? (r.status === "출근" ? "success" : r.status === "지각" || r.status === "조퇴" ? "warning" : "danger") : "muted"}>
                            {r?.status || "미출근"}
                          </Badge>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {attendanceRoster.length === 0 && (
                    <tr>
                      <td colSpan={13} className="px-4 py-10 text-center text-xs text-muted">
                        조건에 맞는 근로자가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {attendanceRoster.length > 0 && (
              <div className="mt-3 flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => setAttendancePage((p) => Math.max(1, p - 1))}
                  disabled={attendancePageClamped === 1}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-muted disabled:opacity-40"
                >
                  이전
                </button>
                <span className="px-2 text-xs text-muted">
                  {attendancePageClamped} / {attendanceTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setAttendancePage((p) => Math.min(attendanceTotalPages, p + 1))}
                  disabled={attendancePageClamped === attendanceTotalPages}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-muted disabled:opacity-40"
                >
                  다음
                </button>
              </div>
            )}

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-muted">아래는 월별 스케줄표입니다</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 md:p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <CalendarRange size={15} className="text-primary" /> 월별 스케줄표
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="month"
                    value={gridMonth}
                    onChange={(e) => setGridMonth(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-ink hover:bg-slate-50">
                    <Upload size={14} /> {importing ? "업로드 중..." : "출근기록부 업로드"}
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      disabled={importing}
                      onChange={handleImportFile}
                    />
                  </label>
                  <Button size="sm" variant="outline" onClick={exportGridCsv}>
                    <FileSpreadsheet size={14} /> 파일저장
                  </Button>
                  <Button size="sm" variant="outline" onClick={printGrid}>
                    <Printer size={14} /> 인쇄/PDF
                  </Button>
                </div>
              </div>

              <div data-print-area className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
                <table className="w-full border-collapse text-center text-xs [&_td]:border [&_td]:border-slate-200 [&_th]:border [&_th]:border-slate-200">
                  <thead>
                    <tr className="border-b border-slate-100 text-muted">
                      <th className="sticky left-0 z-20 w-10 min-w-10 bg-primary-light px-2 py-2.5 font-medium">순번</th>
                      <th className="sticky left-10 z-20 w-16 min-w-16 bg-primary-light px-2 py-2.5 font-medium">이름</th>
                      <th className="sticky left-[104px] z-20 w-24 min-w-24 bg-primary-light px-2 py-2.5 font-medium">연락처</th>
                      <th className="min-w-20 px-2 py-2.5 font-medium">소속업체</th>
                      <th className="min-w-14 px-2 py-2.5 font-medium">D-DAY</th>
                      <th className="min-w-20 px-2 py-2.5 font-medium">입사일</th>
                      <th className="min-w-20 px-2 py-2.5 font-medium">퇴사일</th>
                      <th className="min-w-14 px-2 py-2.5 font-medium">잔여연차</th>
                      <th className="min-w-20 px-2 py-2.5 font-medium">근무구분</th>
                      {gridDayList.map((d) => {
                        const wd = gridWeekdayFor(d);
                        const dateKey = `${gridMonth}-${String(d).padStart(2, "0")}`;
                        const holiday = isKrHoliday(dateKey);
                        return (
                          <th
                            key={d}
                            className={`px-1 py-2.5 font-medium ${dateKey === gridTodayKey ? "bg-primary-light" : ""} ${
                              holiday || wd === "일" ? "text-danger" : wd === "토" ? "text-primary" : ""
                            }`}
                          >
                            {d}
                            <br />({wd})
                          </th>
                        );
                      })}
                      <th className="min-w-12 px-2 py-2.5 font-medium">출근</th>
                      <th className="min-w-12 px-2 py-2.5 font-medium">결근</th>
                      <th className="min-w-12 px-2 py-2.5 font-medium">휴무</th>
                      <th className="min-w-12 px-2 py-2.5 font-medium">연차</th>
                      <th className="min-w-12 px-2 py-2.5 font-medium">만근</th>
                      <th className="min-w-12 px-2 py-2.5 font-medium">특근</th>
                      <th className="min-w-12 px-2 py-2.5 font-medium">병결</th>
                      <th className="min-w-28 px-2 py-2.5 font-medium">비고</th>
                      <th className="min-w-14 px-2 py-2.5 font-medium print:hidden">편집</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gridEmployees.map((emp, i) => {
                      const summary = gridEmployeeMonthSummary(emp.id);
                      const dday = daysSinceHire(emp.hireDate, gridTodayKey);
                      return (
                        <tr
                          key={emp.id}
                          onDoubleClick={() => openBulkEdit(emp)}
                          title="더블클릭하면 다음달 스케줄 일괄편집이 열립니다"
                          className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
                        >
                          <td className="sticky left-0 z-10 bg-white px-2 py-2 text-muted">{i + 1}</td>
                          <td className="sticky left-10 z-10 bg-white px-2 py-2 text-center font-medium text-ink">{emp.name}</td>
                          <td className="sticky left-[104px] z-10 bg-white px-2 py-2 text-ink">
                            <span className="inline-flex items-center gap-1">
                              {emp.phone || "-"}
                              {emp.phone && <SmsButton phone={emp.phone} />}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-ink">{vendorOrAgencyName_(emp)}</td>
                          <td className="px-2 py-2 font-medium text-primary">{dday != null ? `D+${dday}` : "-"}</td>
                          <td className="px-2 py-2 text-ink">{emp.hireDate || "-"}</td>
                          <td className="px-2 py-2 text-ink">{emp.resignDate || "-"}</td>
                          <td className="px-2 py-2 font-medium text-primary">{gridRemainingLeave(emp)}</td>
                          <td className="px-2 py-2 text-ink">{emp.shiftType || "-"}</td>
                          {gridDayList.map((d) => {
                            const dateKey = `${gridMonth}-${String(d).padStart(2, "0")}`;
                            const status = gridDayStatus(emp.id, d);
                            const meta = gridCellMeta(status);
                            const isOut = status === "OUT";
                            const holiday = !isOut && (isKrHoliday(dateKey) || gridWeekdayFor(d) === "일" || gridWeekdayFor(d) === "토");
                            return (
                              <td
                                key={d}
                                onDoubleClick={(e) => e.stopPropagation()}
                                className={`px-1 py-2 ${holiday ? "bg-red-50/40" : ""} ${isOut ? meta.className : ""}`}
                              >
                                <button
                                  type="button"
                                  disabled={isOut}
                                  onClick={() => openGridCell(emp, d)}
                                  className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[10px] ${isOut ? "" : `hover:ring-2 hover:ring-primary/50 ${meta.className}`}`}
                                >
                                  {meta.label}
                                </button>
                              </td>
                            );
                          })}
                          <td className="px-2 py-2 font-semibold text-ink">{summary.present}</td>
                          <td className="px-2 py-2 text-danger">{summary.absent}</td>
                          <td className="px-2 py-2 text-ink">{summary.off}</td>
                          <td className="px-2 py-2 text-ink">{summary.annual}</td>
                          <td className="px-2 py-2 text-ink">{summary.fullAttendance || "-"}</td>
                          <td className="px-2 py-2 text-ink">{summary.overtime}</td>
                          <td className="px-2 py-2 text-ink">{summary.sick}</td>
                          <td className="px-2 py-2" onDoubleClick={(e) => e.stopPropagation()}>
                            <input
                              key={`${emp.id}-${gridRemarkFor(emp.id)}`}
                              type="text"
                              defaultValue={gridRemarkFor(emp.id)}
                              onBlur={(e) => saveGridRemark(emp.id, e.target.value)}
                              placeholder="비고"
                              className="w-24 rounded-md border border-slate-200 px-1.5 py-1 text-center text-[11px]"
                            />
                          </td>
                          <td className="px-2 py-2 print:hidden" onDoubleClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              title="다음달 스케줄 일괄편집"
                              onClick={() => openBulkEdit(emp)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-primary-light hover:text-primary"
                            >
                              <Wand2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {gridEmployees.length === 0 && (
                      <tr>
                        <td colSpan={gridNumDays + 18} className="px-4 py-6 text-center text-muted">
                          조건에 맞는 근로자가 없습니다.
                        </td>
                      </tr>
                    )}
                    {gridEmployees.length > 0 &&
                      (() => {
                        const grand = gridMonthGrandTotal();
                        return (
                          <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-ink">
                            <td className="sticky left-0 z-10 bg-slate-50 px-2 py-2">-</td>
                            <td className="sticky left-10 z-10 bg-slate-50 px-2 py-2 text-left">합계</td>
                            <td className="sticky left-[104px] z-10 bg-slate-50 px-2 py-2">-</td>
                            <td className="px-2 py-2">-</td>
                            <td className="px-2 py-2">-</td>
                            <td className="px-2 py-2">-</td>
                            <td className="px-2 py-2">-</td>
                            <td className="px-2 py-2">-</td>
                            {gridDayList.map((d) => (
                              <td key={d} className="px-1 py-2">
                                {gridDailyHeadcount(d)}
                              </td>
                            ))}
                            <td className="px-2 py-2">{grand.present}</td>
                            <td className="px-2 py-2 text-danger">{grand.absent}</td>
                            <td className="px-2 py-2">{grand.off}</td>
                            <td className="px-2 py-2">{grand.annual}</td>
                            <td className="px-2 py-2">{grand.fullAttendance || "-"}</td>
                            <td className="px-2 py-2">{grand.overtime}</td>
                            <td className="px-2 py-2">{grand.sick}</td>
                            <td className="px-2 py-2">-</td>
                            <td className="px-2 py-2 print:hidden">-</td>
                          </tr>
                        );
                      })()}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {view === "휴무현황" && (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <input
                type="month"
                value={leaveMonth}
                onChange={(e) => setLeaveMonth(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={leaveSearch}
                onChange={(e) => setLeaveSearch(e.target.value)}
                placeholder="이름 검색"
                className="w-40 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <p className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              <span>총 {monthLeaves.length}건</span>
              {Object.entries(monthLeaveTypeTotals).map(([type, total]) => (
                <span key={type}>
                  {type} {total}일
                </span>
              ))}
            </p>
            <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
              <table className="w-full min-w-[860px] text-center text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-muted">
                    <th className="px-4 py-3 font-semibold">순번</th>
                    <th className="px-4 py-3 font-semibold">종류</th>
                    <th className="px-4 py-3 font-semibold">이름</th>
                    <th className="px-4 py-3 font-semibold">연락처</th>
                    <th className="px-4 py-3 font-semibold">소속업체</th>
                    <th className="px-4 py-3 font-semibold">센터</th>
                    <th className="px-4 py-3 font-semibold">기간</th>
                    <th className="px-4 py-3 font-semibold">일수</th>
                    <th className="px-4 py-3 font-semibold">사유</th>
                    <th className="px-4 py-3 font-semibold">삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {monthLeaves.map((lv, i) => {
                    const emp = employeeByUid.get(lv.uid);
                    return (
                      <tr key={lv.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-3 text-ink">{i + 1}</td>
                        <td className="px-4 py-3">
                          <Badge tone={LEAVE_TYPE_TONE[lv.type] || "muted"}>{lv.type}</Badge>
                        </td>
                        <td className="px-4 py-3 text-ink">{lv.name}</td>
                        <td className="px-4 py-3 text-ink">
                          <span className="inline-flex items-center gap-1">
                            {emp?.phone || "-"}
                            {emp?.phone && <SmsButton phone={emp.phone} />}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-ink">{vendorName_(emp?.vendorId)}</td>
                        <td className="px-4 py-3 text-ink">{siteName_(emp?.workSiteId)}</td>
                        <td className="px-4 py-3 text-ink">
                          {lv.startDate === lv.endDate || !lv.endDate ? formatDate(lv.startDate) : `${formatDate(lv.startDate)} ~ ${formatDate(lv.endDate)}`}
                        </td>
                        <td className="px-4 py-3 font-semibold text-ink">{leaveDayCount(lv)}일</td>
                        <td className="px-4 py-3 text-ink">{lv.reason || "-"}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => deleteLeave(lv)}
                            title="삭제"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white hover:bg-primary-dark"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {monthLeaves.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-6 text-center text-xs text-muted">
                        해당 월에 휴무 정보가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {view === "수정현황" && (
          <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
            <table className="w-full min-w-[820px] text-center text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-muted">
                  <th className="px-4 py-3 font-semibold">순번</th>
                  <th className="px-4 py-3 font-semibold">이름</th>
                  <th className="px-4 py-3 font-semibold">근무일자</th>
                  <th className="px-4 py-3 font-semibold">변경항목</th>
                  <th className="px-4 py-3 font-semibold">변경전</th>
                  <th className="px-4 py-3 font-semibold">변경후</th>
                  <th className="px-4 py-3 font-semibold">사유</th>
                  <th className="px-4 py-3 font-semibold">변경일시</th>
                  <th className="px-4 py-3 font-semibold">삭제</th>
                </tr>
              </thead>
              <tbody>
                {edits
                  .slice()
                  .sort((a, b) => (b.editedAt?.seconds || 0) - (a.editedAt?.seconds || 0))
                  .map((e, i) => (
                    <tr key={e.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-3 text-ink">{i + 1}</td>
                      <td className="px-4 py-3 text-ink">{e.name}</td>
                      <td className="px-4 py-3 text-ink">{formatDate(e.date)}</td>
                      <td className="px-4 py-3 text-ink">{e.field}</td>
                      <td className="px-4 py-3 text-ink">{e.oldValue}</td>
                      <td className="px-4 py-3 text-ink">{e.newValue}</td>
                      <td className="px-4 py-3 text-ink">{e.reason}</td>
                      <td className="px-4 py-3 text-ink">
                        {e.editedAt?.toDate ? e.editedAt.toDate().toLocaleString("ko-KR") : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => deleteEdit(e)}
                          title="삭제"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white hover:bg-primary-dark"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                {edits.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-xs text-muted">
                      수정 내역이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {view === "변경요청" && (
          <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
            <table className="w-full min-w-[880px] text-center text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-muted">
                  <th className="px-4 py-3 font-semibold">순번</th>
                  <th className="px-4 py-3 font-semibold">이름</th>
                  <th className="px-4 py-3 font-semibold">근무일자</th>
                  <th className="px-4 py-3 font-semibold">변경항목</th>
                  <th className="px-4 py-3 font-semibold">기존시각</th>
                  <th className="px-4 py-3 font-semibold">요청시각</th>
                  <th className="px-4 py-3 font-semibold">사유</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                  <th className="px-4 py-3 font-semibold">처리</th>
                  <th className="px-4 py-3 font-semibold">삭제</th>
                </tr>
              </thead>
              <tbody>
                {sortedChangeRequests.map((r, i) => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 text-ink">{i + 1}</td>
                    <td className="px-4 py-3 text-ink">{r.name}</td>
                    <td className="px-4 py-3 text-ink">{formatDate(r.date)}</td>
                    <td className="px-4 py-3 text-ink">{r.fieldLabel}</td>
                    <td className="px-4 py-3 text-ink">{r.currentTime || "-"}</td>
                    <td className="px-4 py-3 font-semibold text-ink">{r.requestedTime}</td>
                    <td className="px-4 py-3 text-ink">{r.reason}</td>
                    <td className="px-4 py-3">
                      <Badge tone={CHANGE_REQUEST_STATUS_TONE[r.status]}>{CHANGE_REQUEST_STATUS_LABEL[r.status]}</Badge>
                      {r.status === "rejected" && r.adminNote && <p className="mt-1 text-[11px] text-muted">{r.adminNote}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {r.status === "pending" ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => approveChangeRequest(r)}
                            className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark"
                          >
                            <Check size={12} /> 승인
                          </button>
                          <button
                            type="button"
                            onClick={() => { setRejectTarget(r); setRejectNote(""); }}
                            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-muted hover:bg-slate-50"
                          >
                            <XIcon size={12} /> 반려
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => deleteChangeRequest(r)}
                        title="삭제"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white hover:bg-primary-dark"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {sortedChangeRequests.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-6 text-center text-xs text-muted">
                      출근시간 변경 요청이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={Boolean(gridEditCell)}
        onClose={() => setGridEditCell(null)}
        title={gridEditCell ? `${gridEditCell.name} · ${gridMonth.split("-")[1]}월 ${gridEditCell.day}일 근태 지정` : ""}
      >
        {gridEditCell && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-muted">
              현재 상태:{" "}
              <span className="font-semibold text-ink">
                {gridEditCell.current ? GRID_STATUS_OPTIONS.find((o) => o.key === gridEditCell.current)?.label || gridEditCell.current : "미정"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {GRID_STATUS_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  disabled={gridSaving}
                  onClick={() => gridApplyStatus(o.key)}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
                    gridEditCell.current === o.key ? "border-primary bg-primary-light" : "border-slate-200 bg-white hover:border-primary/40 hover:bg-slate-50"
                  }`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${o.tone}`}>
                    <o.icon size={15} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-ink">{o.label}</span>
                    <span className="block text-[11px] text-muted">{o.desc}</span>
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={gridSaving}
              onClick={gridClearDay}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-sm text-muted hover:border-danger hover:text-danger disabled:opacity-50"
            >
              <Eraser size={14} /> 기록 지우기 (미정으로 초기화)
            </button>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(bulkTarget)}
        onClose={() => setBulkTarget(null)}
        size="lg"
        title={bulkTarget ? `${bulkTarget.name} 스케줄 편집` : ""}
        footer={
          bulkTarget && (
            <>
              <Button variant="outline" className="mr-auto" onClick={resetBulkMonth} disabled={bulkResetting || bulkSaving}>
                <Trash2 size={13} /> {bulkResetting ? "초기화 중..." : "이 달 전체 초기화"}
              </Button>
              <Button variant="outline" onClick={() => setBulkTarget(null)}>
                취소
              </Button>
              <Button onClick={bulkSave} disabled={bulkSaving}>
                {bulkSaving ? "저장 중..." : "저장"}
              </Button>
            </>
          )
        }
      >
        {bulkTarget && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted">
                이 달에 실제로 출근/휴무했던 날짜가 아래 달력에 그대로 표시됩니다. 바꾸고 싶은 날짜를 눌러 원하는 상태로
                다시 지정하세요. 아직 지정되지 않은 미래 날짜는 저장 시 전부 <span className="font-semibold text-primary">출근</span>으로 채워집니다.
              </p>
              <input
                type="month"
                value={bulkMonth}
                onChange={(e) => changeBulkMonth(e.target.value)}
                className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {GRID_STATUS_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setBulkActiveStatus(o.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    bulkActiveStatus === o.key ? o.tone : "bg-slate-100 text-muted hover:bg-slate-200"
                  }`}
                >
                  <o.icon size={12} /> {o.label}
                </button>
              ))}
            </div>

            {bulkPrefillLoading ? (
              <p className="py-6 text-center text-xs text-muted">기존 스케줄을 불러오는 중...</p>
            ) : (
              <MiniMonthCalendar month={bulkMonth} cells={bulkDayCells} onDayClick={toggleBulkDay} />
            )}

            {Object.keys(bulkDayMap).length > 0 && (
              <div className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-muted">
                {GRID_STATUS_OPTIONS.map((o) => {
                  const days = Object.entries(bulkDayMap)
                    .filter(([, v]) => v === o.key)
                    .map(([d]) => d)
                    .sort((a, b) => Number(a) - Number(b));
                  return days.length ? `${o.label} ${days.join(",")}일` : null;
                })
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(importResult)}
        onClose={() => setImportResult(null)}
        title="출근기록부 업로드 결과"
        footer={
          <Button variant="outline" onClick={() => setImportResult(null)}>
            닫기
          </Button>
        }
      >
        {importResult && (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              총 <span className="font-semibold text-primary">{importResult.matchedCount}명</span> 반영 완료 ·{" "}
              <span className="font-semibold text-danger">{importResult.unmatched.length}명</span> 제외
            </p>
            {importResult.unmatched.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-center text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-muted">
                      <th className="px-3 py-2 font-semibold">이름</th>
                      <th className="px-3 py-2 font-semibold">전화번호</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.unmatched.map((u, i) => (
                      <tr key={i} className="border-b border-slate-50 last:border-0">
                        <td className="px-3 py-2 text-ink">{u.name}</td>
                        <td className="px-3 py-2 text-ink">{u.phone || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted">제외된 근로자는 이름과 전화번호가 등록된 근로자 정보와 정확히 일치하지 않아 자동으로 반영되지 않았습니다.</p>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="변경 요청 반려"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              취소
            </Button>
            <Button onClick={rejectChangeRequest}>반려하기</Button>
          </>
        }
      >
        {rejectTarget && (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              {rejectTarget.name}님의 {formatDate(rejectTarget.date)} {rejectTarget.fieldLabel} 변경 요청을 반려합니다.
            </p>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">반려 사유 (선택)</span>
              <textarea
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                rows={3}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="근로자에게 전달할 사유"
              />
            </label>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(detail)}
        onClose={closeDetail}
        title="출근현황 상세"
        footer={
          detailEditMode ? (
            <>
              <Button variant="outline" onClick={() => setDetailEditMode(false)}>
                취소
              </Button>
              <Button onClick={saveDetailEdit} disabled={!detailForm.reason.trim()}>
                저장
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={closeDetail}>
                닫기
              </Button>
              <Button onClick={() => setDetailEditMode(true)}>
                <Pencil size={13} /> 수정
              </Button>
            </>
          )
        }
      >
        {detail && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <span className="block text-[11px] font-medium text-muted">이름</span>
                <span className="text-ink">{detail.record.name}</span>
              </div>
              <div>
                <span className="block text-[11px] font-medium text-muted">근무일</span>
                <span className="text-ink">{formatDate(detail.record.date)}</span>
              </div>
              <div>
                <span className="block text-[11px] font-medium text-muted">사업자</span>
                <span className="text-ink">{companyName}</span>
              </div>
              <div>
                <span className="block text-[11px] font-medium text-muted">센터</span>
                <span className="text-ink">{detail.record.siteName || siteName_(detail.emp.workSiteId)}</span>
              </div>
              <div>
                <span className="block text-[11px] font-medium text-muted">근무구분</span>
                <span className="text-ink">{detail.emp.shiftType || "-"}</span>
              </div>
              <div>
                <span className="block text-[11px] font-medium text-muted">근무형태</span>
                <span className="text-ink">{detail.emp.employmentType || "-"}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">출근시각</span>
                {detailEditMode ? (
                  <input
                    type="time"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    value={detailForm.checkInTime}
                    onChange={(e) => setDetailForm((f) => ({ ...f, checkInTime: e.target.value }))}
                  />
                ) : (
                  <p className="text-sm text-ink">{detail.record.checkInTime ? formatTime(detail.record.checkInTime) : "-"}</p>
                )}
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">퇴근시각</span>
                {detailEditMode ? (
                  <input
                    type="time"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    value={detailForm.checkOutTime}
                    onChange={(e) => setDetailForm((f) => ({ ...f, checkOutTime: e.target.value }))}
                  />
                ) : (
                  <p className="text-sm text-ink">{detail.record.checkOutTime ? formatTime(detail.record.checkOutTime) : "-"}</p>
                )}
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">출근상태</span>
              {detailEditMode ? (
                <select
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={detailForm.status}
                  onChange={(e) => setDetailForm((f) => ({ ...f, status: e.target.value }))}
                >
                  {EDIT_STATUS_OPTIONS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <Badge tone={detail.record.status === "출근" ? "success" : detail.record.status === "지각" || detail.record.status === "조퇴" ? "warning" : "danger"}>
                  {detail.record.status || "미출근"}
                </Badge>
              )}
            </label>

            {detailEditMode && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">사유 (필수)</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={detailForm.reason}
                  onChange={(e) => setDetailForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="변경사유"
                />
              </label>
            )}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(externalInfoTarget)} onClose={() => setExternalInfoTarget(null)} title="외부인력 정보">
        {externalInfoTarget && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <span className="block text-[11px] font-medium text-muted">이름</span>
              <span className="text-ink">{externalInfoTarget.name || "-"}</span>
            </div>
            <div>
              <span className="block text-[11px] font-medium text-muted">연락처</span>
              <span className="text-ink">{externalInfoTarget.phone || "-"}</span>
            </div>
            <div>
              <span className="block text-[11px] font-medium text-muted">소속업체(인력사무소)</span>
              <span className="text-ink">{externalInfoTarget.agencyName || "-"}</span>
            </div>
            <div>
              <span className="block text-[11px] font-medium text-muted">센터</span>
              <span className="text-ink">{siteName_(externalInfoTarget.workSiteId)}</span>
            </div>
            <div>
              <span className="block text-[11px] font-medium text-muted">근무구분</span>
              <span className="text-ink">{externalInfoTarget.shiftType || "-"}</span>
            </div>
            <div>
              <span className="block text-[11px] font-medium text-muted">일당</span>
              <span className="text-ink">{externalInfoTarget.dailyRate ? `${Number(externalInfoTarget.dailyRate).toLocaleString()}원` : "-"}</span>
            </div>
            <div>
              <span className="block text-[11px] font-medium text-muted">성별</span>
              <span className="text-ink">{externalInfoTarget.gender || "-"}</span>
            </div>
            <div>
              <span className="block text-[11px] font-medium text-muted">입사일</span>
              <span className="text-ink">{externalInfoTarget.hireDate || "-"}</span>
            </div>
            <div className="col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-muted">
              외부인력은 연동된 인력사무소의 인원관리에서 정보를 수정할 수 있습니다.
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(quickEditTarget)}
        onClose={closeQuickEdit}
        title="근로자 정보 수정"
        footer={
          <>
            <Button variant="outline" onClick={closeQuickEdit}>
              취소
            </Button>
            <Button onClick={saveQuickEdit} disabled={quickEditSaving}>
              {quickEditSaving ? "저장 중..." : "저장"}
            </Button>
          </>
        }
      >
        {quickEditForm && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">이름</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={quickEditForm.name}
                onChange={(e) => setQuickEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">연락처</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={quickEditForm.phone}
                onChange={(e) => setQuickEditForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">성별</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={quickEditForm.gender}
                onChange={(e) => setQuickEditForm((f) => ({ ...f, gender: e.target.value }))}
              >
                <option value="">선택</option>
                <option value="남">남</option>
                <option value="여">여</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">입사일</span>
              <input
                type="date"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={quickEditForm.hireDate}
                onChange={(e) => setQuickEditForm((f) => ({ ...f, hireDate: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={quickEditForm.workSiteId}
                onChange={(e) => setQuickEditForm((f) => ({ ...f, workSiteId: e.target.value }))}
              >
                <option value="">선택</option>
                {workSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">소속업체</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={quickEditForm.vendorId}
                onChange={(e) => setQuickEditForm((f) => ({ ...f, vendorId: e.target.value }))}
              >
                <option value="">선택</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">부서</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={quickEditForm.team}
                onChange={(e) => setQuickEditForm((f) => ({ ...f, team: e.target.value }))}
              >
                <option value="">선택</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">직급</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={quickEditForm.position}
                onChange={(e) => setQuickEditForm((f) => ({ ...f, position: e.target.value }))}
              >
                <option value="">선택</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">근무구분</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={quickEditForm.shiftType}
                onChange={(e) => setQuickEditForm((f) => ({ ...f, shiftType: e.target.value }))}
              >
                <option value="">선택</option>
                {SHIFT_TYPE_OPTIONS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">고용구분</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={quickEditForm.employmentType}
                onChange={(e) => setQuickEditForm((f) => ({ ...f, employmentType: e.target.value }))}
              >
                <option value="">선택</option>
                {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">재직상태</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={quickEditForm.employmentStatus}
                onChange={(e) => setQuickEditForm((f) => ({ ...f, employmentStatus: e.target.value }))}
              >
                {EMPLOYMENT_STATUS_OPTIONS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
