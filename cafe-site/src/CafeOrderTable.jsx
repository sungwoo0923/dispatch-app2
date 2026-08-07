// ======================= cafe-site/src/CafeOrderTable.jsx =======================
// "기본형" 보기 — 운송 프로그램(배차현황)처럼 컬럼이 있는 가로형(엑셀형) 표.
import React from "react";

const STATUS_META = {
  open:      { label: "대기중" },
  applying:  { label: "신청중" },
  confirmed: { label: "배차완료" },
  cancelled: { label: "취소됨" },
};

const Th = ({ children }) => (
  <th className="px-3 py-2.5 text-left text-[11px] font-bold text-gray-500 border-b border-gray-200 whitespace-nowrap">{children}</th>
);
const Td = ({ children, className = "" }) => (
  <td className={`px-3 py-2.5 text-[12.5px] text-gray-700 border-b border-gray-100 whitespace-nowrap ${className}`}>{children}</td>
);

export default function CafeOrderTable({ orders, onClick }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-gray-50">
            <tr>
              <Th>상태</Th>
              <Th>상차일</Th>
              <Th>상차시간</Th>
              <Th>상차지명</Th>
              <Th>상차지주소</Th>
              <Th>하차지명</Th>
              <Th>하차지주소</Th>
              <Th>상/하차방법</Th>
              <Th>화물내용</Th>
              <Th>차량종류</Th>
              <Th>차량톤수</Th>
              <Th>지급방식</Th>
              <Th>운임</Th>
              <Th>등록자</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => {
              const meta = STATUS_META[o.status] || STATUS_META.open;
              return (
                <tr key={o.id} onClick={() => onClick(o)} className="cursor-pointer hover:bg-gray-50 transition">
                  <Td>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${o.status === "confirmed" ? "border-[#1B2B4B] text-[#1B2B4B]" : o.status === "cancelled" ? "border-gray-300 text-gray-400" : "border-gray-300 text-gray-500"}`}>
                      {meta.label}
                    </span>
                    {o.긴급 && <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded border border-orange-300 text-orange-700">긴급</span>}
                  </Td>
                  <Td className="font-bold text-gray-900">{o.상차일 || "-"}</Td>
                  <Td>{o.상차시간 || "-"}</Td>
                  <Td className="font-semibold text-gray-900">{o.상차지명 || "-"}</Td>
                  <Td className="max-w-[160px] truncate" title={o.상차지주소}>{o.상차지주소 || "-"}</Td>
                  <Td className="font-semibold text-gray-900">{o.하차지명 || "-"}</Td>
                  <Td className="max-w-[160px] truncate" title={o.하차지주소}>{o.하차지주소 || "-"}</Td>
                  <Td>{[o.상차방법, o.하차방법].filter(Boolean).join(" / ") || "-"}</Td>
                  <Td className="max-w-[180px] truncate" title={o.화물내용}>{o.화물내용 || "-"}</Td>
                  <Td>{o.차량종류 || "-"}{o.리프트 ? " (리프트)" : ""}</Td>
                  <Td>{o.차량톤수 || "-"}</Td>
                  <Td>{o.지급방식 || "-"}</Td>
                  <Td className="font-bold text-[#1B2B4B]">{o.운임 || "협의가능"}</Td>
                  <Td>{o.companyName || "-"}{o.posterNickname ? ` · ${o.posterNickname}` : ""}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {orders.length === 0 && (
        <div className="py-16 text-center text-[13px] text-gray-400">등록된 오더가 없습니다.</div>
      )}
    </div>
  );
}
