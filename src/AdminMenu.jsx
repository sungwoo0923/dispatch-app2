// src/AdminMenu.jsx
import React, { useEffect, useState, useMemo } from "react";
import { auth, db } from "./firebase";
import {
  collection,
  getDocs,
  setDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";

export default function AdminMenu() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");

  const headBase = "border px-2 py-2 whitespace-nowrap bg-gray-100 text-center";
  const cellBase = "border px-2 py-1 text-center whitespace-nowrap";
  const me = auth.currentUser;

  // 사용자 목록 불러오기
  useEffect(() => {
    const loadUsers = async () => {
      const snap = await getDocs(collection(db, "users"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setUsers(list);
    };
    loadUsers();
  }, []);

  // 검색
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      Object.values(u).some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [search, users]);

  // 승인 토글
  const toggleApprove = async (u) => {
    const status = !u.approved;
    if (!confirm(`${u.email} → ${status ? "승인" : "승인 해제"} 하시겠습니까?`)) return;
    await setDoc(doc(db, "users", u.id), { approved: status }, { merge: true });
    setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, approved: status } : x));
  };

  // 🆕 권한 변경 (user ↔ admin ↔ test)
  const changeRole = async (u) => {
    const order = ["user", "test", "admin"];
    const nextRole = order[(order.indexOf(u.role) + 1) % order.length];

    if (!confirm(`${u.email}\n역할을 '${u.role}' → '${nextRole}' 로 변경할까요?`)) return;
    
    await setDoc(doc(db, "users", u.id), { role: nextRole }, { merge: true });
    setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, role: nextRole } : x));
  };

  // 🆕 삭제 (본인 삭제 금지)
  const removeUser = async (u) => {
    if (me?.uid === u.id) return alert("❌ 본인 계정은 삭제할 수 없습니다.");
    if (!confirm(`${u.email} 계정을 삭제하시겠습니까?`)) return;
    await deleteDoc(doc(db, "users", u.id));
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
  };

  return (
    <div className="p-5">
      <h2 className="text-lg font-bold mb-4">👨‍💼 관리자 메뉴 (사용자 권한 관리)</h2>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="사용자 검색 (이메일 / 역할)"
        className="border p-2 rounded w-80 mb-3"
      />

      <table className="w-full text-sm border">
        <thead>
          <tr>
            <th className={headBase}>이메일</th>
            <th className={headBase}>권한</th>
            <th className={headBase}>승인여부</th>
            <th className={headBase}>관리</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={4} className="text-center py-4 text-gray-500">
                검색 결과가 없습니다.
              </td>
            </tr>
          ) : (
            filtered.map((u) => {
              const isMe = me?.uid === u.id;
              return (
                <tr key={u.id} className="odd:bg-white even:bg-gray-50">
                  <td className={cellBase}>{u.email}</td>
                  <td className={cellBase}>
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        u.role === "admin"
                          ? "text-blue-700 bg-blue-100"
                          : u.role === "test"
                          ? "text-purple-700 bg-purple-100"
                          : "text-gray-700 bg-gray-100"
                      }`}
                    >
                      {u.role || "user"}
                    </span>
                  </td>
                  <td className={cellBase}>
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        u.approved ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {u.approved ? "승인" : "대기"}
                    </span>
                  </td>
                  <td className={cellBase}>
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => toggleApprove(u)}
                        className="bg-blue-500 text-white px-2 py-1 rounded text-xs"
                      >
                        {u.approved ? "승인해제" : "승인"}
                      </button>
                      <button
                        onClick={() => changeRole(u)}
                        className="bg-gray-600 text-white px-2 py-1 rounded text-xs"
                      >
                        권한 변경
                      </button>
                      <button
                        onClick={() => removeUser(u)}
                        disabled={isMe}
                        className={`px-2 py-1 rounded text-xs text-white ${
                          isMe ? "bg-gray-400 cursor-not-allowed" : "bg-red-600"
                        }`}
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
