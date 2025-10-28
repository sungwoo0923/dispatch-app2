import React, { useMemo, useState } from "react";
import DriverPickerModal from "./DriverPickerModal";

export default function RealtimeStatus({ dispatchData, setDispatchData, drivers, setDrivers }) {
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [targetRow, setTargetRow] = useState(null);

  const today = new Date().toISOString().slice(0, 10);

  // 🔍 오늘 상차일 + 검색 필터
  const filtered = useMemo(() => {
    let data = (dispatchData || []).filter((r) => (r.상차일 || "") === today);
    if (q.trim()) {
      const lower = q.toLowerCase();
      data = data.filter((r) =>
        Object.values(r || {})
          .join(" ")
          .toLowerCase()
          .includes(lower)
      );
    }
    return data;
  }, [dispatchData, q, today]);

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
      <h2 className="text-lg font-bold mb-3">실시간 배차현황 (오늘 상차)</h2>

      <div className="flex justify-between items-center mb-3">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색 (거래처명, 기사이름, 차량번호 등)"
          className="border p-2 rounded w-1/2"
        />
        <div className="text-sm text-gray-600">
          {today} 기준 ({filtered.length}건)
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-gray-400 mt-10">
          오늘 상차 예정 데이터가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-gray-100">
              <tr>
                {[
                  "#", "거래처명", "상차지명", "하차지명", "화물내용",
                  "차량번호", "기사이름", "상차일", "하차일",
                  "청구운임", "기사운임", "수수료", "상태"
                ].map((h) => (
                  <th key={h} className="p-2 border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} className="border-b hover:bg-blue-50">
                  <td className="p-2 text-center">{i + 1}</td>
                  <td className="p-2">{r.거래처명}</td>
                  <td className="p-2">{r.상차지명}</td>
                  <td className="p-2">{r.하차지명}</td>
                  <td className="p-2">{r.화물내용}</td>
                  <td
                    className="p-2 underline text-blue-600 cursor-pointer"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setTargetRow(r);
                      setModalOpen(true);
                    }}
                  >
                    {r.차량번호 || "(입력)"}
                  </td>
                  <td className="p-2">{r.이름}</td>
                  <td className="p-2 text-center">{r.상차일}</td>
                  <td className="p-2 text-center">{r.하차일}</td>
                  <td className="p-2 text-right">{r.청구운임}</td>
                  <td className="p-2 text-right">{r.기사운임}</td>
                  <td className="p-2 text-right text-blue-600 font-semibold">
                    {r.수수료}
                  </td>
                  <td className="p-2 text-center">{r.배차상태}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
