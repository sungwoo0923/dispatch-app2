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
  const [roleFilter, setRoleFilter] = useState("all");
  const [editUser, setEditUser] = useState(null);
const [editName, setEditName] = useState("");
const [editPhone, setEditPhone] = useState("");

const ROLES = ["admin", "driver", "shipper", "test", "user"];

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

  return users.filter((u) => {
    const matchSearch = !q
      ? true
      : [
  u.email,
  u.name,
  u.phone,
  u.role,
  u.companyName,
]
  .join(" ")
  .toLowerCase()
  .includes(q);

    const matchRole =
      roleFilter === "all" ? true : u.role === roleFilter;

    return matchSearch && matchRole;
  });
}, [search, users, roleFilter]);

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

<div className="flex items-center gap-2 mb-3 flex-wrap">

  <input
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    placeholder="사용자 검색 (이메일 / 역할)"
    className="border p-2 rounded w-64"
  />

  {/* 전체 */}
  <button
    onClick={() => setRoleFilter("all")}
    className={`px-3 py-1 rounded text-sm border
      ${roleFilter === "all"
        ? "bg-black text-white"
        : "bg-gray-100 text-gray-700"}`}
  >
    전체
  </button>

  {/* 권한 버튼 */}
  {ROLES.map((r) => (
    <button
      key={r}
      onClick={() => setRoleFilter(r)}
      className={`px-3 py-1 rounded text-sm border
        ${
          roleFilter === r
            ? "bg-blue-600 text-white"
            : "bg-gray-100 text-gray-700 hover:bg-blue-100"
        }`}
    >
      {r}
    </button>
  ))}
</div>

        <table className="w-full text-sm border">
          <thead>
            <tr>
              <th className={headBase}>이메일</th>
<th className={headBase}>이름</th>
<th className={headBase}>핸드폰</th>
<th className={headBase}>권한</th>
<th className={headBase}>회사명</th>
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
<td className={cellBase}>{u.name || "-"}</td>
<td className={cellBase}>{u.phone || "-"}</td>

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
  {u.role === "shipper"
    ? (u.companyName || u.company || "미등록")
    : "-"}
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
                              {ROLES.map((r) => (
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
  onClick={() => {
    setEditUser(u);
    setEditName(u.name || "");
    setEditPhone(u.phone || "");
  }}
  className="bg-indigo-500 text-white px-2 py-1 rounded text-xs"
>
  수정
</button>
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
      {editUser && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
    <div className="bg-white p-5 rounded-lg w-80 shadow-lg">
      <h3 className="text-lg font-bold mb-3">사용자 정보 수정</h3>

      <input
        placeholder="이름"
        value={editName}
        onChange={(e) => setEditName(e.target.value)}
        className="border p-2 rounded w-full mb-2"
      />

      <input
        placeholder="핸드폰번호"
        value={editPhone}
        onChange={(e) => {
  let v = e.target.value.replace(/[^0-9]/g, "");

  if (v.length <= 3) {
    // 그대로
  } else if (v.length <= 7) {
    v = v.replace(/(\d{3})(\d+)/, "$1-$2");
  } else {
    v = v.replace(/(\d{3})(\d{4})(\d+)/, "$1-$2-$3");
  }

  setEditPhone(v);
}}
        className="border p-2 rounded w-full mb-3"
      />

      <div className="flex justify-end gap-2">
        <button
          onClick={() => setEditUser(null)}
          className="px-3 py-1 bg-gray-300 rounded"
        >
          취소
        </button>

        <button
          onClick={async () => {
            if (!editName || !editPhone) {
              return alert("이름과 핸드폰번호를 입력하세요.");
            }

            await setDoc(
              doc(db, "users", editUser.id),
              {
                name: editName,
                phone: editPhone,
              },
              { merge: true }
            );

            setUsers((prev) =>
              prev.map((x) =>
                x.id === editUser.id
                  ? { ...x, name: editName, phone: editPhone }
                  : x
              )
            );

            setEditUser(null);
          }}
          className="px-3 py-1 bg-blue-600 text-white rounded"
        >
          저장
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
}
