// src/AdminMenu.jsx
import React, { useEffect, useState, useMemo } from "react";
import { db } from "./firebase";
import { collection, getDocs, setDoc, doc } from "firebase/firestore";

export default function AdminMenu() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");

  const headBase = "border px-2 py-2 whitespace-nowrap bg-gray-100 text-center";
  const cellBase = "border px-2 py-1 text-center whitespace-nowrap";

  // ✅ Firestore 사용자 목록 불러오기
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setUsers(list);
      } catch (err) {
        alert("❌ Firestore 사용자 로드 실패\n" + err.message);
      }
    };
    loadUsers();
  }, []);

  // ✅ 검색 기능
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      Object.values(u).some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [search, users]);

  // ✅ 승인/미승인 전환
  const toggleApprove = async (u) => {
    const status = !u.approved;
    if (!confirm(`${u.email} → ${status ? "승인" : "승인 해제"} 하시겠습니까?`)) return;
    await setDoc(doc(db, "users", u.id), { approved: status }, { merge: true });
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, approved: status } : x)));
  };

  // ✅ 권한 변경 (admin ↔ user)
  const toggleRole = async (u) => {
    const nextRole = u.role === "admin" ? "user" : "admin";
    if (!confirm(`${u.email} 의 권한을 '${nextRole}' 으로 변경할까요?`)) return;
    await setDoc(doc(db, "users", u.id), { role: nextRole }, { merge: true });
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: nextRole } : x)));
  };

  return (
    <div>
      <h2 className="text-lg font-bold mb-4">👨‍💼 관리자 메뉴 (사용자 승인/권한 관리)</h2>

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
            <th className={headBase}>최근 로그인</th>
            <th className={headBase}>관리</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center py-4 text-gray-500">
                검색 결과가 없습니다.
              </td>
            </tr>
          ) : (
            filtered.map((u) => (
              <tr key={u.id} className="odd:bg-white even:bg-gray-50">
                <td className={cellBase}>{u.email}</td>
                <td className={cellBase}>
                  <span className={u.role === "admin" ? "text-blue-600 font-semibold" : "text-gray-700"}>
                    {u.role}
                  </span>
                </td>
                <td className={cellBase}>
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      u.approved ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {u.approved ? "승인" : "대기중"}
                  </span>
                </td>
                <td className={cellBase}>
                  {u.lastLogin ? new Date(u.lastLogin.seconds * 1000).toLocaleString() : "-"}
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
                      onClick={() => toggleRole(u)}
                      className="bg-gray-600 text-white px-2 py-1 rounded text-xs"
                    >
                      권한변경
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
