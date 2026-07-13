import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { ArrowLeft, Bell, CheckCheck, Trash2 } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import Card from "../components/Card";

function timeAgo(createdAt) {
  const ms = createdAt?.seconds ? createdAt.seconds * 1000 : createdAt ? new Date(createdAt).getTime() : null;
  if (!ms) return "";
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  const d = new Date(ms);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const autoClearedRef = useRef(false);

  // uid + createdAt 정렬 조합은 복합 인덱스가 있어야 동작하는데
  // firestore.indexes.json에 빠져있었다 — 인덱스 없이 쿼리하면
  // failed-precondition 오류가 나서 onSnapshot 성공 콜백이 아예
  // 호출되지 않고, 그 전까지 로컬 캐시에 남아있던 다른 화면(헤더 종
  // 아이콘 등)의 데이터만 잠깐 보이다가 다시 열면 텅 비어 보이는
  // 원인이었다. 인덱스를 추가했고, 혹시 배포 전이라 여전히 실패하면
  // 조용히 사라지는 대신 에러 토스트로 알린다.
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "notifications"), where("uid", "==", user.uid), orderBy("createdAt", "desc"), limit(100)),
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => toast.error(`알림 목록을 불러오지 못했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`)
    );
    return () => unsub();
  }, [user]);

  // 알림이 30개 이상 쌓이면 자동으로 전체삭제한다(30개 미만은 계속 남아있음).
  useEffect(() => {
    if (items.length >= 30 && !autoClearedRef.current) {
      autoClearedRef.current = true;
      const batch = writeBatch(db);
      items.forEach((n) => batch.delete(doc(db, "notifications", n.id)));
      batch.commit().catch(() => {});
    } else if (items.length < 30) {
      autoClearedRef.current = false;
    }
  }, [items]);

  const unreadCount = items.filter((n) => !n.read).length;

  const toggleSelected = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const markAllRead = async () => {
    const unread = items.filter((n) => !n.read);
    if (unread.length === 0) return;
    const batch = writeBatch(db);
    unread.forEach((n) => batch.update(doc(db, "notifications", n.id), { read: true }));
    await batch.commit();
    toast.success("모두 읽음 처리되었습니다");
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!(await confirm(`선택된 알림 ${selected.size}건을 삭제하시겠습니까?`, "delete"))) return;
    const batch = writeBatch(db);
    selected.forEach((id) => batch.delete(doc(db, "notifications", id)));
    await batch.commit();
    setSelected(new Set());
    setSelectMode(false);
    toast.success("삭제되었습니다");
  };

  const deleteAll = async () => {
    if (items.length === 0) return;
    if (!(await confirm("알림을 모두 삭제하시겠습니까?", "delete"))) return;
    const batch = writeBatch(db);
    items.forEach((n) => batch.delete(doc(db, "notifications", n.id)));
    await batch.commit();
    toast.success("모두 삭제되었습니다");
  };

  const openOne = (n) => {
    if (selectMode) {
      toggleSelected(n.id);
      return;
    }
    if (!n.read) updateDoc(doc(db, "notifications", n.id), { read: true });
    if (n.link) navigate(n.link);
  };

  return (
    <div className="min-h-screen bg-surface pb-8">
      <div className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3.5">
        <Link to="/" className="flex items-center gap-1 text-sm font-semibold text-ink">
          <ArrowLeft size={18} /> 알림
        </Link>
        <div className="flex items-center gap-3 text-xs font-medium text-muted">
          <button type="button" className="flex items-center gap-1 hover:text-primary" onClick={markAllRead}>
            <CheckCheck size={14} /> 전체읽음
          </button>
          {selectMode ? (
            <>
              <button type="button" className="text-danger hover:underline" onClick={deleteSelected}>
                선택삭제 ({selected.size})
              </button>
              <button
                type="button"
                className="text-muted hover:text-ink"
                onClick={() => {
                  setSelectMode(false);
                  setSelected(new Set());
                }}
              >
                취소
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setSelectMode(true)} className="hover:text-primary">
                선택
              </button>
              <button type="button" className="flex items-center gap-1 text-danger hover:underline" onClick={deleteAll}>
                <Trash2 size={14} /> 전체삭제
              </button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-2 px-4 pt-4">
        {items.length === 0 && (
          <Card className="flex flex-col items-center gap-2 p-10 text-center">
            <Bell size={26} className="text-muted" />
            <p className="text-sm text-muted">받은 알림이 없습니다.</p>
          </Card>
        )}
        {items.map((n) => (
          <button key={n.id} type="button" onClick={() => openOne(n)} className="block w-full text-left">
            <Card
              className={`flex items-start gap-3 p-4 ${!n.read ? "border-primary/20 bg-primary-light/30" : "border-slate-100"}`}
            >
              {selectMode ? (
                <input
                  type="checkbox"
                  checked={selected.has(n.id)}
                  onChange={() => toggleSelected(n.id)}
                  className="mt-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${!n.read ? "bg-primary" : "bg-transparent"}`} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm ${!n.read ? "font-semibold text-ink" : "font-medium text-ink"}`}>{n.title}</p>
                  <span className="shrink-0 text-[10px] text-muted">{timeAgo(n.createdAt)}</span>
                </div>
                {n.message && <p className="mt-0.5 text-xs leading-relaxed text-muted">{n.message}</p>}
              </div>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
