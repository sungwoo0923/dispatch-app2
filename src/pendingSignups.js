// src/pendingSignups.js
// ⭐ 2026-11-01 가입 승인 대기(직원·기사) — PC 상단 [관리자메뉴] 숫자 + 새 신청이 들어오면 화면 알림
import React from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db, DEFAULT_COMPANY } from "./firebase";

export const isPendingSignup = (u, company) =>
  !!u && u.approved === false && u.employmentStatus !== "퇴사" && !["deleted", "withdrawn"].includes(u.status) &&
  !["shipper", "cafeUser", "totalMaster"].includes(u.role) && (u.companyName || DEFAULT_COMPANY) === company;

export function usePendingSignups(company) {
  const [list, setList] = React.useState([]);
  React.useEffect(() => {
    if (!company) { setList([]); return undefined; }
    let first = true;
    const seen = new Set();
    return onSnapshot(query(collection(db, "users"), where("companyName", "==", company), where("approved", "==", false)), (s) => {
      const p = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => isPendingSignup(u, company));
      if (!first) {
        p.filter((u) => !seen.has(u.id)).forEach((u) => {
          const msg = u.role === "driver" ? `▸ 기사 가입 신청 · ${u.name || ""} ${u.carNo || ""}` : `◆ 직원 가입 신청 · ${u.name || u.email || ""} — 관리자메뉴 › 회원 관리에서 승인해 주세요`;
          try { window.__sflowShowToast?.(msg, "info"); } catch { /* 무시 */ }
          try {
            if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState !== "visible") {
              new Notification(u.role === "driver" ? "기사 가입 신청" : "직원 가입 신청", { body: `${u.name || u.email || ""} — 승인해 주세요`, icon: "/icons/icon-192x192-notif.png" });
            }
          } catch { /* 무시 */ }
        });
      }
      p.forEach((u) => seen.add(u.id));
      first = false;
      setList(p);
    }, () => setList([]));
  }, [company]);
  return list;
}
