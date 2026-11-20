// 📷 2026-11-20 로드뷰 — 상·하차지 주소의 실제 거리 사진을 프로그램 안 팝업으로 본다.
// 담당자가 배차 전에 차량 진입이 되는지(골목 폭, 입구, 진입로) 눈으로 확인하려는 용도.
//
// - 카카오맵 JavaScript SDK(kakao.maps.Roadview)로 왼쪽 로드뷰 + 오른쪽 작은 지도를 띄운다.
// - 주소 → 좌표: 이미 쓰고 있는 Tmap 지오코딩(geocodeAddress) → 실패하면 카카오 주소검색.
// - 주소 근처(50 → 150 → 300m)에서 가장 가까운 로드뷰 지점을 찾는다.
// - 지도를 누르면 그 자리 로드뷰로 옮겨 간다(입구 · 뒷길 확인용).
// - SDK를 못 불러오면(도메인 미등록 · 네트워크) 예전처럼 카카오맵 로드뷰를 새 창으로 연다.
//
// JavaScript 키는 웹페이지에 공개되는 키다(카카오 개발자 콘솔에 등록한 도메인에서만 동작).
// 등록 도메인: https://app.logisweb.co.kr, https://dispatch-app2.vercel.app
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { geocodeAddress } from "./tmapFareCalc";

const KAKAO_JS_KEY = "89a4ab0547ae0bd43eaa11d7de7cc968";
const SDK_URL = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false&libraries=services`;

const cleanAddr = (a) => String(a || "").replace(/\s+/g, " ").trim();

export const roadviewUrl = (lat, lon) => `https://map.kakao.com/link/roadview/${lat},${lon}`;
export const kakaoSearchUrl = (addr) => `https://map.kakao.com/?q=${encodeURIComponent(cleanAddr(addr))}`;

// ── 카카오맵 SDK 불러오기(한 번만) ─────────────────────────────
let sdkLoading = null;
export function loadKakaoMaps() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.kakao?.maps?.Roadview) return Promise.resolve(window.kakao);
  if (sdkLoading) return sdkLoading;
  sdkLoading = new Promise((resolve, reject) => {
    const done = () => {
      try { window.kakao.maps.load(() => resolve(window.kakao)); } catch (e) { reject(e); }
    };
    if (window.kakao?.maps?.load) { done(); return; }
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => (window.kakao?.maps?.load ? done() : reject(new Error("카카오맵 SDK 초기화 실패")));
    s.onerror = () => reject(new Error("카카오맵 SDK 로드 실패"));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error("카카오맵 SDK 로드 시간 초과")), 15000);
  }).catch((e) => { sdkLoading = null; throw e; });
  return sdkLoading;
}

// 주소 → { lat, lon } (Tmap 먼저, 안 되면 카카오 주소검색)
async function findCoord(kakao, addr) {
  try {
    const pt = await geocodeAddress(addr);
    if (pt?.lat && pt?.lon) return { lat: Number(pt.lat), lon: Number(pt.lon) };
  } catch { /* 다음 방법 */ }
  if (!kakao?.maps?.services) return null;
  return new Promise((resolve) => {
    try {
      new kakao.maps.services.Geocoder().addressSearch(addr.replace(/\(.*?\)/g, "").trim(), (res, status) => {
        if (status === kakao.maps.services.Status.OK && res?.[0]) resolve({ lat: Number(res[0].y), lon: Number(res[0].x) });
        else resolve(null);
      });
    } catch { resolve(null); }
  });
}

// 가장 가까운 로드뷰 지점 찾기(반경을 넓혀 가며)
function nearestPano(kakao, latlng) {
  const client = new kakao.maps.RoadviewClient();
  const radii = [50, 150, 300];
  return new Promise((resolve) => {
    const tryAt = (i) => {
      if (i >= radii.length) { resolve(null); return; }
      client.getNearestPanoId(latlng, radii[i], (panoId) => (panoId ? resolve(panoId) : tryAt(i + 1)));
    };
    tryAt(0);
  });
}

