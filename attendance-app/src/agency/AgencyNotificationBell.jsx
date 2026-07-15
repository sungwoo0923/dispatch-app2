import { useEffect, useRef, useState } from "react";
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, writeBatch } from "firebase/firestore";
import { Bell } from "lucide-react";
import { db } from "../firebase";
import { useToast } from "../hooks/useToast";
import { playChime } from "../utils/chime";

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

// 인력사무소용 알림 벨 — PC 관리자용 AdminNotificationBell과 같은 패턴이지만
// companyId 기준이 아니라 agencyId 기준으로 agencyNotifications 컬렉션을
// 구독한다. 도급사가 요청장을 등록/수정/삭제하거나 배정 변경·오더삭제
// 요청을 보낼 때마다 여기 이력이 쌓인다.
export default function AgencyNotificationBell({ agencyId }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const seenIdsRef = useRef(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!agencyId) return;
    const unsub = onSnapshot(
      query(collection(db, "agencyNotifications"), where("agencyId", "==", agencyId), orderBy("createdAt", "desc"), limit(50)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (initializedRef.current) {
          const fresh = list.filter((n) => n.createdAt && !seenIdsRef.current.has(n.id));
          if (fresh.length > 0) playChime();
          fresh.forEach((n) => toast.success(`🔔 ${n.title}`));
        }
        list.forEach((n) => seenIdsRef.current.add(n.id));
        initializedRef.current = true;
        setItems(list);
      },
      (err) => toast.error(`알림을 불러오지 못했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`)
    );
    return () => unsub();
  }, [agencyId]);

  useEffect(() => {
    if (!agencyId) return;
    const unsub = onSnapshot(
      query(collection(db, "agencyNotifications"), where("agencyId", "==", agencyId), where("read", "==", false)),
      (snap) => setUnread(snap.size)
    );
    return () => unsub();
  }, [agencyId]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (!e.target.closest("[data-agency-bell]")) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const markAllRead = async () => {
    const targets = items.filter((n) => !n.read);
    if (targets.length === 0) return;
    const batch = writeBatch(db);
    targets.forEach((n) => batch.update(doc(db, "agencyNotifications", n.id), { read: true }));
    await batch.commit();
  };

  const openOne = (n) => {
    if (!n.read) updateDoc(doc(db, "agencyNotifications", n.id), { read: true }).catch(() => {});
  };

  return (
    <div className="relative" data-agency-bell>
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
