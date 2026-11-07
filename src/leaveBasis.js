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
  return setDoc(doc(db, "hrSettings", co), { companyName: co, leaveBasis: leaveBasisOf(leave), updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
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
