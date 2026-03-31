import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { auth } from "../../firebase";
export default function UserEditModal({ open, user, onClose, mode, currentUserData }) {
  
  
 const [tab, setTab] = useState("기본정보");
const [form, setForm] = useState({
  department: user?.department || "",
  position: user?.position || "",
  tel: user?.tel || "",
  fax: user?.fax || "",
  phone: user?.phone || "",
});
const [permissions, setPermissions] = useState({
master: user?.permissions?.master || false,
subMaster: user?.permissions?.subMaster || false,
settlement: user?.permissions?.settlement || false,
transport: user?.permissions?.transport || false,
});

// 🔥 이거 반드시 있어야 함
const isTargetMaster = user?.permissions?.master;

const currentUser = auth.currentUser;

const isSelf =
  currentUser?.uid === user?.uid;

const isLoginMaster =
  currentUserData?.permissions?.master === true;

const isLoginSubMaster =
  currentUserData?.permissions?.subMaster === true;
  const canEdit = isLoginMaster || isLoginSubMaster;
// ✅ approve (여기 추가)
const approve = async () => {

  // 🔥 마스터만 마스터 권한 부여 가능
  if (!user?.permissions?.master && permissions.master) {
    alert("마스터만 마스터 권한을 부여할 수 있습니다.");
    return;
  }

  try {
    await updateDoc(doc(db, "users", user.uid), {
  approved: true,
  rejected: false,
  department: form.department,
  position: form.position,
  tel: form.tel,
  fax: form.fax,
  phone: form.phone,
  permissions: permissions,
});

    alert("승인 완료");
    onClose();
  } catch (e) {
    console.error(e);
    alert("승인 실패");
  }
};

// 기존 reject 그대로 유지
const reject = async () => {
  if (!window.confirm("가입을 거절하시겠습니까?")) return;

  await updateDoc(doc(db, "users", user.uid), {
    approved: false,
    rejected: true
  });

  alert("거절 완료");
  onClose();
};
const save = async () => {
  try {
await updateDoc(doc(db, "users", user.uid), {
  department: form.department,
  position: form.position,
  tel: form.tel,
  fax: form.fax,
  phone: form.phone,
  permissions: permissions,
});

    alert("수정 완료");
    onClose();
  } catch (e) {
    console.error(e);
    alert("수정 실패");
  }
};
const removeUser = async () => {
  if (!window.confirm("정말 삭제하시겠습니까?")) return;

  try {
    await updateDoc(doc(db, "users", user.uid), {
      deleted: true,
      approved: false
    });

    alert("삭제 완료");
    onClose();
  } catch (e) {
    console.error(e);
    alert("삭제 실패");
  }
};
if (!open) return null;

if (
  user?.permissions?.master &&
  !isSelf
) {
  alert("마스터 계정은 본인만 수정 가능합니다.");
  onClose();
  return null;
}
  if (mode === "approve") {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

      <div className="bg-white w-[420px] rounded-xl shadow-xl p-7">

        {/* 헤더 */}
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-[20px] font-bold text-gray-800">
            가입 승인
          </h2>
          <button onClick={onClose} className="text-xl text-gray-500">×</button>
        </div>

        {/* 사용자 정보 */}
        <div className="space-y-3 text-[16px] mb-6">
          <div>이름: {user?.name || "-"}</div>
          <div>이메일: {user?.email}</div>
          <div>연락처: {user?.phone || "-"}</div>
        </div>

        {/* 권한 선택 */}
        <div className="mb-6">
          <div className="font-semibold mb-2">권한 선택</div>

          <div className="flex gap-4">

  {/* 마스터 (선택불가) */}
  <label>
    <input
      type="checkbox"
      checked={permissions.master}
      disabled
    /> 마스터
  </label>

  {/* 부마스터 */}
  <label>
    <input
      type="checkbox"
      checked={permissions.subMaster}
      onChange={(e) =>
        setPermissions({
          ...permissions,
          subMaster: e.target.checked,
          master: false
        })
      }
    /> 부마스터
  </label>

  {/* 정산 */}
  <label>
    <input
      type="checkbox"
      checked={permissions.settlement}
      onChange={(e) =>
        setPermissions({
          ...permissions,
          settlement: e.target.checked
        })
      }
    /> 정산
  </label>

  {/* 운송 */}
  <label>
    <input
      type="checkbox"
      checked={permissions.transport}
      onChange={(e) =>
        setPermissions({
          ...permissions,
          transport: e.target.checked
        })
      }
    /> 운송
  </label>

</div>
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-3">

          <button
            onClick={onClose}
            className="px-5 py-2 border rounded"
          >
            취소
          </button>

<button
  onClick={async () => {
    if (!window.confirm("승인하시겠습니까?")) return;
    await approve();
  }}
  className="px-5 py-2 bg-blue-600 text-white rounded"
>
  승인완료
</button>

        </div>
      </div>
    </div>
  );
}
if (mode === "reApprove") {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

      <div className="bg-white w-[420px] rounded-xl shadow-xl p-7">

        {/* 헤더 */}
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-[20px] font-bold text-gray-800">
            계정 재승인
          </h2>
          <button onClick={onClose} className="text-xl text-gray-500">×</button>
        </div>

        {/* 사용자 정보 */}
        <div className="space-y-3 text-[16px] mb-6">
          <div>이름: {user?.name || "-"}</div>
          <div>이메일: {user?.email}</div>
          <div>연락처: {user?.phone || "-"}</div>
          <div>부서: {user?.department || "-"}</div>
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-3 mt-6">

          <button
            onClick={onClose}
            className="px-5 py-2 text-[18px] border rounded bg-gray-100"
          >
            취소
          </button>

          <button
            onClick={async () => {
              if (!window.confirm("정말 재승인 하시겠습니까?")) return;

              await updateDoc(doc(db, "users", user.uid), {
                approved: true,
                rejected: false,
                deleted: false,
              });

              alert("재승인 완료");
              onClose();
            }}
            className="px-5 py-2 text-[18px] bg-green-500 text-white rounded"
          >
            재승인
          </button>

        </div>
      </div>
    </div>
  );
}
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

      <div className="bg-white w-[650px] rounded-xl shadow-xl p-7 relative">

        {/* 헤더 */}
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-[20px] font-bold text-gray-800">
            돌캐운송사님 정보수정
          </h2>
          <button onClick={onClose} className="text-xl text-gray-500">×</button>
        </div>

        {/* 탭 */}
        <div className="flex gap-2 mb-6">
          {[
  "기본정보",
  "권한 및 그룹관리",
  ...(mode !== "approve" ? ["알림설정"] : [])
].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-[18px] rounded-md ${
                tab === t
                  ? "bg-gray-200 font-semibold text-gray-800"
                  : "text-gray-500"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ================= 기본정보 ================= */}
{tab === "기본정보" && (
  <div className="space-y-5 text-[20px]">

    {/* 이름 / 휴대폰 */}
    <div className="flex gap-4">
      <Input
  label="이름"
  value={user?.name}
  required
readOnly={true}
/>
<Input
  label="휴대폰 번호"
  value={user?.phone}
  required
  readOnly={!isSelf}
/>
    </div>

    {/* 이메일 */}
<Input label="이메일" value={user?.email} required />

{/* 부서 / 직책 */}
<div className="flex gap-4">

  {/* 부서 */}
  <div className="flex-1">
    <div className="mb-1 text-[13px] font-semibold text-gray-700">부서</div>
    <select
  value={form.department}
disabled={!canEdit}
      onChange={(e) =>
        setForm({ ...form, department: e.target.value })
      }
      className="w-full border px-4 py-2.5 text-[18px] rounded-md"
    >
      <option value="">선택</option>
      <option>경영</option>
      <option>물류</option>
      <option>회계</option>
      <option>영업</option>
      <option>법무</option>
      <option>인사</option>
      <option>사무</option>
      <option>기술지원</option>
      <option>경비</option>
    </select>
  </div>

  {/* 직책 */}
  <div className="flex-1">
    <div className="mb-1 text-[13px] font-semibold text-gray-700">직책</div>
    <select
  value={form.position}
disabled={!canEdit}
      onChange={(e) =>
        setForm({ ...form, position: e.target.value })
      }
      className="w-full border px-4 py-2.5 text-[18px] rounded-md"
    >
      <option value="">선택</option>
      <option>대표</option>
      <option>부장</option>
      <option>차장</option>
      <option>과장</option>
      <option>대리</option>
      <option>사원</option>
      <option>인턴</option>
      <option>수습</option>
    </select>
  </div>

</div>
    {/* 유선 / 팩스 */}
<div className="flex gap-4">
  <Input
    label="유선번호"
    value={form.tel}
    onChange={(v) => setForm({ ...form, tel: v })}
    placeholder="유선번호를 입력해주세요"
    readOnly={false}
  />
  <Input
    label="팩스번호"
    value={form.fax}
    onChange={(v) => setForm({ ...form, fax: v })}
    placeholder="팩스번호를 입력해주세요"
    readOnly={false}
  />
</div>

    {/* 고객코드 */}
    <Input label="고객코드" value={user?.clientCode} placeholder="고객코드" />

    {/* 안내문 */}
<p className="text-[15px] text-gray-500 mt-3 leading-6">
  이용자 등록 시 휴대폰 번호 또는 이메일 2가지 중 하나만 입력하셔도 등록 링크를 보낼 수 있습니다.
  <br />
  등록 링크는 문자메시지와 이메일을 통해 전송되오니 입력된 정보가 올바른지 확인해 주세요.
</p>

{/* 🔴 삭제 버튼 (승인된 계정만 보임) */}
{user?.approved && (
  <div className="pt-4">
    <button
      onClick={removeUser}
      className="w-full py-3 bg-red-500 text-white text-[18px] rounded-lg hover:bg-red-600"
    >
      계정 삭제
    </button>
  </div>
)}

  </div>
)}

        {/* ================= 권한 ================= */}
        {tab === "권한 및 그룹관리" && (
          <div className="space-y-6 text-[20px]">

            <div>
              <div className="flex justify-between items-center mb-3">
                <div className="font-semibold text-gray-800">권한</div>
                <button className="border px-3 py-1 text-xs rounded hover:bg-gray-50">
                  권한상세설정
                </button>
              </div>

{/* ===== 권한 ===== */}
<div className="flex gap-6">

  {/* 마스터 */}
  <label className="flex items-center gap-2">
    <input
      type="checkbox"
      checked={permissions.master}
      disabled={!isLoginMaster}   // 🔥 마스터만 가능
      onChange={(e) =>
        setPermissions({
          master: e.target.checked,
          subMaster: false,
          settlement: false,
          transport: false,
        })
      }
    />
    마스터
  </label>

  {/* 부마스터 */}
  <label className="flex items-center gap-2">
    <input
      type="checkbox"
      checked={permissions.subMaster}
      disabled={!isLoginMaster}   // 🔥 마스터만 가능
      onChange={(e) =>
        setPermissions({
          ...permissions,
          subMaster: e.target.checked,
          master: false,
        })
      }
    />
    부마스터
  </label>

  {/* 정산 */}
  <label className="flex items-center gap-2">
    <input
      type="checkbox"
      checked={permissions.settlement}
      disabled={!isLoginMaster}   // 🔥 마스터만 가능
      onChange={(e) =>
        setPermissions({
          ...permissions,
          settlement: e.target.checked,
        })
      }
    />
    정산
  </label>

  {/* 운송 */}
  <label className="flex items-center gap-2">
    <input
      type="checkbox"
      checked={permissions.transport}
      disabled={!isLoginMaster}   // 🔥 마스터만 가능
      onChange={(e) =>
        setPermissions({
          ...permissions,
          transport: e.target.checked,
        })
      }
    />
    운송
  </label>

</div>

{/* ===== 그룹관리 ===== */}
<div>
  <div className="font-semibold mb-3 text-gray-800">
    소속그룹관리
  </div>

  <label className="flex items-center gap-2 mb-3">
    <input
      type="checkbox"
      defaultChecked
      disabled={!isLoginMaster}   // 🔥 마스터만 수정 가능
    />
    전체
  </label>

  <div className="flex justify-between items-center">
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        defaultChecked
        disabled={!isLoginMaster}   // 🔥 마스터만 수정 가능
      />
      본사
    </label>

    <div className="w-5 h-5 border rounded-full"></div>
  </div>
</div>
            </div>
          </div>
        )}

        {/* ================= 알림 ================= */}
        {tab === "알림설정" && (
          <div className="space-y-6 text-[18px]">

           <AlarmGroup
  title="배차완료알림"
  items={["웹", "어플", "카카오톡", "이메일"]}
  isSelf={isSelf}
/>
<AlarmGroup
  title="정산 알림"
  items={["웹", "어플", "이메일"]}
  isSelf={isSelf}
/>
<AlarmGroup
  title="지연 알림"
  items={["웹", "어플", "카카오톡"]}
  isSelf={isSelf}
/>
<AlarmGroup
  title="최적화 알림"
  items={["웹"]}
  isSelf={isSelf}
/>

            <div className="flex justify-between items-center pt-2">
              <span className="text-gray-700">
                내가 요청한 운송건에 대한 알림만 받기
              </span>
              <Toggle disabled={!isSelf} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= 공통 컴포넌트 ================= */

function Input({ label, value, onChange, placeholder, required, readOnly = true }) {
  return (
    <div className="flex-1">
      <div className="mb-1 text-[13px] font-semibold text-gray-700">
        {required && <span className="text-red-500">*</span>} {label}
      </div>
      <input
        value={value || ""}
        readOnly={readOnly}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 px-4 py-2.5 text-[18px] rounded-md"
      />
    </div>
  );
}

function AlarmGroup({ title, items, isSelf }) {
  return (
    <div>
      <div className="font-semibold mb-2 text-gray-800 text-[16px]">
        {title}
      </div>

      <div className="flex gap-6">
        {items.map((i) => (
          <label key={i} className="flex items-center gap-3 text-[16px]">
            <input
  type="checkbox"
  className="scale-125 accent-blue-600"
  defaultChecked
  disabled={!isSelf}
/>
            {i}
          </label>
        ))}
      </div>
    </div>
  );
}
function Toggle({ disabled }) {
  return (
    <div className={`w-12 h-6 rounded-full relative ${disabled ? "bg-gray-300" : "bg-blue-500"} cursor-pointer`}>
      <div className="w-5 h-5 bg-white rounded-full absolute right-1 top-[2px]" />
    </div>
  );
}