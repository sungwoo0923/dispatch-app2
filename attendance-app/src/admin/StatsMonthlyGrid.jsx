import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, doc, setDoc, addDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { FileSpreadsheet, CalendarDays } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import Card from "../components/Card";
import Panel from "../components/Panel";
import Modal from "../components/Modal";
import Button from "../components/Button";
import { toMonthKey, attendanceDocId } from "../utils/dateUtils";
import { downloadCsv } from "../utils/exportCsv";
import { EMPLOYMENT_TYPE_OPTIONS, SHIFT_TYPE_OPTIONS } from "../constants/hr";
import SmsButton from "../components/SmsButton";
import { useCompanyLookups, filterEmployees, daysInMonth, WEEKDAY_LABELS, leaveStatusOn } from "../utils/statsShared";

function ExcelButton({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-slate-50">
      <FileSpreadsheet size={15} /> 엑셀
    </button>
  );
}

// 하루치 상태를 하나로 판정한다 — 출근(지각 포함)기록이 있으면 무조건
// 출근으로 보고, 없을 때만 그날을 포함하는 승인된 휴가가 있는지로
// 유급/무급휴무를 가른다. 그 외(출근도 휴가도 없는 과거 날짜, 또는
// 정해진 퇴근시각이 지난 오늘 날짜)는 결근으로 표시해 "언제 쉬었는지"
// 뿐 아니라 "언제 안 나왔는지"도 한눈에 구분되게 한다. 오늘 날짜는 하루가
// 끝나기 전까지는 아직 결근으로 단정하지 않는다(AttendanceBoard의
// resolveDayStatus와 같은 기준).
function dayStatus({ uid, dateKey, attendance, leaves, leaveTypes, isFuture, isTodayNotYetOver }) {
  if (attendance.some((a) => a.uid === uid && a.date === dateKey && (a.status === "출근" || a.status === "지각"))) return "present";
  const leave = leaveStatusOn(leaves, leaveTypes, uid, dateKey);
  if (leave) return leave.paid ? "paidLeave" : "unpaidLeave";
  if (isFuture || isTodayNotYetOver) return "future";
  return "absent";
}

const CELL_STYLE = {
  present: "bg-primary text-white font-semibold",
  paidLeave: "bg-primary-light text-primary",
  unpaidLeave: "bg-slate-200 text-slate-500",
  absent: "bg-red-50 text-danger",
  future: "text-slate-300",
};
const CELL_LABEL = { present: "1", paidLeave: "휴", unpaidLeave: "휴", absent: "-", future: "" };

