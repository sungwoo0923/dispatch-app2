import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, getDocs, updateDoc, addDoc, doc, serverTimestamp } from "firebase/firestore";
import { ChevronLeft, ChevronRight, Search, Phone, Clock, CalendarDays } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import Modal from "../components/Modal";
import Button from "../components/Button";
import Badge from "../components/Badge";
import SmsButton from "../components/SmsButton";
import { toDateKey, formatDate, formatTime } from "../utils/dateUtils";
import { computeCheckInStatus } from "../utils/attendanceStatus";

const STATUS_OPTIONS = ["출근", "지각", "조퇴", "출근전", "결근"];
const STATUS_TONE = { 출근: "success", 지각: "warning", 조퇴: "warning", 출근전: "muted", 결근: "danger" };

// 출근현황의 모바일 전용 화면 — 날짜 하나를 골라 그날 체크인/체크아웃 카드를
// 훑어보고, 카드를 눌러 시각·상태를 바로 수정할 수 있게 구성했다. PC의
// 세부 컬럼 커스터마이즈/변경요청 승인 등은 PC 화면을 계속 이용해주세요.
export default function AdminMobileAttendance() {
  const { profile, user } = useAuth();
  const toast = useToast();
  const [dateKey, setDateKey] = useState(() => toDateKey());
  const [attendance, setAttendance] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState("전체");
  const [detail, setDetail] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ checkInTime: "", checkOutTime: "", status: "출근전", reason: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("date", "==", dateKey)),
      (snap) => setAttendance(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId, dateKey]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (snap) =>
        setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => !e.deleted))
      ),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (snap) =>
        setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const empByUid = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const siteName = (id) => workSites.find((s) => s.id === id)?.name || "";

  const rows = useMemo(() => {
    const kw = search.trim();
    return attendance
      .map((a) => ({ record: a, emp: empByUid.get(a.uid) }))
      .filter(({ emp }) => Boolean(emp))
      .filter(({ record }) => statusTab === "전체" || (record.status || "출근전") === statusTab)
      .filter(({ emp }) => !kw || emp.name?.includes(kw))
      .sort((a, b) => (a.emp.name || "").localeCompare(b.emp.name || ""));
  }, [attendance, empByUid, search, statusTab]);

  const counts = useMemo(() => {
    const out = { 전체: rows.length };
    attendance.forEach((a) => {
      const s = a.status || "출근전";
      out[s] = (out[s] || 0) + 1;
    });
    return out;
  }, [attendance, rows.length]);

  const shiftDate = (delta) => {
    const d = new Date(dateKey);
    d.setDate(d.getDate() + delta);
    setDateKey(toDateKey(d));
  };

  const openDetail = (row) => {
    setDetail(row);
    setEditMode(false);
    setForm({
      checkInTime: row.record.checkInTime ? row.record.checkInTime.slice(11, 16) : "",
      checkOutTime: row.record.checkOutTime ? row.record.checkOutTime.slice(11, 16) : "",
      status: row.record.status || "출근전",
      reason: "",
    });
  };

  const save = async () => {
    if (!detail || !form.reason.trim()) return;
    const { record: r } = detail;
    setSaving(true);
    try {
      const updates = {};
      const editLogs = [];
      const prevCheckIn = r.checkInTime ? r.checkInTime.slice(11, 16) : "";
      const prevCheckOut = r.checkOutTime ? r.checkOutTime.slice(11, 16) : "";
      if (form.checkInTime && form.checkInTime !== prevCheckIn) {
        updates.checkInTime = `${r.date}T${form.checkInTime}:00`;
        editLogs.push({ field: "출근시각", oldValue: prevCheckIn || "-", newValue: form.checkInTime });
      }
      if (form.checkOutTime && form.checkOutTime !== prevCheckOut) {
        updates.checkOutTime = `${r.date}T${form.checkOutTime}:00`;
        editLogs.push({ field: "퇴근시각", oldValue: prevCheckOut || "-", newValue: form.checkOutTime });
      }
      const statusChangedManually = form.status !== (r.status || "출근전");
      if (statusChangedManually) {
        updates.status = form.status;
        editLogs.push({ field: "상태", oldValue: r.status || "출근전", newValue: form.status });
      } else if (updates.checkInTime) {
        const snap = await getDocs(
          query(collection(db, "schedules"), where("companyId", "==", profile.companyId), where("uid", "==", r.uid), where("date", "==", r.date))
        );
        const startTime = snap.docs[0]?.data()?.startTime;
        if (startTime) {
          const newStatus = computeCheckInStatus(startTime, new Date(updates.checkInTime));
          if (newStatus !== r.status) {
            updates.status = newStatus;
            editLogs.push({ field: "상태", oldValue: r.status || "출근전", newValue: newStatus });
          }
        }
      }
      if (Object.keys(updates).length === 0) {
        setDetail(null);
        return;
      }
      updates.source = "manual";
      await updateDoc(doc(db, "attendance", r.id), updates);
      for (const log of editLogs) {
        await addDoc(collection(db, "attendanceEdits"), {
          companyId: profile.companyId,
          uid: r.uid,
          name: r.name || detail.emp?.name,
          date: r.date,
          field: log.field,
          oldValue: log.oldValue,
          newValue: log.newValue,
          reason: form.reason,
          editedAt: serverTimestamp(),
          editedBy: user?.uid || null,
        });
      }
      toast.success("수정되었습니다");
      setDetail(null);
    } catch (err) {
      toast.error(`수정에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">출근현황 ({rows.length}명)</p>
          <p className="mt-0.5 text-xs text-muted">카드를 눌러 출퇴근 시각을 확인·수정하세요</p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-2 py-2">
        <button type="button" onClick={() => shiftDate(-1)} className="rounded-lg p-1.5 text-muted hover:bg-slate-50">
          <ChevronLeft size={18} />
        </button>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <CalendarDays size={14} className="text-primary" /> {formatDate(dateKey)}
        </span>
        <button type="button" onClick={() => shiftDate(1)} className="rounded-lg p-1.5 text-muted hover:bg-slate-50">
          <ChevronRight size={18} />
        </button>
      </div>
      {dateKey !== toDateKey() && (
        <button type="button" onClick={() => setDateKey(toDateKey())} className="text-xs font-medium text-primary">
          오늘로 이동
        </button>
      )}

      <div className="relative">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름 검색"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm"
        />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <div className="flex flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain">
        {["전체", ...STATUS_OPTIONS].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusTab(s)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              statusTab === s ? "bg-primary text-white" : "bg-white text-muted border border-slate-200"
            }`}
          >
            {s} {counts[s] || 0}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {rows.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">해당하는 출근기록이 없습니다.</div>
        )}
        {rows.map(({ record: r, emp }) => (
          <button
            key={r.id}
            type="button"
            onClick={() => openDetail({ record: r, emp })}
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-light text-sm font-bold text-primary">
              {emp.name?.[0] || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-ink">{emp.name}</span>
                <Badge tone={STATUS_TONE[r.status || "출근전"] || "muted"}>{r.status || "출근전"}</Badge>
              </div>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                <Clock size={11} />
                {r.checkInTime ? (
                  <span className={r.status === "지각" ? "font-semibold text-danger" : ""}>{formatTime(r.checkInTime)}</span>
                ) : (
                  "-"
                )}
                {" ~ "}
                {r.checkOutTime ? formatTime(r.checkOutTime) : "-"}
                {(r.siteName || siteName(emp.workSiteId)) && ` · ${r.siteName || siteName(emp.workSiteId)}`}
              </p>
            </div>
            {emp.phone && (
              <div className="flex shrink-0 items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
                <a href={`tel:${emp.phone}`} className="rounded-lg p-1.5 text-primary hover:bg-primary-light">
                  <Phone size={15} />
                </a>
                <SmsButton phone={emp.phone} />
              </div>
            )}
          </button>
        ))}
      </div>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="출근현황 상세"
        footer={
          editMode ? (
            <>
              <Button variant="outline" onClick={() => setEditMode(false)}>
                취소
              </Button>
              <Button onClick={save} disabled={saving || !form.reason.trim()}>
                {saving ? "저장 중..." : "저장"}
              </Button>
            </>
          ) : (
            <Button className="w-full" onClick={() => setEditMode(true)}>
              수정
            </Button>
          )
        }
      >
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-light text-base font-bold text-primary">
                {detail.emp?.name?.[0] || "?"}
              </div>
              <div>
                <p className="text-base font-bold text-ink">{detail.emp?.name}</p>
                <p className="text-xs text-muted">{formatDate(detail.record.date)}</p>
              </div>
            </div>

            {!editMode ? (
              <div className="rounded-xl bg-slate-50 p-3.5">
                <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
                  <span className="text-xs text-muted">상태</span>
                  <Badge tone={STATUS_TONE[detail.record.status || "출근전"] || "muted"}>{detail.record.status || "출근전"}</Badge>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
                  <span className="text-xs text-muted">출근시각</span>
                  <span className="text-ink">{detail.record.checkInTime ? formatTime(detail.record.checkInTime) : "-"}</span>
                </div>
                <div className="flex items-center justify-between py-2 text-sm">
                  <span className="text-xs text-muted">퇴근시각</span>
                  <span className="text-ink">{detail.record.checkOutTime ? formatTime(detail.record.checkOutTime) : "-"}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">출근시각</span>
                    <input
                      type="time"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                      value={form.checkInTime}
                      onChange={(e) => setForm((f) => ({ ...f, checkInTime: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">퇴근시각</span>
                    <input
                      type="time"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                      value={form.checkOutTime}
                      onChange={(e) => setForm((f) => ({ ...f, checkOutTime: e.target.value }))}
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">상태</span>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_OPTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, status: s }))}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                          form.status === s ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">수정 사유 *</span>
                  <textarea
                    rows={2}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    value={form.reason}
                    onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                    placeholder="수정 사유를 입력하세요"
                  />
                </label>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
