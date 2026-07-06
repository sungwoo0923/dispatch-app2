import { useEffect, useMemo, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { Plus, CalendarDays, FileSpreadsheet, RefreshCw, LayoutList, Calendar as CalendarIcon, Copy, Repeat, X } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import { downloadCsv } from "../utils/exportCsv";
import { toDateKey, formatDate } from "../utils/dateUtils";
import { buildDefaultContract } from "../utils/contractTemplate";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  SHIFT_TYPE_OPTIONS,
  NATIONALITY_OPTIONS,
  COUNTRY_OPTIONS,
} from "../constants/hr";

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
  const [companyName, setCompanyName] = useState("");
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [shiftTemplates, setShiftTemplates] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ uid: "", date: toDateKey(), startTime: "09:00", endTime: "18:00", siteId: "" });

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [range, setRange] = useState({ start: toDateKey(), end: toDateKey() });
  const [selected, setSelected] = useState(() => new Set());
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
      (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
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
    return () => {
      unsubUsers();
      unsubSites();
      unsubVendors();
      unsubDept();
      unsubPos();
      unsubTemplates();
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

  const rows = useMemo(() => {
    return schedules
      .map((s) => ({ schedule: s, emp: employeeByUid.get(s.uid) }))
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
      .sort((a, b) => a.schedule.date.localeCompare(b.schedule.date));
  }, [schedules, employeeByUid, filters]);

  const submit = async (e) => {
    e.preventDefault();
    const emp = employees.find((x) => x.id === form.uid);
    const site = workSites.find((x) => x.id === form.siteId);
    await addDoc(collection(db, "schedules"), {
      companyId: profile.companyId,
      uid: form.uid,
      name: emp?.name || "",
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      siteId: form.siteId || null,
      siteName: site?.name || "",
      status: "대기",
      createdAt: serverTimestamp(),
    });
    setOpen(false);
  };

  const toggleSelected = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAll = () => setSelected((s) => (s.size === rows.length ? new Set() : new Set(rows.map((r) => r.schedule.id))));

  const applyStatus = async () => {
    for (const id of selected) {
      await updateDoc(doc(db, "schedules", id), { status: statusAction });
      const s = schedules.find((x) => x.id === id);
      const emp = s && employeeByUid.get(s.uid);
      if (!s || !emp) continue;

      if (statusAction === "출근확정") {
        const existing = await getDocs(
          query(collection(db, "contracts"), where("companyId", "==", profile.companyId), where("uid", "==", emp.id))
        );
        if (existing.empty) {
          const site = workSites.find((w) => w.id === emp.workSiteId);
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
            autoGenerated: true,
            createdAt: serverTimestamp(),
          });
        }
      } else if (statusAction === "출근확정취소" || statusAction === "출근취소") {
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
      }
    }
    setSelected(new Set());
  };

  const selectedSchedules = useMemo(() => rows.filter(({ schedule: s }) => selected.has(s.id)), [rows, selected]);

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
    const rowsOut = rows.map(({ schedule: s, emp }) => [
      s.name,
      companyName,
      s.siteName || "-",
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
          <Button onClick={() => setOpen(true)}>
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

        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto">
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
              <Button size="sm" variant="outline" onClick={exportCsv}>
                <FileSpreadsheet size={13} /> 엑셀
              </Button>
            </Card>

            <div className="-mx-4 overflow-x-auto md:-mx-5">
              <table className="w-full min-w-[980px] text-center text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-muted">
                    <th className="px-4 py-3 font-semibold">
                      <input type="checkbox" checked={selected.size > 0 && selected.size === rows.length} onChange={toggleSelectAll} />
                    </th>
                    <th className="px-4 py-3 font-semibold">순번</th>
                    <th className="px-4 py-3 font-semibold">이름</th>
                    <th className="px-4 py-3 font-semibold">사업자</th>
                    <th className="px-4 py-3 font-semibold">센터</th>
                    <th className="px-4 py-3 font-semibold">확정</th>
                    <th className="px-4 py-3 font-semibold">근무일자</th>
                    <th className="px-4 py-3 font-semibold">근무시각</th>
                    <th className="px-4 py-3 font-semibold">전화번호</th>
                    <th className="px-4 py-3 font-semibold">성별</th>
                    <th className="px-4 py-3 font-semibold">소속업체</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ schedule: s, emp }, i) => (
                    <tr key={s.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelected(s.id)} />
                      </td>
                      <td className="px-4 py-3 text-muted">{i + 1}</td>
                      <td className="px-4 py-3 text-ink">{s.name}</td>
                      <td className="px-4 py-3 text-muted">{companyName}</td>
                      <td className="px-4 py-3 text-muted">{s.siteName || siteName_(emp.workSiteId)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[s.status || "대기"]}>{s.status || "대기"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted">{formatDate(s.date)}</td>
                      <td className="px-4 py-3 text-muted">
                        {s.startTime} ~ {s.endTime}
                      </td>
                      <td className="px-4 py-3 text-muted">{emp.phone}</td>
                      <td className="px-4 py-3 text-muted">{emp.gender || "-"}</td>
                      <td className="px-4 py-3 text-muted">{vendorName_(emp.vendorId)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-4 py-6 text-center text-xs text-muted">
                        등록된 스케줄이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <CalendarView month={calendarMonth} setMonth={setCalendarMonth} rows={rows} />
        )}
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="스케줄 등록"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={submit}>등록</Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">직원</span>
            <select
              required
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.uid}
              onChange={(e) => setForm((f) => ({ ...f, uid: e.target.value }))}
            >
              <option value="">선택</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">근무지</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.siteId}
              onChange={(e) => setForm((f) => ({ ...f, siteId: e.target.value }))}
            >
              <option value="">선택 안 함</option>
              {workSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">근무일자</span>
            <input
              type="date"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </label>
          {shiftTemplates.length > 0 && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">시간템플릿으로 채우기</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                defaultValue=""
                onChange={(e) => {
                  const t = shiftTemplates.find((x) => x.id === e.target.value);
                  if (t) setForm((f) => ({ ...f, startTime: t.startTime, endTime: t.endTime }));
                }}
              >
                <option value="">선택 안 함</option>
                {shiftTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.startTime} ~ {t.endTime})
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">시작시각</span>
              <input
                type="time"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">종료시각</span>
              <input
                type="time"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
              />
            </label>
          </div>
        </form>
      </Modal>

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
            <div className="mb-2 flex flex-nowrap gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 text-sm w-fit">
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
                <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
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
          <div className="flex flex-nowrap gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 text-sm w-fit">
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
                <div key={s.id} className="flex flex-nowrap items-center gap-2 overflow-x-auto rounded-lg border border-slate-100 p-2">
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
