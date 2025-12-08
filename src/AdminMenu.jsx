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
  const [roleTarget, setRoleTarget] = useState(null); // 🔥 드롭다운 표시 대상

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
      Object.values(u).some((v) =>
        String(v || "").toLowerCase().includes(q)
      )
    );
  }, [search, users]);

  // 승인 토글
  const toggleApprove = async (u) => {
  const status = !u.approved;

  await setDoc(doc(db, "users", u.id), { approved: status }, { merge: true });

  setUsers((prev) =>
    prev.map((x) => (x.id === u.id ? { ...x, approved: status } : x))
  );

  // 🔥 승인 시 drivers.active 자동 반영
  if (status) {
    await setDoc(doc(db, "drivers", u.id), {
      active: true,
      updatedAt: new Date(),
    }, { merge: true });
  } else {
    await setDoc(doc(db, "drivers", u.id), {
      active: false,
    }, { merge: true });
  }
};
  

  // 🔥 권한 변경 드롭다운 기능
  const updateRole = async (u, newRole) => {
    await setDoc(doc(db, "users", u.id), { role: newRole }, { merge: true });
    setUsers((prev) =>
      prev.map((x) => (x.id === u.id ? { ...x, role: newRole } : x))
    );
    setRoleTarget(null);
  };

  // 삭제 (본인 삭제 금지)
  const removeUser = async (u) => {
    if (me?.uid === u.id) return alert("❌ 본인 계정은 삭제할 수 없습니다.");
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
                          : u.role === "driver"
                          ? "text-green-700 bg-green-100"
                          : "text-gray-700 bg-gray-100"
                      }`}
                    >
                      {u.role || "user"}
                    </span>
                  </td>
                  <td className={cellBase}>
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        u.approved
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {u.approved ? "승인" : "대기"}
                    </span>
                  </td>

                  <td className={cellBase}>
                    <div className="flex gap-2 justify-center relative">
                      {/* 승인/해제 */}
                      <button
                        onClick={() => toggleApprove(u)}
                        className="bg-blue-500 text-white px-2 py-1 rounded text-xs"
                      >
                        {u.approved ? "승인해제" : "승인"}
                      </button>

                      {/* 🔥 권한 변경 드롭다운 버튼 */}
                      <div className="relative">
                        <button
                          onClick={() =>
                            setRoleTarget(roleTarget === u.id ? null : u.id)
                          }
                          className="bg-gray-600 text-white px-2 py-1 rounded text-xs"
                        >
                          권한 변경 ▾
                        </button>

                        {roleTarget === u.id && (
                          <div className="absolute bg-white border shadow rounded mt-1 w-24 z-10">
                            {["user", "driver", "admin"].map((r) => (
                              <button
                                key={r}
                                onClick={() => updateRole(u, r)}
                                className={`block w-full text-left px-2 py-1 text-xs hover:bg-blue-100 ${
                                  u.role === r
                                    ? "font-bold text-blue-600"
                                    : "text-gray-700"
                                }`}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 삭제 */}
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
