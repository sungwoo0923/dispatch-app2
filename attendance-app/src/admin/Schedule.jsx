import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { Plus, CalendarDays } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import { toDateKey, formatDate } from "../utils/dateUtils";

export default function Schedule() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [shiftTemplates, setShiftTemplates] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ uid: "", date: toDateKey(), startTime: "09:00", endTime: "18:00", siteId: "" });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubUsers = onSnapshot(
      query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")),
      (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubSites = onSnapshot(
      query(collection(db, "workSites"), where("companyId", "==", profile.companyId)),
      (snap) => setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubTemplates = onSnapshot(
      query(collection(db, "shiftTemplates"), where("companyId", "==", profile.companyId)),
      (snap) => setShiftTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubSchedules = onSnapshot(
      query(
        collection(db, "schedules"),
        where("companyId", "==", profile.companyId),
        where("date", ">=", toDateKey()),
        orderBy("date", "asc")
      ),
      (snap) => setSchedules(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubUsers();
      unsubSites();
      unsubTemplates();
      unsubSchedules();
    };
  }, [profile?.companyId]);

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
      createdAt: serverTimestamp(),
    });
    setOpen(false);
  };

  return (
    <div className="space-y-6">
      <Panel
        icon={CalendarDays}
        title={`스케줄 관리 (${schedules.length}건)`}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> 스케줄 등록
          </Button>
        }
      >
        <div className="-m-4 overflow-x-auto md:-m-5">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-medium">순번</th>
                <th className="px-4 py-3 font-medium">이름</th>
                <th className="px-4 py-3 font-medium">근무일자</th>
                <th className="px-4 py-3 font-medium">근무시각</th>
                <th className="px-4 py-3 font-medium">근무지</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s, i) => (
                <tr key={s.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 text-muted">{i + 1}</td>
                  <td className="px-4 py-3 text-ink">{s.name}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(s.date)}</td>
                  <td className="px-4 py-3 text-muted">
                    {s.startTime} ~ {s.endTime}
                  </td>
                  <td className="px-4 py-3 text-muted">{s.siteName || "-"}</td>
                </tr>
              ))}
              {schedules.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-xs text-muted">
                    등록된 스케줄이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
    </div>
  );
}
