// ======================= src/officeSms/officeSmsPopup.js =======================
// 💬 2026-11-18 사내문자 "별도 창" — 브라우저 새 창(/sms-window)으로 띄워 모니터 한쪽에 따로 둘 수 있다
//  · 어떻게 띄울지는 이 PC(브라우저)에 기억: 화면 안(float) | 별도 창(popup)
//  · 프로그램 창 ↔ 별도 창은 BroadcastChannel로 이름표 · "이 대화 열기"를 주고받는다
//  · 별도 창은 프로그램 창(opener)에서 연 경우에만 열린다(2차 인증을 통과한 화면에서만 — OfficeSmsPopupPage)

export const SMS_POPUP_PATH = "/sms-window";
const MODE_KEY = "kpOfficeSmsWinMode";
const CH = "kp-office-sms";

export const isSmsPopupPage = () => { try { return window.location.pathname === SMS_POPUP_PATH; } catch { return false; } };

export function getWinMode() { try { return localStorage.getItem(MODE_KEY) === "popup" ? "popup" : "float"; } catch { return "float"; } }
export function setWinMode(v) {
  try { localStorage.setItem(MODE_KEY, v === "popup" ? "popup" : "float"); } catch { /* 무시 */ }
  try { window.dispatchEvent(new CustomEvent("kp-office-sms-winmode", { detail: v })); } catch { /* 무시 */ }
}

let channel = null;
export function smsChannel() {
  if (channel) return channel;
  try { channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CH) : null; } catch { channel = null; }
  return channel;
}
export function postSms(msg) { try { smsChannel()?.postMessage(msg); } catch { /* 무시 */ } }

let popupRef = null;
export const popupOpen = () => !!popupRef && !popupRef.closed;

/** 별도 창 열기(이미 열려 있으면 앞으로 가져와 그 대화로). 팝업이 막히면 false */
export function openSmsPopup(peer = "", name = "") {
  if (popupOpen()) {
    if (peer) postSms({ type: "open", peer, name });
    try { popupRef.focus(); } catch { /* 무시 */ }
    return true;
  }
  const w = Math.min(1040, (window.screen?.availWidth || 1200) - 40);
  const h = Math.min(780, (window.screen?.availHeight || 900) - 60);
  const qs = peer ? `?peer=${encodeURIComponent(peer)}${name ? `&name=${encodeURIComponent(name)}` : ""}` : "";
  try {
    popupRef = window.open(`${SMS_POPUP_PATH}${qs}`, "kpOfficeSms", `width=${w},height=${h},menubar=no,toolbar=no,location=no,status=no,resizable=yes`);
  } catch { popupRef = null; }
  if (popupRef && peer) setTimeout(() => postSms({ type: "open", peer, name }), 1500);
  return !!popupRef;
}
