import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, writeBatch } from "firebase/firestore";
import { Bell } from "lucide-react";
import { db } from "../firebase";
import { useToast } from "../hooks/useToast";

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

// PC 관리자용 알림 벨. 직원 모바일의 HeaderIcons/NotificationsPage와 같은
// notifications 컬렉션을 uid(관리자 uid) 기준으로 구독한다는 점은 같지만,
// 관리자는 화면을 오래 켜둔 채로 작업하는 경우가 많아 "새 알림이 오면
// 그 순간 바로 안다"가 중요해서 드롭다운 목록뿐 아니라 실시간 토스트도
// 함께 띄운다.
export default function AdminNotificationBell({ adminUid }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const seenIdsRef = useRef(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!adminUid) return;
    // uid + orderBy(createdAt) 조합은 복합 인덱스가 필요하다 — 인덱스가
    // 없으면 onSnapshot이 값 없이 조용히 실패하므로, 에러 콜백에서 반드시
    // 토스트로 원인을 드러낸다(직원용 NotificationsPage와 동일한 교훈).
    const unsub = onSnapshot(
      query(collection(db, "notifications"), where("uid", "==", adminUid), orderBy("createdAt", "desc"), limit(50)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (initializedRef.current) {
          const fresh = list.filter((n) => n.createdAt && !seenIdsRef.current.has(n.id));
          fresh.forEach((n) => toast.success(`🔔 ${n.title}`));
        }
        list.forEach((n) => seenIdsRef.current.add(n.id));
        initializedRef.current = true;
        setItems(list);
      },
      (err) => toast.error(`관리자 알림을 불러오지 못했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`)
    );
    return () => unsub();
  }, [adminUid]);

  useEffect(() => {
    if (!adminUid) return;
    const unsub = onSnapshot(
      query(collection(db, "notifications"), where("uid", "==", adminUid), where("read", "==", false)),
      (snap) => setUnread(snap.size)
    );
    return () => unsub();
  }, [adminUid]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (!e.target.closest("[data-admin-bell]")) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const markAllRead = async () => {
    const targets = items.filter((n) => !n.read);
    if (targets.length === 0) return;
    const batch = writeBatch(db);
    targets.forEach((n) => batch.update(doc(db, "notifications", n.id), { read: true }));
    await batch.commit();
  };

  const openOne = (n) => {
    if (!n.read) updateDoc(doc(db, "notifications", n.id), { read: true }).catch(() => {});
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="relative" data-admin-bell>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-slate-50"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 max-h-96 w-80 overflow-y-auto rounded-2xl border border-slate-100 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-ink">알림</p>
            {unread > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs font-medium text-primary hover:underline">
                모두 읽음
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted">알림이 없습니다.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => openOne(n)}
                className={`block w-full border-b border-slate-50 px-4 py-3 text-left last:border-0 hover:bg-slate-50 ${
                  n.read ? "" : "bg-primary-light/30"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />}
                  <p className="truncate text-xs font-semibold text-ink">{n.title}</p>
                </div>
                {n.message && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{n.message}</p>}
                {n.createdAt && <p className="mt-1 text-[10px] text-slate-400">{timeAgo(n.createdAt)}</p>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
