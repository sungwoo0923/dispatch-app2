import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { ClipboardCheck, FileSpreadsheet, RefreshCw } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Panel from "../components/Panel";
import { downloadCsv } from "../utils/exportCsv";
import { toDateKey, formatTime, formatDate } from "../utils/dateUtils";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  SHIFT_TYPE_OPTIONS,
  NATIONALITY_OPTIONS,
  COUNTRY_OPTIONS,
} from "../constants/hr";

const VIEW_OPTIONS = ["출근현황", "휴무현황", "수정현황"];

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
  const [companyName, setCompanyName] = useState("");
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [edits, setEdits] = useState([]);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [range, setRange] = useState({ start: toDateKey(), end: toDateKey() });
  const [view, setView] = useState("출근현황");
  const [selected, setSelected] = useState(() => new Set());
  const [editField, setEditField] = useState("checkInTime");
  const [editTime, setEditTime] = useState("");
  const [editReason, setEditReason] = useState("");
  const [statusAction, setStatusAction] = useState("출근전");

  useEffect(() => {
    if (!profile?.companyId) return;
    getDoc(doc(db, "companies", profile.companyId)).then((s) => setCompanyName(s.data()?.name || ""));
    const unsubs = [
      onSnapshot(
        query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")),
        (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
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

  const employeeByUid = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";
  const vendorName_ = (id) => vendors.find((v) => v.id === id)?.name || "-";

  const rows = useMemo(() => {
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
      .sort((a, b) => a.record.date.localeCompare(b.record.date));
  }, [attendance, employeeByUid, filters]);

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

        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
          <p className="text-xs font-medium text-muted">
            출근현황 {rows.length}
            <span className="ml-2 text-[11px] text-danger">'{lateCount}' 지각</span>
            <span className="ml-1 text-[11px] text-warning">'{earlyLeaveCount}' 조퇴</span>
          </p>
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={view}
            onChange={(e) => setView(e.target.value)}
          >
            {VIEW_OPTIONS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>

        {view === "출근현황" && (
          <>
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
              <div className="ml-auto">
                <Button size="sm" variant="outline" onClick={exportCsv}>
                  <FileSpreadsheet size={13} /> 엑셀
                </Button>
              </div>
            </Card>

            <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
              <table className="w-full min-w-[980px] text-center text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-muted">
                    <th className="px-4 py-3 font-semibold">
                      <input type="checkbox" checked={selected.size > 0 && selected.size === rows.length} onChange={toggleSelectAll} />
                    </th>
                    <th className="px-4 py-3 font-semibold">순번</th>
                    <th className="px-4 py-3 font-semibold">이름</th>
                    <th className="px-4 py-3 font-semibold">출근시간</th>
                    <th className="px-4 py-3 font-semibold">퇴근시간</th>
                    <th className="px-4 py-3 font-semibold">근무일</th>
                    <th className="px-4 py-3 font-semibold">사업자</th>
                    <th className="px-4 py-3 font-semibold">센터</th>
                    <th className="px-4 py-3 font-semibold">근무구분</th>
                    <th className="px-4 py-3 font-semibold">근무형태</th>
                    <th className="px-4 py-3 font-semibold">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ record: r, emp }, i) => (
                    <tr key={r.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelected(r.id)} />
                      </td>
                      <td className="px-4 py-3 text-muted">{i + 1}</td>
                      <td className="px-4 py-3 text-ink">{r.name}</td>
                      <td className="px-4 py-3 text-muted">{r.checkInTime ? formatTime(r.checkInTime) : "-"}</td>
                      <td className="px-4 py-3 text-muted">{r.checkOutTime ? formatTime(r.checkOutTime) : "-"}</td>
                      <td className="px-4 py-3 text-muted">{formatDate(r.date)}</td>
                      <td className="px-4 py-3 text-muted">{companyName}</td>
                      <td className="px-4 py-3 text-muted">{r.siteName || siteName_(emp.workSiteId)}</td>
                      <td className="px-4 py-3 text-muted">{emp.shiftType || "-"}</td>
                      <td className="px-4 py-3 text-muted">{emp.employmentType || "-"}</td>
                      <td className="px-4 py-3">
                        <Badge tone={r.status === "출근" ? "success" : r.status === "지각" || r.status === "조퇴" ? "warning" : "danger"}>
                          {r.status || "미출근"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-4 py-6 text-center text-xs text-muted">
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
                </tr>
              </thead>
              <tbody>
                {leaves.map((lv, i) => (
                  <tr key={lv.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 text-muted">{i + 1}</td>
                    <td className="px-4 py-3 text-ink">{lv.type}</td>
                    <td className="px-4 py-3 text-muted">{lv.reason || "-"}</td>
                    <td className="px-4 py-3 text-muted">{lv.name}</td>
                    <td className="px-4 py-3 text-muted">{employeeByUid.get(lv.uid)?.phone || "-"}</td>
                    <td className="px-4 py-3 text-muted">
                      {formatDate(lv.startDate)} ~ {formatDate(lv.endDate)}
                    </td>
                  </tr>
                ))}
                {leaves.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-xs text-muted">
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
                </tr>
              </thead>
              <tbody>
                {edits
                  .slice()
                  .sort((a, b) => (b.editedAt?.seconds || 0) - (a.editedAt?.seconds || 0))
                  .map((e, i) => (
                    <tr key={e.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-3 text-muted">{i + 1}</td>
                      <td className="px-4 py-3 text-ink">{e.name}</td>
                      <td className="px-4 py-3 text-muted">{formatDate(e.date)}</td>
                      <td className="px-4 py-3 text-muted">{e.field}</td>
                      <td className="px-4 py-3 text-muted">{e.oldValue}</td>
                      <td className="px-4 py-3 text-muted">{e.newValue}</td>
                      <td className="px-4 py-3 text-muted">{e.reason}</td>
                      <td className="px-4 py-3 text-muted">
                        {e.editedAt?.toDate ? e.editedAt.toDate().toLocaleString("ko-KR") : "-"}
                      </td>
                    </tr>
                  ))}
                {edits.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-xs text-muted">
                      수정 내역이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
