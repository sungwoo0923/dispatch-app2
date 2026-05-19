import { useState, useEffect } from "react";
import { db, auth } from "../../firebase";
import { collection, query, where, getDocs, addDoc, orderBy, limit, serverTimestamp } from "firebase/firestore";

export default function ShipperNotice() {
  const user = auth.currentUser;
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    getDocs(query(collection(db, "notices"), orderBy("createdAt", "desc"), limit(100)))
      .then(snap => setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => setNotices([]))
      .finally(() => setLoading(false));
  }, []);

  const fmtDate = (ts) => {
    if (!ts) return "-";
    const d = ts?.toDate ? ts.toDate() : null;
    if (!d) return String(ts).slice(0, 10);
    return new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  };

  return (
    <div className="bg-white rounded-xl px-8 py-6">
      <div className="mb-6">
        <h2 className="text-[20px] font-bold text-gray-800">공지사항</h2>
        <p className="text-sm text-gray-400 mt-0.5">운영팀의 공지 및 서비스 업데이트 소식을 확인하세요</p>
      </div>

      {loading ? (
        <div className="py-20 text-center text-gray-400">불러오는 중...</div>
      ) : notices.length === 0 ? (
        <div className="py-20 text-center text-gray-400">
          <div className="text-base font-medium mb-1">등록된 공지사항이 없습니다</div>
          <div className="text-sm text-gray-300">새로운 소식이 있으면 이 곳에 안내됩니다</div>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {notices.map((n, idx) => (
            <div key={n.id} className={idx > 0 ? "border-t border-gray-100" : ""}>
              <button
                className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-gray-50 transition"
                onClick={() => setExpanded(expanded === n.id ? null : n.id)}>
                {n.pinned && (
                  <span className="shrink-0 px-2 py-0.5 rounded bg-[#2f3e55] text-white text-[11px] font-bold">
                    중요
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{n.title || "제목 없음"}</div>
                </div>
                <div className="text-xs text-gray-400 shrink-0">{fmtDate(n.createdAt)}</div>
                <span className="text-gray-400 text-sm shrink-0">{expanded === n.id ? "▲" : "▼"}</span>
              </button>
              {expanded === n.id && (
                <div className="px-6 pb-5 bg-gray-50 border-t border-gray-100">
                  <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed pt-4">{n.content || ""}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
