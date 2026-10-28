// ======================= cafe-site/src/CafeOrderTable.jsx =======================
// "표" 보기 — 운송 프로그램(배차현황)처럼 컬럼이 있는 가로형(엑셀형) 표.
// ⭐ 2026-10-28 리디자인 — 네이비 머리줄, 상태 배지 통일. flat=true면 바깥 테두리 없이(패널 안).
import React from "react";
import { StatusBadge, Tag, MONO } from "./ui";

const COLS = ["상태", "상차일", "상차시간", "상차지명", "상차지주소", "하차지명", "하차지주소", "상/하차방법", "화물내용", "차량종류", "차량톤수", "지급방식", "운임", "등록자"];
const Td = ({ children, className = "" }) => <td className={`px-3 py-3 text-[13px] text-[#3A4A66] border-b border-[#F1F4F9] whitespace-nowrap ${className}`}>{children}</td>;

export default function CafeOrderTable({ orders, onClick, flat = false }) {
  return (
    <div className={flat ? "" : "bg-white border border-[#E3E8F0] rounded-[20px] overflow-hidden"}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#0F1A30]">
              {COLS.map((c) => <th key={c} className="px-3 py-3 text-left text-[11.5px] font-black text-white/80 whitespace-nowrap">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.id} onClick={() => onClick(o)} className="cursor-pointer hover:bg-[#F5F8FD] transition">
                <Td><span className="inline-flex gap-1"><StatusBadge status={o.status} />{o.긴급 && <Tag strong>긴급</Tag>}</span></Td>
                <Td className="font-black text-[#0F1A30]"><span style={{ fontFamily: MONO }}>{o.상차일 || "-"}</span></Td>
                <Td>{o.상차시간 || "-"}</Td>
                <Td className="font-bold text-[#0F1A30]">{o.상차지명 || "-"}</Td>
                <Td className="max-w-[170px] truncate" title={o.상차지주소}>{o.상차지주소 || "-"}</Td>
                <Td className="font-bold text-[#0F1A30]">{o.하차지명 || "-"}</Td>
                <Td className="max-w-[170px] truncate" title={o.하차지주소}>{o.하차지주소 || "-"}</Td>
                <Td>{[o.상차방법, o.하차방법].filter(Boolean).join(" / ") || "-"}</Td>
                <Td className="max-w-[180px] truncate" title={o.화물내용}>{o.화물내용 || "-"}</Td>
                <Td>{o.차량종류 || "-"}{o.리프트 ? " (리프트)" : ""}</Td>
                <Td>{o.차량톤수 || "-"}</Td>
                <Td>{o.지급방식 || "-"}</Td>
                <Td className="font-black text-[#0F1A30]"><span style={{ fontFamily: MONO }}>{o.운임 || "협의가능"}</span></Td>
                <Td>{o.companyName || "-"}{o.posterNickname ? ` · ${o.posterNickname}` : ""}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {orders.length === 0 && <div className="py-16 text-center text-[13.5px] font-bold text-[#9AA9C3]">등록된 오더가 없습니다</div>}
    </div>
  );
}
