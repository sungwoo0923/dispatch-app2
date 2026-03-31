import { useState } from "react";
import UserEditModal from "./UserEditModal";
import { useEffect } from "react";

import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  deleteDoc,
  updateDoc
} from "firebase/firestore";
import { db, auth } from "../../firebase";
export default function SettingsUsers() {
    const [open, setOpen] = useState(false);
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [mode, setMode] = useState("edit");
    const [rejectedList, setRejectedList] = useState([]);
    useEffect(() => {
  if (!auth.currentUser) return;

  const unsub = onSnapshot(collection(db, "users"), (snap) => {
    const arr = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

const me =
  arr.find(u => u.uid === auth.currentUser.uid) ||
  arr.find(u => u.email === auth.currentUser.email);

if (!me) {
  console.log("❌ 내 계정 못찾음");
  return;
}

const filtered = arr.filter(
  u =>
    u.company === me.company &&
    !u.isPrimary &&
    !u.rejected &&
    !u.deleted
);
const rejectedList = arr.filter(
  u =>
    u.company === me.company &&
    (u.rejected || u.deleted)
);
setUsers(filtered);
setRejectedList(rejectedList);
  });

  return () => unsub();
}, []);
  return (
    <div className="bg-white rounded-xl px-8 py-6">

      {/* ================= 상단 헤더 ================= */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-[20px] font-bold text-gray-800">이용자관리</h2>

        <div className="flex gap-2">
          <button className="border border-gray-300 px-4 py-2 text-sm rounded-md hover:bg-gray-50">
            이용자 엑셀 업로드
          </button>
          <button className="border border-gray-300 px-4 py-2 text-sm rounded-md hover:bg-gray-50">
            이용자 등록
          </button>
<button
    onClick={() => setMode("rejected")}
    className="border border-red-300 px-4 py-2 text-sm rounded-md hover:bg-red-50"
  >
    거절목록
  </button>
</div>
      </div>

      {/* ================= 검색 영역 ================= */}
      <div className="flex items-center gap-3 mb-5">
        <select className="border border-gray-300 px-3 py-2 text-sm rounded-md">
          <option>전체</option>
        </select>

        <input
          className="border border-gray-300 px-3 py-2 text-sm rounded-md w-[240px]"
          placeholder="이용자 입력"
        />

        <button className="bg-blue-500 text-white px-4 py-2 text-sm rounded-md hover:bg-blue-600">
          조회
        </button>
      </div>

      {/* 총 개수 */}
      <div className="text-sm text-gray-500 mb-2">총 {(mode === "rejected" ? rejectedList.length : users.length)}건</div>

      {/* ================= 테이블 ================= */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-[16px]">

          {/* 헤더 */}
          <thead className="bg-gray-100">
            <tr className="text-center text-gray-700 text-[16px] font-semibold">
              <th className="py-3">이름</th>
              <th>부서/직책</th>
              <th>연락처</th>
              <th>이메일</th>
              <th>고객코드</th>
              <th>권한</th>
              <th>그룹관리</th>
              <th>배차알림</th>
              <th>정산알림</th>
              <th>편집</th>
            </tr>
          </thead>

          {/* 바디 */}
          <tbody>
{(mode === "rejected" ? rejectedList : users).map((u) => (
    <tr key={u.id} className="border-t text-center hover:bg-gray-50">

      <td className="py-3 font-medium text-gray-800">{u.name || "-"}</td>
      <td>{u.department || "-"} / {u.position || "-"}</td>
      <td>{u.phone || "-"}</td>
      <td className="text-gray-600">{u.email}</td>
      <td>-</td>

      {/* 권한 */}
<td>
  <div className="flex justify-center gap-2">

    {/* 마스터 */}
{u.permissions?.master && (
  <span className="px-3 py-[4px] text-[13px] rounded bg-purple-100 text-purple-700">
    마스터
  </span>
)}

{/* 부마스터 */}
{u.permissions?.subMaster && (
  <span className="px-3 py-[4px] text-[13px] rounded bg-indigo-100 text-indigo-700">
    부마스터
  </span>
)}

{/* 정산 */}
{u.permissions?.settlement && (
  <span className="px-3 py-[4px] text-[13px] rounded bg-green-100 text-green-700">
    정산
  </span>
)}

{/* 운송 */}
{u.permissions?.transport && (
  <span className="px-3 py-[4px] text-[13px] rounded bg-blue-100 text-blue-700">
    운송
  </span>
)}

{/* 권한 없음 */}
{!u.permissions?.master &&
 !u.permissions?.subMaster &&
 !u.permissions?.settlement &&
 !u.permissions?.transport && (
  <span className="px-3 py-[4px] text-[13px] rounded bg-gray-100 text-gray-500">
    없음
  </span>
)}

  </div>
</td>

<td>본사</td>
<td></td>
<td></td>

<td>
  <div className="flex justify-center gap-2">

  {/* ✅ 1. 가입대기 → 가입여부만 */}
  {!u.approved && mode !== "rejected" && (
    <button
      onClick={() => {
        setSelectedUser(u);
        setMode("approve");
        setOpen(true);
      }}
      className="px-3 py-1 text-xs border rounded bg-blue-50"
    >
      가입여부
    </button>
  )}

  {/* ✅ 2. 승인된 사용자 → 수정 + 삭제 */}
  {u.approved && mode !== "rejected" && (
    <>
      <button
        onClick={() => {
          setSelectedUser(u);
          setMode("edit");
          setOpen(true);
        }}
      >
        수정
      </button>
    </>
  )}

  {/* ✅ 3. 거절목록 → 재승인 */}
  {mode === "rejected" && (
<button
  onClick={() => {
    setSelectedUser(u);
    setMode("reApprove");
    setOpen(true);
  }}
  className="px-3 py-1 text-xs border rounded bg-green-50"
>
  재승인
</button>
  )}

</div>
      </td>

    </tr>
  ))}
</tbody>
        </table>
      </div>

      {/* ================= 페이징 ================= */}
      <div className="flex justify-center items-center gap-2 mt-6 text-sm">
        <button className="px-2 py-1 border rounded text-gray-400">{'<<'}</button>
        <button className="px-2 py-1 border rounded text-gray-400">{'<'}</button>
        <button className="px-3 py-1 border rounded bg-blue-500 text-white">1</button>
        <button className="px-2 py-1 border rounded text-gray-400">{'>'}</button>
        <button className="px-2 py-1 border rounded text-gray-400">{'>>'}</button>
      </div>
<UserEditModal
  open={open}
  user={selectedUser}
  mode={mode}
  onClose={() => setOpen(false)}
/>
    </div>
  );
}
