import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, updateDoc, addDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { ClipboardCheck, FileSpreadsheet, RefreshCw, Pencil, ChevronUp, ChevronDown, ChevronsUpDown, Check, X as XIcon, Trash2 } from "lucide-react";
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
import { useColumnPrefs } from "../hooks/useColumnPrefs";
import { downloadCsv } from "../utils/exportCsv";
import { toDateKey, formatTime, formatDate } from "../utils/dateUtils";
import { computeCheckInStatus } from "../utils/attendanceStatus";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  SHIFT_TYPE_OPTIONS,
  NATIONALITY_OPTIONS,
  COUNTRY_OPTIONS,
} from "../constants/hr";
import SmsButton from "../components/SmsButton";

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

  const [filters, setFilters] = useState(EMPTY_FILTERS);
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
  const vendorName_ = (id) => vendors.find((v) => v.id === id)?.name || "-";

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

  const lateCount = rows.filter(({ record }) => record.status === "지각").length;
  const earlyLeaveCount = rows.filter(({ record }) => record.status === "조퇴").length;

  return (
    <div className="space-y-6">
      <Panel icon={ClipboardCheck} title="출근현황">
        <Card className="mb-4 p-0">
          <div className="flex flex-nowrap overflow-x-auto overscroll-x-contain border-b border-slate-100">
            {VIEW_OPTIONS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`shrink-0 px-4 py-3 text-sm font-medium ${
                  view === v ? "bg-primary-dark text-white" : "text-muted hover:bg-slate-50"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </Card>

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

        {view === "출근현황" && (
          <>
            <div className="mb-2 flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain">
              <p className="text-xs font-medium text-muted">
                출근현황 {rows.length}
                <span className="ml-2 text-[11px] text-danger">'{lateCount}' 지각</span>
                <span className="ml-1 text-[11px] text-warning">'{earlyLeaveCount}' 조퇴</span>
              </p>
            </div>
            <Card className="mb-3 flex flex-wrap items-end gap-2 p-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">출근시간/퇴근시간</span>
                <select
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                  value={editField}
                  onChange={(e) => setEditField(e.target.value)}
                >
                  <option value="checkInTime">출근시각</option>
                  <option value="checkOutTime">퇴근시각</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">변경시각</span>
                <input
                  type="time"
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                />
              </label>
              <label className="block flex-1 min-w-[140px]">
                <span className="mb-1 block text-[11px] font-medium text-muted">사유 (필수)</span>
                <input
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="변경사유"
                />
              </label>
              <Button size="sm" onClick={applyTimeEdit} disabled={selected.size === 0 || !editTime || !editReason.trim()}>
                적용
              </Button>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">출근전/조퇴</span>
                <select
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                  value={statusAction}
                  onChange={(e) => setStatusAction(e.target.value)}
                >
                  <option value="출근전">출근전</option>
                  <option value="조퇴">조퇴</option>
                </select>
              </label>
              <Button size="sm" variant="outline" onClick={applyStatus} disabled={selected.size === 0}>
                적용
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="danger" onClick={deleteSelectedAttendance} disabled={selected.size === 0}>
                  <Trash2 size={13} /> 선택삭제
                </Button>
                <Button size="sm" variant="outline" onClick={exportCsv}>
                  <FileSpreadsheet size={13} /> 엑셀
                </Button>
                <ColumnVisibilityButton columns={attendanceColumnsOrdered} hidden={hiddenAttendanceColumns} toggleColumn={toggleAttendanceColumn} />
              </div>
            </Card>

            <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
              <table className="w-full min-w-[980px] text-center text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-muted">
                    <th className="sticky left-0 z-20 w-10 min-w-10 max-w-10 bg-primary-light px-2 py-3 font-semibold">
                      <input type="checkbox" checked={selected.size > 0 && selected.size === rows.length} onChange={toggleSelectAll} />
                    </th>
                    <th className="sticky left-10 z-20 w-14 min-w-14 max-w-14 bg-primary-light px-2 py-3 font-semibold">순번</th>
                    <th className="sticky left-24 z-20 w-28 min-w-28 max-w-28 bg-primary-light px-2 py-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => setSort((s) => ({ key: "name", dir: s.key === "name" && s.dir === "asc" ? "desc" : "asc" }))}
                        className="inline-flex items-center gap-1 hover:text-ink"
                      >
                        이름
                        {sort.key === "name" ? (
                          sort.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                        ) : (
                          <ChevronsUpDown size={12} className="text-slate-300" />
                        )}
                      </button>
                    </th>
                    {visibleAttendanceColumns.map((c) => (
                      <DraggableTh
                        key={c.key}
                        columnKey={c.key}
                        onMove={moveAttendanceColumn}
                        className="px-4 py-3 font-semibold"
                        sortKey={c.key}
                        sort={sort}
                        onSort={setSort}
                      >
                        {c.label}
                      </DraggableTh>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const { record: r } = row;
                    return (
                      <tr
                        key={r.id}
                        onDoubleClick={() => openDetail(row)}
                        title="더블클릭하여 상세보기"
                        className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-100 ${selected.has(r.id) ? "bg-primary-light/60" : ""}`}
                      >
                        <td className="sticky left-0 z-10 w-10 min-w-10 max-w-10 bg-white px-2 py-3" onDoubleClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelected(r.id)} />
                        </td>
                        <td className="sticky left-10 z-10 w-14 min-w-14 max-w-14 bg-white px-2 py-3 text-muted">{i + 1}</td>
                        <td className="sticky left-24 z-10 w-28 min-w-28 max-w-28 overflow-hidden text-ellipsis bg-white px-2 py-3 text-ink">{r.name}</td>
                        {visibleAttendanceColumns.map((c) => (
                          <td key={c.key} className="px-4 py-3 text-ink">
                            {c.render(row)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={visibleAttendanceColumns.length + 3} className="px-4 py-6 text-center text-xs text-muted">
                        조건에 맞는 출근 기록이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {view === "휴무현황" && (
          <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
            <table className="w-full min-w-[720px] text-center text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-muted">
                  <th className="px-4 py-3 font-semibold">순번</th>
                  <th className="px-4 py-3 font-semibold">종류</th>
                  <th className="px-4 py-3 font-semibold">사유</th>
                  <th className="px-4 py-3 font-semibold">이름</th>
                  <th className="px-4 py-3 font-semibold">전화번호</th>
                  <th className="px-4 py-3 font-semibold">기간</th>
                  <th className="px-4 py-3 font-semibold">삭제</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map((lv, i) => (
                  <tr key={lv.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 text-ink">{i + 1}</td>
                    <td className="px-4 py-3 text-ink">{lv.type}</td>
                    <td className="px-4 py-3 text-ink">{lv.reason || "-"}</td>
                    <td className="px-4 py-3 text-ink">{lv.name}</td>
                    <td className="px-4 py-3 text-ink"><span className="inline-flex items-center gap-1">{employeeByUid.get(lv.uid)?.phone || "-"}<SmsButton phone={employeeByUid.get(lv.uid)?.phone} /></span></td>
                    <td className="px-4 py-3 text-ink">
                      {formatDate(lv.startDate)} ~ {formatDate(lv.endDate)}
                    </td>
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
                ))}
                {leaves.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-xs text-muted">
                      휴무 정보가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
    </div>
  );
}
