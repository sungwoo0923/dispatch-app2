import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Trash2, Plus, MessageSquare, Pin } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import { formatDate } from "../utils/dateUtils";

// 공지 제목은 사용자가 따로 입력하지 않고 "작성한 날짜 + 공지사항"으로
// 자동 생성한다 (예: "2026년 07월 10일 공지사항").
function autoTitle(d = new Date()) {
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일 공지사항`;
}

export default function Board() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const [posts, setPosts] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ content: "", pinned: false });

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

  const openNew = () => {
    setForm({ content: "", pinned: false });
    setModalOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    const now = new Date();
    await addDoc(collection(db, "posts"), {
      companyId: profile.companyId,
      title: autoTitle(now),
      content: form.content,
      pinned: form.pinned,
      authorName: profile.name,
      createdAt: serverTimestamp(),
    });
    setForm({ content: "", pinned: false });
    setModalOpen(false);
  };

  const remove = async (p) => {
    if (!(await confirm(`"${p.title}" 공지를 삭제하시겠습니까?`, "delete"))) return;
    await deleteDoc(doc(db, "posts", p.id));
    setViewing(null);
  };

  return (
    <div className="space-y-6">
      <Panel icon={MessageSquare} title={`게시판 (${sorted.length}건)`}>
        <p className="mb-4 text-xs text-muted">전 직원에게 공지할 소식을 작성하고 관리합니다.</p>
        {sorted.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-sm font-medium text-ink">등록된 공지사항이 없습니다</p>
            <p className="mt-1 text-xs text-muted">새 소식이 있으면 이 곳에 안내됩니다.</p>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-dark text-xs font-semibold text-white">
                  <th className="w-24 px-4 py-3 text-center">날짜</th>
                  <th className="px-4 py-3 text-center">제목</th>
                  <th className="w-32 px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={openNew}
                      className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/25"
                    >
                      <Plus size={13} /> 등록
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, idx) => (
                  <tr
                    key={p.id}
                    onClick={() => setViewing(p)}
                    className={`cursor-pointer text-center hover:bg-slate-50 ${idx > 0 ? "border-t border-slate-100" : ""}`}
                  >
                    <td className="px-4 py-3 text-xs text-muted">
                      {p.createdAt?.toDate ? formatDate(p.createdAt.toDate().toISOString().slice(0, 10)).slice(5) : ""}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                        {p.pinned && <Pin size={13} className="shrink-0 text-primary" />}
                        {p.title}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted">{p.authorName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            <Button onClick={submit} disabled={!form.content.trim()}>
              등록
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs text-muted">
            제목은 "{autoTitle()}"처럼 등록일 기준으로 자동 생성됩니다.
          </p>
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

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title="공지사항 상세"
        footer={
          <>
            <Button variant="outline" onClick={() => remove(viewing)}>
              <Trash2 size={14} /> 삭제
            </Button>
            <Button onClick={() => setViewing(null)}>닫기</Button>
          </>
        }
      >
        {viewing && (
          <div className="space-y-3 text-sm">
            <div>
              <span className="mb-1 block text-xs font-medium text-muted">제목</span>
              <p className="flex items-center gap-1.5 font-semibold text-ink">
                {viewing.pinned && <Badge tone="primary">고정</Badge>}
                {viewing.title}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="mb-1 block text-xs font-medium text-muted">작성자</span>
                <p className="text-ink">{viewing.authorName}</p>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-muted">작성일</span>
                <p className="text-ink">
                  {viewing.createdAt?.toDate ? formatDate(viewing.createdAt.toDate().toISOString().slice(0, 10)) : "-"}
                </p>
              </div>
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-muted">내용</span>
              <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 leading-relaxed text-ink">{viewing.content}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
