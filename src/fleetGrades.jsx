// ======================= src/fleetGrades.jsx =======================
// 🚛 2026-11-12 회사 전용 지입차 구분(분양 등) 선택 목록 — 규칙은 src/fleetGradesCore.js
import React from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db, DEFAULT_COMPANY } from "./firebase";
import { getTenant } from "./fsTenant";
import { COMPANY_FLEET_GRADES } from "./fleetGradesCore";
export * from "./fleetGradesCore";

// 이 회사가 켠 추가 구분(예: ["분양"]) — companySettings/{회사}.fleetGrades
export function useCompanyFleetGrades(company) {
  const co = String(company || (() => { try { return getTenant(); } catch { return ""; } })() || DEFAULT_COMPANY).trim();
  const [extra, setExtra] = React.useState([]);
  React.useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(doc(db, "companySettings", co), (s) => {
      const list = s.exists() && Array.isArray(s.data().fleetGrades) ? s.data().fleetGrades : [];
      setExtra(list.filter((g) => COMPANY_FLEET_GRADES.includes(g)));
    }, () => setExtra([]));
  }, [co]);
  return extra;
}
