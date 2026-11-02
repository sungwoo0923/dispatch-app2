// ======================= src/companyInfo.js =======================
// ⭐ 2026-11-02 속도 — RateCard.jsx에 있던 회사 정보 훅(useCompanyInfo)을 작은 파일로 분리.
//  모바일 첫 화면이 이 훅 하나 때문에 단가표 화면 전체 + 엑셀 라이브러리(xlsx, 약 420KB)를 같이 받고 있었다.
//  RateCard.jsx는 여기서 가져와 그대로 다시 내보내므로 기존 import는 그대로 동작한다.
import { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, onSnapshot, query, where, getDocs } from "firebase/firestore";

export const EMPTY_COMPANY = { name: "", manager: "", phone: "", email: "", address: "", tel: "" };

// 전화번호 하이픈 자동 포맷 (DispatchApp.jsx formatPhone과 동일 규칙) — 단가표/견적서
// 곳곳에서 COMPANY.phone/tel을 그대로 찍어쓰므로, 여기서 한 번만 포맷해두면 모든
// 소비처(RateCard.jsx 전체, MobileApp.jsx 등)에 전부 적용된다.
export function formatPhone(phone) {
  const p = String(phone ?? "").replace(/[^\d]/g, "");
  if (p.length === 11) return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`;
  if (p.length === 10) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
  return p;
}

const pickInfo = (co, docs) => {
  let found = docs.find(d => (d.companyName || "").trim() === co && d.type === "신규" && d.status === "approved");
  if (!found) found = docs.find(d => (d.companyName || "").trim() === co && d.type === "신규");
  if (!found) found = docs.find(d => (d.companyName || "").trim() === co && d.status === "approved");
  const d = found || {};
  return {
    name: co,
    manager: d.representative || d.대표자 || d.ceo || "",
    phone: formatPhone(d.phone || d.연락처 || ""),
    email: d.email || "",
    address: d.address || d.주소 || "",
    tel: formatPhone(d.fax || d.팩스 || d.팩스번호 || ""),
  };
};

export function useCompanyInfo(userCompany) {
  const [info, setInfo] = useState(EMPTY_COMPANY);
  useEffect(() => {
    const co = (userCompany || "").trim();
    if (!co) { setInfo(EMPTY_COMPANY); return; }
    // ⭐ 2026-11-02 속도 — 예전엔 모든 운송사의 가입신청서(transportApplications 전체)를 실시간으로 받아
    //  우리 회사 것만 골랐다. 우리 회사 문서만 받도록 조건을 붙인다. 회사명 앞뒤 공백 등으로 못 찾으면
    //  예전처럼 전체에서 한 번만 찾아본다(결과 동일).
    let alive = true; let fellBack = false;
    const unsub = onSnapshot(query(collection(db, "transportApplications"), where("companyName", "==", co)), (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!docs.length && !fellBack) {
        fellBack = true;
        getDocs(collection(db, "transportApplications"))
          .then((all) => { if (alive) setInfo(pickInfo(co, all.docs.map(d => ({ id: d.id, ...d.data() })))); })
          .catch(() => { if (alive) setInfo(pickInfo(co, [])); });
        return;
      }
      setInfo(pickInfo(co, docs));
    }, () => {});
    return () => { alive = false; unsub(); };
  }, [userCompany]);
  return info;
}
