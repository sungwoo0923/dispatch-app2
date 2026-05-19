import { useState, useEffect } from "react";
import { db, auth } from "../../firebase";
import { collection, query, where, getDocs, addDoc, orderBy, limit, serverTimestamp } from "firebase/firestore";

export default function ShipperInquiry() {
  const user = auth.currentUser;
  const [tab, setTab] = useState("list");
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState({ title: "", content: "" });
  const [submitting, setSubmitting] = useState(false);
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    if (!user) return;
    import("firebase/firestore").then(({ doc, getDoc }) => {
      getDoc(doc(db, "users", user.uid)).then(snap => {
        if (snap.exists()) setUserData(snap.data());
      });
    });
  }, [user]);

  const loadInquiries = () => {
    if (!user) return;
    getDocs(query(collection(db, "inquiries"), where("userId", "==", user.uid), orderBy("createdAt", "desc"), limit(100)))
      .then(snap => setInquiries(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => setInquiries([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadInquiries(); }, [user]);

  const submit = async () => {
    if (!form.title.trim() || !form.content.trim()) { alert("제목과 내용을 입력하세요."); return; }
    setSubmitting(true);
    try {
      await addDoc(collection(db, "inquiries"), {
        title: form.title,
        content: form.content,
        userId: user.uid,
        company: userData?.company || "",
        name: userData?.name || user.email,
        status: "접수중",
        createdAt: serverTimestamp(),
      });
      alert("문의가 등록되었습니다.");
      setForm({ title: "", content: "" });
      setTab("list");
      loadInquiries();
    } catch (e) {
      alert("등록 실패: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const fmtDate = (ts) => {
    if (!ts) return "-";
    const d = ts?.toDate ? ts.toDate() : null;
    if (!d) return "";
    return new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  };

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none";

  return (
    <div className="bg-white rounded-xl px-8 py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-[20px] font-bold text-gray-800">문의사항</h2>
          <p className="text-sm text-gray-400 mt-0.5">서비스 이용 중 궁금한 점을 문의해주세요</p>
        </div>
        <button onClick={() => setTab("write")}
          className="bg-[#2f3e55] text-white px-4 py-2 text-sm rounded-md font-medium hover:bg-[#1e3a5f]">
          + 문의하기
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-1 w-fit">
        {[{ v: "list", label: "문의내역" }, { v: "write", label: "문의하기" }].map(t => (
          <button key={t.v} onClick={() => setTab(t.v)}
            className={`px-5 py-1.5 rounded-md text-sm font-semibold transition ${tab === t.v ? "bg-white text-gray-800 shadow" : "text-gray-500"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "list" && (
        loading ? (
          <div className="py-20 text-center text-gray-400">불러오는 중...</div>
        ) : inquiries.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <div className="text-base font-medium mb-1">등록된 문의가 없습니다</div>
            <div className="text-sm text-gray-300 mb-4">궁금한 사항을 문의해주세요</div>
            <button onClick={() => setTab("write")} className="bg-[#2f3e55] text-white px-5 py-2 rounded-lg text-sm font-semibold">
              문의하기
            </button>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {inquiries.map((q, idx) => (
              <div key={q.id} className={idx > 0 ? "border-t border-gray-100" : ""}>
                <button
                  className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-gray-50 transition"
                  onClick={() => setExpanded(expanded === q.id ? null : q.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">{q.title}</div>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${q.status === "답변완료" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    {q.status || "접수중"}
                  </span>
                  <div className="text-xs text-gray-400 shrink-0">{fmtDate(q.createdAt)}</div>
                  <span className="text-gray-400 text-sm shrink-0">{expanded === q.id ? "▲" : "▼"}</span>
                </button>
                {expanded === q.id && (
                  <div className="px-6 pb-5 bg-gray-50 border-t border-gray-100 space-y-4">
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-1 pt-4">문의 내용</div>
                      <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{q.content}</div>
                    </div>
                    {q.reply && (
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                        <div className="text-xs font-semibold text-blue-600 mb-1">답변</div>
                        <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{q.reply}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {tab === "write" && (
        <div className="max-w-[600px] space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">제목 *</label>
            <input className={inputCls} value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} placeholder="문의 제목을 입력하세요" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">내용 *</label>
            <textarea className={inputCls + " resize-none h-40"} value={form.content}
              onChange={(e) => setForm(p => ({ ...p, content: e.target.value }))} placeholder="문의 내용을 상세히 작성해주세요" />
          </div>
          <div className="text-xs text-gray-400">
            회사: {userData?.company || "-"} · 담당자: {userData?.name || user?.email}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setTab("list")} className="flex-1 border py-2.5 rounded-lg text-sm font-medium">취소</button>
            <button onClick={submit} disabled={submitting}
              className="flex-1 bg-[#2f3e55] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1e3a5f] disabled:opacity-50">
              {submitting ? "등록 중..." : "문의 등록"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
