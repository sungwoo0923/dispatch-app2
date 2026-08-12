// ======================= cafe-site/src/CafeOrderDetail.jsx =======================
import React, { useState, useEffect, useRef } from "react";
import { APPLY_CANCEL_WINDOW_MS } from "./cafeConstants";
import {
  applyToCafeOrder, cancelCafeApply, finalizeCafeApplyIfDue, deleteCafeOrder, cancelCafeOrder,
  cancelCafeAssignment, fetchCafeContact, updateCafeOrder, markNotificationsRead,
  subscribeSettlement, uploadSettlementFile, markTripCompleted, markSettled, friendlyCafeError,
} from "./cafeApi";
import ConfirmAckModal from "./ConfirmAckModal";
import CafeChatDrawer from "./CafeChatDrawer";

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

export default function CafeOrderDetail({ order, profile, onClose, onEdit, notifications = [] }) {
  const [applying, setApplying] = useState(false);
  const [elapsed, setElapsed] = useState(null); // 1..10 (올라가는 카운트)
  const [contact, setContact] = useState(null);
  const [showCancelAssign, setShowCancelAssign] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [settlement, setSettlement] = useState(null);
  const [uploading, setUploading] = useState(false);
  const finalizeTimer = useRef(null);

  const isMine = order.posterUid === profile.uid;
  const isApplicant = order.applicantUid === profile.uid;
  const meta = STATUS_META[order.status] || STATUS_META.open;

  // 신청중 상태 카운트다운 — 1,2,3...처럼 경과 초가 올라가는 형태로 보여준다.
  // 10초(APPLY_CANCEL_WINDOW_MS)가 지나면 자동으로 배차완료로 확정된다.
  //
  // 화면 표시(setElapsed)는 300ms마다 갱신하되, 서버에 실제로 확정을 요청하는
  // finalizeCafeApplyIfDue는 절대 매 tick(300ms)마다 쏘지 않는다 — 서버가 일시적으로
  // 응답하지 못하는 상황(요청량 초과 등)에서 실패할 때마다 즉시 재시도하면 오히려
  // 요청 폭주를 유발해 문제를 더 키운다. 지수 백오프(2s→4s→8s→최대 15s)로만 재시도한다.
  useEffect(() => {
    if (order.status !== "applying" || !order.applyRequestedAt?.toMillis) {
      setElapsed(null);
      return;
    }
    const requestedMs = order.applyRequestedAt.toMillis();
    const totalSec = Math.round(APPLY_CANCEL_WINDOW_MS / 1000);
    let nextFinalizeAt = requestedMs + APPLY_CANCEL_WINDOW_MS;
    let backoffMs = 2000;

    const tick = () => {
      const now = Date.now();
      const passedSec = Math.floor((now - requestedMs) / 1000) + 1;
      setElapsed(Math.min(totalSec, Math.max(1, passedSec)));
      if (now >= nextFinalizeAt) {
        nextFinalizeAt = now + backoffMs;
        backoffMs = Math.min(backoffMs * 2, 15000);
        finalizeCafeApplyIfDue(order.id).catch(() => {});
      }
    };
    tick();
    const interval = setInterval(tick, 300);
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

  // 정산 정보 구독(배차완료 이후에만 의미가 있다)
  useEffect(() => {
    if (order.status !== "confirmed" || !(isMine || isApplicant)) { setSettlement(null); return; }
    return subscribeSettlement(order.id, setSettlement);
  }, [order.status, order.id, isMine, isApplicant]);

  // 이 오더와 관련해 나에게 온 안읽은 알림을 열람 처리, 게시자가 새 신청을 확인하면
  // "내 등록 오더" NEW 뱃지도 함께 꺼지도록 posterUnread를 내린다.
  useEffect(() => {
    const mine = notifications.filter(n => n.orderId === order.id && !n.read);
    if (mine.length) markNotificationsRead(mine.map(n => n.id));
    if (isMine && order.posterUnread) updateCafeOrder(order.id, { posterUnread: false }).catch(() => {});
  }, [order.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = async () => {
    setApplying(true);
    try {
      await applyToCafeOrder(order.id, {
        uid: profile.uid, name: profile.name, nickname: profile.nickname,
        phone: profile.phone, vehicleNumber: profile.vehicleNumber,
      });
      finalizeTimer.current = setTimeout(() => { finalizeCafeApplyIfDue(order.id).catch(() => {}); }, APPLY_CANCEL_WINDOW_MS + 500);
    } catch (e) {
      alert(friendlyCafeError(e));
    } finally {
      setApplying(false);
    }
  };

  const handleCancelApply = async () => {
    if (finalizeTimer.current) clearTimeout(finalizeTimer.current);
    await cancelCafeApply(order.id, profile.uid).catch(() => {});
  };

  const handleDelete = async () => {
    if (order.status === "confirmed") { setShowDeleteConfirm(true); return; }
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

  const handleUpload = async (e, kind) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      await uploadSettlementFile(order.id, profile.uid, file, kind);
    } catch (err) {
      alert(friendlyCafeError(err));
    } finally {
      setUploading(false);
    }
  };

  const handleTripComplete = async () => {
    const amount = Number(String(order.운임 || "").replace(/[^\d]/g, "")) || 0;
    await markTripCompleted(order.id, order.posterUid, order.applicantUid, amount).catch(() => {});
  };

  const handleMarkSettled = async () => {
    if (!confirm("정산완료로 처리하시겠습니까? (실제 결제/세금계산서 발행 연동은 아닌 내부 정산 기록입니다)")) return;
    await markSettled(order.id).catch(() => {});
  };

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
            {(order.status === "applying" || order.status === "confirmed") && (
              <Row label="신청자" value={`${order.applicantName || order.applicantNickname || "-"}${order.applicantVehicleNumber ? ` · ${order.applicantVehicleNumber}` : ""}`} />
            )}
          </div>

          {/* 신청중 카운트다운 — 1초씩 올라가다가 10초가 되면 자동 확정 */}
          {order.status === "applying" && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              {isApplicant ? (
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-bold text-amber-700">
                    배차확정까지 {elapsed != null ? elapsed : "-"} / {Math.round(APPLY_CANCEL_WINDOW_MS / 1000)}초
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

          {/* 배차완료 — 연락처 공개 + 문자/전화/1:1대화 */}
          {order.status === "confirmed" && (isMine || isApplicant) && (
            <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <div className="text-[12px] font-bold text-emerald-700 mb-2">배차완료 — 연락처가 공개되었습니다</div>
              {!contact ? (
                <div className="text-[12px] text-emerald-600">연락처를 불러오는 중...</div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13px] font-bold text-gray-800 truncate">
                    {isMine
                      ? `${order.applicantName || order.applicantNickname || "신청 기사"} · ${contact.applicantPhone || "-"}`
                      : `${order.companyName} · ${contact.posterPhone || "-"}`}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <a href={callHref(isMine ? contact.applicantPhone : contact.posterPhone)} className="px-3 py-1.5 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-bold hover:bg-[#243a60] transition">전화</a>
                    <a href={smsHref(isMine ? contact.applicantPhone : contact.posterPhone)} className="px-3 py-1.5 rounded-lg border border-[#1B2B4B] text-[#1B2B4B] text-[12px] font-bold hover:bg-[#1B2B4B]/5 transition">문자</a>
                    <button onClick={() => setShowChat(true)} className="px-3 py-1.5 rounded-lg border border-[#1B2B4B] text-[#1B2B4B] text-[12px] font-bold hover:bg-[#1B2B4B]/5 transition">1:1대화</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 정산 — 배차완료 이후 인수증/명세서 업로드 + 정산처리 */}
          {order.status === "confirmed" && (isMine || isApplicant) && (
            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[12px] font-bold text-gray-600">정산</div>
                <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${settlement?.settled ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {settlement?.settled ? "정산완료" : "정산대기"}
                </span>
              </div>

              {isApplicant && (
                <div className="mb-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-[12px] font-bold cursor-pointer hover:bg-gray-100 transition">
                    {uploading ? "업로드 중..." : "인수증/명세서 업로드"}
                    <input type="file" accept="image/*,.pdf" className="hidden" disabled={uploading} onChange={e => handleUpload(e, "driver")} />
                  </label>
                  {!settlement?.tripCompleted && (
                    <button onClick={handleTripComplete} className="ml-2 px-3 py-1.5 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-bold hover:bg-[#243a60] transition">운송완료 처리</button>
                  )}
                </div>
              )}

              {(settlement?.driverFiles?.length > 0) && (
                <div className="mb-2">
                  <div className="text-[11px] font-bold text-gray-400 mb-1">기사 제출 서류</div>
                  <div className="flex flex-wrap gap-1.5">
                    {settlement.driverFiles.map((f, i) => (
                      <a key={i} href={f.url} target="_blank" rel="noreferrer" className="text-[11.5px] px-2 py-1 rounded-md bg-white border border-gray-200 text-[#1B2B4B] font-semibold hover:bg-gray-50">{f.name}</a>
                    ))}
                  </div>
                </div>
              )}

              {isMine && (
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-[12px] font-bold cursor-pointer hover:bg-gray-100 transition">
                    {uploading ? "업로드 중..." : "정산서류 업로드"}
                    <input type="file" accept="image/*,.pdf" className="hidden" disabled={uploading} onChange={e => handleUpload(e, "poster")} />
                  </label>
                  {settlement?.tripCompleted && !settlement?.settled && (
                    <button onClick={handleMarkSettled} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[12px] font-bold hover:bg-emerald-700 transition">정산완료 처리</button>
                  )}
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
              {order.status === "confirmed" && (
                <button onClick={() => setShowCancelAssign(true)} className="px-4 py-2.5 rounded-xl border border-red-200 text-red-500 text-[13px] font-semibold hover:bg-red-50 transition">배차취소</button>
              )}
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

      {showCancelAssign && (
        <ConfirmAckModal
          title="배차를 취소하시겠습니까?"
          order={order}
          counterpartLabel="배정된 차주"
          counterpartName={order.applicantName || order.applicantNickname}
          counterpartPhone={order.applicantVehicleNumber ? `차량 ${order.applicantVehicleNumber}` : ""}
          ackText="해당 차주와 협의 되었음"
          confirmLabel="배차 취소"
          onClose={() => setShowCancelAssign(false)}
          onConfirm={async () => {
            await cancelCafeAssignment(order.id, profile.uid).catch(e => alert(friendlyCafeError(e)));
            setShowCancelAssign(false);
          }}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmAckModal
          title="오더를 삭제하시겠습니까?"
          order={order}
          counterpartLabel="배정된 차주"
          counterpartName={order.applicantName || order.applicantNickname}
          counterpartPhone={order.applicantVehicleNumber ? `차량 ${order.applicantVehicleNumber}` : ""}
          ackText="해당 차주와 협의 되었음"
          confirmLabel="오더 삭제"
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={async () => {
            await deleteCafeOrder(order.id).catch(e => alert(friendlyCafeError(e)));
            setShowDeleteConfirm(false);
            onClose();
          }}
        />
      )}

      {showChat && <CafeChatDrawer order={order} profile={profile} onClose={() => setShowChat(false)} />}
    </div>
  );
}
