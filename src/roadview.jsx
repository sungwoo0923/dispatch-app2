// 📷 2026-11-20 로드뷰 — 상·하차지 주소의 실제 거리 사진을 카카오맵 로드뷰로 연다.
// 담당자가 배차 전에 차량 진입이 되는지(골목 폭, 입구, 진입로) 눈으로 확인하려는 용도.
//
// 1단계(지금): 키 없이 카카오맵 로드뷰를 새 창으로 연다.
//   주소 → 좌표는 이미 쓰고 있는 Tmap 지오코딩(geocodeAddress)을 그대로 쓴다.
//   좌표를 못 찾으면 카카오맵에서 주소 검색 화면을 연다(로드뷰 버튼으로 이어서 보면 됨).
// 2단계(나중): 카카오 JavaScript 키를 받으면 프로그램 안 팝업(kakao.maps.Roadview)으로 바꾼다.
//
// 팝업 차단을 피하려고 클릭하는 순간 빈 창을 먼저 열고, 좌표를 찾은 뒤 그 창의 주소를 바꾼다.
import React, { useState } from "react";
import { geocodeAddress } from "./tmapFareCalc";

const cleanAddr = (a) => String(a || "").replace(/\s+/g, " ").trim();

export const roadviewUrl = (lat, lon) => `https://map.kakao.com/link/roadview/${lat},${lon}`;
export const kakaoSearchUrl = (addr) => `https://map.kakao.com/?q=${encodeURIComponent(cleanAddr(addr))}`;

const isNativeApp = () => {
  try { return !!window.Capacitor?.isNativePlatform?.(); } catch { return false; }
};

export async function openRoadview(addr) {
  const a = cleanAddr(addr);
  if (!a) return false;
  // 안드로이드 앱(WebView)은 빈 창을 먼저 열면 화면이 멈출 수 있어 좌표를 찾은 뒤 한 번에 연다.
  const win = isNativeApp() ? null : window.open("about:blank", "_blank");
  let url;
  try {
    const pt = await geocodeAddress(a);
    url = pt && pt.lat && pt.lon ? roadviewUrl(pt.lat, pt.lon) : kakaoSearchUrl(a);
  } catch {
    url = kakaoSearchUrl(a);
  }
  if (win && !win.closed) {
    try { win.opener = null; } catch { /* 무시 */ }
    win.location.href = url;
  } else {
    window.open(url, "_blank", "noopener");
  }
  return true;
}

// 카메라 모양 아이콘(선 하나 색 — 버튼 글자색을 그대로 따라감)
const CamIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13" r="3.2" />
  </svg>
);

/**
 * 로드뷰 버튼 — 프로그램 기본 남색 톤(#1B2B4B) 한 가지 색만 쓴다.
 * variant
 *  - "form"  : 오더 등록 폼 라벨 줄(+ 경유 버튼과 같은 모양)
 *  - "inline": 오더정보 · 상세 화면의 주소 옆 작은 글자 버튼
 */
export function RoadviewButton({ addr, variant = "form", className = "", label = "로드뷰" }) {
  const [busy, setBusy] = useState(false);
  const has = !!cleanAddr(addr);
  const onClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!has || busy) return;
    setBusy(true);
    try { await openRoadview(addr); } finally { setBusy(false); }
  };
  const title = has ? "카카오맵 로드뷰로 이 주소의 거리 사진을 새 창에서 열어요" : "주소를 먼저 입력하면 로드뷰를 볼 수 있어요";
  const base = "inline-flex items-center gap-1 font-bold whitespace-nowrap shrink-0 transition disabled:opacity-40 disabled:cursor-not-allowed";
  const look = variant === "inline"
    ? "text-[11.5px] px-1.5 py-0.5 rounded-md text-[#4B5B78] border border-[#DCE3EE] bg-white hover:border-[#1B2B4B] hover:text-[#1B2B4B]"
    : "text-[11px] px-2 py-0.5 rounded-lg border bg-white text-[#1B2B4B] border-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white";
  return (
    <button type="button" tabIndex={-1} disabled={!has} onClick={onClick} title={title} className={`${base} ${look} ${className}`}>
      <CamIcon size={variant === "inline" ? 11 : 12} />
      {busy ? "여는 중…" : label}
    </button>
  );
}
