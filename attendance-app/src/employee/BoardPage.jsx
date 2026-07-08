import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { Pin, ChevronDown, MessageSquarePlus } from "lucide-react";
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
  const [openId, setOpenId] = useState(null);

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
      {sorted.length === 0 && <p className="text-xs text-muted">등록된 게시글이 없습니다.</p>}
      {sorted.map((p) => {
        const isOpen = openId === p.id;
        return (
          <Card key={p.id} className="p-0">
            <button
              className="flex w-full items-center justify-between px-4 py-3.5 text-left"
              onClick={() => setOpenId(isOpen ? null : p.id)}
            >
              <div className="flex min-w-0 items-center gap-2">
                {p.pinned && <Pin size={13} className="shrink-0 text-primary" />}
                <span className="truncate text-sm font-medium text-ink">{p.title}</span>
                {p.pinned && <Badge tone="primary">고정</Badge>}
              </div>
              <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="border-t border-slate-100 px-4 py-3.5">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted">{p.content}</p>
                <p className="mt-3 text-[11px] text-muted">
                  {p.authorName} ·{" "}
                  {p.createdAt?.toDate ? formatDate(p.createdAt.toDate().toISOString().slice(0, 10)) : ""}
                </p>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

const STATUS_TONE = { 답변대기: "warning", 답변완료: "success" };

function InquiryTab() {
  const { profile, user } = useAuth();
  const toast = useToast();
  const [admins, setAdmins] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [openId, setOpenId] = useState(null);
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
      {sorted.map((q) => {
        const isOpen = openId === q.id;
        return (
          <Card key={q.id} className="p-0">
            <button
              className="flex w-full items-center justify-between px-4 py-3.5 text-left"
              onClick={() => setOpenId(isOpen ? null : q.id)}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{q.subject}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {q.toName}{q.toPosition ? ` (${q.toPosition})` : ""}
                  {q.createdAt?.toDate ? ` · ${formatDate(q.createdAt.toDate().toISOString().slice(0, 10))}` : ""}
                </p>
              </div>
              <Badge tone={STATUS_TONE[q.status] || "muted"}>{q.status}</Badge>
            </button>
            {isOpen && (
              <div className="space-y-2 border-t border-slate-100 px-4 py-3.5">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink">{q.message}</p>
                {q.reply && (
                  <div className="rounded-xl bg-primary-light/40 p-3">
                    <p className="mb-1 text-[11px] font-semibold text-primary">답변</p>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink">{q.reply}</p>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}

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
          <p className="text-[11px] text-muted">문의 내용은 본인과 선택한 담당자만 확인할 수 있습니다.</p>
        </div>
      </Modal>
    </div>
  );
}