// 예전 방식 — 새 창으로 열기(SDK를 못 쓸 때)
export async function openRoadviewWindow(addr) {
  const a = cleanAddr(addr);
  if (!a) return;
  let url = kakaoSearchUrl(a);
  try {
    const pt = await geocodeAddress(a);
    if (pt?.lat && pt?.lon) url = roadviewUrl(pt.lat, pt.lon);
  } catch { /* 검색 화면으로 */ }
  window.open(url, "_blank", "noopener");
}

// ── 팝업 ──────────────────────────────────────────────────────
function RoadviewModal({ addr, name, onClose }) {
  const rvRef = useRef(null);
  const mapRef = useRef(null);
  const [state, setState] = useState("loading"); // loading | ok | nopano | nocoord | error
  const [coord, setCoord] = useState(null);
  // 부모 화면이 다시 그려져도(입력 중 등) 로드뷰를 처음부터 다시 만들지 않게 onClose는 ref로 들고 있는다
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = () => closeRef.current?.();

  useEffect(() => {
    // 뒤에 열린 오더정보 창까지 같이 닫히지 않게 Esc는 여기서 먼저 받고 멈춘다
    const onKey = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); closeRef.current?.(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    let alive = true;
    let cleanup = () => {};
    (async () => {
      let kakao;
      try { kakao = await loadKakaoMaps(); } catch {
        if (!alive) return;
        // SDK를 못 쓰면 새 창으로 대신 연다
        openRoadviewWindow(addr);
        closeRef.current?.();
        return;
      }
      const c = await findCoord(kakao, addr);
      if (!alive) return;
      if (!c) { setState("nocoord"); return; }
      setCoord(c);
      const center = new kakao.maps.LatLng(c.lat, c.lon);

      const map = new kakao.maps.Map(mapRef.current, { center, level: 3 });
      map.addOverlayMapTypeId(kakao.maps.MapTypeId.ROADVIEW); // 로드뷰가 있는 길을 파란 선으로
      new kakao.maps.Marker({ map, position: center }); // 주소 위치
      const here = new kakao.maps.Circle({
        map, center, radius: 6, strokeWeight: 2, strokeColor: "#1B2B4B", strokeOpacity: 1, fillColor: "#FFFFFF", fillOpacity: 1,
      }); // 지금 보고 있는 로드뷰 위치

      const rv = new kakao.maps.Roadview(rvRef.current);
      const show = async (latlng) => {
        const panoId = await nearestPano(kakao, latlng);
        if (!alive) return false;
        if (!panoId) return false;
        rv.setPanoId(panoId, latlng);
        return true;
      };
      kakao.maps.event.addListener(rv, "position_changed", () => {
        const p = rv.getPosition();
        here.setPosition(p);
        map.panTo(p);
      });
      kakao.maps.event.addListener(map, "click", async (ev) => {
        const ok = await show(ev.latLng);
        if (ok && alive) setState("ok");
      });

      const ok = await show(center);
      if (!alive) return;
      setState(ok ? "ok" : "nopano");

      const onResize = () => { try { rv.relayout(); map.relayout(); } catch { /* 무시 */ } };
      window.addEventListener("resize", onResize);
      cleanup = () => window.removeEventListener("resize", onResize);
    })();
    return () => { alive = false; cleanup(); };
  }, [addr]);

  const extUrl = coord ? roadviewUrl(coord.lat, coord.lon) : kakaoSearchUrl(addr);
  const msg = {
    loading: "로드뷰를 불러오는 중이에요…",
    nopano: "이 주소 근처(300m)에는 로드뷰 사진이 없어요. 오른쪽 지도에서 파란 길을 누르면 그 자리 사진을 볼 수 있어요.",
    nocoord: "주소 위치를 찾지 못했어요. 주소를 확인하거나 카카오맵에서 검색해 보세요.",
  }[state];

  return createPortal(
    <div className="fixed inset-0 z-[1000001] bg-[#0B1428]/70 backdrop-blur-[2px] flex items-center justify-center p-0 sm:p-4"
      onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) close(); }}
      onClick={(e) => e.stopPropagation()}>
      <div className="bg-white w-full h-full sm:w-[1180px] sm:max-w-[96vw] sm:h-[78vh] sm:max-h-[820px] sm:rounded-2xl overflow-hidden flex flex-col shadow-[0_30px_80px_rgba(0,0,0,0.4)]"
        onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="shrink-0 flex items-center gap-3 px-4 sm:px-5 h-14 bg-[#0F1A30] text-white">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-[10px] font-extrabold tracking-[0.24em] text-[#8FB0F0] shrink-0">ROADVIEW</span>
              <span className="text-[15px] font-black truncate">{name || "로드뷰"}</span>
            </div>
            <div className="text-[12px] text-white/60 truncate">{addr}</div>
          </div>
          <a href={extUrl} target="_blank" rel="noopener noreferrer"
            className="hidden sm:inline-flex shrink-0 h-8 px-3 items-center rounded-lg border border-white/20 bg-white/5 hover:bg-white/15 text-[12px] font-bold">
            카카오맵에서 크게 보기
          </a>
          <button type="button" onClick={close}
            className="shrink-0 h-8 px-3 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-[12.5px] font-bold">닫기 ✕</button>
        </div>
        {/* 본문: 로드뷰 + 지도 */}
        <div className="flex-1 min-h-0 flex flex-col sm:grid sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
          <div className="relative flex-[3] sm:flex-none min-h-0 bg-[#E9EDF3]">
            <div ref={rvRef} className="absolute inset-0" />
            {msg && (
              <div className="absolute inset-0 flex items-center justify-center p-6 bg-[#F4F6FA]">
                <div className="max-w-[380px] text-center text-[13.5px] font-bold text-[#3A4A66] leading-relaxed">
                  {msg}
                  {state === "nocoord" && (
                    <div className="mt-3"><a href={extUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 px-3 items-center rounded-lg border border-[#1B2B4B] text-[#1B2B4B] text-[12px] font-bold hover:bg-[#1B2B4B] hover:text-white">카카오맵에서 검색</a></div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="relative flex-[2] sm:flex-none min-h-0 border-t sm:border-t-0 sm:border-l border-[#E3E8F0]">
            <div ref={mapRef} className="absolute inset-0" />
          </div>
        </div>
        {/* 안내 */}
        <div className="shrink-0 px-4 sm:px-5 py-2 border-t border-[#EEF1F6] text-[11.5px] font-semibold text-[#7A89A3]">
          지도의 파란 길을 누르면 그 자리 사진으로 옮겨가요 · 사진은 찍은 지 오래됐을 수 있으니 참고용으로 보세요
        </div>
      </div>
    </div>,
    document.body
  );
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
export function RoadviewButton({ addr, name = "", variant = "form", className = "", label = "로드뷰" }) {
  const [open, setOpen] = useState(false);
  const has = !!cleanAddr(addr);
  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (has) setOpen(true);
  };
  const title = has ? "이 주소의 거리 사진(로드뷰)을 봐요" : "주소를 먼저 입력하면 로드뷰를 볼 수 있어요";
  const base = "inline-flex items-center gap-1 font-bold whitespace-nowrap shrink-0 transition disabled:opacity-40 disabled:cursor-not-allowed";
  const look = variant === "inline"
    ? "text-[11.5px] px-1.5 py-0.5 rounded-md text-[#4B5B78] border border-[#DCE3EE] bg-white hover:border-[#1B2B4B] hover:text-[#1B2B4B]"
    : "text-[11px] px-2 py-0.5 rounded-lg border bg-white text-[#1B2B4B] border-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white";
  return (
    <>
      <button type="button" tabIndex={-1} disabled={!has} onClick={onClick} title={title} className={`${base} ${look} ${className}`}>
        <CamIcon size={variant === "inline" ? 11 : 12} />
        {label}
      </button>
      {open && <RoadviewModal addr={cleanAddr(addr)} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}
