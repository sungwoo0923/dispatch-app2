// ======================= src/driverRequiredDocs.js =======================
// 📑 기사 필수 서류(2026-10-31) — 기사앱에서 칸마다 사진을 올리고, 경리·인사(관리자)가 확인/반려한다.
//  저장: driver_documents { driverId, companyName, docType(키), docLabel, fileName, fileType, dataUrl, 만료일, status, uploadedAt, reviewedBy, reviewedAt, rejectReason }
//   status: "제출"(검토 대기) · "확인"(확인 완료) · "반려"(다시 제출 필요)
import React from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";

// required: 필수 · expiry: 만료일 입력 · fresh: 최근 발급본(개월)
export const DRIVER_REQUIRED_DOCS = [
  { key: "license", label: "운전면허증", desc: "앞면 · 글씨가 잘 보이게", required: true, expiry: true },
  { key: "photo", label: "증명사진", desc: "운전자 증명사진(최근 6개월)", required: true },
  { key: "cargoCert", label: "화물운송종사 자격증", desc: "자격증 앞면", required: true },
  { key: "resident", label: "주민등록등본", desc: "최근 3개월 이내 발급", required: true, fresh: 3 },
  { key: "bankbook", label: "통장 사본", desc: "운임을 받을 계좌 · 실물 사진", required: true },
  { key: "bizReg", label: "사업자등록증", desc: "개인·법인 사업자", required: true },
  { key: "carReg", label: "자동차등록증", desc: "운행 차량", required: true },
  { key: "carInsurance", label: "자동차보험 증권", desc: "가입 기간이 보이게", required: true, expiry: true },
  { key: "cargoInsurance", label: "적재물배상책임보험", desc: "증권 또는 가입증명서", required: false, expiry: true },
  { key: "contract", label: "위·수탁(지입) 계약서", desc: "지입 기사님만", required: false, expiry: true },
  { key: "healthCheck", label: "운전적성정밀검사", desc: "해당 기사님만(신규·특별)", required: false },
];
export const docDef = (key) => DRIVER_REQUIRED_DOCS.find((d) => d.key === key) || null;
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const tsMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0);

// 한 서류의 지금 상태 — { tone: "none"|"wait"|"ok"|"bad"|"warn", label }
export function docState(d) {
  if (!d) return { tone: "none", label: "미제출" };
  if (d.status === "반려") return { tone: "bad", label: "반려 · 다시 제출" };
  if (d.만료일) {
    const days = Math.ceil((new Date(d.만료일) - new Date(kstToday())) / 86400000);
    if (days < 0) return { tone: "bad", label: "만료됨" };
    if (days <= 30) return { tone: "warn", label: `${days}일 후 만료` };
  }
  if (d.status === "확인") return { tone: "ok", label: "확인 완료" };
  return { tone: "wait", label: "검토 대기" };
}
export const TONE = {
  none: { bg: "#F3F6FA", fg: "#7A879C", bd: "#E3E8F0" },
  wait: { bg: "#EEF3FC", fg: "#2D4C82", bd: "#C9D6EE" },
  ok: { bg: "#0F1A30", fg: "#FFFFFF", bd: "#0F1A30" },
  warn: { bg: "#FFF7E6", fg: "#92400E", bd: "#FCD9A0" },
  bad: { bg: "#FDECEC", fg: "#B42318", bd: "#F5C2C2" },
};

// 기사 한 명의 서류(종류별 최신 1건)
export function useDriverDocs(driverId) {
  const [docs, setDocs] = React.useState(null);
  React.useEffect(() => {
    if (!driverId) return undefined;
    return onSnapshot(query(collection(db, "driver_documents"), where("driverId", "==", driverId)),
      (s) => setDocs(s.docs.map((x) => ({ id: x.id, ...x.data() }))), () => setDocs([]));
  }, [driverId]);
  return React.useMemo(() => latestByType(docs || []), [docs]);
}
// 종류별 최신 1건 — { [key]: doc }
export function latestByType(list) {
  const m = {};
  (list || []).forEach((d) => {
    const k = d.docType && docDef(d.docType) ? d.docType : null;
    if (!k) return;
    if (!m[k] || tsMs(d.uploadedAt) > tsMs(m[k].uploadedAt)) m[k] = d;
  });
  return m;
}
// 회사 전체 기사 서류 — { [driverId]: { [key]: doc } }
export function useCompanyDriverDocs(company) {
  const [all, setAll] = React.useState(null);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(collection(db, "driver_documents"), (s) => {
      const by = {};
      s.docs.forEach((x) => { const d = { id: x.id, ...x.data() }; if (d.companyName && d.companyName !== company) return; (by[d.driverId] = by[d.driverId] || []).push(d); });
      const out = {};
      Object.entries(by).forEach(([k, v]) => { out[k] = latestByType(v); });
      setAll(out);
    }, () => setAll({}));
  }, [company]);
  return all;
}
// 필수 서류 중 빠졌거나 문제 있는 개수
export function docProblems(byType) {
  let missing = 0; let wait = 0; let bad = 0; let warn = 0;
  DRIVER_REQUIRED_DOCS.forEach((def) => {
    const st = docState(byType?.[def.key]);
    if (st.tone === "none") { if (def.required) missing += 1; }
    else if (st.tone === "wait") wait += 1;
    else if (st.tone === "bad") bad += 1;
    else if (st.tone === "warn") warn += 1;
  });
  return { missing, wait, bad, warn };
}
