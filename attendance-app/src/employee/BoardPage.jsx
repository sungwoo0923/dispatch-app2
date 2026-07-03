import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Pin, ChevronDown } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import { formatDate } from "../utils/dateUtils";

export default function BoardPage() {
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
    <div className="space-y-3 px-4 pt-4">
      <h2 className="text-sm font-semibold text-ink">게시판</h2>
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
