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
    const [permissionOpen, setPermissionOpen] = useState(false);
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

const filtered = arr.filter(u => u.company === me.company);

setUsers(filtered);
  });

  return () => unsub();
}, []);
const handleDelete = async (user) => {
  if (user.uid === auth.currentUser.uid) {
    alert("본인 계정은 삭제 불가");
    return;
  }

  if (!window.confirm("정말 삭제하시겠습니까?")) return;

  await deleteDoc(doc(db, "users", user.id));
};
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
      <div className="text-sm text-gray-500 mb-2">총 {users.length}건</div>

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
  {users.map((u) => (
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

          {/* 삭제 */}
          <button
            onClick={() => handleDelete(u)}
            
            className="px-3 py-1 text-xs border rounded bg-gray-100"
          >
            삭제
          </button>

          {/* 수정 */}
          <button
            onClick={() => {
              setSelectedUser(u);
              setOpen(true);
            }}
            className="px-3 py-1 text-sm border rounded"
          >
            수정
          </button>
<button
  onClick={() => {
    setSelectedUser(u);
    setOpen(true);
  }}
  className="px-3 py-1 text-xs border rounded bg-blue-50"
>
  가입여부
</button>
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
  mode="permission"
  onClose={() => setOpen(false)}
/>
<PermissionModal
  open={permissionOpen}
  user={selectedUser}
  onClose={() => setPermissionOpen(false)}
/>
    </div>
  );
}
function PermissionModal({ open, user, onClose }) {
  const [perm, setPerm] = useState({
    master: false,
    settlement: false,
    transport: false
  });

  useEffect(() => {
    if (user?.permissions) {
      setPerm(user.permissions);
    }
  }, [user]);

  if (!open || !user) return null;

  const approve = async () => {
    await updateDoc(doc(db, "users", user.id), {
      approved: true, // 🔥 승인 처리
      role: perm.master ? "shipper" : "staff",
      permissions: perm
    });

    alert("승인 완료");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

      <div className="bg-white w-[420px] rounded-2xl shadow-xl p-6">

        {/* 타이틀 */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">권한 설정</h2>
          <button onClick={onClose}>✕</button>
        </div>

        {/* 권한 선택 */}
        <div className="flex flex-col gap-3 mb-6">

          {/* 관리자 */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={perm.master}
              onChange={(e) =>
                setPerm({
                  master: e.target.checked,
                  settlement: e.target.checked ? true : perm.settlement,
                  transport: e.target.checked ? true : perm.transport
                })
              }
            />
            관리자
          </label>

          {/* 정산 */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={perm.settlement}
              onChange={(e) =>
                setPerm({ ...perm, settlement: e.target.checked })
              }
              disabled={perm.master}
            />
            정산
          </label>

          {/* 운송 */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={perm.transport}
              onChange={(e) =>
                setPerm({ ...perm, transport: e.target.checked })
              }
              disabled={perm.master}
            />
            운송
          </label>

        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded bg-gray-100"
          >
            취소
          </button>

          <button
            onClick={approve}
            className="px-4 py-2 bg-blue-600 text-white rounded"
          >
            승인완료
          </button>
        </div>

      </div>
    </div>
  );
}