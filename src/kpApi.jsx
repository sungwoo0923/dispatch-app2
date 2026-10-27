// ======================= src/kpApi.jsx =======================
// 서버 함수(Firebase Functions) 호출 공용 — 로그인 토큰을 붙여 POST로 부른다.
import React from "react";
import { auth, FUNCTIONS_BASE } from "./firebase";

export async function callFn(name, body) {
  const token = await auth.currentUser?.getIdToken();
  let res;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("서버 응답을 받지 못했습니다. 서버 배포 여부를 확인하거나 잠시 후 다시 시도해 주세요.");
  }
  let data = {};
  try { data = await res.json(); } catch { /* 무시 */ }
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

// 관리자 화면 공용 카드 모양(남색 계열)
export const KP_CARD = "bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)]";
export const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
export const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const won = (n) => `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}원`;

// 카드 머리(영문 라벨 + 제목 + 설명)
export function KpCardHead({ eyebrow, title, desc, right }) {
  return (
    <div className="px-5 sm:px-6 py-5 border-b border-[#EEF1F6] flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">{eyebrow}</div>
        <div className="text-[18px] font-black text-[#0F1A30]">{title}</div>
        {desc && <div className="text-[13.5px] text-[#5B6B85] mt-1">{desc}</div>}
      </div>
      {right}
    </div>
  );
}
