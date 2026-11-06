// ======================= cafe-site/src/CafeOrderCard.jsx =======================
// ⭐ 2026-11-06 로지스웹 허브 리디자인 — 오더 카드(경로 · 일정 · 화물/차량 · 운임 · 올린 운송사 신뢰도)
//  새 글은 시/구까지만 보인다(정확한 주소·지명은 매칭 후 공개).
import React from "react";
import { pickRegion, regionText, isV2 } from "./cafeConstants";
import { StatusBadge, Tag, UrgentTag, Icon, Stars, NUM, timeAgo, shortDate, dayBadge } from "./ui";

export function routeOf(o) {
  const up = pickRegion(o, "상차");
  const dn = pickRegion(o, "하차");
  return {
    from: regionText(up.sido, up.sigungu) || (!isV2(o) ? o.상차지명 : "") || "지역 미기재",
    to: regionText(dn.sido, dn.sigungu) || (!isV2(o) ? o.하차지명 : "") || "지역 미기재",
  };
}
export function cargoLine(o) {
  return [o.차량톤수, o.차량종류 ? `${o.차량종류}${o.리프트 ? "(리프트)" : ""}` : "", o.화물내용].filter(Boolean).join(" · ");
}
export function fareText(o) {
  if (o.협의 || o.운임 === "협의" || o.운임 === "협의가능") return "운임 협의";
  return o.운임 || "운임 협의";
}

export function TrustLine({ trust, dark = false }) {
  if (!trust) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${dark ? "text-white/60" : "text-[#8592A8]"}`}>
      {trust.rated > 0 && <><Stars value={trust.avg} size={13} /><span style={NUM}>{trust.avg.toFixed(1)}</span><span>·</span></>}
      <span>거래 <b className={dark ? "text-white" : "text-[#3A4A66]"} style={NUM}>{trust.deals}</b>건</span>
    </span>
  );
}

export default function CafeOrderCard({ order: o, onClick, trust, mine, requested }) {
  const done = ["delivered", "cancelled", "confirmed"].includes(o.status);
  const { from, to } = routeOf(o);
  const badge = dayBadge(o.상차일);
  const reqN = (o.requesterUids || []).length;
  return (
    <button type="button" onClick={onClick}
      className={`group text-left w-full bg-white rounded-[20px] ring-1 ring-inset ring-[#E2E7EF] overflow-hidden transition hover:ring-[#9FB4D9] hover:shadow-[0_18px_40px_rgba(15,26,48,.10)] hover:-translate-y-0.5 ${done ? "opacity-70" : ""}`}>
      <div className="px-5 pt-4 pb-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge status={o.status} />
          {o.긴급 && <UrgentTag />}
          {o.운행유형 === "왕복" && <Tag>왕복</Tag>}
          {o.혼적 && <Tag>혼적</Tag>}
          {o.경유여부 && <Tag>경유</Tag>}
          {mine && <Tag strong>내 오더</Tag>}
          {requested && !mine && <Tag className="!bg-[#DCE7FA] !text-[#1B2B4B]">요청함</Tag>}
          <span className="ml-auto text-[13px] font-medium text-[#A3AEC0]">{timeAgo(o.createdAt)}</span>
        </div>

        <div className="mt-3.5 flex items-stretch gap-3">
          <div className="flex flex-col items-center pt-1.5 pb-1.5">
            <span className="w-2.5 h-2.5 rounded-full ring-[3px] ring-[#DCE7FA] bg-[#2D4C82]" />
            <span className="flex-1 w-px my-1 bg-gradient-to-b from-[#2D4C82] to-[#0F1A30] opacity-40" />
            <span className="w-2.5 h-2.5 rounded-[3px] bg-[#0F1A30]" />
          </div>
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[#8592A8]">상차</div>
              <div className="text-[18px] font-extrabold text-[#0F1A30] truncate leading-tight">{from}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[#8592A8]">하차</div>
              <div className="text-[18px] font-extrabold text-[#0F1A30] truncate leading-tight">{to}</div>
            </div>
          </div>
          <div className="text-right shrink-0 flex flex-col justify-between">
            <div>
              <div className="text-[13px] font-semibold text-[#8592A8]">제시 운임</div>
              <div className="text-[20px] font-extrabold text-[#0F1A30] leading-tight" style={NUM}>{fareText(o)}</div>
              {o.지급방식 && <div className="text-[13px] font-medium text-[#8592A8]">{o.지급방식}</div>}
            </div>
            {reqN > 0 && o.status === "open" && <div className="text-[13px] font-bold text-[#2D4C82]">요청 {reqN}곳</div>}
          </div>
        </div>
      </div>

      <div className="px-5 py-3 bg-[#F7F9FC] border-t border-[#EEF1F6] flex items-center gap-3">
        <div className="shrink-0 flex items-center gap-2">
          <Icon name="calendar" size={16} className="text-[#55657F]" />
          <span className="text-[14px] font-bold text-[#0F1A30]" style={NUM}>{shortDate(o.상차일) || "날짜 협의"}</span>
          {badge && <span className="text-[13px] font-bold text-[#2D4C82]">{badge}</span>}
          {o.상차시간 && <span className="text-[14px] text-[#55657F]">{o.상차시간}</span>}
        </div>
        <div className="min-w-0 flex-1 text-right text-[14px] text-[#3A4A66] truncate">{cargoLine(o) || "-"}</div>
      </div>
      <div className="px-5 py-2.5 border-t border-[#EEF1F6] flex items-center gap-2 min-w-0">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[13px] font-bold shrink-0" style={{ background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}>{String(o.companyName || "?").slice(0, 1)}</span>
        <span className="text-[14px] font-bold text-[#0F1A30] truncate">{o.companyName || "-"}</span>
        <span className="ml-auto shrink-0"><TrustLine trust={trust} /></span>
      </div>
    </button>
  );
}
