import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Bell, MessageCircle } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";

// 모바일 상단 헤더 오른쪽의 아이콘 묶음. 예전에 있던 이름 이니셜 원형
// 아바타 자리를 사내 메신저 진입 버튼(말풍선)이 대신하고, 그 옆에 알림종을
// 둔다.
export default function HeaderIcons({ onMessengerClick, messengerUnread = 0 }) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "notifications"), where("uid", "==", user.uid), where("read", "==", false)),
      (snap) => setUnread(snap.size)
    );
    return () => unsub();
  }, [user]);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onMessengerClick}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-slate-50"
      >
        <MessageCircle size={20} />
        {messengerUnread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
            {messengerUnread > 99 ? "99+" : messengerUnread}
          </span>
        )}
      </button>
      <Link
        to="/notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-slate-50"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-2 w-2 items-center justify-center rounded-full bg-danger" />
        )}
      </Link>
    </div>
  );
}
