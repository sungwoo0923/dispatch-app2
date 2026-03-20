import { useState } from "react";
import UserEditModal from "./UserEditModal";
export default function SettingsUsers() {
    const [open, setOpen] = useState(false);
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
      <div className="text-sm text-gray-500 mb-2">총 1건</div>

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
            <tr className="border-t text-center hover:bg-gray-50">
              <td className="py-3 font-medium text-gray-800">돌캐운송사</td>
              <td className="text-gray-500">-</td>
              <td>01055041821</td>
              <td className="text-gray-600">tjdndqkf@naver.com</td>
              <td>-</td>

              {/* 권한 */}
              <td>
  <div className="flex justify-center gap-2">
    <span className="
      px-3 py-[4px]
      text-[13px] font-semibold
      rounded-md
      bg-purple-100 text-purple-700
    ">
      관리자
    </span>

    <span className="
      px-3 py-[4px]
      text-[13px] font-semibold
      rounded-md
      bg-green-100 text-green-700
    ">
      정산
    </span>
  </div>
</td>

              {/* 그룹관리 */}
              <td className="text-gray-700">본사</td>

              {/* 배차알림 */}
              <td>
                <div className="flex justify-center">
                  <div className="w-4 h-4 border border-gray-400 rounded-full"></div>
                </div>
              </td>

              {/* 정산알림 */}
              <td>
                <div className="flex justify-center">
                  <div className="w-4 h-4 border border-gray-400 rounded-full"></div>
                </div>
              </td>

              {/* 편집 */}
              <td>
                <div className="flex justify-center gap-2">
                  <button className="px-3 py-1 text-xs border rounded bg-gray-100 hover:bg-gray-200">
                    삭제
                  </button>
                  <button
  onClick={() => setOpen(true)}
  className="px-3 py-1 text-sm border rounded bg-white hover:bg-gray-100"
>
  수정
</button>
                </div>
              </td>
            </tr>
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
<UserEditModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}