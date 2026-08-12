// ======================= cafe-site/src/CafeOrderTable.jsx =======================
// "기본형" 보기 — 운송 프로그램(배차현황)처럼 컬럼이 있는 가로형(엑셀형) 표.
// 컨테이너 폭 안에서 가로 스크롤 없이 한 화면에 들어오도록 table-fixed로 폭을
// 고정하고, 글씨는 운송 프로그램과 동일하게 진하고 또렷하게(font-bold, 어두운 색)
// 보이도록 하며 모든 칸은 가운데 정렬한다.
import React from "react";

const STATUS_META = {
  open:      { label: "대기중" },
  applying:  { label: "신청중" },
  confirmed: { label: "배차완료" },
  cancelled: { label: "취소됨" },
};

const Th = ({ children, w }) => (
  <th style={{ width: w }} className="px-2 py-2.5 text-center text-[12px] font-extrabold text-gray-600 border-b-2 border-gray-200 whitespace-nowrap">{children}</th>
);
const Td = ({ children, className = "" }) => (
  <td className={`px-2 py-2.5 text-[13px] text-gray-900 border-b border-gray-100 text-center truncate ${className}`}>{children}</td>
);

export default function CafeOrderTable({ orders, onClick, showUnread }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse table-fixed min-w-[980px]">
          <thead className="bg-gray-50">
            <tr>
              <Th w="7%">상태</Th>
              <Th w="10%">상차일시</Th>
              <Th w="13%">상차지</Th>
              <Th w="13%">하차지</Th>
              <Th w="9%">상/하차</Th>
              <Th w="16%">화물내용</Th>
              <Th w="10%">차량</Th>
              <Th w="7%">지급</Th>
              <Th w="8%">운임</Th>
              <Th w="7%">등록자</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => {
              const meta = STATUS_META[o.status] || STATUS_META.open;
              return (
                <tr key={o.id} onClick={() => onClick(o)} className="cursor-pointer hover:bg-[#1B2B4B]/5 transition">
                  <Td>
                    <span className="relative inline-flex items-center gap-1">
                      {showUnread && o.posterUnread && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-cafe-blink" />
                      )}
                      <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded border ${o.status === "confirmed" ? "border-[#1B2B4B] text-[#1B2B4B] bg-[#1B2B4B]/5" : o.status === "cancelled" ? "border-gray-300 text-gray-400" : "border-gray-300 text-gray-600"}`}>
                        {meta.label}
                      </span>
                    </span>
                    {o.긴급 && <span className="ml-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded border border-orange-300 text-orange-700">긴급</span>}
                  </Td>
                  <Td className="font-bold">
                    <div>{o.상차일 || "-"}</div>
                    <div className="text-[11px] text-gray-500 font-semibold">{o.상차시간 || ""}</div>
                  </Td>
                  <Td className="font-bold" title={o.상차지주소}>
                    <div>{o.상차지명 || "-"}</div>
                    <div className="text-[11px] text-gray-500 font-medium truncate">{o.상차지주소 || ""}</div>
                  </Td>
                  <Td className="font-bold" title={o.하차지주소}>
                    <div>{o.하차지명 || "-"}</div>
                    <div className="text-[11px] text-gray-500 font-medium truncate">{o.하차지주소 || ""}</div>
                  </Td>
                  <Td className="font-semibold">{[o.상차방법, o.하차방법].filter(Boolean).join("/") || "-"}</Td>
                  <Td className="font-semibold" title={o.화물내용}>{o.화물내용 || "-"}</Td>
                  <Td className="font-semibold">{o.차량톤수 || ""}{o.차량종류 ? ` ${o.차량종류}` : ""}{o.리프트 ? "(리프트)" : ""}</Td>
                  <Td className="font-semibold">{o.지급방식 || "-"}</Td>
                  <Td className="font-extrabold text-[#1B2B4B]">{o.운임 || "협의"}</Td>
                  <Td className="font-semibold" title={`${o.companyName || ""} ${o.posterNickname || ""}`}>{o.companyName || "-"}</Td>
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
