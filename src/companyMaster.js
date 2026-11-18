// ======================= src/companyMaster.js =======================
// 👑 2026-11-18 운송사 마스터는 1명 — 최고관리자가 가입 심사 · 회원관리에서 마스터를 또 지정하지 못하게 확인한다(사용자 요청)
//  예전엔 같은 운송사 신청서 두 개를 모두 "신규"로 승인하거나 [마스터 계정]을 둘 다 체크하면 마스터가 2명이 됐다.
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";

// 그 운송사에 이미 있는 마스터(나 말고) — 없으면 null
export async function findOtherMaster(companyName, exceptUid = "") {
  const co = String(companyName || "").trim();
  if (!co) return null;
  try {
    const snap = await getDocs(query(collection(db, "users"), where("companyName", "==", co), where("isMaster", "==", true)));
    const d = snap.docs.find((x) => x.id !== exceptUid && x.data()?.role !== "shipper" && x.data()?.employmentStatus !== "퇴사");
    return d ? { id: d.id, ...d.data() } : null;
  } catch {
    return null; // 읽기 실패면 막지 않는다(승인 자체는 되게)
  }
}

export const masterLabel = (u) => (u ? `${u.name || u.displayName || ""}${u.email ? ` (${u.email})` : ""}`.trim() || "다른 직원" : "");
