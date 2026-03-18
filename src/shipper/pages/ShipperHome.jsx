import { useState } from "react";

export default function ShipperHome() {
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="flex gap-6">

      {/* ================= 좌측 ================= */}
      <div className="flex-1 space-y-4">

        {/* 탭 */}
        <div className="flex gap-6 border-b pb-2 text-sm font-semibold">
          <button
            onClick={() => setTab("dashboard")}
            className={`pb-2 ${
              tab === "dashboard"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-400"
            }`}
          >
            대시보드
          </button>

          <button
            onClick={() => setTab("report")}
            className={`pb-2 ${
              tab === "report"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-400"
            }`}
          >
            보고서
          </button>
        </div>

        <div className="text-lg font-bold">실시간 운송정보</div>

        {/* KPI */}
        <div className="grid grid-cols-6 gap-4">
          <Kpi title="전체 운송 건수" value="0" />
          <Kpi title="배차중" value="0" color="text-gray-700" />
          <Kpi title="운송중" value="0" color="text-blue-600" />
          <Kpi title="운송완료" value="0" color="text-green-600" />
          <Kpi title="예외상황" value="0" color="text-red-500" />
          <Kpi title="CS 문의" value="0" color="text-orange-500" />
        </div>

        {/* 🔥 핵심: 좌우 분할 */}
<div className="flex gap-4">

  {/* 지도 */}
  <div className="w-[62%] bg-white rounded-lg border border-gray-100 h-[450px] shadow-sm flex flex-col items-center justify-center text-gray-400 text-sm">
    <div className="text-lg mb-2">🚧</div>
    <div className="font-medium">지도 기능 준비중입니다</div>
    <div className="text-xs mt-1">곧 업데이트 예정</div>
  </div>

          {/* ================= 우측 패널 ================= */}
          <div className="w-[38%] bg-white rounded-lg border border-gray-100 shadow-sm flex flex-col">

            {/* 🔥 검색 영역 */}
            <div className="p-3 border-b">

              <div className="flex justify-between items-center mb-2 text-sm text-gray-500">
                <div>총 0 건</div>
              </div>

              <div className="flex items-center gap-2">

                <div className="flex items-center border border-gray-300 rounded-md px-3 h-9 flex-1 bg-white">
                  <span className="text-gray-400 text-sm mr-2">🔍</span>
                  <input
                    placeholder="오더번호, 차량, 기사 검색"
                    className="flex-1 text-sm outline-none bg-transparent"
                  />
                </div>

                <select className="border border-gray-300 rounded-md h-9 px-3 text-sm bg-white">
                  <option>운송상태</option>
                  <option>요청</option>
                  <option>운송중</option>
                  <option>완료</option>
                </select>

                <button className="h-9 px-4 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600">
                  검색
                </button>

              </div>
            </div>

            {/* 🔥 리스트 영역 */}
<div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
  검색된 내역이 없습니다.
            </div>

          </div>

        </div>

      </div>

      {/* ================= 오른쪽 사이드 ================= */}
      <div className="w-72 bg-white rounded-lg border border-gray-100 p-4 shadow-sm">
        <div className="font-bold mb-3">최근 방문 내역</div>

        <div className="space-y-2 text-sm">
          <PanelItem title="운송" sub="일반 배차등록" />
          <PanelItem title="운송" sub="운송목록" />
          <PanelItem title="마스터설정" sub="설정" />
          <PanelItem title="운송" sub="대량 배차등록" />
          <PanelItem title="정산" sub="운송사정산" />
        </div>
      </div>

    </div>
  );
}

/* KPI */
function Kpi({ title, value, color = "text-gray-800" }) {
  return (
    <div className="bg-white rounded-lg px-5 py-4 shadow-sm border border-gray-100">
      <div className="text-[11px] text-gray-400 mb-1">{title}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

/* 우측 패널 */
function PanelItem({ title, sub }) {
  return (
    <div className="p-3 border border-gray-100 rounded hover:bg-gray-50 cursor-pointer flex justify-between">
      <div>
        <div className="text-xs text-gray-400">{title}</div>
        <div>{sub}</div>
      </div>
      <div>›</div>
    </div>
  );
}