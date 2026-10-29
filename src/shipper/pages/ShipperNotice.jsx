import { useState, useEffect } from "react";
import { db, auth } from "../../firebase";
import { collection, query, where, getDocs, addDoc, serverTimestamp, getDoc, doc } from "firebase/firestore";

export default function ShipperNotice() {
  const user = auth.currentUser;
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const linkedCompanyName = userSnap.exists() ? userSnap.data()?.linkedTransportCompany?.companyName : null;
        if (!linkedCompanyName) { setNotices([]); setLoading(false); return; }

        const snap = await getDocs(query(collection(db, "notices"), where("audience", "==", "shipper")));
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(n => n.companyName === linkedCompanyName)
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
          .slice(0, 100);
        setNotices(list);
      } catch {
        setNotices([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const fmtDate = (ts) => {
    if (!ts) return "-";
    const d = ts?.toDate ? ts.toDate() : null;
    if (!d) return String(ts).slice(0, 10);
    return new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  };

  return (
    <div className="bg-white rounded-[22px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)] px-7 py-6">

      {loading ? (
        <div className="py-20 text-center text-gray-400">불러오는 중...</div>
      ) : notices.length === 0 ? (
        <div className="py-20 text-center text-gray-400">
          <div className="mx-auto mb-4 w-16 h-16 rounded-[20px] flex items-center justify-center shadow-[0_10px_24px_rgba(15,26,48,0.25)]" style={{ background: "linear-gradient(135deg,#0F1A30,#1B2B4B 55%,#2D4C82)" }}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#CFE0FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg></div>
          <div className="text-[16px] font-black text-[#0F1A30] mb-1">등록된 공지사항이 없습니다</div>
          <div className="text-sm text-gray-300">새로운 소식이 있으면 이 곳에 안내됩니다</div>
        </div>
      ) : (
        <div className="border border-[#E3E8F0] rounded-[16px] overflow-hidden">
          {notices.map((n, idx) => (
            <div key={n.id} className={idx > 0 ? "border-t border-gray-100" : ""}>
              <button
                className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-gray-50 transition"
                onClick={() => setExpanded(expanded === n.id ? null : n.id)}>
                {n.pinned && (
                  <span className="shrink-0 px-2 py-0.5 rounded bg-[#1B2B4B] text-white text-[11px] font-bold">
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
