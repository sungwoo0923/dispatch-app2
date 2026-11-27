// ======================= src/orderFormFields.js =======================
// 🧩 2026-11-26 오더등록 입력칸 고르기(사용자 요청) — 운송사마다 필요 없는 입력칸을 숨긴다(PC 배차관리 · 모바일 오더등록 같이)
//  · 회사 기본값: colLayoutsCompany/{회사}.orderFormFields = { hidden: [칸], at, by }  (그 회사 직원이 [회사 전체 적용])
//  · 개인 설정:   userSettings/{uid}.orderFormFields = { mode: "mine" | "company", hidden: [칸], at }
//    → mode "mine" 이면 내 값, 아니면 회사 기본값. 내 값은 나만 바뀌고 다른 계정은 그대로
//  · 거래처 · 운임(청구 · 기사 · 수수료)은 숨길 수 없다(LOCKED)
//  · 숨긴 칸은 입력창에서 빠지고 나머지가 앞으로 당겨진다(격자라 자동 정렬) · 숨긴 칸은 필수 검사도 하지 않는다
//  · 이 PC에 마지막 값을 기억해 두어 화면이 뜨자마자 같은 모양(localStorage)
import React from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db, auth } from "./firebase";

export const ORDER_FIELDS = [
  { key: "거래처", label: "거래처명", group: "기본", locked: true },
  { key: "운임", label: "운임(청구 · 기사 · 수수료)", group: "기본", locked: true },
  { key: "상차지", label: "상차지명", group: "상차" },
  { key: "상차지주소", label: "상차지 주소", group: "상차" },
  { key: "상차지담당자", label: "상차지 담당자", group: "상차" },
  { key: "상차지연락처", label: "상차지 연락처", group: "상차" },
  { key: "하차지", label: "하차지명", group: "하차" },
  { key: "하차지주소", label: "하차지 주소", group: "하차" },
  { key: "하차지담당자", label: "하차지 담당자", group: "하차" },
  { key: "하차지연락처", label: "하차지 연락처", group: "하차" },
  { key: "화물내용", label: "화물내용", group: "화물 · 차량" },
  { key: "차량종류", label: "차량종류", group: "화물 · 차량" },
  { key: "차량톤수", label: "차량톤수", group: "화물 · 차량" },
  { key: "스마트검색", label: "스마트검색(기사 찾기)", group: "기사" },
  { key: "차량번호", label: "차량번호", group: "기사" },
  { key: "기사명", label: "기사명", group: "기사" },
  { key: "전화번호", label: "기사 전화번호", group: "기사" },
  { key: "상차방법", label: "상차방법", group: "방법 · 지급" },
  { key: "하차방법", label: "하차방법", group: "방법 · 지급" },
  { key: "지급방식", label: "지급방식", group: "방법 · 지급" },
  { key: "배차방식", label: "배차방식", group: "방법 · 지급" },
  { key: "마감월", label: "마감월(이월 오더)", group: "방법 · 지급" }, // 🗓 2026-11-27 10/31 상차 · 11월 마감처럼 청구 달을 오더에서 바로 정한다
  { key: "메모", label: "메모 · 기사 전달사항", group: "메모" },
];
export const LOCKED = new Set(ORDER_FIELDS.filter((f) => f.locked).map((f) => f.key));
const KEYS = new Set(ORDER_FIELDS.map((f) => f.key));
export const cleanHidden = (arr) => [...new Set((Array.isArray(arr) ? arr : []).filter((k) => KEYS.has(k) && !LOCKED.has(k)))];
// 필수 검사에서 빼는 칸 — 숨긴 칸에 해당하는 값 이름
export const HIDDEN_VALUE_KEYS = { 상차지: "상차지명", 하차지: "하차지명", 화물내용: "화물내용", 차량톤수: "차량톤수", 지급방식: "지급방식" };

// 지금 쓸 숨김 — 내 값(mode mine)이면 내 것, 아니면 회사 것
export function resolveHidden(company, mine) {
  if (mine && mine.mode === "mine") return { hidden: cleanHidden(mine.hidden), src: "mine" };
  return { hidden: cleanHidden(company?.hidden), src: company?.hidden ? "company" : "default" };
}

// ── 저장소(앱에 하나) ──
let CO = ""; let UID = "";
let COMP = null; let MINE = null;
const subs = new Set();
const notify = () => subs.forEach((f) => f());
const lsKey = () => `kpOrderFields:v1:${UID}:${CO}`;
const cache = () => { try { localStorage.setItem(lsKey(), JSON.stringify({ COMP, MINE })); } catch { /* 무시 */ } };
let unC = null; let unM = null;
function attach(co, uid) {
  if (co === CO && uid === UID) return;
  CO = co; UID = uid;
  try { const c = JSON.parse(localStorage.getItem(lsKey()) || "null"); COMP = c?.COMP || null; MINE = c?.MINE || null; } catch { COMP = null; MINE = null; }
  notify();
  try { unC?.(); } catch { /* 무시 */ } try { unM?.(); } catch { /* 무시 */ }
  unC = null; unM = null;
  if (co) unC = onSnapshot(doc(db, "colLayoutsCompany", co), (s) => { COMP = s.exists() ? s.data()?.orderFormFields || null : null; cache(); notify(); }, () => {});
  if (uid) unM = onSnapshot(doc(db, "userSettings", uid), (s) => { if (s.metadata?.hasPendingWrites) return; MINE = s.exists() ? s.data()?.orderFormFields || null : null; cache(); notify(); }, () => {});
}

const myName = () => { try { return localStorage.getItem("userName") || auth?.currentUser?.email || ""; } catch { return ""; } };
// 회사 전체 적용 — 그 회사 모든 계정(개인 설정을 켠 사람 빼고)
export async function saveCompanyFields(hidden) {
  if (!CO) throw new Error("회사 정보가 없어요");
  const v = { hidden: cleanHidden(hidden), at: Date.now(), by: myName() };
  COMP = v; cache(); notify();
  await setDoc(doc(db, "colLayoutsCompany", CO), { companyName: CO, orderFormFields: v }, { merge: true });
}
// 개인 설정 — mode "mine"(내 값) · "company"(회사 기본값 따르기)
export async function saveMyFields(mode, hidden) {
  if (!UID) throw new Error("로그인 정보가 없어요");
  const v = { mode, hidden: cleanHidden(hidden), at: Date.now() };
  MINE = v; cache(); notify();
  await setDoc(doc(db, "userSettings", UID), { orderFormFields: v }, { merge: true });
}

// 화면에서 — { hidden:Set, src, company, mine, show(key) }
export function useOrderFormFields(company) {
  const co = String(company || "").trim();
  const [uid, setUid] = React.useState(() => auth?.currentUser?.uid || "");
  React.useEffect(() => { try { return auth.onAuthStateChanged((u) => setUid(u?.uid || "")); } catch { return undefined; } }, []);
  const [, tick] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { subs.add(tick); return () => { subs.delete(tick); }; }, []);
  React.useEffect(() => { attach(co, uid); }, [co, uid]);
  const r = resolveHidden(COMP, MINE);
  const hidden = new Set(r.hidden);
  return { hidden, src: r.src, company: COMP, mine: MINE, show: (k) => !hidden.has(k) };
}
