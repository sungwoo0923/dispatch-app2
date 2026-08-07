// ======================= cafe-site/src/CafeOrderDetail.jsx =======================
import React, { useState, useEffect, useRef } from "react";
import { APPLY_CANCEL_WINDOW_MS } from "./cafeConstants";
import { applyToCafeOrder, cancelCafeApply, finalizeCafeApplyIfDue, deleteCafeOrder, cancelCafeOrder, fetchCafeContact } from "./cafeApi";

const STATUS_META = {
  open:      { label: "대기중",   cls: "bg-gray-100 text-gray-600" },
  applying:  { label: "신청중",   cls: "bg-amber-50 text-amber-700" },
  confirmed: { label: "배차완료", cls: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "취소됨",   cls: "bg-red-50 text-red-600" },
};

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-1.5">
      <div className="w-20 shrink-0 text-[12px] font-bold text-gray-400">{label}</div>
      <div className="text-[13px] text-gray-800 font-medium">{value}</div>
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
  const meta = STATUS_META[order.status] || STATUS_META.open;

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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[560px] max-w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
              {order.긴급 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/15 text-white">긴급</span>}
            </div>
            <div className="text-white font-bold text-[16px] truncate">{order.상차지명} → {order.하차지명}</div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl leading-none shrink-0">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 pb-4 border-b border-gray-100">
            <Row label="상차지" value={`${order.상차지명}${order.상차지주소 ? ` (${order.상차지주소})` : ""}`} />
            <Row label="상차일시" value={`${order.상차일 || "-"} ${order.상차시간 || ""}`} />
            <Row label="하차지" value={`${order.하차지명}${order.하차지주소 ? ` (${order.하차지주소})` : ""}`} />
            <Row label="하차일시" value={order.하차일 ? `${order.하차일} ${order.하차시간 || ""}` : (order.하차시간 || null)} />
          </div>
          <div className="mb-4 pb-4 border-b border-gray-100">
            <Row label="화물내용" value={order.화물내용} />
            <Row label="차량톤수" value={order.차량톤수} />
            <Row label="차량종류" value={order.차량종류} />
            <Row label="지급방식" value={order.지급방식} />
            <Row label="상차방법" value={order.상차방법} />
            <Row label="하차방법" value={order.하차방법} />
            <Row label="운임" value={order.운임 || "협의"} />
            <Row label="옵션" value={[order.운행유형 === "왕복" && "왕복", order.혼적 && "혼적", order.경유여부 && "경유"].filter(Boolean).join(" · ") || null} />
            {order.메모 && <Row label="메모" value={order.메모} />}
          </div>
          <div>
            <Row label="등록자" value={`${order.companyName || "-"}${order.posterNickname ? ` · ${order.posterNickname}` : ""}`} />
          </div>

          {/* 신청중 카운트다운 */}
          {order.status === "applying" && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              {isApplicant ? (
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-bold text-amber-700">
                    신청 완료 처리까지 {remain != null ? remain : "-"}초
                  </div>
                  <button onClick={handleCancelApply}
                    className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-700 text-[12px] font-bold hover:bg-amber-100 transition">
                    신청취소
                  </button>
                </div>
              ) : (
                <div className="text-[13px] font-bold text-amber-700">다른 기사님이 신청 처리 중입니다.</div>
              )}
            </div>
          )}

          {/* 배차완료 — 연락처 공개 */}
          {order.status === "confirmed" && (isMine || isApplicant) && (
            <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <div className="text-[12px] font-bold text-emerald-700 mb-2">배차완료 — 연락처가 공개되었습니다</div>
              {!contact ? (
                <div className="text-[12px] text-emerald-600">연락처를 불러오는 중...</div>
              ) : isMine ? (
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-bold text-gray-800">{order.applicantName || order.applicantNickname || "신청 기사"} · {contact.applicantPhone || "-"}</div>
                  <div className="flex gap-2">
                    <a href={callHref(contact.applicantPhone)} className="px-3 py-1.5 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-bold hover:bg-[#243a60] transition">전화</a>
                    <a href={smsHref(contact.applicantPhone)} className="px-3 py-1.5 rounded-lg border border-[#1B2B4B] text-[#1B2B4B] text-[12px] font-bold hover:bg-[#1B2B4B]/5 transition">문자</a>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-bold text-gray-800">{order.companyName} · {contact.posterPhone || "-"}</div>
                  <div className="flex gap-2">
                    <a href={callHref(contact.posterPhone)} className="px-3 py-1.5 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-bold hover:bg-[#243a60] transition">전화</a>
                    <a href={smsHref(contact.posterPhone)} className="px-3 py-1.5 rounded-lg border border-[#1B2B4B] text-[#1B2B4B] text-[12px] font-bold hover:bg-[#1B2B4B]/5 transition">문자</a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 하단 액션 */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          {isMine ? (
            <>
              <button onClick={handleDelete} className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-[13px] font-semibold hover:bg-gray-50 transition">삭제</button>
              {order.status !== "cancelled" && order.status !== "confirmed" && (
                <button onClick={handleCancelOrder} className="px-4 py-2.5 rounded-xl border border-red-200 text-red-500 text-[13px] font-semibold hover:bg-red-50 transition">오더취소</button>
              )}
              {order.status === "open" && (
                <button onClick={() => onEdit(order)} className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white font-bold text-[13px] transition">수정</button>
              )}
            </>
          ) : order.status === "open" ? (
            <button onClick={handleApply} disabled={applying}
              className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white font-bold text-[13px] transition disabled:opacity-50">
              {applying ? "신청 중..." : "배차신청"}
            </button>
          ) : (
            <div className="flex-1 py-2.5 text-center text-[13px] font-semibold text-gray-400">
              {order.status === "cancelled" ? "취소된 오더입니다" : "이미 신청이 진행 중인 오더입니다"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
