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
    const [selectedUserId, setSelectedUserId] = useState(null);
    const selectedUser = users.find(u => u.uid === selectedUserId);
    const [mode, setMode] = useState("edit");
    const [rejectedList, setRejectedList] = useState([]);
    const [me, setMe] = useState(null);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteCopied, setInviteCopied] = useState(false);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulkLoading, setBulkLoading] = useState(false);

    const inviteLink = `${window.location.origin}/shipper-signup`;

    const handleCopyInvite = async () => {
      try {
        await navigator.clipboard.writeText(inviteLink);
        setInviteCopied(true);
        setTimeout(() => setInviteCopied(false), 2000);
      } catch {
        alert("복사 실패 - 링크를 직접 선택하여 복사해주세요.");
      }
    };

    const handleBulkFile = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      if (!me?.companyName) return;
      setBulkLoading(true);
      try {
        const XLSX = await import("xlsx");
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const sheetRows = XLSX.utils.sheet_to_json(ws);

        let matched = 0, notFound = 0;
        for (const row of sheetRows) {
          const email = String(row["이메일"] || row["email"] || "").trim().toLowerCase();
          if (!email) continue;
          const target = users.find(u => (u.email || "").toLowerCase() === email);
          if (!target) { notFound++; continue; }
          const patch = {};
          if (row["이름"] || row["name"]) patch.name = String(row["이름"] || row["name"]).trim();
          if (row["부서"] || row["department"]) patch.department = String(row["부서"] || row["department"]).trim();
          if (row["직책"] || row["position"]) patch.position = String(row["직책"] || row["position"]).trim();
          if (row["연락처"] || row["phone"]) patch.phone = String(row["연락처"] || row["phone"]).trim();
          if (Object.keys(patch).length === 0) continue;
          await updateDoc(doc(db, "users", target.uid), patch);
          matched++;
        }
        alert(`${matched}건 업데이트 완료${notFound ? ` (이메일 미일치 ${notFound}건 제외)` : ""}`);
      } catch (err) {
        alert("파일 처리 오류: " + err.message);
      } finally {
        setBulkLoading(false);
        setBulkOpen(false);
      }
    };
    useEffect(() => {
  if (!auth.currentUser) return;

  const unsub = onSnapshot(collection(db, "users"), (snap) => {
const arr = snap.docs.map(d => ({
  uid: d.id,   // 핵심: uid = 문서ID로 강제
  ...d.data()
}));

const me = arr.find(u => u.uid === auth.currentUser.uid);

if (!me) {
  console.log("❌ 내 계정 못찾음");
  return;
}
setMe(me);
const filtered = arr.filter(
  u =>
    u.companyName === me.companyName &&
    !u.rejected &&
    !u.deleted
);
const rejectedList = arr.filter(
  u =>
    u.companyName === me.companyName &&
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
          <button
            onClick={() => setBulkOpen(true)}
            disabled={bulkLoading}
            className="border border-gray-300 px-4 py-2 text-sm rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            {bulkLoading ? "처리중..." : "이용자 엑셀 업로드"}
          </button>
          <button
            onClick={() => setInviteOpen(true)}
            className="bg-[#1B2B4B] text-white px-4 py-2 text-sm rounded-md hover:opacity-90 font-medium"
          >
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

        <button className="bg-[#1B2B4B] text-white px-4 py-2 text-sm rounded-md hover:opacity-90">
          조회
        </button>
      </div>

      {/* 총 개수 */}
      <div className="text-sm text-gray-500 mb-2">총 {(mode === "rejected" ? rejectedList.length : users.length)}건</div>

      {/* ================= 테이블 ================= */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">

          {/* 헤더 */}
          <thead className="bg-[#1B2B4B]">
            <tr className="text-center text-white text-xs font-bold">
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
    <tr key={u.uid} className="border-t text-center hover:bg-gray-50">

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
  <span className="px-2.5 py-[4px] text-[12px] font-bold rounded bg-[#1B2B4B] text-white">
    마스터
  </span>
)}

{/* 부마스터 */}
{u.permissions?.subMaster && (
  <span className="px-2.5 py-[4px] text-[12px] font-bold rounded bg-[#1B2B4B]/10 text-[#1B2B4B] border border-[#1B2B4B]/20">
    부마스터
  </span>
)}

{/* 정산 */}
{u.permissions?.settlement && (
  <span className="px-2.5 py-[4px] text-[12px] font-bold rounded bg-[#1B2B4B]/10 text-[#1B2B4B] border border-[#1B2B4B]/20">
    정산
  </span>
)}

{/* 운송 */}
{u.permissions?.transport && (
  <span className="px-2.5 py-[4px] text-[12px] font-bold rounded bg-[#1B2B4B]/10 text-[#1B2B4B] border border-[#1B2B4B]/20">
    운송
  </span>
)}

{/* 권한 없음 */}
{!u.permissions?.master &&
 !u.permissions?.subMaster &&
 !u.permissions?.settlement &&
 !u.permissions?.transport && (
  <span className="px-2.5 py-[4px] text-[12px] font-bold rounded bg-gray-100 text-gray-500">
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
        setSelectedUserId(u.uid);
        setMode("approve");
        setOpen(true);
      }}
      className="px-3 py-1 text-xs font-semibold rounded-md border border-[#1B2B4B]/25 bg-[#1B2B4B]/8 text-[#1B2B4B] hover:bg-[#1B2B4B]/15 transition"
    >
      가입여부
    </button>
  )}

{u.approved && mode !== "rejected" && (
  <>
    {u.permissions?.master && !me?.permissions?.master ? (
      // ❌ 부마스터는 마스터 수정 못함
      <span className="text-gray-400 text-xs">수정불가</span>
    ) : (
      <button
        onClick={() => {
          setSelectedUserId(u.uid);
          setMode("edit");
          setOpen(true);
        }}
        className="px-3 py-1 text-xs font-semibold rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
      >
        수정
      </button>
    )}
  </>
)}

  {/* ✅ 3. 거절목록 → 재승인 */}
  {mode === "rejected" && (
<button
  onClick={() => {
    setSelectedUserId(u.uid);
    setMode("reApprove");
    setOpen(true);
  }}
  className="px-3 py-1 text-xs font-semibold rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
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
        <button className="px-3 py-1 border rounded bg-[#1B2B4B] text-white">1</button>
        <button className="px-2 py-1 border rounded text-gray-400">{'>'}</button>
        <button className="px-2 py-1 border rounded text-gray-400">{'>>'}</button>
      </div>
{me && selectedUser && (
  <UserEditModal
    key={selectedUser.uid}   // 🔥 이거 추가 (핵심)
    open={open}
    user={selectedUser}
    mode={mode}
    currentUserData={me}
    onClose={() => setOpen(false)}
  />
)}

      {/* 이용자 등록 안내 팝업 */}
      {inviteOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setInviteOpen(false)}>
          <div className="bg-white rounded-2xl w-[480px] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4">
              <h3 className="text-white font-bold text-[15px]">이용자 등록</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                아래 가입 링크를 새 이용자에게 전달하세요. 가입 신청 후 이 화면의
                <b> 가입여부</b> 버튼으로 승인하면 이용자 목록에 추가됩니다.
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={inviteLink}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-700 bg-gray-50"
                />
                <button
                  onClick={handleCopyInvite}
                  className={`px-4 py-2.5 rounded-lg text-sm font-bold whitespace-nowrap transition ${
                    inviteCopied ? "bg-emerald-600 text-white" : "bg-[#1B2B4B] text-white hover:opacity-90"
                  }`}
                >
                  {inviteCopied ? "복사됨" : "링크 복사"}
                </button>
              </div>
            </div>
            <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex justify-end">
              <button onClick={() => setInviteOpen(false)} className="px-5 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 이용자 엑셀 업로드 팝업 */}
      {bulkOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setBulkOpen(false)}>
          <div className="bg-white rounded-2xl w-[460px] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4">
              <h3 className="text-white font-bold text-[15px]">이용자 엑셀 업로드</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-500 mb-4">
                이미 가입된 이용자의 정보를 이메일 기준으로 일괄 업데이트합니다. 신규 계정은
                생성되지 않으니, 새 이용자는 가입 링크로 직접 가입해야 합니다.
              </p>
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 font-mono mb-4">
                이메일 | 이름 | 부서 | 직책 | 연락처
              </div>
              <label className={`block w-full text-center py-3 bg-[#1B2B4B] text-white rounded-lg cursor-pointer hover:opacity-90 font-semibold ${bulkLoading ? "opacity-50" : ""}`}>
                {bulkLoading ? "처리중..." : "파일 선택"}
                <input
                  type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  disabled={bulkLoading}
                  onChange={handleBulkFile}
                />
              </label>
              <button onClick={() => setBulkOpen(false)} className="w-full mt-2 border border-gray-200 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50">닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
