import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Trash2, ChevronDown, Plus, MessageSquare } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import { formatDate } from "../utils/dateUtils";

export default function Board() {
  const { profile } = useAuth();
  const [posts, setPosts] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", pinned: false });

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

  const submit = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "posts"), {
      companyId: profile.companyId,
      title: form.title,
      content: form.content,
      pinned: form.pinned,
      authorName: profile.name,
      createdAt: serverTimestamp(),
    });
    setForm({ title: "", content: "", pinned: false });
    setModalOpen(false);
  };

  const remove = (id) => deleteDoc(doc(db, "posts", id));

  return (
    <div className="space-y-6">
      <Panel
        icon={MessageSquare}
        title={`게시판 (${sorted.length}건)`}
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} /> 공지 작성
          </Button>
        }
      >
      <p className="mb-4 text-xs text-muted">전 직원에게 공지할 소식을 작성하고 관리합니다.</p>
      {sorted.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm font-medium text-ink">등록된 공지사항이 없습니다</p>
          <p className="mt-1 text-xs text-muted">새 소식이 있으면 이 곳에 안내됩니다.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          {sorted.map((p, idx) => {
            const isOpen = openId === p.id;
            return (
              <div key={p.id} className={idx > 0 ? "border-t border-slate-100" : ""}>
                <button
                  className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-50"
                  onClick={() => setOpenId(isOpen ? null : p.id)}
                >
                  {p.pinned && (
                    <span className="shrink-0 rounded bg-primary-dark px-2 py-0.5 text-[11px] font-bold text-white">
                      중요
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{p.title}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {p.createdAt?.toDate ? formatDate(p.createdAt.toDate().toISOString().slice(0, 10)) : ""}
                  </span>
                  <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50 px-6 pb-5 pt-4">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{p.content}</p>
                    <div className="mt-4 flex items-center justify-between text-xs text-muted">
                      <span>작성자: {p.authorName}</span>
                      <button className="flex items-center gap-1 hover:text-danger" onClick={() => remove(p.id)}>
                        <Trash2 size={13} /> 삭제
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </Panel>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="공지 작성"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              취소
            </Button>
            <Button onClick={submit} disabled={!form.title || !form.content}>
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
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">내용</span>
            <textarea
              required
              rows={6}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
            />
            상단 고정
          </label>
        </form>
      </Modal>
    </div>
  );
}
