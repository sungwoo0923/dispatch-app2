import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Bell } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";

// 모바일 상단 헤더 오른쪽의 아이콘 묶음 — 알림종만 우선 들어가고, 사내
// 메신저 아이콘도 이 자리에 나란히 추가될 예정이다. 예전에 있던 이름
// 이니셜 원형 아바타는 요청에 따라 제거했다.
export default function HeaderIcons() {
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
