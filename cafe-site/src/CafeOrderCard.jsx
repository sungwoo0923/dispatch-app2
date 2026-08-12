// ======================= cafe-site/src/CafeOrderCard.jsx =======================
import React from "react";

// 상태는 색으로 구분하지 않고(다채로워 보이지 않게) 네이비/회색 단색 틀로만 표시하고,
// "배차완료"만 채워진 네이비로 눈에 띄게 한다. 긴급만 경고색(주황)을 예외로 쓴다.
const STATUS_META = {
  open:      { label: "대기중",   cls: "border-gray-300 text-gray-500" },
  applying:  { label: "신청중",   cls: "border-[#1B2B4B]/40 text-[#1B2B4B]" },
  confirmed: { label: "배차완료", cls: "bg-[#1B2B4B] text-white border-[#1B2B4B]" },
  cancelled: { label: "취소됨",   cls: "border-gray-200 text-gray-300" },
};

export default function CafeOrderCard({ order, onClick, showUnread }) {
  const meta = STATUS_META[order.status] || STATUS_META.open;
  return (
    <div onClick={onClick}
      className="bg-white border border-gray-200 rounded-xl px-5 py-4 hover:border-[#1B2B4B]/40 hover:shadow-sm transition cursor-pointer relative">
      {showUnread && order.posterUnread && (
        <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-red-500 border-2 border-white animate-cafe-blink" />
      )}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 ${meta.cls}`}>{meta.label}</span>
          {order.긴급 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-orange-300 text-orange-700 shrink-0">긴급</span>}
          {order.운행유형 === "왕복" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 shrink-0">왕복</span>}
          {order.혼적 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 shrink-0">혼적</span>}
          {order.경유여부 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 shrink-0">경유</span>}
        </div>
        <span className="text-[11px] text-gray-400 shrink-0">{order.상차일}{order.상차시간 ? ` · ${order.상차시간}` : ""}</span>
      </div>

      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-bold text-[15px] text-gray-900 truncate">{order.상차지명}</span>
        <span className="text-gray-300">→</span>
        <span className="font-bold text-[15px] text-gray-900 truncate">{order.하차지명}</span>
      </div>

      <div className="text-[12px] text-gray-500 mb-2 truncate">
        {order.화물내용 || "-"}{order.차량톤수 ? ` · ${order.차량톤수}` : ""}{order.차량종류 ? ` · ${order.차량종류}${order.리프트 ? "(리프트)" : ""}` : ""}{order.지급방식 ? ` · ${order.지급방식}` : ""}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-[#1B2B4B]">{order.운임 ? order.운임 : "운임 협의"}</span>
        <span className="text-[11px] text-gray-400">{order.companyName}{order.posterNickname ? ` · ${order.posterNickname}` : ""}</span>
      </div>
    </div>
  );
}
