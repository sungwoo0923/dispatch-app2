// ======================= cafe-site/src/CafeOrderDetail.jsx =======================
import React, { useState, useEffect, useRef } from "react";
import { APPLY_CANCEL_WINDOW_MS } from "./cafeConstants";
import { applyToCafeOrder, cancelCafeApply, finalizeCafeApplyIfDue, deleteCafeOrder, cancelCafeOrder, fetchCafeContact } from "./cafeApi";
import { GRID_BG, MONO, Icon, StatusBadge, Tag } from "./ui";
// ⭐ 2026-10-28 리디자인 — 경로 카드 + 정보 그리드, 상태는 네이비 한 계열(색 구분 없음)

function Cell({ label, value, strong }) {
  if (!value) return null;
  return (
    <div className="rounded-xl bg-[#F8FAFD] border border-[#EEF1F6] px-3.5 py-2.5 min-w-0">
      <div className="text-[11px] font-bold text-[#7A879C]">{label}</div>
      <div className={`text-[14px] mt-0.5 break-words ${strong ? "font-black text-[#0F1A30]" : "font-bold text-[#1F2A44]"}`}>{value}</div>
    </div>
  );
}

export default function CafeOrderDetail({ order, profile, onClose, onEdit }) {
  const [applying, setApplying] = useState(false);
  const [remain, setRemain] = useState(null);
  const [contact, setContact] = useState(null);
  const finalizeTimer = useRef(null);

  const isMine = order.posterUid === profile.uid;
  const isApplicant = order.applicantUid === profile.uid;

  // 신청중 상태 카운트다운(10초) — 본인이 신청자라면 취소 가능 구간, 아니라면 마감 임박 표시.
  useEffect(() => {
    if (order.status !== "applying" || !order.applyRequestedAt?.toMillis) {
      setRemain(null);
      return;
    }
    const requestedMs = order.applyRequestedAt.toMillis();
    const tick = () => {
      const left = APPLY_CANCEL_WINDOW_MS - (Date.now() - requestedMs);
      setRemain(Math.max(0, Math.ceil(left / 1000)));
      if (left <= 0) {
        finalizeCafeApplyIfDue(order.id).catch(() => {});
      }
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [order.status, order.applyRequestedAt, order.id]);

  // 배차완료 상태면 연락처를 가져온다(당사자만 firestore.rules에서 조회 허용).
  useEffect(() => {
    if (order.status === "confirmed" && (isMine || isApplicant)) {
      fetchCafeContact(order.id).then(setContact);
    } else {
      setContact(null);
    }
  }, [order.status, order.id, isMine, isApplicant]);

  const handleApply = async () => {
    setApplying(true);
    try {
      await applyToCafeOrder(order.id, { uid: profile.uid, name: profile.name, nickname: profile.nickname, phone: profile.phone });
      finalizeTimer.current = setTimeout(() => { finalizeCafeApplyIfDue(order.id).catch(() => {}); }, APPLY_CANCEL_WINDOW_MS + 500);
    } catch (e) {
      alert(e.message || "신청 중 오류가 발생했습니다.");
    } finally {
      setApplying(false);
    }
  };

  const handleCancelApply = async () => {
    if (finalizeTimer.current) clearTimeout(finalizeTimer.current);
    await cancelCafeApply(order.id, profile.uid).catch(() => {});
  };

  const handleDelete = async () => {
    if (!confirm("이 오더를 삭제하시겠습니까?")) return;
    await deleteCafeOrder(order.id).catch(() => {});
    onClose();
  };

  const handleCancelOrder = async () => {
    if (!confirm("이 오더를 취소 처리하시겠습니까?")) return;
    await cancelCafeOrder(order.id).catch(() => {});
  };

  const callHref = (phone) => `tel:${(phone || "").replace(/[^\d]/g, "")}`;
  const smsHref = (phone) => `sms:${(phone || "").replace(/[^\d]/g, "")}`;

  const contactBox = (who, phone) => (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[12px] font-bold text-white/60">{who}</div>
        <div className="text-[18px] font-black tracking-wide" style={{ fontFamily: MONO }}>{phone || "-"}</div>
      </div>
      <div className="flex gap-2 shrink-0">
        <a href={callHref(phone)} className="h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[13px] font-black inline-flex items-center gap-1.5"><Icon name="phone" size={15} />전화</a>
        <a href={smsHref(phone)} className="h-10 px-4 rounded-xl ring-1 ring-white/30 text-white text-[13px] font-black inline-flex items-center gap-1.5"><Icon name="chat" size={15} />문자</a>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-[#0F1A30]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-[9999] sm:p-4" onClick={onClose}>
      <div className="bg-[#F4F6FA] sm:rounded-[24px] rounded-t-[24px] shadow-[0_24px_60px_rgba(15,26,48,0.4)] w-full sm:w-[600px] max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-5 text-white shrink-0 relative" style={GRID_BG}>
          <div className="flex items-center gap-1.5">
            <StatusBadge status={order.status} />
            {order.긴급 && <span className="h-[22px] px-1.5 rounded-md bg-white text-[#0F1A30] text-[11px] font-black inline-flex items-center">긴급</span>}
            {order.운행유형 === "왕복" && <span className="h-[22px] px-1.5 rounded-md ring-1 ring-white/30 text-[11px] font-black inline-flex items-center">왕복</span>}
            <button type="button" onClick={onClose} className="ml-auto w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center text-white/70"><Icon name="close" size={18} /></button>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>FROM · 상차</div>
              <div className="text-[19px] font-black truncate">{order.상차지명}</div>
              <div className="text-[12px] text-white/55 truncate">{order.상차지주소 || " "}</div>
            </div>
            <span className="w-10 h-10 rounded-full bg-white/10 ring-1 ring-white/20 flex items-center justify-center"><Icon name="arrow" size={17} /></span>
            <div className="min-w-0 text-right">
              <div className="text-[10px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>TO · 하차</div>
              <div className="text-[19px] font-black truncate">{order.하차지명}</div>
              <div className="text-[12px] text-white/55 truncate">{order.하차지주소 || " "}</div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-white/[0.07] ring-1 ring-white/10 px-4 py-2.5">
            <span className="text-[12.5px] font-bold text-white/70">운임</span>
            <span className="text-[22px] font-black" style={{ fontFamily: MONO }}>{order.운임 || "협의"}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Cell label="상차일시" value={`${order.상차일 || "-"} ${order.상차시간 || ""}`} strong />
            <Cell label="하차일시" value={order.하차일 ? `${order.하차일} ${order.하차시간 || ""}` : (order.하차시간 || "-")} strong />
            <Cell label="화물내용" value={order.화물내용} strong />
            <Cell label="차량" value={[order.차량톤수, order.차량종류, order.리프트 ? "리프트" : ""].filter(Boolean).join(" · ") || "-"} />
            <Cell label="상차방법" value={order.상차방법} />
            <Cell label="하차방법" value={order.하차방법} />
            <Cell label="지급방식" value={order.지급방식} />
            <Cell label="옵션" value={[order.운행유형 === "왕복" && "왕복", order.혼적 && "혼적", order.경유여부 && "경유"].filter(Boolean).join(" · ") || null} />
          </div>
          {order.메모 && <div className="rounded-xl bg-white border border-[#E3E8F0] px-4 py-3"><div className="text-[11px] font-bold text-[#7A879C]">메모</div><div className="text-[14px] text-[#1F2A44] whitespace-pre-wrap mt-0.5">{order.메모}</div></div>}
          <div className="flex items-center gap-3 rounded-xl bg-white border border-[#E3E8F0] px-4 py-3">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black shrink-0" style={{ background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}>{String(order.companyName || "?").slice(0, 1)}</span>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-[#7A879C]">등록자</div>
              <div className="text-[14px] font-black text-[#0F1A30] truncate">{order.companyName || "-"}{order.posterNickname ? <span className="font-bold text-[#7A879C]"> · {order.posterNickname}</span> : null}</div>
            </div>
            {isMine && <span className="ml-auto"><Tag>내 오더</Tag></span>}
          </div>

          {/* 신청중 카운트다운 */}
          {order.status === "applying" && (
            <div className="rounded-2xl border-2 border-[#1B2B4B] bg-white px-4 py-3.5">
              {isApplicant ? (
                <div className="flex items-center gap-3">
                  <div className="relative w-12 h-12 shrink-0">
                    <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90"><circle cx="18" cy="18" r="15" fill="none" stroke="#EEF1F6" strokeWidth="3.5" /><circle cx="18" cy="18" r="15" fill="none" stroke="#1B2B4B" strokeWidth="3.5" strokeDasharray={`${((remain || 0) / 10) * 94} 94`} strokeLinecap="round" /></svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[15px] font-black text-[#0F1A30]" style={{ fontFamily: MONO }}>{remain != null ? remain : "-"}</span>
                  </div>
                  <div className="flex-1 text-[13.5px] font-bold text-[#0F1A30]">배차 확정까지 {remain != null ? remain : "-"}초 — 지금은 취소할 수 있습니다</div>
                  <button type="button" onClick={handleCancelApply} className="h-10 px-4 rounded-xl border border-[#0F1A30] text-[#0F1A30] text-[13px] font-black">신청취소</button>
                </div>
              ) : (
                <div className="text-[13.5px] font-bold text-[#0F1A30]">다른 회원이 배차신청을 진행하고 있습니다.</div>
              )}
            </div>
          )}

          {/* 배차완료 — 연락처 공개 */}
          {order.status === "confirmed" && (isMine || isApplicant) && (
            <div className="rounded-2xl px-5 py-4 text-white" style={GRID_BG}>
              <div className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#8FB0F0] mb-2" style={{ fontFamily: MONO }}>CONFIRMED · 연락처 공개</div>
              {!contact ? <div className="text-[13px] text-white/70">연락처를 불러오는 중…</div>
                : isMine ? contactBox(order.applicantName || order.applicantNickname || "신청자", contact.applicantPhone)
                  : contactBox(order.companyName || "등록자", contact.posterPhone)}
            </div>
          )}
        </div>

        {/* 하단 액션 */}
        <div className="px-5 py-4 border-t border-[#E3E8F0] bg-white flex gap-2.5 shrink-0 pb-[max(16px,env(safe-area-inset-bottom))]">
          {isMine ? (
            <>
              <button type="button" onClick={handleDelete} className="h-12 px-4 rounded-xl border border-[#DCE3EE] text-[#7A879C] text-[13.5px] font-bold hover:bg-[#F5F8FD]">삭제</button>
              {order.status !== "cancelled" && order.status !== "confirmed" && (
                <button type="button" onClick={handleCancelOrder} className="h-12 px-4 rounded-xl border border-[#0F1A30] text-[#0F1A30] text-[13.5px] font-black">오더취소</button>
              )}
              {order.status === "open" && (
                <button type="button" onClick={() => onEdit(order)} className="flex-1 h-12 rounded-xl text-white font-black text-[14px]" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>수정</button>
              )}
            </>
          ) : order.status === "open" ? (
            <button type="button" onClick={handleApply} disabled={applying}
              className="flex-1 h-12 rounded-xl text-white font-black text-[15px] disabled:opacity-50 inline-flex items-center justify-center gap-2 shadow-[0_10px_24px_rgba(15,26,48,0.25)]" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>
              <Icon name="bolt" size={17} />{applying ? "신청 중…" : "배차신청"}
            </button>
          ) : (
            <div className="flex-1 h-12 flex items-center justify-center text-[13.5px] font-bold text-[#9AA9C3]">
              {order.status === "cancelled" ? "취소된 오더입니다" : order.status === "confirmed" ? "배차가 완료된 오더입니다" : "신청이 진행 중인 오더입니다"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
