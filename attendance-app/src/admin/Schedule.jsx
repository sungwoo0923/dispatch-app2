import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  serverTimestamp,
  deleteField,
} from "firebase/firestore";
import {
  Plus,
  CalendarDays,
  FileSpreadsheet,
  RefreshCw,
  LayoutList,
  Calendar as CalendarIcon,
  Copy,
  Repeat,
  X,
  Search,
  Clock,
  CalendarOff,
  UserMinus,
  Trash2,
} from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { computeCheckInStatus } from "../utils/attendanceStatus";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import SidePanel from "../components/SidePanel";
import DraggableTh from "../components/DraggableTh";
import ColumnVisibilityButton from "../components/ColumnVisibilityButton";
import { useColumnPrefs } from "../hooks/useColumnPrefs";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import { downloadCsv } from "../utils/exportCsv";
import { toDateKey, formatDate, calculateAge, attendanceDocId } from "../utils/dateUtils";
import { softDeleteEmployees } from "../utils/employeeUtils";
import { buildDefaultContract } from "../utils/contractTemplate";
import { contractStatus } from "../utils/contractStatus";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  SHIFT_TYPE_OPTIONS,
  NATIONALITY_OPTIONS,
  COUNTRY_OPTIONS,
} from "../constants/hr";
import SmsButton from "../components/SmsButton";

const STATUS_OPTIONS = ["대기", "출근확정", "출근확정취소", "출근취소"];
const STATUS_TONE = { 대기: "muted", 출근확정: "success", 출근확정취소: "warning", 출근취소: "danger" };

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

