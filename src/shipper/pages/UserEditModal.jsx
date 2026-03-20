import { useState } from "react";

export default function UserEditModal({ open, onClose }) {
  const [tab, setTab] = useState("기본정보");

  if (!open) return null;

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
          {["기본정보", "권한 및 그룹관리", "알림설정"].map((t) => (
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

            <div className="flex gap-4">
              <Input label="이름" value="돌캐운송사" required />
              <Input label="휴대폰 번호" value="01055041821" required />
            </div>

            <Input label="이메일" value="tjdndqkf@naver.com" required />

            <div className="flex gap-4">
              <Input label="부서명" placeholder="부서명" />
              <Input label="직책" placeholder="직책" />
            </div>

            <div className="flex gap-4">
              <Input label="유선번호" placeholder="유선번호를 입력해주세요" />
              <Input label="팩스번호" placeholder="팩스번호를 입력해주세요" />
            </div>

            <Input label="고객코드" placeholder="고객코드" />

            <p className="text-[15px] text-gray-500 mt-3 leading-6">
              이용자 등록 시 휴대폰 번호 또는 이메일 2가지 중 하나만 입력하셔도 등록 링크를 보낼 수 있습니다.
              <br />
              등록 링크는 문자메시지와 이메일을 통해 전송되오니 입력된 정보가 올바른지 확인해 주세요.
            </p>
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

              <div className="flex gap-6">
  {["관리자", "정산", "배차", "창고"].map((p) => (
    <label key={p} className="flex items-center gap-2">
      <input
        type="checkbox"
        className="scale-125 accent-blue-600"
        defaultChecked={p !== "배차" && p !== "창고"}
      />
      {p}
    </label>
  ))}
</div>
            </div>

            <div>
              <div className="font-semibold mb-3 text-gray-800">
                소속그룹관리
              </div>

              <label className="flex items-center gap-2 mb-3">
                <input type="checkbox" defaultChecked />
                전체
              </label>

              <div className="flex justify-between items-center">
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked />
                  본사
                </label>

                <div className="w-5 h-5 border rounded-full"></div>
              </div>
            </div>
          </div>
        )}

        {/* ================= 알림 ================= */}
        {tab === "알림설정" && (
          <div className="space-y-6 text-[18px]">

            <AlarmGroup title="배차완료알림" items={["웹", "어플", "카카오톡", "이메일"]} />
            <AlarmGroup title="정산 알림" items={["웹", "어플", "이메일"]} />
            <AlarmGroup title="지연 알림" items={["웹", "어플", "카카오톡"]} />
            <AlarmGroup title="최적화 알림" items={["웹"]} />

            <div className="flex justify-between items-center pt-2">
              <span className="text-gray-700">
                내가 요청한 운송건에 대한 알림만 받기
              </span>
              <Toggle />
            </div>
          </div>
        )}

        {/* 하단 버튼 */}
        <div className="flex justify-end gap-3 mt-10">
          <button
            onClick={onClose}
            className="px-5 py-2 text-[18px] border rounded bg-gray-100 hover:bg-gray-200"
          >
            취소
          </button>
          <button className="px-5 py-2 text-[18px] bg-blue-600 text-white rounded hover:bg-blue-700">
            수정완료
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= 공통 컴포넌트 ================= */

function Input({ label, value, placeholder, required }) {
  return (
    <div className="flex-1">
      <div className="mb-1 text-[13px] font-semibold text-gray-700">
        {required && <span className="text-red-500">*</span>} {label}
      </div>
      <input
        defaultValue={value}
        placeholder={placeholder}
        className="w-full border border-gray-300 px-4 py-2.5 text-[18px] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function AlarmGroup({ title, items }) {
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
            />
            {i}
          </label>
        ))}
      </div>
    </div>
  );
}
function Toggle() {
  return (
    <div className="w-12 h-6 bg-blue-500 rounded-full relative cursor-pointer">
      <div className="w-5 h-5 bg-white rounded-full absolute right-1 top-[2px]" />
    </div>
  );
}