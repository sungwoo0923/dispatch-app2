// ======================= src/popbillAuto.js =======================
// 💬🏦 2026-11-08 팝빌 자동화 화면 쪽 연결(화면 조각은 src/PopbillAuto.jsx)
//  · popbillSettings/{회사}: 알림톡 설정(alimtalk) · 조회할 계좌(bankAccounts) — 회사 관리자가 바로 쓴다(서버 규칙이 회사 · 권한 검사)
//  · bankTxns · bankSyncState · bankAliases · alimtalkLogs: 서버만 쓴다 — 여기서는 읽기만
//  · 서버 호출: alimtalkSend(오더 다시 보내기) · bankDeposits(status · syncNow · confirm · ignore · undo)
//  · 둘러보기(demo=1, 개발 서버에서만)는 src/popbillAutoDemo.js의 메모리 저장소를 쓴다(배포 빌드에는 들어가지 않는다)
import React from "react";
import { doc, onSnapshot, setDoc, collection, query, where, limit } from "firebase/firestore";
import { auth, db } from "./firebase";
import { pdCall } from "./publicDataMain";
import { alimtalkSettingsOf, alimtalkOrderDefault } from "../functions/alimtalkCore.mjs";

export * from "../functions/alimtalkCore.mjs";

const isDemo = () => { try { return new URLSearchParams(window.location.search).get("demo") === "1"; } catch { return false; } };
let demoMod = null;
const demo = import.meta.env.DEV ? async () => (demoMod || (demoMod = await import("./popbillAutoDemo.js"))) : async () => null;
const DEMO = () => import.meta.env.DEV && isDemo();

// ── 회사 설정 ──
export function subscribeAutoSettings(co, cb) {
  if (!co) { cb({}); return () => {}; }
  if (DEMO()) { let off = null; let dead = false; demo().then((m) => { if (!dead) off = m.demoSubscribe("settings", cb); }); return () => { dead = true; off?.(); }; }
  return onSnapshot(doc(db, "popbillSettings", co), (s) => cb(s.exists() ? s.data() || {} : {}), () => cb({}));
}
export async function saveAutoSettings(co, patch) {
  if (DEMO()) return (await demo()).demoSaveSettings(patch);
  return setDoc(doc(db, "popbillSettings", co), { ...patch, companyName: co, updatedAt: Date.now(), updatedBy: auth.currentUser?.uid || "" }, { merge: true });
}
export function useAutoSettings(co) {
  const [s, setS] = React.useState(null);
  React.useEffect(() => subscribeAutoSettings(co, setS), [co]);
  return s;
}

// 새 오더 "알림톡 보내기" 처음 값 — addDispatch 등 화면 밖 함수가 쓰도록 회사 설정을 한 번 구독해 둔다
let _defCo = ""; let _defOff = null; let _defVal = false; const _defSubs = new Set();
export function watchAlimtalkDefault(co) {
  const c = String(co || "").trim();
  if (!c || c === _defCo) return;
  _defOff?.(); _defCo = c;
  _defOff = subscribeAutoSettings(c, (s) => { _defVal = alimtalkOrderDefault(s); _defSubs.forEach((f) => f(_defVal)); });
}
export const alimtalkDefaultNow = () => _defVal;
// 컴포넌트용 — 회사 기본값(구독)
export function useAlimtalkDefault(co) {
  const [v, setV] = React.useState(_defVal);
  React.useEffect(() => { if (co) watchAlimtalkDefault(co); setV(_defVal); _defSubs.add(setV); return () => { _defSubs.delete(setV); }; }, [co]);
  return v;
}
export const settingsOfDoc = (d) => alimtalkSettingsOf(d || {});

// ── 은행 입금 ──
export function subscribeBankTxns(co, cb) {
  if (!co) { cb([]); return () => {}; }
  if (DEMO()) { let off = null; let dead = false; demo().then((m) => { if (!dead) off = m.demoSubscribe("txns", cb); }); return () => { dead = true; off?.(); }; }
  return onSnapshot(query(collection(db, "bankTxns"), where("companyName", "==", co), where("status", "in", ["review", "auto", "new"]), limit(300)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]));
}
export function subscribeBankState(co, cb) {
  if (!co) { cb(null); return () => {}; }
  if (DEMO()) { let off = null; let dead = false; demo().then((m) => { if (!dead) off = m.demoSubscribe("state", cb); }); return () => { dead = true; off?.(); }; }
  return onSnapshot(doc(db, "bankSyncState", co), (s) => cb(s.exists() ? s.data() : null), () => cb(null));
}
export async function bankCall(action, data = {}) {
  if (DEMO()) return (await demo()).demoBank(action, data);
  return pdCall("bankDeposits", { action, ...data }, 120000);
}
export async function alimtalkSendNow(row, targets) {
  if (DEMO()) return (await demo()).demoAlimtalkSend(row, targets);
  return pdCall("alimtalkSend", { col: row.__col || "orders", id: row._id || row.id, ...(targets ? { targets } : {}) }, 60000);
}
// 팝빌 연결 상태(회사 화면용) — { popbill: {enabled, reason}, member, state }
export function usePopbillLink(co) {
  const [st, setSt] = React.useState(null);
  React.useEffect(() => {
    let off = false;
    if (!co) return undefined;
    bankCall("status").then((r) => { if (!off) setSt(r); }).catch((e) => { if (!off) setSt({ unavailable: true, error: e?.message || "" }); });
    return () => { off = true; };
  }, [co]);
  return st;
}
export const popbillLinkLabel = (st) => {
  if (!st) return { tone: "muted", label: "확인 중" };
  if (st.unavailable) return { tone: "muted", label: "팝빌 연결 전", detail: "서버 함수 배포 전이에요" };
  if (!st.popbill?.enabled) return { tone: "muted", label: "팝빌 연결 전", detail: "사업자 등록 · 팝빌 연동 계약이 끝나면 켜져요" };
  if (st.member?.status !== "연동됨") return { tone: "warn", label: "연동회원 등록 필요", detail: "회사정보 › 팝빌 연동회원에서 사업자번호를 등록해 주세요" };
  return { tone: "ok", label: "팝빌 연결됨" };
};
