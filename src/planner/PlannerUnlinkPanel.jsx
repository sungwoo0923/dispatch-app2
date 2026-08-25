// src/planner/PlannerUnlinkPanel.jsx — "내정보"의 연동끊기. 한쪽이 요청하면
// 상대방이 동의해야 실제로 끊어진다(비밀번호 확인 → 상대 동의 → 데이터 전부
// 삭제 + 두 사람 다 새 그룹으로 분리). 상대가 거절하면 연동은 유지되고,
// 요청한 사람은 최고관리자에게 문의(에스컬레이션)할 수 있다.
import React, { useState } from "react";
import {
  usePlannerUnlinkRequest, requestUnlink, respondUnlink, escalateUnlinkToAdmin, cancelUnlinkRequest,
} from "../adminPlannerData";
import useBodyScrollLock from "./useBodyScrollLock";
import { ACCENT, ACCENT_BORDER } from "./plannerTheme";

function UnlinkConfirmModal({ onClose, onConfirm }) {
  useBodyScrollLock();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    if (!password) { setError("비밀번호를 입력해 주세요."); return; }
    setSubmitting(true);
    setError("");
    try {
      await onConfirm(password);
      onClose();
    } catch (e) {
      setError(e?.message || "처리 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10040] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative bg-white rounded-2xl p-5 w-full max-w-[360px]">
        <div className="text-[14px] font-extrabold text-red-500 mb-2">정말 연동을 끊으시겠어요?</div>
        <div className="text-[11.5px] text-gray-500 mb-4 leading-relaxed">
          연동을 끊으면 가계부·일정·경조사·미니게임 기록 등 이 가족의 모든 데이터가 전부 사라져요.
          되돌릴 수 없어요. 상대방이 동의해야 실제로 끊어져요.
        </div>
        <div className="text-[12px] font-semibold text-gray-600 mb-1.5">비밀번호 확인</div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="내 계정 비밀번호"
          className="w-full border rounded-lg px-3 py-2.5 text-[13px] focus:outline-none mb-2"
          style={{ borderColor: ACCENT_BORDER }}
        />
        {error && <div className="text-[11px] text-red-500 mb-2">{error}</div>}
        <div className="flex gap-2 mt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-gray-600 text-[13px] font-semibold" style={{ borderColor: ACCENT_BORDER }}>
            취소
          </button>
          <button onClick={confirm} disabled={submitting} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold bg-red-500 disabled:opacity-50">
            {submitting ? "처리 중..." : "연동끊기"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlannerUnlinkPanel({ account, other }) {
  const req = usePlannerUnlinkRequest(account.groupId);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!other) return null; // 연동된 상대가 없으면 끊을 것도 없다.

  const iAmRequester = req?.requestedByUid === account.uid;
  const memberUids = [account.uid, other.uid];

  const doRequest = async (password) => {
    await requestUnlink(account.groupId, account.uid, account.name, password);
  };

  const agree = async () => {
    if (!confirm("동의하면 이 가족의 모든 데이터가 즉시 삭제되고 연동이 끊어져요. 계속할까요?")) return;
    setBusy(true);
    try {
      await respondUnlink(account.groupId, memberUids, true);
    } catch (e) {
      alert("처리 중 오류가 발생했습니다: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    try {
      await respondUnlink(account.groupId, memberUids, false);
    } finally {
      setBusy(false);
    }
  };

  const escalate = async () => {
    setBusy(true);
    try {
      await escalateUnlinkToAdmin(account.groupId);
    } finally {
      setBusy(false);
    }
  };

  const cancelMyRequest = async () => {
    setBusy(true);
    try {
      await cancelUnlinkRequest(account.groupId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-2 border-t" style={{ borderColor: "#fee2e2" }}>
      <div className="mt-3 text-[12px] font-bold text-gray-500 mb-1.5">연동끊기</div>

      {!req && (
        <>
          <div className="text-[10.5px] text-gray-400 mb-2 leading-relaxed">
            {other.name || "상대방"}님과의 연동을 끊어요. 상대방이 동의해야 실제로 끊어지고, 이 가족의 모든 데이터가 함께 삭제돼요.
          </div>
          <button onClick={() => setShowConfirm(true)} className="text-[12px] font-semibold text-red-500">
            연동끊기
          </button>
        </>
      )}

      {req?.status === "pending" && iAmRequester && (
        <div className="p-3 rounded-xl border border-red-200 bg-red-50">
          <div className="text-[12px] font-bold text-red-500">상대방의 동의를 기다리는 중이에요</div>
          <div className="text-[10.5px] text-red-400 mt-1 mb-2">동의하면 즉시 모든 데이터가 삭제되고 연동이 끊어져요.</div>
          <button onClick={cancelMyRequest} disabled={busy} className="text-[11px] font-semibold text-gray-500">
            요청 취소
          </button>
        </div>
      )}

      {req?.status === "pending" && !iAmRequester && (
        <div className="p-3 rounded-xl border border-red-200 bg-red-50">
          <div className="text-[12px] font-bold text-red-500">{req.requestedByName || "상대방"}님이 연동 해제를 요청했어요</div>
          <div className="text-[10.5px] text-red-400 mt-1 mb-2.5 leading-relaxed">
            동의하면 이 가족의 모든 데이터(가계부·일정·경조사·미니게임 기록 등)가 즉시 삭제되고 연동이 끊어져요. 되돌릴 수 없어요.
          </div>
          <div className="flex gap-2">
            <button onClick={decline} disabled={busy} className="flex-1 py-2 rounded-lg border text-gray-600 text-[12px] font-semibold bg-white" style={{ borderColor: ACCENT_BORDER }}>
              거절
            </button>
            <button onClick={agree} disabled={busy} className="flex-1 py-2 rounded-lg text-white text-[12px] font-bold bg-red-500">
              {busy ? "처리 중..." : "동의"}
            </button>
          </div>
        </div>
      )}

      {req?.status === "declined" && iAmRequester && (
        <div className="p-3 rounded-xl border" style={{ borderColor: ACCENT_BORDER, background: "#fafafa" }}>
          <div className="text-[12px] font-bold text-gray-600">상대방이 거절했어요. 연동은 그대로 유지돼요.</div>
          {req.adminRequested ? (
            <div className="text-[10.5px] text-gray-400 mt-1">최고관리자에게 문의했어요. 승인을 기다리는 중이에요.</div>
          ) : (
            <button onClick={escalate} disabled={busy} className="text-[11px] font-semibold mt-2" style={{ color: ACCENT }}>
              최고관리자에게 문의하기
            </button>
          )}
        </div>
      )}

      {req?.status === "declined" && !iAmRequester && (
        <div className="text-[10.5px] text-gray-400">연동 해제 요청을 거절했어요. 연동은 그대로 유지돼요.</div>
      )}

      {showConfirm && <UnlinkConfirmModal onClose={() => setShowConfirm(false)} onConfirm={doRequest} />}
    </div>
  );
}
