// src/AdminApprovalPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { auth, db } from "./firebase";
import { collection, getDocs, updateDoc, deleteDoc, doc } from "firebase/firestore";

const headBase = "border px-2 py-2 whitespace-nowrap bg-gray-100 text-center";
const cellBase = "border px-2 py-1 text-center whitespace-nowrap align-middle min-w-[120px]";

export default function AdminApprovalPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const me = auth.currentUser;

  // ✅ 유저 목록 불러오기
  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "users"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRows(
        list.sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")))
      );
    } catch (e) {
      console.error(e);
      alert("유저 목록 로딩 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // ✅ 승인
  const approve = async (id) => {
    if (!confirm("해당 사용자를 승인하시겠습니까?")) return;
    await updateDoc(doc(db, "users", id), {
      approved: true,
      approvedAt: new Date(),
    });
    alert("✅ 승인 완료!");
    await load();
  };

  // ✅ 승인 해제(거절)
  const reject = async (id) => {
    if (!confirm("해당 사용자의 승인을 해제(거절)하시겠습니까?")) return;
    await updateDoc(doc(db, "users", id), {
      approved: false,
      rejectedAt: new Date(),
    });
    alert("⏳ 승인 해제 완료!");
    await load();
  };

  // ✅ 삭제
  const removeUser = async (id, email) => {
    if (me?.uid === id) {
      alert("본인 계정은 삭제할 수 없습니다.");
      return;
    }
    if (!confirm(`정말 삭제하시겠습니까?\n(${email})`)) return;
    await deleteDoc(doc(db, "users", id));
    alert("❌ 삭제 완료!");
    await load();
  };

  // ✅ 요약 통계
  const stats = useMemo(() => {
    const total = rows.length;
    const approved = rows.filter((r) => r.approved).length;
    const pending = total - approved;
    return { total, approved, pending };
  }, [rows]);

  return (
    <div className="p-4 animate-fadeIn">
      {/* 🔴 Tailwind 작동 테스트용 박스 */}
      <div className="p-4 mb-4 bg-red-600 text-white font-bold text-center rounded-lg shadow-md">
        🚨 Tailwind 작동 테스트 박스 (이게 보이면 Tailwind 정상 작동 중)
      </div>

      <h2 className="text-lg font-bold mb-3">가입 승인 관리</h2>

      {/* ✅ 요약 영역 */}
      <div className="flex gap-2 text-sm mb-3">
        <span className="px-2 py-1 bg-gray-100 rounded">전체 {stats.total}명</span>
        <span className="px-2 py-1 bg-green-100 text-green-700 rounded">
          승인 {stats.approved}명
        </span>
        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded">
          대기 {stats.pending}명
        </span>
        <button
          onClick={load}
          className="ml-auto px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded"
        >
          새로고침
        </button>
      </div>

      {/* ✅ 테이블 */}
      {loading ? (
        <p>로딩 중…</p>
      ) : (
        <table className="w-full border text-sm">
          <thead>
            <tr>
              <th className={headBase}>이메일</th>
              <th className={headBase}>이름</th>
              <th className={headBase}>승인상태</th>
              <th className={headBase}>역할</th>
              <th className={headBase}>처리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const isMe = me?.uid === u.id;
              const disableAll = false; // ✅ 관리자 테스트용: 항상 활성화

              return (
                <tr key={u.id} className="odd:bg-white even:bg-gray-50">
                  <td className={cellBase}>{u.email || ""}</td>
                  <td className={cellBase}>{u.name || "이름없음"}</td>
                  <td className={cellBase}>
                    {u.approved ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-100 text-green-700 font-semibold">
                        ✅ 승인됨
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-yellow-100 text-yellow-700 font-semibold">
                        ⏳ 대기중
                      </span>
                    )}
                  </td>
                  <td className={cellBase}>{u.role || "user"}</td>
                  <td className={cellBase}>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => approve(u.id)}
                        disabled={disableAll || !!u.approved}
                        className={`px-3 py-1 rounded text-white transition ${
                          u.approved
                            ? "bg-gray-300 cursor-not-allowed"
                            : "bg-green-600 hover:bg-green-700"
                        }`}
                      >
                        승인
                      </button>
                      <button
                        onClick={() => reject(u.id)}
                        disabled={disableAll || !u.approved}
                        className={`px-3 py-1 rounded text-white transition ${
                          !u.approved
                            ? "bg-gray-300 cursor-not-allowed"
                            : "bg-yellow-500 hover:bg-yellow-600"
                        }`}
                      >
                        거절
                      </button>
                      <button
                        onClick={() => removeUser(u.id, u.email)}
                        disabled={disableAll}
                        className={`px-3 py-1 rounded text-white transition ${
                          disableAll
                            ? "bg-gray-300 cursor-not-allowed"
                            : "bg-red-600 hover:bg-red-700"
                        }`}
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-4 text-gray-500">
                  표시할 사용자가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
