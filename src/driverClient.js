// ======================= src/driverClient.js =======================
import React from "react";
// 📱 2026-11-26 기사님이 기사앱(설치한 앱)으로 쓰는지, 휴대폰 인터넷(웹)으로 쓰는지
//  · 기사 화면(src/driver/DriverHome.jsx)이 열릴 때 drivers/{uid} 문서에 남긴다:
//    clientType("app" | "web") · clientOs("android" | "ios" | "pc") · clientPwa(홈 화면에 추가해서 연 웹) · clientAt(마지막으로 연 시각)
//  · 예전 버전은 clientType 이 없다 → 기사앱 위치 서비스가 남기는 nativeTracking 이 있으면 기사앱으로 본다
//  · 관제현황(FleetControlDeck) · 기사 등록 관리(FleetManagement) · 모바일 관제(MobileFleetView)에서 같이 쓴다

// 지금 이 화면이 어디서 열렸는지(기사 화면에서 부른다)
export function detectDriverClient() {
  if (typeof window === "undefined") return { clientType: "web", clientOs: "pc", clientPwa: false };
  const cap = window.Capacitor;
  const native = !!cap?.isNativePlatform?.();
  const ua = String(navigator.userAgent || "");
  const capOs = native ? String(cap?.getPlatform?.() || "") : "";
  const clientOs = capOs === "android" || capOs === "ios" ? capOs
    : /android/i.test(ua) ? "android"
    : /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) ? "ios"
    : "pc";
  let pwa = false;
  try { pwa = !native && (window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true); } catch (_) { pwa = false; }
  return { clientType: native ? "app" : "web", clientOs, clientPwa: !!pwa };
}

const OS_LABEL = { android: "안드로이드", ios: "아이폰", pc: "PC" };

// 관리자 화면 표시용 — key: app | web | unknown
export function driverClientOf(raw = {}) {
  const r = raw || {};
  const os = OS_LABEL[r.clientOs] || "";
  if (r.clientType === "app") {
    return { key: "app", label: "기사앱", desc: `${os ? os + " " : ""}기사앱으로 쓰고 있어요 · 앱을 닫아도 위치가 계속 와요` };
  }
  if (r.clientType === "web") {
    return {
      key: "web", label: "웹",
      desc: `${os ? os + " " : ""}${r.clientPwa ? "홈 화면 바로가기(웹)" : "인터넷(웹)"}으로 쓰고 있어요 · 화면을 끄거나 닫으면 위치가 끊겨요. 기사앱 설치를 안내해 주세요`,
    };
  }
  if (r.nativeTracking === true) return { key: "app", label: "기사앱", desc: "기사앱 위치 기록이 있어요" };
  return { key: "unknown", label: "확인 전", desc: "기사님이 기사 화면을 한 번 열면 기사앱인지 웹인지 보여요" };
}

// 배지 색(밝은 화면 · 어두운 관제 화면 공통으로 읽히는 색)
export const DRIVER_CLIENT_COLOR = { app: "#10B981", web: "#F59E0B", unknown: "#94A3B8" };

// 작은 배지 [기사앱] / [웹] / [확인 전] — 마우스를 올리면 설명이 나온다
export function ClientTag({ d, size = 11.5 }) {
  const c = driverClientOf(d?.raw || d);
  const col = DRIVER_CLIENT_COLOR[c.key];
  return React.createElement("span", {
    title: c.desc,
    style: { flexShrink: 0, padding: "0 6px", borderRadius: 6, border: `1px solid ${col}`, color: col, fontSize: size, fontWeight: 900, lineHeight: "17px", whiteSpace: "nowrap" },
  }, c.label);
}
