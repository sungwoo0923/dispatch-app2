// ======================= cafe-site/src/CafeOrderTable.jsx =======================
// "표" 보기 — 운송 프로그램(배차현황)처럼 컬럼이 있는 가로형 표.
// ⭐ 2026-11-06 로지스웹 허브 리디자인 — 시/구 경로, 제시 운임, 올린 운송사 신뢰도. flat=true면 바깥 테두리 없이(패널 안).
import React from "react";
import { StatusBadge, UrgentTag, Tag, NUM, shortDate, timeAgo } from "./ui";
import { routeOf, fareText, TrustLine } from "./CafeOrderCard";

const COLS = ["상태", "상차일", "상차", "하차", "차량", "화물", "제시 운임", "지급", "올린 운송사", "요청", "등록"];
const Td = ({ children, className = "" }) => <td className={`px-3.5 py-3.5 text-[14px] text-[#3A4A66] border-b border-[#EEF1F6] whitespace-nowrap ${className}`}>{children}</td>;

export default function CafeOrderTable({ orders, onClick, flat = false, trustOf = () => null, myUid }) {
  return (
    <div className={flat ? "" : "bg-white rounded-[20px] ring-1 ring-inset ring-[#E2E7EF] overflow-hidden"}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#0F1A30]">
              {COLS.map((c) => <th key={c} className="px-3.5 py-3 text-left text-[13px] font-bold text-white/75 whitespace-nowrap">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {orders.map(o => {
              const { from, to } = routeOf(o);
              return (
                <tr key={o.id} onClick={() => onClick(o)} className="cursor-pointer hover:bg-[#F5F8FD] transition">
                  <Td><span className="inline-flex gap-1.5 items-center"><StatusBadge status={o.status} />{o.긴급 && <UrgentTag />}{o.posterUid === myUid && <Tag strong>내 오더</Tag>}</span></Td>
                  <Td className="font-bold text-[#0F1A30]"><span style={NUM}>{shortDate(o.상차일) || "-"}</span>{o.상차시간 ? <span className="ml-1.5 font-medium text-[#55657F]">{o.상차시간}</span> : null}</Td>
                  <Td className="font-bold text-[#0F1A30]">{from}</Td>
                  <Td className="font-bold text-[#0F1A30]">{to}</Td>
                  <Td>{[o.차량톤수, o.차량종류].filter(Boolean).join(" ") || "-"}{o.리프트 ? " (리프트)" : ""}</Td>
                  <Td className="max-w-[200px] truncate" title={o.화물내용}>{o.화물내용 || "-"}</Td>
                  <Td className="font-extrabold text-[#0F1A30]"><span style={NUM}>{fareText(o)}</span></Td>
                  <Td>{o.지급방식 || "-"}</Td>
                  <Td><span className="font-bold text-[#0F1A30]">{o.companyName || "-"}</span> <TrustLine trust={trustOf(o.companyName)} /></Td>
                  <Td><span style={NUM}>{(o.requesterUids || []).length || "-"}</span></Td>
                  <Td className="text-[#8592A8]">{timeAgo(o.createdAt)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {orders.length === 0 && <div className="py-16 text-center text-[14px] font-semibold text-[#8592A8]">조건에 맞는 오더가 없습니다</div>}
    </div>
  );
}
