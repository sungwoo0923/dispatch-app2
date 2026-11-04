// ======================= src/companyFeatures.js =======================
// ⭐ 2026-11-02 회사별 맞춤 기능 — 특정 운송사만 쓰는 기능을 최고관리자(관리자센터 › 고객사 상세)가 회사별로 켜 준다.
//  저장: companyFeatures/{회사} = { companyName, fareRules: bool, vehicleLedger: bool, …, updatedAt, updatedBy }
//  규칙: 읽기 = 그 회사 승인 직원 + 최고관리자 · 쓰기 = 최고관리자만 (firestore.rules)
//  새 기능은 COMPANY_FEATURES에 한 줄만 추가하면 관리자센터에 토글이 생긴다.
import React from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { getTenant } from "./fsTenant";

export const COMPANY_FEATURES = [
  { key: "fareRules", label: "운임 규칙", desc: "운임구분(일대·월대 등)별 수수료 자동 계산" },
  { key: "vehicleLedger", label: "차량 관리대장", desc: "차량별 정비·변경·기사 탑승 이력, 장비(유류카드·하이패스·GPS·덮개·박스) 관리" },
  { key: "masterRolePerms", label: "마스터 권한 관리", desc: "회사 마스터가 관리자메뉴 › 권한 관리에서 자기 회사 역할별 메뉴(숨김·조회·수정)를 직접 설정" },
  { key: "orderManagerCol", label: "배차표 배차담당자 칸", desc: "실시간·배차현황·미배차 표에 오더 등록 직원 이름 표시" },
];

const resolveCompany = (company) => {
  const c = String(company || "").trim();
  if (c) return c;
  try { return String(getTenant() || localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "").trim(); } catch { return ""; }
};

const blank = () => {
  const o = { loaded: false };
  COMPANY_FEATURES.forEach((f) => { o[f.key] = false; });
  return Object.freeze(o);
};
const EMPTY = blank();

// 회사별 구독 공유 — 같은 회사를 여러 화면이 봐도 onSnapshot 하나
const stores = new Map(); // co -> { state, listeners, unsub }
function storeOf(co) {
  let s = stores.get(co);
  if (!s) { s = { state: EMPTY, listeners: new Set(), unsub: null }; stores.set(co, s); }
  return s;
}
const emit = (s) => s.listeners.forEach((fn) => fn());
function start(co, s) {
  if (s.unsub || !co) return;
  try {
    s.unsub = onSnapshot(doc(db, "companyFeatures", co), (snap) => {
      const d = snap.exists() ? snap.data() || {} : {};
      const o = { loaded: true };
      COMPANY_FEATURES.forEach((f) => { o[f.key] = d[f.key] === true; });
      // 배열에 아직 없는 키도 true면 그대로 노출(다른 기능이 먼저 저장한 경우)
      Object.keys(d).forEach((k) => { if (!(k in o) && typeof d[k] === "boolean") o[k] = d[k]; });
      s.state = o; emit(s);
    }, () => { s.state = { ...blank(), loaded: true }; emit(s); });
  } catch { s.state = { ...blank(), loaded: true }; emit(s); }
}

// { fareRules, vehicleLedger, …, loaded }
export function useCompanyFeatures(company) {
  const co = resolveCompany(company);
  const subscribe = React.useCallback((cb) => {
    if (!co) return () => {};
    const s = storeOf(co);
    s.listeners.add(cb);
    start(co, s);
    return () => {
      s.listeners.delete(cb);
      if (!s.listeners.size && s.unsub) setTimeout(() => {
        if (!s.listeners.size && s.unsub) { try { s.unsub(); } catch { /* 무시 */ } s.unsub = null; s.state = EMPTY; }
      }, 3000);
    };
  }, [co]);
  const get = React.useCallback(() => (co ? storeOf(co).state : EMPTY), [co]);
  return React.useSyncExternalStore(subscribe, get, get);
}

export function useCompanyFeature(company, key) {
  return useCompanyFeatures(company)[key] === true;
}

// 최고관리자용 — 회사별 기능 켜기/끄기
export async function setCompanyFeature(company, key, on, by) {
  const co = String(company || "").trim();
  if (!co || !key) throw new Error("회사·기능을 지정하세요");
  await setDoc(doc(db, "companyFeatures", co), {
    companyName: co,
    [key]: !!on,
    updatedAt: Date.now(),
    updatedBy: by || auth?.currentUser?.email || "",
  }, { merge: true });
}
