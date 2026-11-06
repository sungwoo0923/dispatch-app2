// ======================= cafe-site/src/hub/HubOrderCard.jsx =======================
// ⭐ 2026-11-06 콜 카드 — 경로선 · 거리 · 운임(큰 글자) · km당 운임 · 운임 적정성 · 상차 시각 · 배지
import React from "react";
import { HI, Badge, RouteLine, NUMS } from "./hubUi";
import { manwon, fareFitness, dayLabel, ago, STATUS } from "./hubConstants";

const TONE = { good: "navy", fair: "sky", low: "line" };

export default function HubOrderCard({ o, onOpen, mine, fav, fresh, extraKm, compact = false }) {
  const km = o.거리km || 0;
  const fare = Number(o.운임) || 0;
  const perKm = km && fare ? Math.round(fare / km) : 0;
  const fit = fareFitness(fare, o.차량톤수, km, o.운행유형 === "왕복");
  const st = STATUS[o.status] || STATUS.open;
  return (
    <button type="button" onClick={onOpen} data-testid="order-card" data-order-id={o.id}
      className={`group w-full text-left bg-white rounded-[22px] ring-1 ring-inset ${fresh ? "ring-[#8FB0F0] hub-new" : "ring-[#E2E7EF]"} shadow-[0_1px_2px_rgba(15,26,48,.04),0_10px_30px_rgba(15,26,48,.05)] hover:ring-[#9FB5DA] hover:shadow-[0_16px_40px_rgba(15,26,48,.10)] transition overflow-hidden`}>
      <div className="px-4 pt-4 pb-3 sm:px-5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {o.긴급 && <Badge tone="accent"><HI name="bolt" size={13} stroke={2.6} />긴급</Badge>}
          {o.status !== "open" && <Badge tone={o.status === "delivered" ? "navy" : "blue"}>{st.label}</Badge>}
          {o.운행유형 === "왕복" && <Badge tone="out">왕복</Badge>}
          <Badge tone="out">{o.적재 === "혼적" ? "혼적" : "독차"}</Badge>
          {o.지급방식 && <Badge>{o.지급방식}</Badge>}
          {mine && <Badge tone="sky">내 오더</Badge>}
          {fav && <Badge tone="sky"><HI name="heart" size={12} fill="currentColor" />즐겨찾기</Badge>}
          <span className="ml-auto text-[13.5px] font-semibold text-[#8592A8] shrink-0">{ago(o.createdAt)}</span>
        </div>
        <div className="mt-3">
          <RouteLine from={`${o.상차시도} ${o.상차시군구 || ""}`} to={`${o.하차시도} ${o.하차시군구 || ""}`} km={km}
            fromSub={`${dayLabel(o.상차일)} ${o.상차시간 || ""} 상차`} toSub={`${dayLabel(o.하차일 || o.상차일)} ${o.하차시간 || ""} 하차`} />
        </div>
        <div className="mt-3 flex items-center gap-x-2 gap-y-1 flex-wrap text-[15px] font-bold text-[#1B2B4B]">
          <span className="inline-flex items-center gap-1"><HI name="truck" size={16} className="text-[#2D4C82]" />{o.차량톤수} {o.차량종류}</span>
          {o.화물내용 && <><span className="text-[#C9D2E0]">·</span><span className="truncate max-w-[60%]">{o.화물내용}</span></>}
          {o.파레트 ? <><span className="text-[#C9D2E0]">·</span><span>{o.파레트}파레트</span></> : null}
          {o.중량 && <><span className="text-[#C9D2E0]">·</span><span>{o.중량}</span></>}
          {!compact && o.상차방법 && <><span className="text-[#C9D2E0]">·</span><span className="text-[#55657F]">{o.상차방법}</span></>}
        </div>
        {extraKm ? <div className="mt-2 text-[14px] font-bold text-[#2D4C82] inline-flex items-center gap-1"><HI name="gps" size={14} />내 위치에서 상차지까지 약 {extraKm}km</div> : null}
      </div>
      <div className="px-4 sm:px-5 py-3 bg-[#F7F9FC] border-t border-[#EEF1F6] flex items-center gap-3">
        <div className="min-w-0">
          <div className="text-[24px] font-extrabold text-[#0F1A30] leading-none" style={NUMS}>{manwon(fare)}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[13.5px] font-bold text-[#55657F]">
            {perKm ? <span style={NUMS}>km당 {perKm.toLocaleString()}원</span> : <span>거리 미상</span>}
            {o.수수료 ? <span>· 수수료 {manwon(o.수수료)}</span> : null}
          </div>
        </div>
        {fit && <Badge tone={TONE[fit.tone]} className="ml-auto">{fit.label}</Badge>}
        <span className={`${fit ? "" : "ml-auto"} w-11 h-11 rounded-2xl inline-flex items-center justify-center text-white shrink-0 group-hover:translate-x-0.5 transition`} style={{ background: "linear-gradient(120deg,#1B2B4B,#2D4C82)" }}><HI name="chevron" size={20} /></span>
      </div>
      <div className="px-4 sm:px-5 py-2.5 flex items-center gap-2 text-[14px] text-[#55657F] border-t border-[#EEF1F6]">
        <HI name="building" size={15} className="text-[#8592A8] shrink-0" />
        <span className="font-bold text-[#3A4A66] truncate">{o.posterCompany || o.posterName || "등록자"}</span>
        <span className="text-[#A3AEC0] shrink-0">{o.posterRole === "carrier" ? "운송사" : "화주"}</span>
        {o.posterVerified && <span className="ml-auto inline-flex items-center gap-1 text-[13.5px] font-bold text-[#2D4C82] shrink-0"><HI name="shield" size={15} />서류 인증</span>}
      </div>
    </button>
  );
}