export default function StatsMonthlyGrid() {
  const { profile } = useAuth();
  const toast = useToast();
  const lookups = useCompanyLookups(profile?.companyId);
  const [filters, setFilters] = useState({ siteId: "", vendorId: "", shiftType: "", employmentType: "", team: "", search: "" });
  const [month, setMonth] = useState(toMonthKey());
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  // 도급팀이 실제로 관리하던 엑셀(근로자 x 1~31일 달력형 표, 셀을 직접
  // 채워넣는 방식)을 참고해, 이 그리드도 셀을 눌러 그날 상태를 바로
  // 수정할 수 있게 한다 — 순수 조회용 집계표에 머물지 않고 실제 근태를
  // 여기서 계획/정정할 수 있는 화면으로 만든다.
  const [editCell, setEditCell] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubAtt = onSnapshot(
      query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("month", "==", month)),
      (snap) => setAttendance(snap.docs.map((d) => d.data()))
    );
    const unsubLeaves = onSnapshot(
      query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("status", "==", "approved")),
      (snap) => setLeaves(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubAtt();
      unsubLeaves();
    };
  }, [profile?.companyId, month]);

  const numDays = daysInMonth(month);
  const dayList = Array.from({ length: numDays }, (_, i) => i + 1);
  const rows = filterEmployees(lookups.employees, filters);
  const siteName_ = (id) => lookups.workSites.find((s) => s.id === id)?.name || "-";
  const vendorName_ = (id) => lookups.vendors.find((v) => v.id === id)?.name || "-";
  const todayKey = new Date().toISOString().slice(0, 10);

  const weekdayFor = (day) => {
    const d = new Date(`${month}-${String(day).padStart(2, "0")}T00:00:00`);
    return WEEKDAY_LABELS[d.getDay()];
  };

  const statusFor = (uid, day) => {
    const dateKey = `${month}-${String(day).padStart(2, "0")}`;
    // 정해진 퇴근시각(기본 18:00) 전까지는 오늘 날짜를 결근으로 단정하지 않는다.
    const isTodayNotYetOver = dateKey === todayKey && new Date().getHours() < 18;
    return dayStatus({ uid, dateKey, attendance, leaves, leaveTypes: lookups.leaveTypes, isFuture: dateKey > todayKey, isTodayNotYetOver });
  };

  const openCellEditor = (emp, day) => {
    const dateKey = `${month}-${String(day).padStart(2, "0")}`;
    setEditCell({ uid: emp.id, name: emp.name, day, dateKey });
  };

  const markPresent = async () => {
    if (!editCell) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, "attendance", attendanceDocId(editCell.uid, editCell.dateKey)),
        {
          uid: editCell.uid,
          name: editCell.name,
          companyId: profile.companyId,
          date: editCell.dateKey,
          month: editCell.dateKey.slice(0, 7),
          status: "출근",
          checkInTime: `${editCell.dateKey}T09:00:00`,
          source: "manual",
        },
        { merge: true }
      );
      toast.success("출근으로 표시했습니다");
      setEditCell(null);
    } catch (err) {
      toast.error(`저장에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const markLeave = async () => {
    if (!editCell) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, "attendance", attendanceDocId(editCell.uid, editCell.dateKey))).catch(() => {});
      await addDoc(collection(db, "leaves"), {
        companyId: profile.companyId,
        uid: editCell.uid,
        name: editCell.name,
        type: "관리자 처리",
        startDate: editCell.dateKey,
        endDate: editCell.dateKey,
        status: "approved",
        createdAt: serverTimestamp(),
      });
      toast.success("휴무로 표시했습니다");
      setEditCell(null);
    } catch (err) {
      toast.error(`저장에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const clearDay = async () => {
    if (!editCell) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, "attendance", attendanceDocId(editCell.uid, editCell.dateKey))).catch(() => {});
      const toRemove = leaves.filter(
        (l) => l.uid === editCell.uid && l.status === "approved" && editCell.dateKey >= l.startDate && editCell.dateKey <= (l.endDate || l.startDate)
      );
      for (const l of toRemove) await deleteDoc(doc(db, "leaves", l.id)).catch(() => {});
      toast.success("기록을 지웠습니다");
      setEditCell(null);
    } catch (err) {
      toast.error(`저장에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const headers = ["사업자", "센터", "소속업체", "근무구분", "근무형태", "부서", "직급", "4대보험", "이름", "전화번호", ...dayList.map((d) => String(d)), "출근일수"];
    const rowsOut = rows.map((emp) => {
      const marks = dayList.map((d) => statusFor(emp.id, d));
      const total = marks.filter((s) => s === "present").length;
      return [
        lookups.companyName, siteName_(emp.workSiteId), vendorName_(emp.vendorId), emp.shiftType || "-", emp.employmentType || "-",
        emp.team || "-", emp.position || "-", emp.insuranceApplied || "-", emp.name, emp.phone,
        ...marks.map((s) => CELL_LABEL[s] || "-"), total,
      ];
    });
    downloadCsv(`근로자별월별출근집계_${month}`, headers, rowsOut);
  };

  const subtotals = dayList.map((d) => rows.filter((emp) => statusFor(emp.id, d) === "present").length);

  return (
    <Panel icon={CalendarDays} title="근로자별월별출근집계">
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">사업자</span>
          <select disabled className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-muted">
            <option>{lookups.companyName || "-"}</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.siteId} onChange={(e) => setFilters((f) => ({ ...f, siteId: e.target.value }))}>
            <option value="">전체</option>
            {lookups.workSites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">소속업체</span>
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.vendorId} onChange={(e) => setFilters((f) => ({ ...f, vendorId: e.target.value }))}>
            <option value="">전체</option>
            {lookups.vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">근무구분</span>
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.shiftType} onChange={(e) => setFilters((f) => ({ ...f, shiftType: e.target.value }))}>
            <option value="">전체</option>
            {SHIFT_TYPE_OPTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">근무형태</span>
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.employmentType} onChange={(e) => setFilters((f) => ({ ...f, employmentType: e.target.value }))}>
            <option value="">전체</option>
            {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">부서</span>
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.team} onChange={(e) => setFilters((f) => ({ ...f, team: e.target.value }))}>
            <option value="">전체</option>
            {lookups.departments.map((d) => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">출근월</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label className="block flex-1 min-w-[140px]">
          <span className="mb-1.5 block text-xs font-medium text-muted">이름</span>
          <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} placeholder="검색어를 입력하세요." />
        </label>
      </Card>

      <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
        <p className="text-xs font-medium text-muted">목록 {rows.length}</p>
        <div className="flex items-center gap-3">
          <span className="flex flex-nowrap items-center gap-1.5 text-[11px] text-muted">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" /> 출근
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary-light" /> 유급휴무
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-200" /> 무급휴무
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-50" /> 결근
          </span>
          <ExcelButton onClick={exportCsv} />
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-muted">
              <th className="sticky left-0 z-10 bg-white px-3 py-3 font-medium">사업자</th>
              <th className="bg-white px-3 py-3 font-medium">센터</th>
              <th className="bg-white px-3 py-3 font-medium">소속업체</th>
              <th className="bg-white px-3 py-3 font-medium">근무구분</th>
              <th className="bg-white px-3 py-3 font-medium">근무형태</th>
              <th className="bg-white px-3 py-3 font-medium">부서</th>
              <th className="bg-white px-3 py-3 font-medium">직급</th>
              <th className="bg-white px-3 py-3 font-medium">4대보험</th>
              <th className="bg-white px-3 py-3 font-medium">이름</th>
              <th className="bg-white px-3 py-3 font-medium">전화번호</th>
              {dayList.map((d) => (
                <th key={d} className="px-1.5 py-3 text-center font-medium">
                  {d}
                  <br />({weekdayFor(d)})
                </th>
              ))}
              <th className="bg-white px-3 py-3 text-center font-medium">출근일수</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((emp) => {
              const marks = dayList.map((d) => statusFor(emp.id, d));
              const total = marks.filter((s) => s === "present").length;
              return (
                <tr key={emp.id} className="border-b border-slate-50 last:border-0">
                  <td className="sticky left-0 bg-white px-3 py-2 text-ink">{lookups.companyName}</td>
                  <td className="px-3 py-2 text-ink">{siteName_(emp.workSiteId)}</td>
                  <td className="px-3 py-2 text-ink">{vendorName_(emp.vendorId)}</td>
                  <td className="px-3 py-2 text-ink">{emp.shiftType || "-"}</td>
                  <td className="px-3 py-2 text-ink">{emp.employmentType || "-"}</td>
                  <td className="px-3 py-2 text-ink">{emp.team || "-"}</td>
                  <td className="px-3 py-2 text-ink">{emp.position || "-"}</td>
                  <td className="px-3 py-2 text-ink">{emp.insuranceApplied || "-"}</td>
                  <td className="px-3 py-2 text-ink">{emp.name}</td>
                  <td className="px-3 py-2 text-ink"><span className="inline-flex items-center gap-1">{emp.phone}<SmsButton phone={emp.phone} /></span></td>
                  {marks.map((s, i) => (
                    <td key={i} className="px-1 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => openCellEditor(emp, dayList[i])}
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[11px] hover:ring-2 hover:ring-primary/50 ${CELL_STYLE[s]}`}
                        title="클릭해서 이 날짜 상태 수정"
                      >
                        {CELL_LABEL[s]}
                      </button>
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center font-semibold text-ink">{total}</td>
                </tr>
              );
            })}
            {rows.length > 0 && (
              <tr className="bg-slate-50 font-semibold text-ink">
                <td colSpan={10} className="sticky left-0 bg-slate-50 px-3 py-2 text-right">[소계 · 출근인원]</td>
                {subtotals.map((s, i) => (
                  <td key={i} className="px-1 py-2 text-center">{s}</td>
                ))}
                <td className="px-3 py-2 text-center">{subtotals.reduce((a, b) => a + b, 0)}</td>
              </tr>
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={numDays + 11} className="px-4 py-6 text-center text-muted">조건에 맞는 근로자가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={Boolean(editCell)}
        onClose={() => setEditCell(null)}
        title={editCell ? `${editCell.name} · ${month.split("-")[1]}월 ${editCell.day}일` : ""}
      >
        {editCell && (
          <div className="space-y-2">
            <Button className="w-full" onClick={markPresent} disabled={saving}>
              출근으로 표시
            </Button>
            <Button className="w-full" variant="outline" onClick={markLeave} disabled={saving}>
              휴무로 표시
            </Button>
            <Button className="w-full" variant="danger" onClick={clearDay} disabled={saving}>
              기록 삭제 (결근)
            </Button>
          </div>
        )}
      </Modal>
    </Panel>
  );
}
