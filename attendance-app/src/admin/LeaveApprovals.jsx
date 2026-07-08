import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { CalendarClock, RefreshCw, FileSpreadsheet } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Panel from "../components/Panel";
import Modal from "../components/Modal";
import ApprovalBox from "../components/ApprovalBox";
import { downloadCsv } from "../utils/exportCsv";
import { formatDate, toDateKey, addDays } from "../utils/dateUtils";
import { EMPLOYMENT_TYPE_OPTIONS, SHIFT_TYPE_OPTIONS, NATIONALITY_OPTIONS, COUNTRY_OPTIONS } from "../constants/hr";
import SmsButton from "../components/SmsButton";

const STATUS_OPTIONS = ["승인대기", "승인완료", "반려"];
const STATUS_MAP = { pending: "승인대기", approved: "승인완료", rejected: "반려" };
const STATUS_MAP_REV = { 승인대기: "pending", 승인완료: "approved", 반려: "rejected" };
const STATUS_TONE = { 승인대기: "warning", 승인완료: "success", 반려: "danger" };

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

export default function LeaveApprovals() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [range, setRange] = useState({ start: addDays(toDateKey(), -30), end: addDays(toDateKey(), 30) });
  const [selected, setSelected] = useState(() => new Set());
  const [statusAction, setStatusAction] = useState("승인완료");
  const [note, setNote] = useState("");
  const [detailView, setDetailView] = useState(null); // { leave, emp }

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (s) => setEmployees(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (s) => setWorkSites(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "vendors"), where("companyId", "==", profile.companyId)), (s) => setVendors(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "leaves"), where("companyId", "==", profile.companyId)), (s) => setLeaves(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const employeeByUid = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";
  const vendorName_ = (id) => vendors.find((v) => v.id === id)?.name || "-";

  const rows = useMemo(() => {
    return leaves
      .map((lv) => ({ leave: lv, emp: employeeByUid.get(lv.uid) }))
      .filter(({ emp }) => Boolean(emp))
      .filter(({ leave, emp }) => {
        if (range.start && leave.startDate < range.start) return false;
        if (range.end && leave.startDate > range.end) return false;
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
      .sort((a, b) => b.leave.startDate.localeCompare(a.leave.startDate));
  }, [leaves, employeeByUid, filters, range]);

  const toggleSelected = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleSelectAll = () => setSelected((s) => (s.size === rows.length ? new Set() : new Set(rows.map((r) => r.leave.id))));

  const applyStatus = async () => {
    const nextStatus = STATUS_MAP_REV[statusAction];
    for (const id of selected) {
      await updateDoc(doc(db, "leaves", id), { status: nextStatus, adminNote: note || null });
      const lv = leaves.find((l) => l.id === id);
      if (!lv || nextStatus === "pending") continue;
      await addDoc(collection(db, "notifications"), {
        companyId: profile.companyId,
        uid: lv.uid,
        title: nextStatus === "approved" ? `${lv.type} 신청이 승인되었습니다` : `${lv.type} 신청이 반려되었습니다`,
        message: nextStatus === "rejected" ? note || "" : "",
        read: false,
        createdAt: serverTimestamp(),
      });
    }
    setSelected(new Set());
    setNote("");
  };

  const exportCsv = () => {
    const headers = ["사업자", "센터", "상태", "신청자", "휴가일자", "휴가유형", "휴가일수", "사유", "전화번호"];
    downloadCsv(
      "근로자휴가신청현황",
      headers,
      rows.map(({ leave: lv, emp }) => [profile.companyId, siteName_(emp.workSiteId), STATUS_MAP[lv.status] || "승인대기", lv.name, formatDate(lv.startDate), lv.type, lv.days || 1, lv.reason || "-", emp.phone || "-"])
    );
  };

  return (
    <div className="space-y-6">
      <Panel icon={CalendarClock} title="근로자휴가신청현황">
        <p className="mb-4 text-xs text-muted">근로자가 모바일을 통해 휴가 신청할 수 있으며 휴가 신청한 내용을 확인할 수 있습니다. 근로자들이 신청한 휴가를 승인 절차 프로세스를 진행 할 수 있습니다. 승인완료,반려,승인대기를 할 수 있습니다.</p>

        <Card className="mb-4 space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.siteId} onChange={(e) => setFilters((f) => ({ ...f, siteId: e.target.value }))}>
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
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.vendorId} onChange={(e) => setFilters((f) => ({ ...f, vendorId: e.target.value }))}>
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
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.shiftType} onChange={(e) => setFilters((f) => ({ ...f, shiftType: e.target.value }))}>
                <option value="">전체</option>
                {SHIFT_TYPE_OPTIONS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">근무형태</span>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.employmentType} onChange={(e) => setFilters((f) => ({ ...f, employmentType: e.target.value }))}>
                <option value="">전체</option>
                {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">국적구분</span>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.nationality} onChange={(e) => setFilters((f) => ({ ...f, nationality: e.target.value }))}>
                <option value="">선택</option>
                {NATIONALITY_OPTIONS.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">국가구분</span>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.country} onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value }))}>
                <option value="">전체</option>
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">이름</span>
                <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.name} onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">전화번호</span>
                <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.phone} onChange={(e) => setFilters((f) => ({ ...f, phone: e.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">휴가발생일</span>
                <div className="flex items-center gap-1.5">
                  <input type="date" className="rounded-lg border border-slate-200 px-2 py-2 text-sm" value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} />
                  <span className="text-muted">~</span>
                  <input type="date" className="rounded-lg border border-slate-200 px-2 py-2 text-sm" value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} />
                </div>
              </label>
            </div>
            <div className="flex gap-2">
              <button type="button" className="rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50" onClick={() => setFilters(EMPTY_FILTERS)}>
                <RefreshCw size={16} />
              </button>
              <Button>검색</Button>
            </div>
          </div>
        </Card>

        <Card className="mb-3 flex flex-nowrap items-end gap-2 overflow-x-auto overscroll-x-contain p-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">상태</span>
            <select className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm" value={statusAction} onChange={(e) => setStatusAction(e.target.value)}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <input className="w-40 rounded-lg border border-slate-200 px-2.5 py-2 text-sm" placeholder="관리자비고" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" onClick={applyStatus} disabled={selected.size === 0}>
            적용
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <FileSpreadsheet size={13} /> 엑셀
          </Button>
        </Card>

        <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
          <table className="w-full min-w-[980px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-semibold">
                  <input type="checkbox" checked={selected.size > 0 && selected.size === rows.length} onChange={toggleSelectAll} />
                </th>
                <th className="px-4 py-3 font-semibold">순번</th>
                <th className="px-4 py-3 font-semibold">사업자</th>
                <th className="px-4 py-3 font-semibold">센터</th>
                <th className="px-4 py-3 font-semibold">상태</th>
                <th className="px-4 py-3 font-semibold">신청자</th>
                <th className="px-4 py-3 font-semibold">휴가일자</th>
                <th className="px-4 py-3 font-semibold">휴가유형</th>
                <th className="px-4 py-3 font-semibold">휴가일수</th>
                <th className="px-4 py-3 font-semibold">사유</th>
                <th className="px-4 py-3 font-semibold">관리자비고</th>
                <th className="px-4 py-3 font-semibold">전화번호</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ leave: lv, emp }, i) => (
                <tr
                  key={lv.id}
                  onDoubleClick={() => setDetailView({ leave: lv, emp })}
                  title="더블클릭하여 휴가신청서 미리보기"
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(lv.id)} onChange={() => toggleSelected(lv.id)} />
                  </td>
                  <td className="px-4 py-3 text-ink">{i + 1}</td>
                  <td className="px-4 py-3 text-ink">{vendorName_(emp.vendorId)}</td>
                  <td className="px-4 py-3 text-ink">{siteName_(emp.workSiteId)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[STATUS_MAP[lv.status] || "승인대기"]}>{STATUS_MAP[lv.status] || "승인대기"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink">{lv.name}</td>
                  <td className="px-4 py-3 text-ink">{formatDate(lv.startDate)}</td>
                  <td className="px-4 py-3 text-ink">{lv.type}</td>
                  <td className="px-4 py-3 text-ink">{lv.days || 1}</td>
                  <td className="px-4 py-3 text-ink">{lv.reason || "-"}</td>
                  <td className="px-4 py-3 text-ink">{lv.adminNote || "-"}</td>
                  <td className="px-4 py-3 text-ink"><span className="inline-flex items-center gap-1">{emp.phone || "-"}<SmsButton phone={emp.phone} /></span></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-6 text-center text-xs text-muted">
                    신청된 휴가가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal
        open={Boolean(detailView)}
        onClose={() => setDetailView(null)}
        title="휴가신청서"
        footer={<Button onClick={() => setDetailView(null)}>닫기</Button>}
      >
        {detailView && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold text-ink">휴가신청서</p>
              <ApprovalBox
                steps={[
                  {
                    role: "결재",
                    name: "",
                    signatureDataUrl: null,
                    result:
                      detailView.leave.status === "approved" ? "approved" : detailView.leave.status === "rejected" ? "rejected" : null,
                  },
                ]}
              />
            </div>
            <div className="space-y-1.5 text-sm text-ink">
              <div className="flex justify-between border-b border-slate-50 py-1.5">
                <span className="text-xs text-muted">이름</span>
                <span>{detailView.leave.name}</span>
              </div>
              <div className="flex justify-between border-b border-slate-50 py-1.5">
                <span className="text-xs text-muted">근무지</span>
                <span>{siteName_(detailView.emp.workSiteId)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-50 py-1.5">
                <span className="text-xs text-muted">휴가유형</span>
                <span>{detailView.leave.type}</span>
              </div>
              <div className="flex justify-between border-b border-slate-50 py-1.5">
                <span className="text-xs text-muted">휴가일자</span>
                <span>{formatDate(detailView.leave.startDate)} ({detailView.leave.days || 1}일)</span>
              </div>
              <div className="flex justify-between border-b border-slate-50 py-1.5">
                <span className="text-xs text-muted">사유</span>
                <span>{detailView.leave.reason || "-"}</span>
              </div>
              {detailView.leave.adminNote && (
                <div className="flex justify-between border-b border-slate-50 py-1.5">
                  <span className="text-xs text-muted">관리자비고</span>
                  <span>{detailView.leave.adminNote}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
