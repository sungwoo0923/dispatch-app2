// ======================= src/officeLocSync.js =======================
// 📍 2026-11-09 회사 출근지 한 곳 관리 — 원본은 회사관리 › 출근기록부의 출근지(companySettings/{회사}.officeLocation).
//  · 지입차관리·기사앱이 쓰던 예전 저장 위치(fleet_settings/co_{회사}.defaultCheckInLocation)에도 같은 값을 복사해 둔다
//    (기사앱은 그 문서를 읽고, 그 문서는 같은 회사 직원이면 누구나 쓸 수 있어 출근기록부를 고치는 사람이 함께 맞출 수 있다)
//  · 읽는 쪽은 officeToFleetLoc / pickCompanyLoc 으로 "출근기록부 값 먼저, 없으면 예전 값"을 쓴다
import { doc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// 출근기록부 형식 { lat, lng, address, radius, outRadius } → 지입차 형식 { name, lat, lng }
export const officeToFleetLoc = (o) => {
  const lat = Number(o?.lat), lng = Number(o?.lng ?? o?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (!lat && !lng)) return null;
  return { name: String(o?.address || o?.name || "회사 출근지"), lat, lng, source: "attendance" };
};
// 출근기록부 값이 있으면 그것, 없으면 예전 지입차 값
export const pickCompanyLoc = (office, legacyFleet) => officeToFleetLoc(office) || legacyFleet || null;

// 출근기록부에서 출근지를 저장한 뒤 부른다 — 지입차·기사앱 쪽 복사본을 맞춘다(실패해도 원본 저장은 그대로)
export async function mirrorOfficeToFleet(company, office) {
  const co = String(company || "").trim();
  const loc = officeToFleetLoc(office);
  if (!co || !loc) return;
  try { await setDoc(doc(db, "fleet_settings", `co_${co}`), { defaultCheckInLocation: loc, companyName: co, syncedFrom: "attendance", syncedAt: Date.now() }, { merge: true }); }
  catch (e) { console.warn("[출근지] 지입차 복사 실패:", e?.code || e?.message || e); }
}
