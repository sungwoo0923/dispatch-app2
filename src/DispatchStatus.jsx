import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import DriverPickerModal from "./DriverPickerModal"; // ✅ 모달 컴포넌트 분리 시

export default function DispatchStatus({ dispatchData, setDispatchData, drivers, setDrivers }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [targetRow, setTargetRow] = useState(null);

  // ✅ 상차일 기준 오름차순 정렬
  const sortedData = useMemo(
    () => [...dispatchData].sort((a, b) => new Date(a.상차일) - new Date(b.상차일)),
    [dispatchData]
  );

  // ✅ 상태별 색상
  const getStatusColor = (status) => {
    switch (status) {
      case "배차완료":
        return "bg-blue-100 text-blue-700 font-semibold";
      case "배차중":
        return "bg-yellow-100 text-yellow-700 font-semibold";
      case "배송중":
        return "bg-green-100 text-green-700 font-semibold";
      case "배송완료":
        return "bg-gray-200 text-gray-600 font-semibold";
      default:
        return "bg-gray-50 text-gray-400";
    }
  };

  // ✅ 엑셀 다운로드
  const downloadExcel = () => {
    const ws = XLSX.utils.json_to_sheet(sortedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "배차현황");
    XLSX.writeFile(wb, `${new Date().toISOString().slice(0, 10)}_배차현황.xlsx`);
  };

  // ✅ 기사정보 적용
  const applyDriver = ({ 차량번호, 이름, 전화번호 }) => {
    const idx = dispatchData.indexOf(targetRow);
    if (idx < 0) return;
    const next = [...dispatchData];
    next[idx] = { ...next[idx], 차량번호, 이름, 전화번호, 배차상태: "배차완료" };
    setDispatchData(next);
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-3">배차현황</h2>

      <div className="mb-2 flex justify-between">
        <button onClick={downloadExcel} className="bg-green-600 text-white px-3 py-1 rounded">
          엑셀 다운로드
        </button>
        <div className="text-sm text-gray-500">{sortedData.length}건</div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border text-sm text-center">
          <thead className="bg-gray-100">
            <tr>
              {[
                "순번", "등록일", "상차일", "상차시간", "하차일", "하차시간",
                "거래처명", "상차지명", "하차지명", "화물내용", "차량종류",
                "차량톤수", "차량번호", "이름", "전화번호",
                "지급방식", "배차방식", "배차상태", "청구운임", "기사운임", "수수료"
              ].map((h) => (
                <th key={h} className="border px-2 py-1">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((r, i) => (
              <tr key={i} className="border-t hover:bg-gray-50">
                <td>{i + 1}</td>
                <td>{r.등록일}</td>
                <td>{r.상차일}</td>
                <td>{r.상차시간}</td>
                <td>{r.하차일}</td>
                <td>{r.하차시간}</td>
                <td>{r.거래처명}</td>
                <td>{r.상차지명}</td>
                <td>{r.하차지명}</td>
                <td>{r.화물내용}</td>
                <td>{r.차량종류}</td>
                <td>{r.차량톤수}</td>
                <td
                  className="underline cursor-pointer text-blue-600"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setTargetRow(r);
                    setModalOpen(true);
                  }}
                >
                  {r.차량번호 || "(입력)"}
                </td>
                <td>{r.이름}</td>
                <td>{r.전화번호}</td>
                <td>{r.지급방식}</td>
                <td>{r.배차방식}</td>
                <td>
                  <span className={`px-2 py-1 rounded ${getStatusColor(r.배차상태)}`}>
                    {r.배차상태 || "-"}
                  </span>
                </td>
                <td>{r.청구운임}</td>
                <td>{r.기사운임}</td>
                <td>{r.수수료}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ✅ 기사 선택/등록 팝업 */}
      <DriverPickerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={applyDriver}
        drivers={drivers}
        setDrivers={setDrivers}
        presetCarNo={targetRow?.차량번호 || ""}
      />
    </div>
  );
}
