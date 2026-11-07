// ======================= src/dailyReport.js =======================
// 📊 2026-11-06 일일 경영 보고(DAILY REPORT) — 누가 보는지(권한)·받기 설정 저장
//  · 기존 "경영 브리핑"(임원 홈 · ExecSuite ExecDashboard)과 별개의 새 메뉴. 임원 화면 메뉴에서 경영 브리핑 바로 다음.
//  · 볼 수 있는 사람: 기존 임원 판정 그대로 — 임원 화면 역할(customRoles roleScreen === "exec" · 권한 관리 › "임원 화면")
//    (PC DispatchApp isExec · 모바일 isExecM · 서버 규칙 isExecRoleUser와 같은 기준). 새 권한 판정은 만들지 않았다.
//  · 받기 설정(사람마다): dailyReportPrefs/{uid} = { uid, companyName, time, days, weekend, monday, channels, sections, popupDismissed, updatedAt }
//  · 회사 설정: dailyReportCompany/{회사} = { companyName, recipients: { uid: false }, updatedAt, updatedBy }
//    false = 받지 않음(팝업·푸시·메일 안 감 · 메뉴는 그대로). 받는 사람 목록 = 임원 화면 역할 직원(useRoleOptions().execKeys)
//  · 서버(functions › dailyReportPush)가 30분마다 받는 시간이 된 사람에게 푸시(·메일)를 보낸다
import React from "react";
import { doc, onSnapshot, setDoc, collection, query, where } from "firebase/firestore";
import { db, auth } from "./firebase";
import { mergePrefs } from "./dailyReportCore";
import { isPreviewMode } from "./fsTenant";
import { isDemoOn } from "./devDemoData";

export const BRIEF_MENU = "일일경영보고";
export const BRIEF_LABEL = "일일 경영 보고";
export const BRIEF_EN = "DAILY REPORT";
export const PREFS_COL = "dailyReportPrefs";
export const CO_COL = "dailyReportCompany";
const demoMode = () => { try { return !!(import.meta.env.DEV && (isPreviewMode() || isDemoOn())); } catch { return false; } };
export const isBriefDemo = demoMode;

// 메뉴를 볼 수 있는지 — 기존 임원 판정(isExec) 그대로
export function canSeeBriefing({ isExec = false } = {}) {
  return !!isExec;
}
// 받는 사람 목록을 고칠 수 있는 사람 — 최고관리자 · 회사 마스터 · 관리자(운송·통합) · 대표 직책
export const canManageRecipients = ({ role, profile } = {}) => demoMode() || role === "totalMaster" || profile?.isMaster === true || ["admin", "allMgr"].includes(role) || ["대표", "대표이사", "사장"].includes(String(profile?.position || "").trim());

// ── 받기 설정(사람마다) ──
const DEMO_KEY = (uid) => `kpBriefPrefs:${uid}`;
export function useBriefingPrefs(uid) {
  const [raw, setRaw] = React.useState(undefined);
  React.useEffect(() => {
    if (!uid) { setRaw(null); return undefined; }
    if (demoMode()) { try { setRaw(JSON.parse(localStorage.getItem(DEMO_KEY(uid)) || "null")); } catch { setRaw(null); } const h = () => { try { setRaw(JSON.parse(localStorage.getItem(DEMO_KEY(uid)) || "null")); } catch { /* 무시 */ } }; window.addEventListener("kp-brief-prefs", h); return () => window.removeEventListener("kp-brief-prefs", h); }
    return onSnapshot(doc(db, PREFS_COL, uid), (s) => setRaw(s.exists() ? s.data() : null), () => setRaw(null));
  }, [uid]);
  return React.useMemo(() => ({ ready: raw !== undefined, saved: !!raw, raw: raw || null, prefs: mergePrefs(raw || {}) }), [raw]);
}
export async function saveBriefingPrefs(uid, company, patch) {
  if (!uid) throw new Error("로그인 정보가 없습니다");
  const data = { ...patch, uid, companyName: String(company || "").trim(), updatedAt: Date.now() };
  if (demoMode()) {
    let cur = {}; try { cur = JSON.parse(localStorage.getItem(DEMO_KEY(uid)) || "{}") || {}; } catch { /* 무시 */ }
    try { localStorage.setItem(DEMO_KEY(uid), JSON.stringify({ ...cur, ...data })); } catch { /* 무시 */ }
    window.dispatchEvent(new Event("kp-brief-prefs"));
    return;
  }
  await setDoc(doc(db, PREFS_COL, uid), data, { merge: true });
}

// ── 회사 설정(받는 사람) ──
const DEMO_CO = (co) => `kpBriefCo:${co}`;
export function useBriefingCompany(company) {
  const co = String(company || "").trim();
  const [d, setD] = React.useState(null);
  React.useEffect(() => {
    if (!co) { setD(null); return undefined; }
    if (demoMode()) { try { setD(JSON.parse(localStorage.getItem(DEMO_CO(co)) || "null")); } catch { setD(null); } const h = () => { try { setD(JSON.parse(localStorage.getItem(DEMO_CO(co)) || "null")); } catch { /* 무시 */ } }; window.addEventListener("kp-brief-co", h); return () => window.removeEventListener("kp-brief-co", h); }
    return onSnapshot(doc(db, CO_COL, co), (s) => setD(s.exists() ? s.data() : null), () => setD(null));
  }, [co]);
  return React.useMemo(() => ({ recipients: d?.recipients || {}, raw: d }), [d]);
}
export async function saveBriefingRecipients(company, recipients) {
  const co = String(company || "").trim();
  if (!co) throw new Error("회사 정보가 없습니다");
  const data = { companyName: co, recipients, updatedAt: Date.now(), updatedBy: auth?.currentUser?.email || "" };
  if (demoMode()) { try { localStorage.setItem(DEMO_CO(co), JSON.stringify(data)); } catch { /* 무시 */ } window.dispatchEvent(new Event("kp-brief-co")); return; }
  await setDoc(doc(db, CO_COL, co), data, { merge: true });
}

// 회사 직원(받는 사람 후보) — 기사·화주 제외 · 퇴사 포함(인력 현황 퇴사 집계용)
export function useCompanyPeople(company) {
  const co = String(company || "").trim();
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(query(collection(db, "users"), where("companyName", "==", co)), (s) => setRows(s.docs.map((x) => ({ uid: x.id, ...x.data() }))), () => setRows([]));
  }, [co]);
  return rows;
}
