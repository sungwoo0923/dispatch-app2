// ======================= src/companyFeatures.js =======================
// ⭐ 2026-11-02 회사별 맞춤 기능 — 특정 운송사만 쓰는 기능을 최고관리자(관리자센터 › 고객사 상세)가 회사별로 켜 준다.
//  저장: companyFeatures/{회사} = { companyName, fareRules: bool, vehicleLedger: bool, …, updatedAt, updatedBy }
//  규칙: 읽기 = 그 회사 승인 직원 + 최고관리자 · 쓰기 = 최고관리자만 (firestore.rules)
//  새 기능은 COMPANY_FEATURES에 한 줄만 추가하면 관리자센터에 토글이 생긴다.
import React from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { getTenant } from "./fsTenant";
import { presetFeatures } from "./bizModules"; // 🧭 2026-11-12 업무 영역 — 저장값이 없어도 통합으로 여는 회사

export const COMPANY_FEATURES = [
  { key: "fareRules", label: "운임 규칙", desc: "운임구분(일대·월대 등)별 수수료 자동 계산 — 모든 운송사 기본 켜짐(안 쓰는 곳만 끔)", defaultOn: true },
  { key: "vehicleLedger", label: "차량 관리대장", desc: "차량별 정비·변경·기사 탑승 이력, 장비(유류카드·하이패스·GPS·덮개·박스) 관리" },
  { key: "masterRolePerms", label: "마스터 권한 관리", desc: "회사 마스터가 관리자메뉴 › 권한 관리에서 자기 회사 역할별 메뉴(숨김·조회·수정)를 직접 설정 — 모든 운송사 기본 켜짐(막을 곳만 끔)", defaultOn: true }, // ⭐ 2026-11-11 모든 운송사 마스터에게 기본으로 연다
  // 💳 2026-11-11 정산 표시 · IN/OUT — 처음엔 테스트운송사만 쓰던 시험 기능. 같은 날 모든 운송사 기본 켜짐으로 바꿈(안 쓰는 곳만 여기서 끔)
  { key: "callPay", label: "정산 표시 · IN/OUT", desc: "배차현황 [정산] 칸(계산서·지급·입금) · 잡은 콜 · 정산관리 › 입금 확인 · 사무실 첨부 파란색 · 거래처명 더보기 · 모바일 + 버튼에 AI 비서 합치기 — 모든 운송사 기본 켜짐(안 쓰는 곳만 끔)", defaultOn: true },
  { key: "orderManagerCol", label: "배차표 배차담당자 칸", desc: "실시간·배차현황·미배차 표에 오더 등록 직원 이름 표시" },
  // ⭐ 2026-11-08 업체 요청 — 기사앱 퇴근 키로수 입력 + 엔진오일(교환 후 5만km, 4만km부터 알림 확인해야 출퇴근)·타이어 표시
  { key: "driverOdoOil", label: "기사 퇴근 키로수·오일 관리", desc: "기사앱 퇴근 시 키로수 입력 필수 · 엔진오일 교환 시점/다음 교환(5만km)·타이어 표시 · 4만km부터 오일 알림 확인해야 출퇴근" },
  // 🧭 2026-11-12 업무 영역 — 가입할 때 고른 값(src/bizModules.js). 예전 운송사는 내륙만
  { key: "routeGroups", label: "담당노선구분", desc: "거래처가 같아도 시트 탭처럼 묶음(녹수 · 아산 KDF …)으로 나눠 보기 · 화면 위 버튼 줄 · 직원별 내 담당" }, // 🗂 2026-11-13 JY로지스틱스용
  { key: "modInland", label: "업무 영역 · 내륙운송", desc: "내륙 배차(기존 배차 프로그램) — 기본 켜짐", defaultOn: true },
  { key: "modContainer", label: "업무 영역 · 컨테이너운송", desc: "컨테이너 오더등록 · 운송현황 · 마감보드 · 손익" },
  { key: "modSea", label: "업무 영역 · 해상", desc: "해상 선적등록(B/L) · 선적현황 · 마감보드 · 손익" },
  { key: "modAir", label: "업무 영역 · 항공", desc: "항공 등록(AWB) · 항공현황 · 마감보드 · 손익" },
];

const resolveCompany = (company) => {
  const c = String(company || "").trim();
  if (c) return c;
  try { return String(getTenant() || localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "").trim(); } catch { return ""; }
};

const blank = () => {
  const o = { loaded: false };
  COMPANY_FEATURES.forEach((f) => { o[f.key] = !!f.defaultOn; }); // ⭐ 2026-11-09 기본 켜짐 기능(defaultOn)은 저장값이 없어도 켜짐
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
      COMPANY_FEATURES.forEach((f) => { o[f.key] = f.defaultOn ? d[f.key] !== false : d[f.key] === true; }); // defaultOn = 끈(false) 회사만 꺼짐
      // 배열에 아직 없는 키도 true면 그대로 노출(다른 기능이 먼저 저장한 경우)
      Object.keys(d).forEach((k) => { if (!(k in o) && typeof d[k] === "boolean") o[k] = d[k]; });
      // 🧭 2026-11-12 업무 영역 기본값(JY로지스틱스 · 테스트운송사 = 통합) — 관리센터에서 저장한 값이 있으면 그 값이 우선
      const pre = presetFeatures(co);
      if (pre) Object.keys(pre).forEach((k) => { if (typeof d[k] !== "boolean") o[k] = pre[k]; });
      s.state = o; emit(s);
    }, () => { s.state = { ...blank(), ...(presetFeatures(co) || {}), loaded: true }; emit(s); });
  } catch { s.state = { ...blank(), ...(presetFeatures(co) || {}), loaded: true }; emit(s); }
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
  return useCompanyFeatures(company)[key] === true; // defaultOn 기능도 위에서 true로 채워진다
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
