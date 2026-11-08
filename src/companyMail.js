// ======================= src/companyMail.js =======================
// ✉️ 2026-11-08 운송사별 발신 메일 — 화면 쪽 연결(서버: functions/companyMail.js)
//  · sendCompanyMail(payload): 회사 메일 보내기(예전 fetch("/api/send-email") 자리). 던지지 않고 { ok, code, error, ... }를 돌려준다.
//    회사에 메일 설정이 없으면 code "MAIL_NOT_CONFIGURED" + 화면 전체에 "kp:mail-setup-needed" 이벤트(등록 안내 창이 뜬다)
//  · mailSettingsApi: 회사정보 › 메일 설정(상태 · 저장 · 테스트 · 해제)
//  · useCompanyMailSettings(company): companyMailSettings/{회사}(비밀 없음) 실시간 · 둘러보기(demo)는 이 탭 안 가짜 저장소
//  · openMailSettings(): 회사관리 › 회사정보 › 메일 설정으로 이동(DispatchApp이 "kp:open-mail-settings"를 받는다)
import React from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db, auth, FUNCTIONS_BASE } from "./firebase";
import { isPreviewMode } from "./fsTenant";

export const MAIL_NOT_CONFIGURED = "MAIL_NOT_CONFIGURED";
export const MAIL_SETUP_MSG = "회사정보 › 메일 설정에서 발신 메일을 먼저 등록해 주세요";
// 예전 공용 발송 계정(한 운송사의 다음 메일)의 주인 회사 — 등록 안내 띠를 먼저 보여 준다
export const LEGACY_MAIL_COMPANIES = ["돌캐"];
export const MAIL_ADMIN_ROLES = ["admin", "test", "hrAcct", "allMgr", "totalMaster"];
export const canEditMail = (role, isMaster) => MAIL_ADMIN_ROLES.includes(String(role || "")) || isMaster === true;

export const MAIL_PRESETS = [
  { key: "daum", label: "Daum · Kakao 메일", host: "smtp.daum.net", port: 465, security: "ssl", hint: "@daum.net · @hanmail.net",
    guide: ["Daum 메일 › 환경설정 › IMAP/POP3에서 IMAP/SMTP 사용을 켜 주세요.", "카카오 계정 2단계 인증을 쓰고 있다면 카카오계정 › 계정 보안에서 만든 앱 비밀번호를 넣어 주세요.", "2단계 인증을 쓰지 않으면 메일 로그인 비밀번호로도 보낼 수 있지만, 앱 비밀번호를 권해요."] },
  { key: "naver", label: "네이버 메일", host: "smtp.naver.com", port: 465, security: "ssl", hint: "@naver.com",
    guide: ["네이버 메일 › 환경설정 › POP3/IMAP 설정에서 IMAP/SMTP 사용을 '사용함'으로 바꿔 주세요.", "2단계 인증을 쓰고 있다면 네이버 내정보 › 보안설정 › 2단계 인증 › 애플리케이션 비밀번호 관리에서 비밀번호를 만들어 넣어 주세요."] },
  { key: "gmail", label: "Gmail · Google Workspace", host: "smtp.gmail.com", port: 465, security: "ssl", hint: "앱 비밀번호 필요",
    guide: ["Google 계정 › 보안에서 2단계 인증을 먼저 켜 주세요.", "Google 계정 › 보안 › 앱 비밀번호에서 16자리 비밀번호를 만들어 넣어 주세요.", "Google 계정 로그인 비밀번호로는 보낼 수 없어요."] },
  { key: "outlook", label: "Outlook · Microsoft 365", host: "smtp.office365.com", port: 587, security: "starttls", hint: "587 · STARTTLS",
    guide: ["Microsoft 365는 회사 관리자가 이 계정의 SMTP 인증(Authenticated SMTP)을 켜 둬야 해요.", "2단계 인증을 쓰고 있다면 앱 비밀번호를 만들어 넣어 주세요."] },
  { key: "nate", label: "네이트 메일", host: "smtp.mail.nate.com", port: 465, security: "ssl", hint: "@nate.com",
    guide: ["네이트 메일 › 환경설정 › POP3/SMTP 설정에서 사용함으로 바꿔 주세요."] },
  { key: "custom", label: "직접 입력", host: "", port: 465, security: "ssl", hint: "회사 메일 서버",
    guide: ["하이웍스 · 가비아 같은 회사 메일은 메일 관리자에게 보내는 서버(SMTP) 주소 · 포트 · 보안 방식을 물어 넣어 주세요.", "보통 465는 SSL, 587은 STARTTLS예요."] },
];
const DOMAIN_PRESET = { "daum.net": "daum", "hanmail.net": "daum", "kakao.com": "daum", "naver.com": "naver", "gmail.com": "gmail", "outlook.com": "outlook", "hotmail.com": "outlook", "live.com": "outlook", "nate.com": "nate" };
export const presetOfEmail = (email) => DOMAIN_PRESET[String(email || "").split("@")[1]?.toLowerCase() || ""] || "";
export const presetByKey = (k) => MAIL_PRESETS.find((p) => p.key === k) || null;

