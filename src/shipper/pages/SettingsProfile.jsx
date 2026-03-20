import { useState, useEffect } from "react";

export default function SettingsProfile() {
  return (
    <div className="bg-white rounded-lg px-10 py-8">

      {/* 타이틀 */}
      <h2 className="text-[22px] font-bold text-gray-800 mb-8">설정</h2>

      {/* 섹션 */}
      <div className="text-[20px]">

        {/* 회사정보 */}
        <div className="mb-10">
          <div className="font-semibold text-gray-700 mb-6">회사정보</div>

          <div className="space-y-6">
            <Row label="회사명" value="(주)돌캐" />
            <Row label="대표" value="" />
            <Row label="주소" value="" />
            <Row label="업태/업종" value="- / -" />

            <div className="flex items-start">
              <div className="w-[180px] text-gray-500">사업자번호</div>
              <div>
                <div className="text-gray-800">329-81-00967</div>
                <div className="text-[16px] text-blue-500 mt-1">
                  정보 수정이 필요할 경우 r15332525@daum.net 으로 변경된 사업자 등록증을 보내주시기 바랍니다.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 구분선 */}
        <div className="border-t border-gray-200 my-8"></div>

        {/* 은행정보 */}
        <div className="mb-10">
          <Row label="은행정보" value="-" />
        </div>

        {/* 구분선 */}
        <div className="border-t border-gray-200 my-8"></div>

        {/* 입력 */}
        <div className="space-y-6">
          <RowInput label="전화번호" defaultValue="" />
          <RowInput label="팩스" defaultValue="" />
        </div>

      </div>
    </div>
  );
}

/* ================= 고정 Row ================= */
function Row({ label, value }) {
  return (
    <div className="flex items-center">
      <div className="w-[180px] text-gray-500">{label}</div>
      <div className="text-gray-800">{value}</div>
    </div>
  );
}

function RowInput({ label, defaultValue }) {
  const storageKey = `settings_${label}`;

  const [isEdit, setIsEdit] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const [original, setOriginal] = useState(defaultValue);

  /* 🔥 최초 로드 시 저장값 불러오기 */
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null) {
      setValue(saved);
      setOriginal(saved);
    }
  }, [storageKey]);

  const handleEdit = () => {
    setIsEdit(true);
  };

  const handleCancel = () => {
    setValue(original);
    setIsEdit(false);
  };

  const handleSave = () => {
    setOriginal(value);
    localStorage.setItem(storageKey, value); // 🔥 핵심
    setIsEdit(false);
  };

  return (
    <div className="flex items-center">
      <div className="w-[180px] text-gray-500">{label}</div>

      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={!isEdit}
        className={`
          w-[420px]
          h-[42px]
          px-4
          rounded-md
          border
          text-[15px]
          transition-all duration-150
          ${isEdit 
            ? "bg-white border-blue-400 focus:ring-2 focus:ring-blue-200" 
            : "bg-gray-100 border-gray-200"}
        `}
      />

      <div className="ml-3 flex gap-2">
        {!isEdit ? (
          <button onClick={handleEdit} className="px-5 py-2.5 bg-blue-500 text-white rounded-md">
            수정
          </button>
        ) : (
          <>
            <button onClick={handleSave} className="px-5 py-2.5 bg-red-500 text-white rounded-md">
              완료
            </button>
            <button onClick={handleCancel} className="px-5 py-2.5 bg-gray-200 rounded-md">
              취소
            </button>
          </>
        )}
      </div>
    </div>
  );
}