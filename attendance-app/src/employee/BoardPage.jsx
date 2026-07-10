import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { ChevronRight, MessageSquarePlus, Pin } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { formatDate } from "../utils/dateUtils";

const TOP_TABS = ["공지", "문의하기"];

export default function BoardPage() {
  const [tab, setTab] = useState("공지");
  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex flex-nowrap overflow-x-auto rounded-xl border border-slate-100 bg-white">
        {TOP_TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 px-4 py-2.5 text-sm font-semibold ${tab === t ? "bg-primary-dark text-white" : "text-muted"}`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "공지" && <NoticeTab />}
      {tab === "문의하기" && <InquiryTab />}
    </div>
  );
}

function NoticeTab() {
  const { profile } = useAuth();
  const [posts, setPosts] = useState([]);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(query(collection(db, "posts"), where("companyId", "==", profile.companyId)), (snap) =>
      setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId]);

  const sorted = useMemo(
    () =>
      [...posts].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      }),
    [posts]
  );

  return (
    <div className="space-y-3">
      <div className="px-0.5">
        <p className="text-sm font-semibold text-ink">공지사항</p>
        <p className="mt-0.5 text-xs text-muted">회사의 새로운 소식과 안내를 확인하세요</p>
      </div>
      {sorted.length === 0 ? (
        <Card className="flex flex-col items-center gap-1 p-8 text-center">
          <p className="text-sm font-medium text-ink">등록된 공지사항이 없습니다</p>
          <p className="text-xs text-muted">새 소식이 있으면 이 곳에 안내됩니다.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {sorted.map((p, idx) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setViewing(p)}
              className={`flex w-full items-center gap-2 px-4 py-3.5 text-left active:bg-slate-50 ${idx > 0 ? "border-t border-slate-100" : ""}`}
            >
              {p.pinned && (
                <span className="shrink-0 rounded bg-primary-dark px-1.5 py-0.5 text-[10px] font-bold text-white">중요</span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{p.title}</span>
              <span className="shrink-0 text-xs text-muted">
                {p.createdAt?.toDate ? formatDate(p.createdAt.toDate().toISOString().slice(0, 10)) : ""}
              </span>
              <ChevronRight size={15} className="shrink-0 text-muted" />
            </button>
          ))}
        </div>
      )}

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title="공지사항 상세" footer={<Button className="w-full" onClick={() => setViewing(null)}>닫기</Button>}>
        {viewing && (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-1.5 font-semibold text-ink">
              {viewing.pinned && <Badge tone="primary">고정</Badge>}
              {viewing.title}
            </p>
            <p className="text-xs text-muted">
              {viewing.authorName} ·{" "}
              {viewing.createdAt?.toDate ? formatDate(viewing.createdAt.toDate().toISOString().slice(0, 10)) : ""}
            </p>
            <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-ink">{viewing.content}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

const STATUS_TONE = { 답변대기: "warning", 답변완료: "success" };

function InquiryTab() {
  const { profile, user } = useAuth();
  const toast = useToast();
  const [admins, setAdmins] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [open, setOpen] = useState(false);
  const [adminSearch, setAdminSearch] = useState("");
  const [form, setForm] = useState({ toUid: "", subject: "", message: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "admin")), (snap) =>
        setAdmins(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "inquiries"), where("fromUid", "==", user.uid)), (snap) =>
        setInquiries(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId, user?.uid]);

  const sorted = [...inquiries].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  const filteredAdmins = admins.filter((a) => !adminSearch.trim() || a.name?.includes(adminSearch.trim()));

  const openNew = () => {
    setForm({ toUid: "", subject: "", message: "" });
    setAdminSearch("");
    setOpen(true);
  };

  const submit = async () => {
    const target = admins.find((a) => a.id === form.toUid);
    if (!target || !form.subject.trim() || !form.message.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "inquiries"), {
        companyId: profile.companyId,
        fromUid: user.uid,
        fromName: profile.name,
        toUid: target.id,
        toName: target.name,
        toPosition: target.position || "",
        toTeam: target.team || "",
        subject: form.subject,
        message: form.message,
        status: "답변대기",
        reply: "",
        createdAt: serverTimestamp(),
      });
      toast.success("문의가 접수되었습니다");
      setOpen(false);
    } catch (err) {
      toast.error(`문의 등록에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button className="w-full" onClick={openNew}>
        <MessageSquarePlus size={16} /> 새 문의 작성
      </Button>
      {sorted.length === 0 && <p className="text-xs text-muted">작성한 문의가 없습니다.</p>}
      {sorted.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {sorted.map((q, idx) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setViewing(q)}
              className={`flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left active:bg-slate-50 ${idx > 0 ? "border-t border-slate-100" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{q.subject}</p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {q.toName}{q.toPosition ? ` (${q.toPosition})` : ""}
                  {q.createdAt?.toDate ? ` · ${formatDate(q.createdAt.toDate().toISOString().slice(0, 10))}` : ""}
                </p>
              </div>
              <Badge tone={STATUS_TONE[q.status] || "muted"}>{q.status}</Badge>
            </button>
          ))}
        </div>
      )}

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title="문의 상세" footer={<Button className="w-full" onClick={() => setViewing(null)}>닫기</Button>}>
        {viewing && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 flex-1 truncate font-semibold text-ink">{viewing.subject}</p>
              <Badge tone={STATUS_TONE[viewing.status] || "muted"}>{viewing.status}</Badge>
            </div>
            <p className="text-xs text-muted">
              {viewing.toName}{viewing.toPosition ? ` (${viewing.toPosition})` : ""}
              {viewing.createdAt?.toDate ? ` · ${formatDate(viewing.createdAt.toDate().toISOString().slice(0, 10))}` : ""}
            </p>
            <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-ink">{viewing.message}</p>
            {viewing.reply && (
              <div className="rounded-xl bg-primary-light/40 p-3">
                <p className="mb-1 text-xs font-semibold text-primary">답변</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{viewing.reply}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="새 문의 작성"
        footer={
          <Button className="w-full" onClick={submit} disabled={saving || !form.toUid || !form.subject.trim() || !form.message.trim()}>
            {saving ? "등록 중..." : "문의 보내기"}
          </Button>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">받는 사람 검색</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              placeholder="이름으로 검색"
              value={adminSearch}
              onChange={(e) => setAdminSearch(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">받는 사람 선택</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.toUid}
              onChange={(e) => setForm((f) => ({ ...f, toUid: e.target.value }))}
            >
              <option value="">선택</option>
              {filteredAdmins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.position ? ` / ${a.position}` : ""}{a.team ? ` / ${a.team}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">제목</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">내용</span>
            <textarea
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              rows={4}
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            />
          </label>
          <p className="text-xs text-muted">문의 내용은 본인과 선택한 담당자만 확인할 수 있습니다.</p>
        </div>
      </Modal>
    </div>
  );
}
