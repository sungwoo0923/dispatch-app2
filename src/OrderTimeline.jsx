// ======================= src/OrderTimeline.jsx =======================
// 🕘 오더 변경 이력(2026-10-27, PC·모바일 공용)
//  오더에 쌓인 수정이력(history: {at,user,field,before,after})에 등록·배차확정·업체전달·복구 시각까지 합쳐
//  "누가 · 언제 · 무엇을" 한 줄 흐름으로 보여준다. 같은 사람이 한 번에 저장한 여러 항목은 한 칸으로 묶는다.
import React from "react";

const toMs = (v) => {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") { const t = Date.parse(v); return Number.isNaN(t) ? 0 : t; }
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return 0;
};
const LABEL = {
  차종: "차량종류", 톤수: "차량톤수", 기사명: "기사", 이름: "기사", 경유상차목록: "경유 상차지", 경유하차목록: "경유 하차지", 경유지_상차: "경유 상차지", 경유지_하차: "경유 하차지",
  상차시간기준: "상차시간 기준", 하차시간기준: "하차시간 기준", 전달사항고정: "전달사항 고정",
};
const HIDDEN = new Set(["경유지_상차", "경유지_하차", "경유지상차", "경유지하차", "작성자", "_lastModified", "updatedAt"]);
const MONEY = new Set(["청구운임", "기사운임", "수수료", "산재보험료"]);
const fmtVal = (field, v) => {
  if (v === null || v === undefined || v === "") return "없음";
  if (Array.isArray(v)) return v.length ? `${v.length}곳 · ${v.map((x) => x?.업체명 || "").filter(Boolean).join(", ")}` : "없음";
  if (typeof v === "boolean") return v ? "예" : "아니오";
  if (typeof v === "object") return toMs(v) ? new Date(toMs(v)).toLocaleString("ko-KR") : "변경";
  if (MONEY.has(field) && /^-?\d+(\.\d+)?$/.test(String(v).replace(/,/g, ""))) return `${Number(String(v).replace(/,/g, "")).toLocaleString("ko-KR")}원`;
  return String(v);
};
const fmtAt = (ms) => new Date(ms).toLocaleString("ko-KR", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });

export function buildOrderEvents(order) {
  if (!order) return [];
  const ev = [];
  const created = toMs(order.createdAt) || toMs(order.등록일시);
  if (created) {
    const via = order.정기오더 ? `정기 오더(${order.정기오더.name || ""})` : order.등록기기 ? `${order.등록기기}에서` : "";
    ev.push({ at: created, user: order.createdByEmail || order.등록자명 || "", kind: "등록", lines: [via ? `${via} 등록` : "오더 등록"] });
  }
  // 수정이력 — 같은 사람이 1분 안에 저장한 항목은 한 칸으로
  const hist = (Array.isArray(order.history) ? order.history : []).filter((h) => h && h.field && !HIDDEN.has(h.field)).sort((a, b) => toMs(a.at) - toMs(b.at));
  hist.forEach((h) => {
    const at = toMs(h.at);
    const line = { field: LABEL[h.field] || h.field, before: fmtVal(h.field, h.before), after: fmtVal(h.field, h.after) };
    if (line.before === line.after) return;
    if (/\[object Object\]/.test(line.before + line.after)) return; // 예전 경유지 저장 방식이 남긴 의미 없는 기록
    const last = ev[ev.length - 1];
    if (last && last.kind === "수정" && last.user === (h.user || "") && Math.abs(at - last.at) < 60000) last.lines.push(line);
    else ev.push({ at, user: h.user || "", kind: "수정", lines: [line] });
  });
  const confirmed = toMs(order.배차확정일시);
  if (confirmed) ev.push({ at: confirmed, user: order.배차확정자 || "", kind: "배차확정", lines: [`${order.차량번호 || ""} ${order.이름 || order.기사명 || ""}`.trim() || "배차 완료"] });
  const delivered = toMs(order.업체전달일시);
  if (delivered && order.업체전달상태 === "전달완료") ev.push({ at: delivered, user: order.업체전달자 || "", kind: "업체전달", lines: [order.업체전달방법 ? `${order.업체전달방법}로 전달` : "업체에 전달"] });
  const restored = toMs(order.복구일시);
  if (restored) ev.push({ at: restored, user: order.복구자 || "", kind: "복구", lines: ["휴지통에서 되살림"] });
  return ev.sort((a, b) => b.at - a.at);
}

// userName: (email) => 실명 — PC는 userNameMap으로 바꿔 보여준다
export function OrderTimeline({ order, userName, size = "md" }) {
  const events = React.useMemo(() => buildOrderEvents(order), [order]);
  const big = size !== "sm";
  const who = (u) => (u ? (userName?.(u) || String(u).split("@")[0]) : "");
  if (!events.length) return <div className="py-8 text-center text-[13.5px] text-[#9AA9C3]">아직 기록된 변경 이력이 없습니다</div>;
  return (
    <ol className="relative">
      {events.map((e, i) => (
        <li key={i} className="relative pl-7 pb-4 last:pb-0">
          {i < events.length - 1 && <span className="absolute left-[7px] top-4 bottom-0 w-px bg-[#DCE3EE]" />}
          <span className={`absolute left-0 top-1 w-[15px] h-[15px] rounded-full border-[3px] ${i === 0 ? "border-[#0F1A30] bg-white" : "border-[#C9D4E5] bg-white"}`} />
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className={`inline-flex items-center h-[20px] px-2 rounded-md text-[11.5px] font-black ${e.kind === "수정" ? "bg-[#EEF3FB] text-[#1B2B4B]" : "bg-[#0F1A30] text-white"}`}>{e.kind}</span>
            <span className={`${big ? "text-[13px]" : "text-[12px]"} font-bold text-[#0F1A30] tabular-nums`}>{fmtAt(e.at)}</span>
            {who(e.user) && <span className={`${big ? "text-[12.5px]" : "text-[11.5px]"} text-[#7A879C] font-semibold`}>{who(e.user)}</span>}
          </div>
          <div className="mt-1 space-y-0.5">
            {e.lines.map((l, k) => typeof l === "string" ? (
              <div key={k} className={`${big ? "text-[13.5px]" : "text-[12.5px]"} text-[#3A4A66]`}>{l}</div>
            ) : (
              <div key={k} className={`${big ? "text-[13.5px]" : "text-[12.5px]"} text-[#3A4A66] break-words`}>
                <span className="font-bold text-[#0F1A30]">{l.field}</span>
                <span className="text-[#9AA9C3]"> {l.before}</span>
                <span className="text-[#7A879C]"> → </span>
                <span className="font-bold text-[#1B2B4B]">{l.after}</span>
              </div>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

// PC용 가운데 창
export function OrderTimelineModal({ order, onClose, userName }) {
  return (
    <div className="fixed inset-0 z-[1000000] bg-[#0F1A30]/45 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-[560px] max-h-[82vh] bg-white rounded-[22px] shadow-[0_24px_60px_rgba(15,26,48,0.35)] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 bg-gradient-to-r from-[#0F1A30] via-[#1B2B4B] to-[#2D4C82] text-white flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-white/60">HISTORY</div>
            <div className="text-[18px] font-black">변경 이력</div>
            <div className="text-[12.5px] text-white/70 mt-0.5 truncate">{order?.상차일} · {order?.거래처명} · {order?.상차지명} → {order?.하차지명}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 text-white text-[16px] shrink-0">✕</button>
        </div>
        <div className="px-6 py-5 overflow-y-auto"><OrderTimeline order={order} userName={userName} /></div>
      </div>
    </div>
  );
}
