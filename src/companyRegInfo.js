// ======================= src/companyRegInfo.js =======================
// 🏢 2026-11-04 우리 회사 등록 정보(대표자·상호·사업자번호·주소·연락처·팩스·이메일 원본 그대로)(회사관리 › 회사정보) 읽기 — 계약서 등에서 "우리 회사" 칸 자동 입력용
//  · 출처: transportApplications (회사정보 화면 CompanyProfile 과 같은 문서 고르기 규칙: 신규+승인 → 신규 → 승인)
//  · 추가 사업자(companySettings/{회사}.bizList)는 companyBiz.jsx 의 useCompanyBiz / printInfoForBiz 로 덮어 쓴다
//  · 반환: { name, ceo, bizNo, addr, phone, fax, email } — 문서가 없거나 읽기 실패면 null
import React from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";

const pick = (docs, co) => {
  const same = docs.filter((d) => String(d.companyName || "").trim() === co);
  return same.find((d) => d.type === "신규" && d.status === "approved") || same.find((d) => d.type === "신규") || same.find((d) => d.status === "approved") || same[0] || null;
};

export const companyRegInfoOf = (d, co = "") => {
  if (!d) return null;
  return {
    name: String(co || d.companyName || "").trim(),
    ceo: d.representative || d.대표자 || d.ceo || "",
    bizNo: d.businessNumber || d.사업자번호 || "",
    addr: d.address || d.주소 || "",
    phone: d.phone || d.연락처 || "",
    fax: d.fax || d.팩스 || d.팩스번호 || "",
    email: d.email || d.이메일 || "",
  };
};

export function useCompanyRegInfo(company) {
  const co = String(company || "").trim();
  const [info, setInfo] = React.useState(null);
  React.useEffect(() => {
    if (!co) { setInfo(null); return undefined; }
    return onSnapshot(query(collection(db, "transportApplications"), where("companyName", "==", co)), (s) => {
      const all = s.docs.map((x) => ({ id: x.id, ...x.data() }));
      const v = companyRegInfoOf(pick(all, co), co);
      // 회사정보 화면과 같이 — 주소가 비어 있으면 같은 회사 다른 신청서의 주소로 보완
      if (v && !v.addr) { const alt = all.find((d) => String(d.address || d.주소 || "").trim()); if (alt) v.addr = alt.address || alt.주소 || ""; }
      setInfo(v);
    }, () => setInfo(null));
  }, [co]);
  return info;
}