export default function Schedule() {
  const { profile } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const location = useLocation();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [shiftTemplates, setShiftTemplates] = useState([]);
  const [allowanceTemplates, setAllowanceTemplates] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [businessEntities, setBusinessEntities] = useState([]);
  const [open, setOpen] = useState(false);

  const [bulkFilters, setBulkFilters] = useState(EMPTY_FILTERS);
  const [bulkSearched, setBulkSearched] = useState(false);
  const [bulkResults, setBulkResults] = useState([]);
  const [bulkSelected, setBulkSelected] = useState(() => new Set());

  // 근로자목록에서 우클릭 > 스케줄등록으로 넘어온 경우, 이름 검색이 아니라
  // uid로 정확히 그 근로자만 출근자등록 팝업에 미리 선택해둔다(동명이인
  // 오선택 방지). 다시 안 열리도록 state를 소비 후 지워준다.
  useEffect(() => {
    const presetId = location.state?.presetEmployeeId;
    if (!presetId || employees.length === 0) return;
    const emp = employees.find((e) => e.id === presetId);
    if (emp) {
      setBulkResults([emp]);
      setBulkSearched(true);
      setBulkSelected(new Set([emp.id]));
      setOpen(true);
    }
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, employees]);
  const [bulkRange, setBulkRange] = useState({ start: toDateKey(), end: toDateKey() });

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [range, setRange] = useState({ start: toDateKey(), end: toDateKey() });
  const [selected, setSelected] = useState(() => new Set());
  const [selectedLeaves, setSelectedLeaves] = useState(() => new Set());
  const [selectedResigned, setSelectedResigned] = useState(() => new Set());
  const [statusAction, setStatusAction] = useState("출근확정");
  const [view, setView] = useState("list");
  const [calendarMonth, setCalendarMonth] = useState(() => toDateKey().slice(0, 7));

  const [copyOpen, setCopyOpen] = useState(false);
  const [copyForm, setCopyForm] = useState({
    fixedStaff: true,
    baseDate: toDateKey(),
    mode: "dates",
    dates: [],
    dateInput: "",
    rangeStart: toDateKey(),
    rangeEnd: toDateKey(),
  });

  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState({ mode: "bulk", templateId: "" });
  const [individualTemplates, setIndividualTemplates] = useState({});

  useEffect(() => {
    if (!profile?.companyId) return;
    getDoc(doc(db, "companies", profile.companyId)).then((s) => setCompanyName(s.data()?.name || ""));
    const unsubUsers = onSnapshot(
      query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")),
      // 삭제(탈퇴)된 근로자는 employeeByUid에서 아예 빠져야 스케줄/대기/휴무
      // 카드에서도 함께 사라진다 — 근로자목록에서 삭제해도 여기 그대로
      // 남아있던 버그의 원인이 바로 이 필터 누락이었다.
      (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => !e.deleted))
    );
    const unsubSites = onSnapshot(
      query(collection(db, "workSites"), where("companyId", "==", profile.companyId)),
      (snap) => setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubVendors = onSnapshot(
      query(collection(db, "vendors"), where("companyId", "==", profile.companyId)),
      (snap) => setVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubDept = onSnapshot(
      query(collection(db, "departments"), where("companyId", "==", profile.companyId)),
      (snap) => setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubPos = onSnapshot(
      query(collection(db, "positions"), where("companyId", "==", profile.companyId)),
      (snap) => setPositions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubTemplates = onSnapshot(
      query(collection(db, "shiftTemplates"), where("companyId", "==", profile.companyId)),
      (snap) => setShiftTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubAllowT = onSnapshot(
      query(collection(db, "allowanceTemplates"), where("companyId", "==", profile.companyId)),
      (snap) => setAllowanceTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubLeaves = onSnapshot(
      query(collection(db, "leaves"), where("companyId", "==", profile.companyId)),
      (snap) => setLeaves(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubContracts = onSnapshot(
      query(collection(db, "contracts"), where("companyId", "==", profile.companyId)),
      (snap) => setContracts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubEntities = onSnapshot(
      query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)),
      (snap) => setBusinessEntities(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubUsers();
      unsubSites();
      unsubVendors();
      unsubDept();
      unsubPos();
      unsubTemplates();
      unsubAllowT();
      unsubLeaves();
      unsubContracts();
      unsubEntities();
    };
  }, [profile?.companyId]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const monthRange =
      view === "calendar"
        ? { start: `${calendarMonth}-01`, end: `${calendarMonth}-31` }
        : range;
    const unsubSchedules = onSnapshot(
      query(
        collection(db, "schedules"),
        where("companyId", "==", profile.companyId),
        where("date", ">=", monthRange.start),
        where("date", "<=", monthRange.end)
      ),
      (snap) => setSchedules(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsubSchedules();
  }, [profile?.companyId, range.start, range.end, view, calendarMonth]);

  const employeeByUid = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";
  const vendorName_ = (id) => vendors.find((v) => v.id === id)?.name || "-";
  const shiftTemplateName_ = (id) => shiftTemplates.find((t) => t.id === id)?.name || "-";
  const allowanceTemplateName_ = (id) => allowanceTemplates.find((t) => t.id === id)?.name || "-";
  const latestContractFor = (uid) =>
    contracts.filter((c) => c.uid === uid).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0] || null;

  const matchesFilters = (emp, f) => {
    if (!emp) return false;
    if (f.siteId && emp.workSiteId !== f.siteId) return false;
    if (f.vendorId && emp.vendorId !== f.vendorId) return false;
    if (f.shiftType && emp.shiftType !== f.shiftType) return false;
    if (f.employmentType && emp.employmentType !== f.employmentType) return false;
    if (f.team && emp.team !== f.team) return false;
    if (f.position && emp.position !== f.position) return false;
    if (f.nationality && emp.nationality !== f.nationality) return false;
    if (f.country && emp.country !== f.country) return false;
    if (f.name && !emp.name?.includes(f.name)) return false;
    if (f.phone && !emp.phone?.includes(f.phone)) return false;
    return true;
  };

  // 컬럼명을 클릭해 정렬할 때, id 참조 컬럼(센터/소속업체 등)이나 계약서
  // 조회처럼 별도 조회가 필요한 값은 화면에 보이는 값 기준으로 정렬해야
  // 의미가 있으므로 특별 처리하고 나머지는 emp/schedule/leave 필드를
  // 그대로 사용한다.
  const scheduleRowSortValue = (row, key) => {
    switch (key) {
      case "site":
        return siteName_(row.emp?.workSiteId) || row.schedule?.siteName || "";
      case "vendor":
        return vendorName_(row.emp?.vendorId);
      case "company":
        return companyName;
      case "date":
        return row.schedule?.date || "";
      case "time":
        return row.schedule?.startTime || "";
      case "status":
        return row.schedule?.status || "대기";
      case "shiftTemplate":
        return shiftTemplateName_(row.emp?.shiftTemplateId);
      case "allowanceTemplate":
        return allowanceTemplateName_(row.emp?.allowanceTemplateId);
      case "contractCycle":
        return latestContractFor(row.emp?.id)?.cycle || "";
      case "contractStartDate":
        return latestContractFor(row.emp?.id)?.startDate || "";
      case "contractWritten":
        return contractStatus(latestContractFor(row.emp?.id));
      case "signatureStatus":
        return latestContractFor(row.emp?.id)?.employeeSignatureDataUrl ? "Y" : "N";
      default:
        return row.emp?.[key] ?? "";
    }
  };
  const sortRows = (list, sort, valueOf) => {
    if (!sort.key) return list;
    const dir = sort.dir === "desc" ? -1 : 1;
    return [...list].sort((a, b) => {
      const av = valueOf(a, sort.key);
      const bv = valueOf(b, sort.key);
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
  };

  const [scheduleSort, setScheduleSort] = useState({ key: "date", dir: "asc" });
  const [leaveSort, setLeaveSort] = useState({ key: "period", dir: "asc" });
  const [resignedSort, setResignedSort] = useState({ key: "name", dir: "asc" });

  const rows = useMemo(() => {
    const list = schedules
      .map((s) => ({ schedule: s, emp: employeeByUid.get(s.uid) }))
      .filter(({ emp }) => Boolean(emp))
      .filter(({ emp }) => matchesFilters(emp, filters));
    return sortRows(list, scheduleSort, scheduleRowSortValue);
  }, [schedules, employeeByUid, filters, scheduleSort]);

  // 스케줄 인원 현황은 "확정된" 근무만 모아두는 카드다 — 대기/취소 상태 건은
  // 각자의 카드(대기/휴무/퇴사)에만 나타나야 하며 여기 중복으로 잡히면 안 된다.
  const confirmedRows = useMemo(() => rows.filter(({ schedule: s }) => s.status === "출근확정"), [rows]);
  const pendingRows = useMemo(() => rows.filter(({ schedule: s }) => (s.status || "대기") === "대기"), [rows]);

  const leaveRowSortValue = (row, key) => {
    switch (key) {
      case "name":
        return row.emp?.name || "";
      case "site":
        return siteName_(row.emp?.workSiteId);
      case "vendor":
        return vendorName_(row.emp?.vendorId);
      case "company":
        return companyName;
      case "type":
        return row.leave?.type || "";
      case "period":
        return row.leave?.startDate || "";
      case "reason":
        return row.leave?.reason || "";
      default:
        return row.emp?.[key] ?? "";
    }
  };

  const leaveRows = useMemo(() => {
    const list = leaves
      .filter((lv) => lv.status === "approved")
      .map((lv) => ({ leave: lv, emp: employeeByUid.get(lv.uid) }))
      .filter(({ emp }) => Boolean(emp))
      .filter(({ leave, emp }) => {
        if (range.start && (leave.endDate || leave.startDate) < range.start) return false;
        if (range.end && leave.startDate > range.end) return false;
        return matchesFilters(emp, filters);
      });
    return sortRows(list, leaveSort, leaveRowSortValue);
  }, [leaves, employeeByUid, filters, range, leaveSort]);

  const resignedRowSortValue = (emp, key) => {
    switch (key) {
      case "site":
        return siteName_(emp.workSiteId);
      case "vendor":
        return vendorName_(emp.vendorId);
      case "company":
        return companyName;
      case "furlough":
        return emp.employmentStatus === "휴직" ? "Y" : "N";
      case "shiftTemplate":
        return shiftTemplateName_(emp.shiftTemplateId);
      case "allowanceTemplate":
        return allowanceTemplateName_(emp.allowanceTemplateId);
      default:
        return emp[key] ?? "";
    }
  };

  const resignedRows = useMemo(() => {
    const list = employees.filter((emp) => emp.employmentStatus === "퇴사" && matchesFilters(emp, filters));
    return sortRows(list, resignedSort, resignedRowSortValue);
  }, [employees, filters, resignedSort]);

  const scheduleColumns = [
    { key: "company", label: "사업자", render: () => companyName },
    { key: "site", label: "센터", render: ({ schedule: s, emp }) => siteName_(emp.workSiteId) || s.siteName || "-" },
    {
      key: "status",
      label: "확정",
      render: ({ schedule: s }) => <Badge tone={STATUS_TONE[s.status || "대기"]}>{s.status || "대기"}</Badge>,
    },
    { key: "date", label: "근무일자", render: ({ schedule: s }) => formatDate(s.date) },
    { key: "time", label: "근무시각", render: ({ schedule: s }) => `${s.startTime} ~ ${s.endTime}` },
    { key: "phone", label: "전화번호", render: ({ emp }) => emp.phone },
    { key: "gender", label: "성별", render: ({ emp }) => emp.gender || "-" },
    { key: "age", label: "나이", render: ({ emp }) => calculateAge(emp.residentNumberFront) ?? "-" },
    { key: "vendor", label: "소속업체", render: ({ emp }) => vendorName_(emp.vendorId) },
    { key: "shiftType", label: "근무구분", render: ({ emp }) => emp.shiftType || "-" },
    { key: "employmentType", label: "근무형태", render: ({ emp }) => emp.employmentType || "-" },
    { key: "workLocation", label: "근무위치", render: ({ emp }) => emp.workLocation || "-" },
    { key: "note", label: "근무비고", render: ({ emp }) => emp.note || "-" },
    { key: "team", label: "부서", render: ({ emp }) => emp.team || "-" },
    { key: "position", label: "직급", render: ({ emp }) => emp.position || "-" },
    { key: "nationality", label: "외/내국인", render: ({ emp }) => emp.nationality || "-" },
    { key: "country", label: "국적", render: ({ emp }) => emp.country || "-" },
    { key: "signup", label: "회원가입", render: () => "Y" },
    { key: "contractCycle", label: "계약주기", render: ({ emp }) => latestContractFor(emp.id)?.cycle || "-" },
    {
      key: "contractStartDate",
      label: "계약시작일자",
      render: ({ emp }) => {
        const c = latestContractFor(emp.id);
        return c?.startDate ? formatDate(c.startDate) : "-";
      },
    },
    { key: "contractWritten", label: "계약서작성여부", render: ({ emp }) => contractStatus(latestContractFor(emp.id)) },
    { key: "shiftTemplate", label: "시간템플릿", render: ({ emp }) => shiftTemplateName_(emp.shiftTemplateId) },
    { key: "allowanceTemplate", label: "수당템플릿", render: ({ emp }) => allowanceTemplateName_(emp.allowanceTemplateId) },
    { key: "contractTemplate", label: "계약서템플릿", render: ({ emp }) => emp.contractTemplateName || "-" },
    { key: "resignTemplate", label: "사직서템플릿", render: ({ emp }) => emp.resignTemplateName || "-" },
    { key: "insurance", label: "4대보험", render: ({ emp }) => (emp.insuranceApplied === "Y" ? "Y" : "N") },
    { key: "employeeCode", label: "가입코드", render: ({ emp }) => emp.employeeCode || "-" },
    {
      key: "signatureStatus",
      label: "전자서명여부",
      render: ({ emp }) => (latestContractFor(emp.id)?.employeeSignatureDataUrl ? "Y" : "N"),
    },
  ];
  const {
    visibleColumns: visibleScheduleColumns,
    hidden: hiddenScheduleColumns,
    moveColumn: moveScheduleColumn,
    toggleColumn: toggleScheduleColumn,
    columns: scheduleColumnsOrdered,
  } = useColumnPrefs("scheduleMain", scheduleColumns);

  const leaveColumns = [
    { key: "name", label: "이름", render: ({ emp }) => emp.name },
    { key: "company", label: "사업자", render: () => companyName },
    { key: "site", label: "센터", render: ({ emp }) => siteName_(emp.workSiteId) },
    { key: "type", label: "휴가유형", render: ({ leave }) => leave.type || "-" },
    {
      key: "period",
      label: "휴무기간",
      render: ({ leave }) => `${formatDate(leave.startDate)} ~ ${formatDate(leave.endDate || leave.startDate)}`,
    },
    { key: "reason", label: "사유", render: ({ leave }) => leave.reason || "-" },
    { key: "phone", label: "전화번호", render: ({ emp }) => emp.phone },
    { key: "gender", label: "성별", render: ({ emp }) => emp.gender || "-" },
    { key: "age", label: "나이", render: ({ emp }) => calculateAge(emp.residentNumberFront) ?? "-" },
    { key: "vendor", label: "소속업체", render: ({ emp }) => vendorName_(emp.vendorId) },
    { key: "shiftType", label: "근무구분", render: ({ emp }) => emp.shiftType || "-" },
    { key: "employmentType", label: "근무형태", render: ({ emp }) => emp.employmentType || "-" },
    { key: "workLocation", label: "근무위치", render: ({ emp }) => emp.workLocation || "-" },
    { key: "note", label: "근무비고", render: ({ emp }) => emp.note || "-" },
    { key: "team", label: "부서", render: ({ emp }) => emp.team || "-" },
    { key: "position", label: "직급", render: ({ emp }) => emp.position || "-" },
  ];
  const {
    visibleColumns: visibleLeaveColumns,
    hidden: hiddenLeaveColumns,
    moveColumn: moveLeaveColumn,
    toggleColumn: toggleLeaveColumn,
    columns: leaveColumnsOrdered,
  } = useColumnPrefs("scheduleLeave", leaveColumns);

  const resignedColumns = [
    { key: "name", label: "이름", render: (emp) => emp.name },
    { key: "company", label: "사업자", render: () => companyName },
    { key: "site", label: "센터", render: (emp) => siteName_(emp.workSiteId) },
    { key: "phone", label: "전화번호", render: (emp) => emp.phone },
    { key: "gender", label: "성별", render: (emp) => emp.gender || "-" },
    { key: "age", label: "나이", render: (emp) => calculateAge(emp.residentNumberFront) ?? "-" },
    { key: "furlough", label: "휴면", render: (emp) => (emp.employmentStatus === "휴직" ? "Y" : "N") },
    { key: "vendor", label: "소속업체", render: (emp) => vendorName_(emp.vendorId) },
    { key: "hireDate", label: "입사일", render: (emp) => (emp.hireDate ? formatDate(emp.hireDate) : "-") },
    { key: "resignDate", label: "퇴사일", render: (emp) => (emp.resignDate ? formatDate(emp.resignDate) : "-") },
    { key: "shiftType", label: "근무구분", render: (emp) => emp.shiftType || "-" },
    { key: "employmentType", label: "근무형태", render: (emp) => emp.employmentType || "-" },
    { key: "workLocation", label: "근무위치", render: (emp) => emp.workLocation || "-" },
    { key: "note", label: "근무비고", render: (emp) => emp.note || "-" },
    { key: "team", label: "부서", render: (emp) => emp.team || "-" },
    { key: "position", label: "직급", render: (emp) => emp.position || "-" },
    { key: "shiftTemplate", label: "시간템플릿", render: (emp) => shiftTemplateName_(emp.shiftTemplateId) },
    { key: "allowanceTemplate", label: "수당템플릿", render: (emp) => allowanceTemplateName_(emp.allowanceTemplateId) },
    { key: "contractTemplate", label: "계약서템플릿", render: (emp) => emp.contractTemplateName || "-" },
    { key: "resignTemplate", label: "사직서템플릿", render: (emp) => emp.resignTemplateName || "-" },
    { key: "nationality", label: "외/내국인", render: (emp) => emp.nationality || "-" },
    { key: "country", label: "국적", render: (emp) => emp.country || "-" },
    { key: "signup", label: "회원가입", render: () => "Y" },
    { key: "insurance", label: "4대보험", render: (emp) => (emp.insuranceApplied === "Y" ? "Y" : "N") },
    { key: "payType", label: "급여", render: (emp) => emp.payType || "-" },
  ];
  const {
    visibleColumns: visibleResignedColumns,
    hidden: hiddenResignedColumns,
    moveColumn: moveResignedColumn,
    toggleColumn: toggleResignedColumn,
    columns: resignedColumnsOrdered,
  } = useColumnPrefs("scheduleResigned", resignedColumns);

  const openBulkRegister = () => {
    setBulkFilters(EMPTY_FILTERS);
    setBulkSearched(false);
    setBulkResults([]);
    setBulkSelected(new Set());
    setBulkRange({ start: toDateKey(), end: toDateKey() });
    setOpen(true);
  };

  const runBulkSearch = () => {
    // 출근자등록은 실제로 배정할 근무자를 고르는 화면이므로, 퇴사 처리되었거나
    // 탈퇴(삭제)된 근로자는 검색 결과에 나오지 않아야 한다.
    setBulkResults(
      employees.filter((emp) => !emp.deleted && emp.employmentStatus !== "퇴사" && matchesFilters(emp, bulkFilters))
    );
    setBulkSearched(true);
    setBulkSelected(new Set());
  };

  const toggleBulkSelected = (id) =>
    setBulkSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleBulkSelectAll = () =>
    setBulkSelected((s) => (s.size === bulkResults.length ? new Set() : new Set(bulkResults.map((e) => e.id))));

  // 같은 근로자의 같은 날짜에 스케줄 문서가 두 개 이상 생기면 대기/출근확정
  // 등 서로 다른 상태로 동시에 나타나는 중복 버그가 생긴다 — 새로 만들기
  // 전에 항상 이미 있는지부터 확인한다.
  const scheduleExistsFor = (uid, date) => schedules.some((x) => x.uid === uid && x.date === date);

  const submitBulkSchedule = async () => {
    if (bulkSelected.size === 0 || !bulkRange.start || !bulkRange.end) return;
    const dates = [];
    let cur = new Date(bulkRange.start);
    const end = new Date(bulkRange.end);
    while (cur <= end) {
      dates.push(toDateKey(cur));
      cur = new Date(cur.getTime() + 86400000);
    }
    for (const uid of bulkSelected) {
      const emp = employees.find((x) => x.id === uid);
      if (!emp) continue;
      const site = workSites.find((x) => x.id === emp.workSiteId);
      let created = 0;
      for (const date of dates) {
        if (scheduleExistsFor(uid, date)) continue;
        await addDoc(collection(db, "schedules"), {
          companyId: profile.companyId,
          uid: emp.id,
          name: emp.name,
          date,
          startTime: "09:00",
          endTime: "18:00",
          siteId: emp.workSiteId || null,
          siteName: site?.name || "",
          status: "대기",
          createdAt: serverTimestamp(),
        });
        created += 1;
      }
      if (created > 0) notifyScheduleStatus(emp.id, `근무 스케줄 ${created}건이 등록되었습니다. (대기 상태)`);
    }
    setOpen(false);
  };

  const toggleSelected = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // 스케줄 인원 현황(출근확정)과 대기 인원 현황은 체크박스 선택 상태를 공유한다 —
  // 각 표의 "전체선택"은 그 표에 보이는 행만 토글하고 다른 표의 선택은 건드리지 않는다.
  const toggleSelectAllIn = (rowsSubset) =>
    setSelected((s) => {
      const ids = rowsSubset.map((r) => r.schedule.id);
      const allSelected = ids.length > 0 && ids.every((id) => s.has(id));
      const next = new Set(s);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });

  // 휴무/퇴사 인원 현황은 각각 다른 컬렉션(leaves/users)을 참조하므로
  // 스케줄 선택 상태(selected)와 별도의 Set을 쓴다. 토글 로직은 동일해
  // setter만 받는 범용 헬퍼로 공유한다.
  const toggleOne = (setter, id) =>
    setter((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAllIn = (setter, ids) =>
    setter((s) => {
      const allSelected = ids.length > 0 && ids.every((id) => s.has(id));
      const next = new Set(s);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });

  // 관리자가 스케줄을 등록/변경할 때마다 해당 근로자 모바일에도 그 사실이
  // 뜨도록, notifications 문서를 하나 만든다(모바일 알림함이 이미 이
  // 컬렉션을 실시간 구독하고 있다).
  const notifyScheduleStatus = (uid, message) => {
    if (!uid) return;
    addDoc(collection(db, "notifications"), {
      companyId: profile.companyId,
      uid,
      title: "근무 스케줄 안내",
      message,
      read: false,
      createdAt: serverTimestamp(),
    }).catch(() => {});
  };

  // 스케줄 상태 변경에 따르는 부수효과(출근확정 시 근로계약서 자동생성,
  // 취소 시 미서명 자동생성 계약서 정리)를 한 건 단위로 뽑아둔 헬퍼 —
  // 하단의 체크박스 일괄적용(applyStatus)과 표 우클릭 메뉴가 함께 쓴다.
  const applyScheduleStatusOne = async (id, status) => {
    await updateDoc(doc(db, "schedules", id), { status });
    const s = schedules.find((x) => x.id === id);
    const emp = s && employeeByUid.get(s.uid);
    if (!s || !emp) return;
    notifyScheduleStatus(s.uid, `${s.date} 근무 상태가 '${status}'(으)로 변경되었습니다.`);

    if (status === "출근확정") {
      const existing = await getDocs(
        query(collection(db, "contracts"), where("companyId", "==", profile.companyId), where("uid", "==", emp.id))
      );
      if (existing.empty) {
        const site = workSites.find((w) => w.id === emp.workSiteId);
        // 회사(대표) 도장은 근로자의 소속 사업자(businessEntities)에 등록된
        // 것을 그대로 가져와, 계약서가 자동 생성되는 순간부터 이미 날인된
        // 상태로 발송되게 한다 — 도장이 없으면(아직 미등록) 찍지 않고 그대로
        // 둔다(관리자가 나중에 계약관리에서 직접 서명/도장 적용 가능).
        const stampUrl = businessEntities.find((b) => b.id === emp.businessEntityId)?.stampUrl || null;
        const signedAt = stampUrl ? s.date : null;
        await addDoc(collection(db, "contracts"), {
          companyId: profile.companyId,
          uid: emp.id,
          employeeName: emp.name,
          title: "근로계약서",
          startDate: s.date,
          endDate: null,
          content: buildDefaultContract({
            employeeName: emp.name,
            hireDate: s.date,
            position: emp.position,
            siteName: site?.name || s.siteName,
            companyName,
          }),
          status: "sent",
          signatureDataUrl: null,
          signedAt: null,
          companySignatureDataUrl: stampUrl,
          companySignedAt: signedAt,
          autoGenerated: true,
          createdAt: serverTimestamp(),
        });
      }
    } else if (status === "출근확정취소" || status === "출근취소") {
      const autoContracts = await getDocs(
        query(
          collection(db, "contracts"),
          where("companyId", "==", profile.companyId),
          where("uid", "==", emp.id),
          where("autoGenerated", "==", true)
        )
      );
      for (const c of autoContracts.docs) {
        if (c.data().status !== "signed") await deleteDoc(doc(db, "contracts", c.id));
      }
    } else if (status === "대기") {
      // "대기"로 되돌리면 그날 근무 자체가 취소된 것이므로, 강제출근/자동출근 등으로
      // 이미 남아있는 출퇴근 기록도 함께 지워야 한다 — 안 지우면 스케줄은 대기인데
      // 모바일 체크 화면에는 여전히 "출근완료"가 남아 혼란을 준다.
      await deleteDoc(doc(db, "attendance", attendanceDocId(s.uid, s.date))).catch(() => {});
    }
  };

  const applyStatus = async () => {
    for (const id of selected) await applyScheduleStatusOne(id, statusAction);
    setSelected(new Set());
  };

  // 스케줄/대기/휴무/퇴사 4개 카드 표를 우클릭하면 다른 상태로 즉시 전환할 수
  // 있는 컨텍스트 메뉴. 카드마다 근거 데이터(schedules.status / leaves.status /
  // users.employmentStatus)가 달라 kind별로 분기해 처리한다.
  const [rowMenu, setRowMenu] = useState(null); // { x, y, kind: "confirmed"|"pending"|"leave"|"resigned", row }

  // 근로자목록 더블클릭 수정과 동일하게, 스케줄 목록도 행을 더블클릭하면
  // 사이드에서 슬라이드로 수정창이 뜬다.
  const [editSchedule, setEditSchedule] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  const openScheduleEdit = (s) => {
    setEditSchedule(s);
    setEditForm({ date: s.date, startTime: s.startTime, endTime: s.endTime, siteId: s.siteId || "", status: s.status || "대기" });
  };

  const saveScheduleEdit = async () => {
    if (!editSchedule || !editForm) return;
    setEditSaving(true);
    try {
      const site = workSites.find((w) => w.id === editForm.siteId);
      await updateDoc(doc(db, "schedules", editSchedule.id), {
        date: editForm.date,
        startTime: editForm.startTime,
        endTime: editForm.endTime,
        siteId: editForm.siteId || null,
        siteName: site?.name || "",
        status: editForm.status,
      });
      // 근로자에게 아직 배정된 근무지가 없었다면, 이 스케줄에서 지정한 센터를
      // 근로자의 기본 근무지(users.workSiteId)에도 반영한다 — 모바일 앱의
      // 홈 화면/지오펜스 체크인은 스케줄별 siteId가 아니라 이 필드를 참조하므로,
      // 여기서만 센터를 지정하면 목록엔 반영돼도 직원 모바일은 계속
      // "배정된 근무지가 없습니다"로 남는다. 이미 다른 근무지가 지정된
      // 근로자는 하루짜리 임시 배치일 수 있으므로 덮어쓰지 않는다.
      const emp = employeeByUid.get(editSchedule.uid);
      if (editForm.siteId && emp && !emp.workSiteId) {
        await updateDoc(doc(db, "users", editSchedule.uid), { workSiteId: editForm.siteId });
      }
      toast.success("수정되었습니다");
      setEditSchedule(null);
    } catch (err) {
      toast.error(`수정에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    } finally {
      setEditSaving(false);
    }
  };

  // 스케줄/대기/휴무/퇴사 4개 카드 모두 체크박스로 선택한 행을 한 번에
  // 삭제한다 — 각 카드가 근거로 삼는 컬렉션(문서)이 서로 달라 카드별로
  // 분기한다. 칸마다 개별 삭제 버튼을 두지 않고, 선택 후 한 번에
  // 지우는 방식(다른 목록 화면들의 "선택삭제"와 동일한 패턴)으로 통일했다.
  const deleteSelectedSchedules = async () => {
    if (selectedSchedules.length === 0) return;
    if (!(await confirm(`선택된 ${selectedSchedules.length}건의 스케줄을 삭제하시겠습니까?`, "delete"))) return;
    await Promise.all(selectedSchedules.map(({ schedule: s }) => deleteDoc(doc(db, "schedules", s.id))));
    toast.success(`${selectedSchedules.length}건 삭제되었습니다`);
    setSelected(new Set());
  };

  const deleteSelectedLeaves = async () => {
    const targets = leaveRows.filter((row) => selectedLeaves.has(row.leave.id));
    if (targets.length === 0) return;
    if (!(await confirm(`선택된 ${targets.length}건의 휴무 기록을 삭제하시겠습니까?`, "delete"))) return;
    await Promise.all(targets.map((row) => deleteDoc(doc(db, "leaves", row.leave.id))));
    toast.success(`${targets.length}건 삭제되었습니다`);
    setSelectedLeaves(new Set());
  };

  const deleteSelectedResigned = async () => {
    const targets = resignedRows.filter((emp) => selectedResigned.has(emp.id));
    if (targets.length === 0) return;
    if (!(await confirm(`선택된 ${targets.length}명을 삭제하시겠습니까? 삭제하면 모바일 접속이 차단됩니다.`, "delete"))) return;
    await softDeleteEmployees(targets.map((emp) => emp.id));
    toast.success(`${targets.length}명 삭제되었습니다`);
    setSelectedResigned(new Set());
  };

  const openRowMenu = (e, kind, row) => {
    e.preventDefault();
    setRowMenu({ x: e.clientX, y: e.clientY, kind, row });
  };
  const closeRowMenu = () => setRowMenu(null);

  useEffect(() => {
    if (!rowMenu) return;
    const onDocClick = () => closeRowMenu();
    document.addEventListener("click", onDocClick);
    document.addEventListener("scroll", onDocClick, true);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("scroll", onDocClick, true);
    };
  }, [rowMenu]);

  const ROW_MENU_TARGETS = {
    confirmed: ["강제출근", "대기", "휴무", "퇴사"],
    pending: ["출근확정", "휴무", "퇴사"],
    leave: ["대기", "출근확정", "퇴사"],
    resigned: ["근무"],
  };

  // 근로자가 출근지에 도착했는데도 시스템/기기 문제로 모바일 출근 버튼이
  // 안 먹힐 때, 관리자가 대신 출근 처리할 수 있게 한다. 단, 안전교육 등
  // 필수자료를 아직 다 이수하지 않은 근로자까지 강제로 출근 처리해버리면
  // 안전관리 사각지대가 생기므로 그 조건만은 그대로 지킨다.
  const forceCheckIn = async (row) => {
    const { schedule: s, emp } = row;
    if (!(await confirm(`${emp.name}님을 관리자가 직접 출근 처리하시겠습니까? 시스템 문제로 정상 출근이 안 될 때만 사용해주세요.`, "save")))
      return;
    try {
      const [materialsSnap, completionsSnap] = await Promise.all([
        getDocs(query(collection(db, "safetyMaterials"), where("companyId", "==", profile.companyId), where("active", "==", true))),
        getDocs(query(collection(db, "safetyCompletions"), where("uid", "==", s.uid))),
      ]);
      const completedIds = new Set(completionsSnap.docs.map((d) => d.data().materialId));
      const pendingSafety = materialsSnap.docs.filter((d) => !completedIds.has(d.id)).length;
      if (pendingSafety > 0) {
        toast.error(`${emp.name}님은 안전교육 미이수 자료가 ${pendingSafety}건 있어 강제출근 처리할 수 없습니다. 안전교육 이수 후 다시 시도해주세요.`);
        return;
      }
      const dateKey = s.date || toDateKey();
      // 강제출근도 실제 출근 버튼을 누른 것과 동일하게 예정 출근시각 대비
      // 지각 여부를 판정해야 한다 — 이전에는 무조건 "출근"으로만 기록돼
      // 실제로 예정시각보다 한참 늦게 강제출근 처리해도 지각이 전혀
      // 남지 않았다.
      const now = new Date();
      const status = computeCheckInStatus(s.startTime, now);
      await setDoc(
        doc(db, "attendance", attendanceDocId(s.uid, dateKey)),
        {
          uid: s.uid,
          name: emp.name,
          companyId: profile.companyId,
          date: dateKey,
          month: dateKey.slice(0, 7),
          status,
          checkInTime: now.toISOString(),
          // 대기로 되돌렸다가 다시 강제출근시키는 등, 같은 날짜에 재출근
          // 처리하는 경우 이전에 남아있던 퇴근기록(checkOutTime)이 그대로
          // 남아 "출근완료 · 09:54 · 퇴근 10:06"처럼 옛 퇴근시각이 계속
          // 표시되는 문제가 있었다 — 새로 출근 처리할 때는 항상 지운다.
          checkOutTime: deleteField(),
          checkOutSource: deleteField(),
          source: "manual",
          siteId: s.siteId || emp.workSiteId || null,
          siteName: s.siteName || siteName_(emp.workSiteId),
        },
        { merge: true }
      );
      toast.success(status === "지각" ? `${emp.name}님을 지각 출근 처리했습니다` : `${emp.name}님을 출근 처리했습니다`);
      notifyScheduleStatus(
        s.uid,
        status === "지각"
          ? "관리자에 의해 출근 처리되었습니다. (지각)"
          : "관리자에 의해 출근 처리되었습니다."
      );
    } catch (err) {
      toast.error(`강제출근 처리에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    }
  };

  const upsertScheduleForToday = async (uid, emp, status) => {
    const dateKey = toDateKey();
    const existing = schedules.find((x) => x.uid === uid && x.date === dateKey);
    if (existing) {
      await applyScheduleStatusOne(existing.id, status);
      return;
    }
    const ref = await addDoc(collection(db, "schedules"), {
      companyId: profile.companyId,
      uid,
      name: emp.name,
      date: dateKey,
      siteId: emp.workSiteId || null,
      siteName: siteName_(emp.workSiteId),
      startTime: "",
      endTime: "",
      status: "대기",
      createdAt: serverTimestamp(),
    });
    if (status === "출근확정") await applyScheduleStatusOne(ref.id, "출근확정");
    else notifyScheduleStatus(uid, `${dateKey} 근무 상태가 '대기'로 변경되었습니다.`);
  };

  const runRowStatusChange = async (target) => {
    if (!rowMenu) return;
    const { kind, row } = rowMenu;
    closeRowMenu();
    if (kind === "confirmed" && target === "강제출근") {
      await forceCheckIn(row);
      return;
    }
    try {
      if (kind === "confirmed" || kind === "pending") {
        const { schedule: s, emp } = row;
        if (target === "대기" || target === "출근확정") {
          await applyScheduleStatusOne(s.id, target);
        } else if (target === "휴무") {
          await addDoc(collection(db, "leaves"), {
            companyId: profile.companyId,
            uid: s.uid,
            name: emp.name,
            type: "관리자 처리",
            startDate: s.date,
            endDate: s.date,
            status: "approved",
            createdAt: serverTimestamp(),
          });
          await deleteDoc(doc(db, "schedules", s.id));
          notifyScheduleStatus(s.uid, `${s.date} 근무 상태가 '휴무'로 변경되었습니다.`);
        } else if (target === "퇴사") {
          await updateDoc(doc(db, "users", s.uid), { employmentStatus: "퇴사", resignDate: s.date });
          await deleteDoc(doc(db, "schedules", s.id));
        }
      } else if (kind === "leave") {
        const { leave, emp } = row;
        if (target === "퇴사") {
          await updateDoc(doc(db, "leaves", leave.id), { status: "cancelled" });
          await updateDoc(doc(db, "users", leave.uid), { employmentStatus: "퇴사", resignDate: toDateKey() });
        } else if (target === "대기" || target === "출근확정") {
          await updateDoc(doc(db, "leaves", leave.id), { status: "cancelled" });
          await upsertScheduleForToday(leave.uid, emp, target);
        }
      } else if (kind === "resigned") {
        await updateDoc(doc(db, "users", row.id), { employmentStatus: "재직", resignDate: "" });
      }
      toast.success("상태가 변경되었습니다");
    } catch {
      toast.error("상태 변경에 실패했습니다.");
    }
  };

  const selectedSchedules = useMemo(() => rows.filter(({ schedule: s }) => selected.has(s.id)), [rows, selected]);

  // 대기 인원 현황에서 전체선택(혹은 일부 선택) 후 한 번에 출근확정 처리한다.
  const confirmSelectedPending = async () => {
    const targets = pendingRows.filter(({ schedule: s }) => selected.has(s.id));
    if (targets.length === 0) {
      toast.error("선택된 인원이 없습니다.");
      return;
    }
    for (const { schedule: s } of targets) await applyScheduleStatusOne(s.id, "출근확정");
    setSelected(new Set());
    toast.success(`${targets.length}명을 출근확정 처리했습니다`);
  };

  const addCopyDate = () => {
    if (!copyForm.dateInput) return;
    setCopyForm((f) => (f.dates.includes(f.dateInput) ? f : { ...f, dates: [...f.dates, f.dateInput].sort(), dateInput: "" }));
  };
  const removeCopyDate = (d) => setCopyForm((f) => ({ ...f, dates: f.dates.filter((x) => x !== d) }));

  const targetDatesForCopy = () => {
    if (copyForm.mode === "dates") return copyForm.dates;
    if (!copyForm.rangeStart || !copyForm.rangeEnd) return [];
    const out = [];
    let cur = new Date(copyForm.rangeStart);
    const end = new Date(copyForm.rangeEnd);
    while (cur <= end) {
      out.push(toDateKey(cur));
      cur = new Date(cur.getTime() + 86400000);
    }
    return out;
  };

  const applyCopy = async () => {
    const targets = targetDatesForCopy();
    if (targets.length === 0 || selectedSchedules.length === 0) return;
    for (const { schedule: s } of selectedSchedules) {
      for (const targetDate of targets) {
        if (scheduleExistsFor(s.uid, targetDate)) continue;
        await addDoc(collection(db, "schedules"), {
          companyId: profile.companyId,
          uid: s.uid,
          name: s.name,
          date: targetDate,
          startTime: s.startTime,
          endTime: s.endTime,
          siteId: s.siteId || null,
          siteName: s.siteName || "",
          status: "대기",
          createdAt: serverTimestamp(),
        });
      }
    }
    setCopyOpen(false);
    setSelected(new Set());
    setCopyForm((f) => ({ ...f, dates: [], dateInput: "" }));
  };

  const applyTemplateChange = async () => {
    if (templateForm.mode === "bulk") {
      const template = shiftTemplates.find((t) => t.id === templateForm.templateId);
      if (!template) return;
      for (const id of selected) {
        await updateDoc(doc(db, "schedules", id), {
          startTime: template.startTime,
          endTime: template.endTime,
          shiftTemplateId: template.id,
          shiftTemplateName: template.name,
        });
      }
    } else {
      for (const id of selected) {
        const tId = individualTemplates[id];
        const template = shiftTemplates.find((t) => t.id === tId);
        if (!template) continue;
        await updateDoc(doc(db, "schedules", id), {
          startTime: template.startTime,
          endTime: template.endTime,
          shiftTemplateId: template.id,
          shiftTemplateName: template.name,
        });
      }
    }
    setTemplateOpen(false);
    setSelected(new Set());
    setIndividualTemplates({});
  };

  const exportCsv = () => {
    const headers = ["이름", "사업자", "센터", "확정", "근무일자", "근무시각", "전화번호", "성별", "소속업체"];
    const rowsOut = confirmedRows.map(({ schedule: s, emp }) => [
      s.name,
      companyName,
      siteName_(emp.workSiteId) || s.siteName || "-",
      s.status || "대기",
      formatDate(s.date),
      `${s.startTime} ~ ${s.endTime}`,
      emp.phone || "-",
      emp.gender || "-",
      vendorName_(emp.vendorId),
    ]);
    downloadCsv(`스케줄_${range.start}~${range.end}`, headers, rowsOut);
  };

  return (
    <div className="space-y-6">
      <Panel
        icon={CalendarDays}
        title="스케줄등록"
        actions={
          <Button onClick={openBulkRegister}>
            <Plus size={16} /> 스케줄 등록
          </Button>
        }
      >
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
              <span className="mb-1.5 block text-xs font-medium text-muted">국적구분</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.nationality}
                onChange={(e) => setFilters((f) => ({ ...f, nationality: e.target.value }))}
              >
                <option value="">선택</option>
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
              <span className="mb-1.5 block text-xs font-medium text-muted">일정</span>
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

        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
          <p className="text-xs font-medium text-muted">스케줄 인원 현황 {rows.length}</p>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${view === "list" ? "bg-white text-primary shadow-sm" : "text-muted"}`}
            >
              <LayoutList size={13} /> 목록보기
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${view === "calendar" ? "bg-white text-primary shadow-sm" : "text-muted"}`}
            >
              <CalendarIcon size={13} /> 달력보기
            </button>
          </div>
        </div>

        {view === "list" ? (
          <>
            <Card className="mb-3 flex flex-wrap items-end gap-2 p-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">선택</span>
                <select
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                  value={statusAction}
                  onChange={(e) => setStatusAction(e.target.value)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <Button size="sm" onClick={applyStatus} disabled={selected.size === 0}>
                적용
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={selected.size === 0}
                onClick={() => {
                  const first = selectedSchedules[0]?.schedule.date || toDateKey();
                  setCopyForm((f) => ({ ...f, baseDate: first }));
                  setCopyOpen(true);
                }}
              >
                <Copy size={13} /> 스케줄 복사하기
              </Button>
              <Button size="sm" variant="outline" disabled={selected.size === 0} onClick={() => setTemplateOpen(true)}>
                <Repeat size={13} /> 템플릿변경하기
              </Button>
              <Button size="sm" variant="danger" disabled={selected.size === 0} onClick={deleteSelectedSchedules}>
                <Trash2 size={13} /> 선택삭제 ({selected.size})
              </Button>
              <Button size="sm" variant="outline" onClick={exportCsv}>
                <FileSpreadsheet size={13} /> 엑셀
              </Button>
              <div className="ml-auto">
                <ColumnVisibilityButton columns={scheduleColumnsOrdered} hidden={hiddenScheduleColumns} toggleColumn={toggleScheduleColumn} />
              </div>
            </Card>

            <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
              <table className="w-full min-w-[980px] text-center text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-muted">
                    <th className="sticky left-0 z-20 w-10 min-w-10 max-w-10 bg-primary-light px-2 py-3 font-semibold">
                      <input
                        type="checkbox"
                        checked={confirmedRows.length > 0 && confirmedRows.every(({ schedule: s }) => selected.has(s.id))}
                        onChange={() => toggleSelectAllIn(confirmedRows)}
                      />
                    </th>
                    <th className="sticky left-10 z-20 w-14 min-w-14 max-w-14 bg-primary-light px-2 py-3 font-semibold">순번</th>
                    <th className="sticky left-24 z-20 w-28 min-w-28 max-w-28 bg-primary-light px-2 py-3 font-semibold">이름</th>
                    {visibleScheduleColumns.map((c) => (
                      <DraggableTh
                        key={c.key}
                        columnKey={c.key}
                        onMove={moveScheduleColumn}
                        className="px-4 py-3 font-semibold"
                        sortKey={c.key}
                        sort={scheduleSort}
                        onSort={setScheduleSort}
                      >
                        {c.label}
                      </DraggableTh>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {confirmedRows.map((row, i) => {
                    const { schedule: s } = row;
                    return (
                      <tr
                        key={s.id}
                        className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-100 ${selected.has(s.id) ? "bg-primary-light/60" : ""}`}
                        title="더블클릭하여 수정 · 우클릭하여 상태변경"
                        onDoubleClick={() => openScheduleEdit(s)}
                        onContextMenu={(e) => openRowMenu(e, "confirmed", row)}
                      >
                        <td className="sticky left-0 z-10 w-10 min-w-10 max-w-10 bg-white px-2 py-3">
                          <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelected(s.id)} />
                        </td>
                        <td className="sticky left-10 z-10 w-14 min-w-14 max-w-14 bg-white px-2 py-3 text-muted">{i + 1}</td>
                        <td className="sticky left-24 z-10 w-28 min-w-28 max-w-28 overflow-hidden text-ellipsis bg-white px-2 py-3 text-ink">{s.name}</td>
                        {visibleScheduleColumns.map((c) => (
                          <td key={c.key} className="px-4 py-3 text-ink">
                            {c.render(row)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {confirmedRows.length === 0 && (
                    <tr>
                      <td colSpan={visibleScheduleColumns.length + 3} className="px-4 py-6 text-center text-xs text-muted">
                        출근확정된 스케줄이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <CalendarView month={calendarMonth} setMonth={setCalendarMonth} rows={confirmedRows} />
        )}
      </Panel>

      <Card className="p-4">
        <div className="mb-3 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Clock size={13} /> 대기 인원 현황 {pendingRows.length}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => toggleSelectAllIn(pendingRows)}>
              전체선택
            </Button>
            <Button size="sm" onClick={confirmSelectedPending}>
              출근확정
            </Button>
            <ColumnVisibilityButton columns={scheduleColumnsOrdered} hidden={hiddenScheduleColumns} toggleColumn={toggleScheduleColumn} />
          </div>
        </div>
        <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
          <table className="w-full min-w-[720px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="sticky left-0 z-20 w-10 min-w-10 max-w-10 bg-primary-light px-2 py-3 font-semibold">
                  <input
                    type="checkbox"
                    checked={pendingRows.length > 0 && pendingRows.every(({ schedule: s }) => selected.has(s.id))}
                    onChange={() => toggleSelectAllIn(pendingRows)}
                  />
                </th>
                <th className="sticky left-10 z-20 w-14 min-w-14 max-w-14 bg-primary-light px-2 py-3 font-semibold">순번</th>
                <th className="sticky left-24 z-20 w-28 min-w-28 max-w-28 bg-primary-light px-2 py-3 font-semibold">이름</th>
                {visibleScheduleColumns.map((c) => (
                  <DraggableTh key={c.key} columnKey={c.key} onMove={moveScheduleColumn} className="px-4 py-3 font-semibold">
                    {c.label}
                  </DraggableTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {pendingRows.map((row, i) => (
                <tr
                  key={row.schedule.id}
                  className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-100 ${selected.has(row.schedule.id) ? "bg-primary-light/60" : ""}`}
                  title="더블클릭하여 수정 · 우클릭하여 상태변경"
                  onDoubleClick={() => openScheduleEdit(row.schedule)}
                  onContextMenu={(e) => openRowMenu(e, "pending", row)}
                >
                  <td className="sticky left-0 z-10 w-10 min-w-10 max-w-10 bg-white px-2 py-3">
                    <input type="checkbox" checked={selected.has(row.schedule.id)} onChange={() => toggleSelected(row.schedule.id)} />
                  </td>
                  <td className="sticky left-10 z-10 w-14 min-w-14 max-w-14 bg-white px-2 py-3 text-muted">{i + 1}</td>
                  <td className="sticky left-24 z-10 w-28 min-w-28 max-w-28 overflow-hidden text-ellipsis bg-white px-2 py-3 text-ink">{row.schedule.name}</td>
                  {visibleScheduleColumns.map((c) => (
                    <td key={c.key} className="px-4 py-3 text-ink">
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
              {pendingRows.length === 0 && (
                <tr>
                  <td colSpan={visibleScheduleColumns.length + 3} className="px-4 py-6 text-center text-xs text-muted">
                    대기 중인 인원이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <CalendarOff size={13} /> 휴무 인원 현황 {leaveRows.length}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={selectedLeaves.size === 0}
              onClick={deleteSelectedLeaves}
            >
              <Trash2 size={13} /> 선택삭제 ({selectedLeaves.size})
            </Button>
            <ColumnVisibilityButton columns={leaveColumnsOrdered} hidden={hiddenLeaveColumns} toggleColumn={toggleLeaveColumn} />
          </div>
        </div>
        <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
          <table className="w-full min-w-[720px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="w-10 px-2 py-3 font-semibold">
                  <input
                    type="checkbox"
                    checked={leaveRows.length > 0 && leaveRows.every((row) => selectedLeaves.has(row.leave.id))}
                    onChange={() => toggleAllIn(setSelectedLeaves, leaveRows.map((row) => row.leave.id))}
                  />
                </th>
                <th className="px-4 py-3 font-semibold">순번</th>
                {visibleLeaveColumns.map((c) => (
                  <DraggableTh
                    key={c.key}
                    columnKey={c.key}
                    onMove={moveLeaveColumn}
                    className="px-4 py-3 font-semibold"
                    sortKey={c.key}
                    sort={leaveSort}
                    onSort={setLeaveSort}
                  >
                    {c.label}
                  </DraggableTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaveRows.map((row, i) => (
                <tr
                  key={row.leave.id}
                  className={`border-b border-slate-50 last:border-0 ${selectedLeaves.has(row.leave.id) ? "bg-primary-light/60" : ""}`}
                  onContextMenu={(e) => openRowMenu(e, "leave", row)}
                >
                  <td className="px-2 py-3">
                    <input
                      type="checkbox"
                      checked={selectedLeaves.has(row.leave.id)}
                      onChange={() => toggleOne(setSelectedLeaves, row.leave.id)}
                    />
                  </td>
                  <td className="px-4 py-3 text-ink">{i + 1}</td>
                  {visibleLeaveColumns.map((c) => (
                    <td key={c.key} className="px-4 py-3 text-ink">
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
              {leaveRows.length === 0 && (
                <tr>
                  <td colSpan={visibleLeaveColumns.length + 2} className="px-4 py-6 text-center text-xs text-muted">
                    휴무 중인 인원이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <UserMinus size={13} /> 퇴사 인원 현황 {resignedRows.length}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={selectedResigned.size === 0}
              onClick={deleteSelectedResigned}
            >
              <Trash2 size={13} /> 선택삭제 ({selectedResigned.size})
            </Button>
            <ColumnVisibilityButton columns={resignedColumnsOrdered} hidden={hiddenResignedColumns} toggleColumn={toggleResignedColumn} />
          </div>
        </div>
        <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
          <table className="w-full min-w-[720px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="w-10 px-2 py-3 font-semibold">
                  <input
                    type="checkbox"
                    checked={resignedRows.length > 0 && resignedRows.every((emp) => selectedResigned.has(emp.id))}
                    onChange={() => toggleAllIn(setSelectedResigned, resignedRows.map((emp) => emp.id))}
                  />
                </th>
                <th className="px-4 py-3 font-semibold">순번</th>
                {visibleResignedColumns.map((c) => (
                  <DraggableTh
                    key={c.key}
                    columnKey={c.key}
                    onMove={moveResignedColumn}
                    className="px-4 py-3 font-semibold"
                    sortKey={c.key}
                    sort={resignedSort}
                    onSort={setResignedSort}
                  >
                    {c.label}
                  </DraggableTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {resignedRows.map((emp, i) => (
                <tr
                  key={emp.id}
                  className={`border-b border-slate-50 last:border-0 ${selectedResigned.has(emp.id) ? "bg-primary-light/60" : ""}`}
                  onContextMenu={(e) => openRowMenu(e, "resigned", emp)}
                >
                  <td className="px-2 py-3">
                    <input
                      type="checkbox"
                      checked={selectedResigned.has(emp.id)}
                      onChange={() => toggleOne(setSelectedResigned, emp.id)}
                    />
                  </td>
                  <td className="px-4 py-3 text-ink">{i + 1}</td>
                  {visibleResignedColumns.map((c) => (
                    <td key={c.key} className="px-4 py-3 text-ink">
                      {c.render(emp)}
                    </td>
                  ))}
                </tr>
              ))}
              {resignedRows.length === 0 && (
                <tr>
                  <td colSpan={visibleResignedColumns.length + 2} className="px-4 py-6 text-center text-xs text-muted">
                    퇴사 처리된 인원이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {rowMenu && (
        <div
          className="fixed z-50 w-36 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg"
          style={{ left: rowMenu.x, top: rowMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="truncate px-3 py-1 text-[11px] text-muted">
            {rowMenu.kind === "resigned" ? rowMenu.row.name : rowMenu.kind === "leave" ? rowMenu.row.emp?.name : rowMenu.row.schedule?.name}
          </p>
          {ROW_MENU_TARGETS[rowMenu.kind].map((target) => (
            <button
              key={target}
              type="button"
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${target === "강제출근" ? "font-semibold text-primary" : "text-ink"}`}
              onClick={() => runRowStatusChange(target)}
            >
              {target === "강제출근" ? "강제출근 처리" : `${target}로 변경`}
            </button>
          ))}
        </div>
      )}

      <SidePanel
        open={Boolean(editSchedule)}
        onClose={() => setEditSchedule(null)}
        title={`스케줄등록 > 수정 (${editSchedule?.name || ""})`}
        footer={
          <Button onClick={saveScheduleEdit} disabled={editSaving}>
            {editSaving ? "저장 중..." : "저장"}
          </Button>
        }
      >
        {editForm && (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">근무일자</span>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={editForm.date}
                onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">출근시각</span>
                <input
                  type="time"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={editForm.startTime}
                  onChange={(e) => setEditForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">퇴근시각</span>
                <input
                  type="time"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={editForm.endTime}
                  onChange={(e) => setEditForm((f) => ({ ...f, endTime: e.target.value }))}
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={editForm.siteId}
                onChange={(e) => setEditForm((f) => ({ ...f, siteId: e.target.value }))}
              >
                <option value="">미배정</option>
                {workSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">확정상태</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={editForm.status}
                onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
              >
                {["대기", "출근확정", "휴무"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </SidePanel>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title="스케줄등록 > 출근자등록"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={submitBulkSchedule} disabled={bulkSelected.size === 0}>
              출근일정등록
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Card className="space-y-3 p-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">센터</span>
                <select
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                  value={bulkFilters.siteId}
                  onChange={(e) => setBulkFilters((f) => ({ ...f, siteId: e.target.value }))}
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
                <span className="mb-1 block text-[11px] font-medium text-muted">소속업체</span>
                <select
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                  value={bulkFilters.vendorId}
                  onChange={(e) => setBulkFilters((f) => ({ ...f, vendorId: e.target.value }))}
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
                <span className="mb-1 block text-[11px] font-medium text-muted">근무구분</span>
                <select
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                  value={bulkFilters.shiftType}
                  onChange={(e) => setBulkFilters((f) => ({ ...f, shiftType: e.target.value }))}
                >
                  <option value="">전체</option>
                  {SHIFT_TYPE_OPTIONS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">근무형태</span>
                <select
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                  value={bulkFilters.employmentType}
                  onChange={(e) => setBulkFilters((f) => ({ ...f, employmentType: e.target.value }))}
                >
                  <option value="">전체</option>
                  {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">부서</span>
                <select
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                  value={bulkFilters.team}
                  onChange={(e) => setBulkFilters((f) => ({ ...f, team: e.target.value }))}
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
                <span className="mb-1 block text-[11px] font-medium text-muted">직급</span>
                <select
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                  value={bulkFilters.position}
                  onChange={(e) => setBulkFilters((f) => ({ ...f, position: e.target.value }))}
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
                <span className="mb-1 block text-[11px] font-medium text-muted">국적구분</span>
                <select
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                  value={bulkFilters.nationality}
                  onChange={(e) => setBulkFilters((f) => ({ ...f, nationality: e.target.value }))}
                >
                  <option value="">전체</option>
                  {NATIONALITY_OPTIONS.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">국가구분</span>
                <select
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                  value={bulkFilters.country}
                  onChange={(e) => setBulkFilters((f) => ({ ...f, country: e.target.value }))}
                >
                  <option value="">전체</option>
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">이름</span>
                <input
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                  value={bulkFilters.name}
                  onChange={(e) => setBulkFilters((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">전화번호</span>
                <input
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                  value={bulkFilters.phone}
                  onChange={(e) => setBulkFilters((f) => ({ ...f, phone: e.target.value }))}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50"
                title="초기화"
                onClick={() => {
                  setBulkFilters(EMPTY_FILTERS);
                }}
              >
                <RefreshCw size={16} />
              </button>
              <Button size="sm" onClick={runBulkSearch}>
                <Search size={13} /> 검색
              </Button>
            </div>
          </Card>

          <div className="flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
            <p className="text-xs font-medium text-muted">출근자 목록 {bulkSearched ? bulkResults.length : 0}</p>
            <p className="text-xs text-muted">선택 {bulkSelected.size}명</p>
          </div>
          <div className="-mx-6 overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[1600px] text-center text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100 text-xs text-muted">
                  <th className="px-3 py-2 font-semibold">
                    <input type="checkbox" checked={bulkSearched && bulkResults.length > 0 && bulkSelected.size === bulkResults.length} onChange={toggleBulkSelectAll} />
                  </th>
                  <th className="px-3 py-2 font-semibold">순번</th>
                  <th className="px-3 py-2 font-semibold">이름</th>
                  <th className="px-3 py-2 font-semibold">전화번호</th>
                  <th className="px-3 py-2 font-semibold">성별</th>
                  <th className="px-3 py-2 font-semibold">나이</th>
                  <th className="px-3 py-2 font-semibold">휴면</th>
                  <th className="px-3 py-2 font-semibold">센터</th>
                  <th className="px-3 py-2 font-semibold">사업자</th>
                  <th className="px-3 py-2 font-semibold">소속업체</th>
                  <th className="px-3 py-2 font-semibold">근무위치</th>
                  <th className="px-3 py-2 font-semibold">근무구분</th>
                  <th className="px-3 py-2 font-semibold">근무형태</th>
                  <th className="px-3 py-2 font-semibold">근무비고</th>
                  <th className="px-3 py-2 font-semibold">부서</th>
                  <th className="px-3 py-2 font-semibold">직급</th>
                  <th className="px-3 py-2 font-semibold">시간템플릿</th>
                  <th className="px-3 py-2 font-semibold">수당템플릿</th>
                  <th className="px-3 py-2 font-semibold">계약서템플릿</th>
                  <th className="px-3 py-2 font-semibold">사직서템플릿</th>
                  <th className="px-3 py-2 font-semibold">외/내국인</th>
                  <th className="px-3 py-2 font-semibold">국적</th>
                  <th className="px-3 py-2 font-semibold">회원가입</th>
                  <th className="px-3 py-2 font-semibold">4대보험</th>
                  <th className="px-3 py-2 font-semibold">급여</th>
                </tr>
              </thead>
              <tbody>
                {bulkSearched &&
                  bulkResults.map((emp, i) => (
                    <tr key={emp.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={bulkSelected.has(emp.id)} onChange={() => toggleBulkSelected(emp.id)} />
                      </td>
                      <td className="px-3 py-2 text-ink">{i + 1}</td>
                      <td className="px-3 py-2 text-ink">{emp.name}</td>
                      <td className="px-3 py-2 text-ink"><span className="inline-flex items-center gap-1">{emp.phone}<SmsButton phone={emp.phone} /></span></td>
                      <td className="px-3 py-2 text-ink">{emp.gender || "-"}</td>
                      <td className="px-3 py-2 text-ink">{calculateAge(emp.residentNumberFront) ?? "-"}</td>
                      <td className="px-3 py-2 text-ink">{emp.employmentStatus === "휴직" ? "Y" : "N"}</td>
                      <td className="px-3 py-2 text-ink">{siteName_(emp.workSiteId)}</td>
                      <td className="px-3 py-2 text-ink">{companyName}</td>
                      <td className="px-3 py-2 text-ink">{vendorName_(emp.vendorId)}</td>
                      <td className="px-3 py-2 text-ink">{emp.workLocation || "-"}</td>
                      <td className="px-3 py-2 text-ink">{emp.shiftType || "-"}</td>
                      <td className="px-3 py-2 text-ink">{emp.employmentType || "-"}</td>
                      <td className="px-3 py-2 text-ink">{emp.note || "-"}</td>
                      <td className="px-3 py-2 text-ink">{emp.team || "-"}</td>
                      <td className="px-3 py-2 text-ink">{emp.position || "-"}</td>
                      <td className="px-3 py-2 text-ink">{shiftTemplateName_(emp.shiftTemplateId)}</td>
                      <td className="px-3 py-2 text-ink">{allowanceTemplateName_(emp.allowanceTemplateId)}</td>
                      <td className="px-3 py-2 text-ink">{emp.contractTemplateName || "-"}</td>
                      <td className="px-3 py-2 text-ink">{emp.resignTemplateName || "-"}</td>
                      <td className="px-3 py-2 text-ink">{emp.nationality || "-"}</td>
                      <td className="px-3 py-2 text-ink">{emp.country || "-"}</td>
                      <td className="px-3 py-2 text-ink">Y</td>
                      <td className="px-3 py-2 text-ink">{emp.insuranceApplied === "Y" ? "Y" : "N"}</td>
                      <td className="px-3 py-2 text-ink">{emp.payType || "-"}</td>
                    </tr>
                  ))}
                {!bulkSearched && (
                  <tr>
                    <td colSpan={24} className="px-3 py-6 text-center text-xs text-muted">
                      조회내역이 없습니다. 필터를 설정한 뒤 검색 버튼을 눌러주세요.
                    </td>
                  </tr>
                )}
                {bulkSearched && bulkResults.length === 0 && (
                  <tr>
                    <td colSpan={24} className="px-3 py-6 text-center text-xs text-muted">
                      조회된 내역이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">출근 기간</span>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={bulkRange.start}
                onChange={(e) => setBulkRange((r) => ({ ...r, start: e.target.value }))}
              />
              <span className="text-muted">~</span>
              <input
                type="date"
                className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={bulkRange.end}
                onChange={(e) => setBulkRange((r) => ({ ...r, end: e.target.value }))}
              />
            </div>
          </label>
        </div>
      </SidePanel>

      <Modal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        title="스케줄 복사하기"
        footer={
          <>
            <Button variant="outline" onClick={() => setCopyOpen(false)}>
              취소
            </Button>
            <Button onClick={applyCopy} disabled={targetDatesForCopy().length === 0}>
              복사
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl bg-primary-light px-3.5 py-2.5 text-xs text-primary">
            복사조건: #사업자 {companyName} #선택인원 {selectedSchedules.length}명
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={copyForm.fixedStaff}
              onChange={(e) => setCopyForm((f) => ({ ...f, fixedStaff: e.target.checked }))}
            />
            고정인원 (선택한 근로자를 그대로 복사)
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">복사기준일자</span>
            <input
              type="date"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={copyForm.baseDate}
              onChange={(e) => setCopyForm((f) => ({ ...f, baseDate: e.target.value }))}
            />
          </label>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">복사적용일자</span>
            <div className="mb-2 flex flex-nowrap gap-1 overflow-x-auto overscroll-x-contain rounded-lg bg-slate-100 p-1 text-sm w-fit">
              <button
                type="button"
                onClick={() => setCopyForm((f) => ({ ...f, mode: "dates" }))}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${copyForm.mode === "dates" ? "bg-white text-primary shadow-sm" : "text-muted"}`}
              >
                선택일자
              </button>
              <button
                type="button"
                onClick={() => setCopyForm((f) => ({ ...f, mode: "range" }))}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${copyForm.mode === "range" ? "bg-white text-primary shadow-sm" : "text-muted"}`}
              >
                선택기간
              </button>
            </div>
            {copyForm.mode === "dates" ? (
              <div className="space-y-2">
                <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain">
                  <input
                    type="date"
                    className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    value={copyForm.dateInput}
                    onChange={(e) => setCopyForm((f) => ({ ...f, dateInput: e.target.value }))}
                  />
                  <Button size="sm" variant="outline" type="button" onClick={addCopyDate}>
                    추가
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {copyForm.dates.map((d) => (
                    <span key={d} className="flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-2.5 pr-1.5 text-xs text-ink">
                      {formatDate(d)}
                      <button onClick={() => removeCopyDate(d)} className="text-muted hover:text-danger">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  {copyForm.dates.length === 0 && <p className="text-xs text-muted">추가된 날짜가 없습니다.</p>}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  value={copyForm.rangeStart}
                  onChange={(e) => setCopyForm((f) => ({ ...f, rangeStart: e.target.value }))}
                />
                <span className="text-muted">~</span>
                <input
                  type="date"
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  value={copyForm.rangeEnd}
                  onChange={(e) => setCopyForm((f) => ({ ...f, rangeEnd: e.target.value }))}
                />
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        title="템플릿변경하기"
        footer={
          <>
            <Button variant="outline" onClick={() => setTemplateOpen(false)}>
              취소
            </Button>
            <Button onClick={applyTemplateChange}>적용</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl bg-primary-light px-3.5 py-2.5 text-xs text-primary">선택인원 {selected.size}명</div>
          <div className="flex flex-nowrap gap-1 overflow-x-auto overscroll-x-contain rounded-lg bg-slate-100 p-1 text-sm w-fit">
            <button
              type="button"
              onClick={() => setTemplateForm((f) => ({ ...f, mode: "bulk" }))}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${templateForm.mode === "bulk" ? "bg-white text-primary shadow-sm" : "text-muted"}`}
            >
              일괄변경
            </button>
            <button
              type="button"
              onClick={() => setTemplateForm((f) => ({ ...f, mode: "individual" }))}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${templateForm.mode === "individual" ? "bg-white text-primary shadow-sm" : "text-muted"}`}
            >
              개별변경
            </button>
          </div>

          {templateForm.mode === "bulk" ? (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">시간템플릿</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={templateForm.templateId}
                onChange={(e) => setTemplateForm((f) => ({ ...f, templateId: e.target.value }))}
              >
                <option value="">선택</option>
                {shiftTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.startTime} ~ {t.endTime})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {selectedSchedules.map(({ schedule: s }) => (
                <div key={s.id} className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain rounded-lg border border-slate-100 p-2">
                  <span className="w-20 shrink-0 truncate text-sm text-ink">{s.name}</span>
                  <select
                    className="flex-1 rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                    value={individualTemplates[s.id] || ""}
                    onChange={(e) => setIndividualTemplates((m) => ({ ...m, [s.id]: e.target.value }))}
                  >
                    <option value="">선택</option>
                    {shiftTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.startTime} ~ {t.endTime})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function CalendarView({ month, setMonth, rows }) {
  const [y, m] = month.split("-").map(Number);
  const firstDay = new Date(y, m - 1, 1);
  const numDays = new Date(y, m, 0).getDate();
  const startWeekday = firstDay.getDay();
  const cells = [...Array(startWeekday).fill(null), ...Array.from({ length: numDays }, (_, i) => i + 1)];

  const byDay = new Map();
  for (const { schedule: s } of rows) {
    const day = Number(s.date.slice(8, 10));
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(s);
  }

  const shiftMonth = (delta) => {
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-muted hover:bg-slate-50" onClick={() => shiftMonth(-1)}>
          «
        </button>
        <p className="text-sm font-semibold text-ink">
          {y}년 {m}월
        </p>
        <button className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-muted hover:bg-slate-50" onClick={() => shiftMonth(1)}>
          »
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] text-muted">
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
          <div key={d} className="py-1 font-medium">
            {d}
          </div>
        ))}
        {cells.map((day, i) => (
          <div key={i} className={`min-h-[70px] rounded-lg border p-1.5 text-left ${day ? "border-slate-100" : "border-transparent"}`}>
            {day && (
              <>
                <p className="mb-1 text-[11px] text-muted">{day}</p>
                {(byDay.get(day) || []).slice(0, 3).map((s) => (
                  <p key={s.id} className="truncate rounded bg-primary-light px-1 py-0.5 text-[10px] text-primary">
                    {s.name}
                  </p>
                ))}
                {(byDay.get(day) || []).length > 3 && (
                  <p className="text-[10px] text-muted">+{(byDay.get(day) || []).length - 3}건</p>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