// ── 둘러보기(demo=1 · /preview) — 이 탭 안에서만 ──
const isDemo = () => { try { return isPreviewMode() || window.location.pathname === "/preview" || new URLSearchParams(window.location.search).get("demo") === "1"; } catch { return false; } };
const DK = "kpDemoCompanyMail";
const demoRead = () => { try { return JSON.parse(sessionStorage.getItem(DK) || "null"); } catch { return null; } };
const demoWrite = (v) => { try { if (v) sessionStorage.setItem(DK, JSON.stringify(v)); else sessionStorage.removeItem(DK); } catch { /* 무시 */ } window.dispatchEvent(new Event("kp:demo-mail")); };
const blank = () => ({ configured: false, fromEmail: "", fromName: "", replyTo: "", preset: "", host: "", port: 0, security: "", hasPassword: false, passwordUpdatedAt: 0, lastTestOk: null, lastTestAt: 0, lastTestError: "", updatedAt: 0, updatedByName: "" });
const demoApi = {
  get: () => ({ ...blank(), ...(demoRead() || {}), canEdit: true, myEmail: auth.currentUser?.email || "preview@kp-flow.app" }),
  save: (d) => {
    const prev = demoRead() || {};
    const p = presetByKey(d.preset) || presetByKey("custom");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(d.fromEmail || ""))) throw new Error("발신 이메일 형식을 확인해 주세요");
    if (!d.password && !prev.hasPassword) throw new Error("앱 비밀번호를 넣어 주세요");
    const t = Date.now();
    const next = { ...prev, fromEmail: String(d.fromEmail).toLowerCase(), fromName: d.fromName || "", replyTo: d.replyTo || "", preset: p.key, host: p.key === "custom" ? d.host : p.host, port: p.key === "custom" ? Number(d.port) : p.port, security: p.key === "custom" ? d.security : p.security, hasPassword: true, passwordUpdatedAt: d.password ? t : prev.passwordUpdatedAt || t, configured: true, updatedAt: t, lastTestOk: null, lastTestAt: 0 };
    demoWrite(next);
    return { ok: true, ...next };
  },
  test: () => { const cur = demoRead(); if (!cur?.configured) { const e = new Error(MAIL_SETUP_MSG); e.code = MAIL_NOT_CONFIGURED; throw e; } demoWrite({ ...cur, lastTestOk: true, lastTestAt: Date.now(), lastTestError: "" }); return { ok: true, to: auth.currentUser?.email || "preview@kp-flow.app" }; },
  remove: () => { demoWrite(null); return { ok: true }; },
};

// 호출형 함수(onCall) — App Check 헤더는 src/appCheckClient.js가 FUNCTIONS_BASE 주소에 자동으로 붙인다
async function call(name, data) {
  const token = await auth.currentUser?.getIdToken?.();
  let res;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/${name}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ data }) });
  } catch (e) { const er = new Error("인터넷 연결을 확인해 주세요"); er.code = "NETWORK"; er.cause = e; throw er; }
  let j = {};
  try { j = await res.json(); } catch { /* 무시 */ }
  if (!res.ok || j.error) {
    const er = new Error(j.error?.message || (res.status === 413 ? "첨부 파일이 너무 커요. 용량을 줄여 다시 보내 주세요" : `요청 실패(${res.status})`));
    er.code = j.error?.details?.code || j.error?.status || String(res.status);
    er.details = j.error?.details || null;
    throw er;
  }
  return j.result;
}

export const mailSettingsApi = {
  get: (company) => (isDemo() ? Promise.resolve(demoApi.get()) : call("mailSettings", { action: "get", company })),
  save: (company, form) => (isDemo() ? Promise.resolve().then(() => demoApi.save(form)) : call("mailSettings", { action: "save", company, ...form })),
  test: (company) => (isDemo() ? Promise.resolve().then(() => demoApi.test()) : call("mailSettings", { action: "test", company })),
  remove: (company) => (isDemo() ? Promise.resolve(demoApi.remove()) : call("mailSettings", { action: "remove", company })),
};

export const isMailSetupNeeded = (r) => r?.code === MAIL_NOT_CONFIGURED;
export function announceMailSetupNeeded() { try { window.dispatchEvent(new CustomEvent("kp:mail-setup-needed")); } catch { /* 무시 */ } }
export function openMailSettings() { try { sessionStorage.setItem("kpCmTab", "회사정보"); sessionStorage.setItem("kpMailFocus", "1"); window.dispatchEvent(new Event("kp:open-mail-settings")); } catch { /* 무시 */ } }

// 회사 메일 보내기 — payload: { to, cc, bcc, subject, html, attachments:[{filename, content(base64), contentType}], fromName, replyTo, log:{ type, client, body } | false }
export async function sendCompanyMail(payload = {}) {
  if (isDemo()) {
    const cur = demoRead();
    if (!cur?.configured) { announceMailSetupNeeded(); return { ok: false, code: MAIL_NOT_CONFIGURED, error: MAIL_SETUP_MSG }; }
    return { ok: true, demo: true, sentFrom: cur.fromEmail, fromName: payload.fromName || cur.fromName, replyTo: payload.replyTo || cur.replyTo || "", logged: false };
  }
  try {
    const r = await call("sendCompanyMail", payload);
    return { ...r, ok: true };
  } catch (e) {
    if (e.code === MAIL_NOT_CONFIGURED) announceMailSetupNeeded();
    return { ok: false, code: e.code || "", error: e.message || "메일을 보내지 못했어요", logged: !!e.details?.logged };
  }
}

// companyMailSettings/{회사} 실시간 — undefined: 불러오는 중 · 객체: 상태
export function useCompanyMailSettings(company) {
  const [v, setV] = React.useState(undefined);
  React.useEffect(() => {
    if (isDemo()) {
      const h = () => setV(demoApi.get());
      h(); window.addEventListener("kp:demo-mail", h);
      return () => window.removeEventListener("kp:demo-mail", h);
    }
    if (!company) { setV(blank()); return undefined; }
    return onSnapshot(doc(db, "companyMailSettings", company), (s) => {
      const d = s.exists() ? s.data() || {} : {};
      setV({ ...blank(), ...d, configured: !!(d.fromEmail && d.hasPassword) });
    }, () => setV(blank()));
  }, [company]);
  return v;
}
