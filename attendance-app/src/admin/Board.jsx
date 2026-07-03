import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Pin, Trash2, ChevronDown, Plus, MessageSquare } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
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
      <div className="space-y-2">
        {sorted.map((p) => {
          const isOpen = openId === p.id;
          return (
            <Card key={p.id} className="p-0">
              <button
                className="flex w-full items-center justify-between px-5 py-4 text-left"
                onClick={() => setOpenId(isOpen ? null : p.id)}
              >
                <div className="flex items-center gap-2">
                  {p.pinned && <Pin size={14} className="text-primary" />}
                  <span className="text-sm font-medium text-ink">{p.title}</span>
                  {p.pinned && <Badge tone="primary">고정</Badge>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted">
                    {p.createdAt?.toDate ? formatDate(p.createdAt.toDate().toISOString().slice(0, 10)) : ""}
                  </span>
                  <ChevronDown size={16} className={`text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-slate-100 px-5 py-4">
                  <p className="whitespace-pre-wrap text-sm text-muted">{p.content}</p>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted">
                    <span>작성자: {p.authorName}</span>
                    <button className="flex items-center gap-1 hover:text-danger" onClick={() => remove(p.id)}>
                      <Trash2 size={13} /> 삭제
                    </button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        {sorted.length === 0 && (
          <Card className="p-6 text-center text-xs text-muted">등록된 게시글이 없습니다.</Card>
        )}
      </div>
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
