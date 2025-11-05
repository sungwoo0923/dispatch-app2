import React, { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  updateDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./firebase";

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ 실시간 구독 적용
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setUsers(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const approveUser = async (id) => {
    if (!window.confirm("이 사용자를 승인하시겠습니까?")) return;
    await updateDoc(doc(db, "users", id), { approved: true });
    alert("승인 완료!");
  };

  const revokeUser = async (id) => {
    if (!window.confirm("승인을 취소하시겠습니까?")) return;
    await updateDoc(doc(db, "users", id), { approved: false });
    alert("승인 취소 완료!");
  };

  const deleteUser = async (id) => {
    if (!window.confirm("이 사용자를 삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, "users", id));
    alert("삭제 완료!");
  };

  if (loading) return <div className="p-6 text-center">불러오는 중...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">👨‍💼 관리자 승인 페이지</h1>

      <table className="w-full border text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2">이메일</th>
            <th className="border p-2">이름</th>
            <th className="border p-2">권한</th>
            <th className="border p-2">승인상태</th>
            <th className="border p-2">가입일</th>
            <th className="border p-2">조작</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 && (
            <tr>
              <td colSpan="6" className="text-center p-4">
                등록된 사용자가 없습니다.
              </td>
            </tr>
          )}
          {users.map((u) => (
            <tr key={u.id} className="odd:bg-white even:bg-gray-50">
              <td className="border p-2">{u.email}</td>
              <td className="border p-2">{u.name}</td>
              <td className="border p-2">{u.role}</td>
              <td className="border p-2">
                {u.approved ? (
                  <span className="text-green-600 font-semibold">승인됨</span>
                ) : (
                  <span className="text-red-500 font-semibold">대기중</span>
                )}
              </td>
              <td className="border p-2">
                {u.createdAt?.toDate
                  ? new Date(u.createdAt.toDate()).toLocaleString("ko-KR")
                  : "-"}
              </td>
              <td className="border p-2 space-x-2">
                {!u.approved ? (
                  <button
                    onClick={() => approveUser(u.id)}
                    className="bg-green-500 text-white px-2 py-1 rounded"
                  >
                    승인
                  </button>
                ) : (
                  <button
                    onClick={() => revokeUser(u.id)}
                    className="bg-yellow-500 text-white px-2 py-1 rounded"
                  >
                    승인취소
                  </button>
                )}
                <button
                  onClick={() => deleteUser(u.id)}
                  className="bg-red-500 text-white px-2 py-1 rounded"
                >
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
