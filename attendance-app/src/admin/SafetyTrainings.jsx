import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { ShieldCheck, Eye } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { formatDate } from "../utils/dateUtils";

export default function SafetyTrainings() {
  const { profile } = useAuth();
  const [workSites, setWorkSites] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [attendance, setAttendance] = useState([]);

  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [form, setForm] = useState({ title: "", date: "", siteId: "", content: "" });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubSites = onSnapshot(
      query(collection(db, "workSites"), where("companyId", "==", profile.companyId)),
      (snap) => setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubTrainings = onSnapshot(
      query(collection(db, "safetyTrainings"), where("companyId", "==", profile.companyId)),
      (snap) => setTrainings(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubAttendance = onSnapshot(
      query(collection(db, "trainingAttendance"), where("companyId", "==", profile.companyId)),
      (snap) => setAttendance(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubSites();
      unsubTrainings();
      unsubAttendance();
    };
  }, [profile?.companyId]);

  const sortedTrainings = useMemo(
    () => [...trainings].sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [trainings]
  );

  const attendeesFor = (trainingId) => attendance.filter((a) => a.trainingId === trainingId);

  const submit = async (e) => {
    e.preventDefault();
    const site = workSites.find((s) => s.id === form.siteId);
    await addDoc(collection(db, "safetyTrainings"), {
      companyId: profile.companyId,
      title: form.title,
      date: form.date,
      siteId: form.siteId || null,
      siteName: site?.name || "",
      content: form.content,
      createdAt: serverTimestamp(),
    });
    setForm({ title: "", date: "", siteId: "", content: "" });
    setOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-ink">안전교육 (TBM)</h1>
          <p className="text-sm text-muted">교육 등록 및 참석 서명현황</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <ShieldCheck size={16} /> 교육 등록
        </Button>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="px-4 py-3 font-medium">제목</th>
              <th className="px-4 py-3 font-medium">일시</th>
              <th className="px-4 py-3 font-medium">근무지</th>
              <th className="px-4 py-3 font-medium">참석 서명</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sortedTrainings.map((t) => (
              <tr key={t.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 text-ink">{t.title}</td>
                <td className="px-4 py-3 text-muted">{formatDate(t.date)}</td>
                <td className="px-4 py-3 text-muted">{t.siteName || "-"}</td>
                <td className="px-4 py-3">
                  <Badge tone="primary">{attendeesFor(t.id).length}명 서명</Badge>
                </td>
                <td className="px-4 py-3">
                  <button className="text-muted hover:text-primary" title="보기" onClick={() => setViewing(t)}>
                    <Eye size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {sortedTrainings.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-xs text-muted">
                  등록된 안전교육이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="안전교육 등록"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={submit} disabled={!form.title || !form.date}>
              등록
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">제목</span>
            <input
              required
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="예: 물류센터 지게차 안전교육"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">교육일자</span>
              <input
                required
                type="date"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">근무지</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={form.siteId}
                onChange={(e) => setForm((f) => ({ ...f, siteId: e.target.value }))}
              >
                <option value="">전체</option>
                {workSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">교육 내용</span>
            <textarea
              rows={5}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="교육 내용을 입력하세요"
            />
          </label>
        </form>
      </Modal>

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.title} size="lg" footer={<Button onClick={() => setViewing(null)}>닫기</Button>}>
        {viewing && (
          <div>
            <p className="mb-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-xs leading-relaxed">
              {viewing.content || "등록된 내용이 없습니다."}
            </p>
            <p className="mb-2 text-sm font-semibold text-ink">참석 서명 ({attendeesFor(viewing.id).length}명)</p>
            <div className="space-y-2">
              {attendeesFor(viewing.id).map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
                  <div>
                    <p className="text-sm text-ink">{a.employeeName}</p>
                    <p className="text-[11px] text-muted">{a.signedAt}</p>
                  </div>
                  <img src={a.signatureDataUrl} alt="서명" className="h-10 rounded border border-slate-200 bg-white" />
                </div>
              ))}
              {attendeesFor(viewing.id).length === 0 && <p className="text-xs text-muted">아직 서명한 근로자가 없습니다.</p>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
