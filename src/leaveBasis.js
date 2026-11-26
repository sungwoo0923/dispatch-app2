// ======================= src/leaveBasis.js =======================
// 📅 2026-11-07 회사 연차 회기 기준(입사일 / 회계연도) — 내정보 · 전자결재 · 인사관리부가 같은 값을 읽는다
//  · 원본: 인사관리부 › 연차 촉진 설정(payrollSettings/{회사}.leave) — 급여 담당·인사 담당만 읽을 수 있어서
//    저장할 때 hrSettings/{회사}.leaveBasis에도 같이 적는다(직원 누구나 읽음)
//  · 없으면 입사일 기준
import React from "react";
import { collection, doc, onSnapshot, query, setDoc, serverTimestamp, where } from "firebase/firestore";
import { db } from "./firebase";

const cache = new Map();
export const leaveBasisOf = (v) => (v && v.basis === "fiscal" ? { basis: "fiscal", fiscalStart: /^\d{2}-\d{2}$/.test(v.fiscalStart || "") ? v.fiscalStart : "01-01" } : { basis: "hire", fiscalStart: "01-01" });

export function useLeaveBasis(company) {
  const co = String(company || "").trim();
  const [v, setV] = React.useState(() => cache.get(co) || leaveBasisOf(null));
  React.useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(doc(db, "hrSettings", co), (s) => { const b = leaveBasisOf(s.exists() ? s.data().leaveBasis : null); cache.set(co, b); setV(b); }, () => {});
  }, [co]);
  return v;
}

// 연차 촉진 설정을 저장하거나 화면을 열 때 — 직원이 읽는 곳에도 같은 값
export function mirrorLeaveBasis(company, leave) {
  const co = String(company || "").trim();
  if (!co) return Promise.resolve();
  // 🔕 2026-11-26 leavePopup — 연차 촉진 통지를 직원 화면에 팝업으로 띄울지(회사 설정 · 값이 없으면 띄움)
  return setDoc(doc(db, "hrSettings", co), { companyName: co, leaveBasis: leaveBasisOf(leave), leavePopup: leave?.popup !== false, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
}

// 🔕 2026-11-26 사용자 요청 — 연차 촉진 통지 팝업을 회사마다 끌 수 있게(인사관리부 › 연차 촉진 › 설정)
//  끄면 들어올 때 화면 가운데 팝업만 안 뜬다. 알림 목록 · 사내메일 · 이메일 · 발송 기록(법정 통지 증빙)은 그대로
const popupCache = new Map();
export function useLeavePopupOn(company) {
  const co = String(company || "").trim();
  const [on, setOn] = React.useState(() => (popupCache.has(co) ? popupCache.get(co) : true));
  React.useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(doc(db, "hrSettings", co), (s) => { const v = !(s.exists() && s.data().leavePopup === false); popupCache.set(co, v); setOn(v); }, () => {});
  }, [co]);
  return on;
}

// 내정보(PC·모바일) 연차 — 전자결재 연차·반차 문서(내 것) · 연차 조정 · 회사 회기 기준을 한 번에
//  (규칙: 같은 회사 직원은 cat "leave" 결재를 company 조건으로 읽을 수 있다)
export function useMyLeaveExtras(uid, company) {
  const co = String(company || "").trim();
  const basis = useLeaveBasis(co);
  const [approvals, setApprovals] = React.useState([]);
  const [adjust, setAdjust] = React.useState([]);
  React.useEffect(() => {
    if (!uid || !co) return undefined;
    const a = onSnapshot(query(collection(db, "approvals"), where("company", "==", co), where("cat", "==", "leave"), where("drafterUid", "==", uid)), (s) => setApprovals(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setApprovals([]));
    const b = onSnapshot(doc(db, "userProfiles", uid), (s) => setAdjust((s.exists() && s.data().leaveAdjust) || []), () => setAdjust([]));
    return () => { a(); b(); };
  }, [uid, co]);
  return React.useMemo(() => ({ approvals, adjust, basis }), [approvals, adjust, basis]);
}
