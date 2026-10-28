// ======================= cafe-site/src/CafeOrderCard.jsx =======================
// 상태는 색으로 구분하지 않고(다채로워 보이지 않게) 네이비 한 계열 — 채움/테두리로만 구분.
// ⭐ 2026-10-28 리디자인 — 티켓형 카드(날짜 블록 + 경로 + 화물/차량 + 운임)
import React from "react";
import { StatusBadge, Tag, Icon, MONO, timeAgo } from "./ui";

export default function CafeOrderCard({ order: o, onClick }) {
  const done = o.status === "confirmed" || o.status === "cancelled";
  return (
    <button type="button" onClick={onClick}
      className={`group text-left w-full bg-white border border-[#E3E8F0] rounded-[20px] overflow-hidden transition hover:border-[#1B2B4B]/40 hover:shadow-[0_14px_30px_rgba(15,26,48,0.10)] hover:-translate-y-0.5 ${done ? "opacity-70" : ""}`}>
      <div className="px-5 pt-4 pb-3.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge status={o.status} />
          {o.긴급 && <Tag strong>긴급</Tag>}
          {o.운행유형 === "왕복" && <Tag>왕복</Tag>}
          {o.혼적 && <Tag>혼적</Tag>}
          {o.경유여부 && <Tag>경유</Tag>}
          <span className="ml-auto text-[11px] font-bold text-[#9AA9C3]">{timeAgo(o.createdAt)}</span>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold tracking-[0.2em] text-[#9AA9C3]" style={{ fontFamily: MONO }}>FROM</div>
            <div className="text-[16px] font-black text-[#0F1A30] truncate">{o.상차지명}</div>
            <div className="text-[11.5px] text-[#7A879C] truncate">{o.상차지주소 || " "}</div>
          </div>
          <span className="w-8 h-8 rounded-full bg-[#EEF3FB] text-[#1B2B4B] flex items-center justify-center group-hover:bg-[#0F1A30] group-hover:text-white transition"><Icon name="arrow" size={15} /></span>
          <div className="min-w-0 text-right">
            <div className="text-[10px] font-extrabold tracking-[0.2em] text-[#9AA9C3]" style={{ fontFamily: MONO }}>TO</div>
            <div className="text-[16px] font-black text-[#0F1A30] truncate">{o.하차지명}</div>
            <div className="text-[11.5px] text-[#7A879C] truncate">{o.하차지주소 || " "}</div>
          </div>
        </div>
      </div>
      <div className="px-5 py-3 bg-[#F8FAFD] border-t border-dashed border-[#DCE3EE] flex items-center gap-3">
        <div className="shrink-0 text-center">
          <div className="text-[13px] font-black text-[#0F1A30] leading-none" style={{ fontFamily: MONO }}>{(o.상차일 || "").slice(5).replace("-", "/") || "--/--"}</div>
          <div className="text-[10.5px] font-bold text-[#7A879C] mt-1">{o.상차시간 || "시간 협의"}</div>
        </div>
        <div className="w-px h-7 bg-[#DCE3EE]" />
        <div className="min-w-0 flex-1 text-[12.5px] text-[#3A4A66] truncate">
          <b className="text-[#0F1A30]">{o.화물내용 || "-"}</b>{o.차량톤수 ? ` · ${o.차량톤수}` : ""}{o.차량종류 ? ` · ${o.차량종류}${o.리프트 ? "(리프트)" : ""}` : ""}
          <div className="text-[11.5px] text-[#9AA9C3] truncate">{o.companyName}{o.posterNickname ? ` · ${o.posterNickname}` : ""}{o.지급방식 ? ` · ${o.지급방식}` : ""}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[15px] font-black text-[#0F1A30]" style={{ fontFamily: MONO }}>{o.운임 || "협의"}</div>
        </div>
      </div>
    </button>
  );
}
