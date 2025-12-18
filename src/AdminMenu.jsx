// src/AdminMenu.jsx
import React, { useEffect, useState, useMemo } from "react";
import { auth, db } from "./firebase";
import {
  collection,
  setDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { onSnapshot } from "firebase/firestore";

export default function AdminMenu() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [roleTarget, setRoleTarget] = useState(null);

  // 🔥 모바일 미리보기 토글
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  const headBase = "border px-2 py-2 whitespace-nowrap bg-gray-100 text-center";
  const cellBase = "border px-2 py-1 text-center whitespace-nowrap";
  const me = auth.currentUser;

  // 사용자 목록 불러오기
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snapshot) => {
      const list = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setUsers(list);
    });
    return () => unsub();
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

    // drivers.active 자동 반영
    await setDoc(
      doc(db, "drivers", u.id),
      {
        active: status,
        updatedAt: new Date(),
      },
      { merge: true }
    );
  };

  // 권한 변경
  const updateRole = async (u, newRole) => {
    await setDoc(doc(db, "users", u.id), { role: newRole }, { merge: true });
    setUsers((prev) =>
      prev.map((x) => (x.id === u.id ? { ...x, role: newRole } : x))
    );
    setRoleTarget(null);
  };

  // 삭제
  const removeUser = async (u) => {
    if (me?.uid === u.id) return alert("❌ 본인 계정은 삭제할 수 없습니다.");
    await deleteDoc(doc(db, "users", u.id));
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
  };

  return (
    <div className="p-5 flex gap-6">
      {/* ================= LEFT: 기존 관리자 메뉴 ================= */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">
            👨‍💼 관리자 메뉴 (사용자 권한 관리)
          </h2>

          {/* 🔥 모바일 미리보기 버튼 */}
          <button
            onClick={() => setShowMobilePreview((v) => !v)}
            className={`px-4 py-2 rounded-md text-sm font-semibold shadow ${
              showMobilePreview
                ? "bg-gray-600 text-white"
                : "bg-blue-600 text-white"
            }`}
          >
            📱 모바일 미리보기
          </button>
        </div>

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
                        <button
                          onClick={() => toggleApprove(u)}
                          className="bg-blue-500 text-white px-2 py-1 rounded text-xs"
                        >
                          {u.approved ? "승인해제" : "승인"}
                        </button>

                        <div className="relative">
                          <button
                            onClick={() =>
                              setRoleTarget(
                                roleTarget === u.id ? null : u.id
                              )
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

                        <button
                          onClick={() => removeUser(u)}
                          disabled={isMe}
                          className={`px-2 py-1 rounded text-xs text-white ${
                            isMe
                              ? "bg-gray-400 cursor-not-allowed"
                              : "bg-red-600"
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

      {/* ================= RIGHT: 모바일 미리보기 ================= */}
      {showMobilePreview && (
        <div className="w-[420px] shrink-0">
          <div className="sticky top-4 bg-white border rounded-xl shadow-lg p-3">
            <div className="text-sm font-semibold text-center mb-2">
              📱 모바일 화면 미리보기
            </div>

            <iframe
              src="/mobile"
              title="mobile-preview"
              className="w-full h-[760px] border rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}
