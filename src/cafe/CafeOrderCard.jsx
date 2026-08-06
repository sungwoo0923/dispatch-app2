// ======================= src/cafe/CafeOrderCard.jsx =======================
import React from "react";

const STATUS_META = {
  open:      { label: "대기중",   dot: "#94a3b8", text: "text-gray-500" },
  applying:  { label: "신청중",   dot: "#d97706", text: "text-amber-600" },
  confirmed: { label: "배차완료", dot: "#16a34a", text: "text-emerald-600" },
  cancelled: { label: "취소됨",   dot: "#ef4444", text: "text-red-500" },
};

export default function CafeOrderCard({ order, onClick }) {
  const meta = STATUS_META[order.status] || STATUS_META.open;
  return (
    <div onClick={onClick}
      className="bg-white border border-gray-200 rounded-xl px-5 py-4 hover:border-[#1B2B4B]/40 hover:shadow-sm transition cursor-pointer">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.dot }} />
          <span className={`text-[11px] font-bold ${meta.text} shrink-0`}>{meta.label}</span>
          {order.긴급 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 shrink-0">긴급</span>}
          {order.운행유형 === "왕복" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 shrink-0">왕복</span>}
          {order.혼적 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 shrink-0">혼적</span>}
          {order.경유여부 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 shrink-0">경유</span>}
        </div>
        <span className="text-[11px] text-gray-400 shrink-0">{order.상차일}{order.상차시간 ? ` · ${order.상차시간}` : ""}</span>
      </div>

      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-bold text-[15px] text-gray-900 truncate">{order.상차지명}</span>
        <span className="text-gray-300">→</span>
        <span className="font-bold text-[15px] text-gray-900 truncate">{order.하차지명}</span>
      </div>

      <div className="text-[12px] text-gray-500 mb-2 truncate">
        {order.화물내용 || "-"}{order.차량톤수 ? ` · ${order.차량톤수}` : ""}{order.차량종류 ? ` · ${order.차량종류}` : ""}{order.지급방식 ? ` · ${order.지급방식}` : ""}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-[#1B2B4B]">{order.운임 ? order.운임 : "운임 협의"}</span>
        <span className="text-[11px] text-gray-400">{order.companyName}{order.posterNickname ? ` · ${order.posterNickname}` : ""}</span>
      </div>
    </div>
  );
}
