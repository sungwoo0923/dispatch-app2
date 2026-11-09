// ======================= src/driverDuty.js =======================
// 🚚 2026-11-09 관제(PC 지입차관리)에서 쓰는 기사 근무 도우미 — 계산은 functions/driverDutyCore.mjs(기사앱·서버와 같은 기준)
//  · isOnDuty(raw): 출근 후 아직 퇴근 안 함(관제 [퇴근처리] 버튼을 보일지)
//  · forceCheckout(raw, by): 운송사 [퇴근처리] — 기사 대신 최종퇴근(마지막 이동 시각 기준 · 오늘 이동거리 키로수 누적 · 기록 남김)
import { addDoc, collection, deleteField, doc, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { accumulateOdometer, isOnDuty, liveOdometer, kstYmd } from "../functions/driverDutyCore.mjs";

export { liveOdometer, isOnDuty };

const ms = (t) => (t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : typeof t === "number" ? t : 0);

export async function forceCheckout(raw = {}, by = "") {
  const id = raw.id || raw.uid;
  if (!id) throw new Error("기사 정보가 없어요");
  const last = ms(raw.lastMovedAt) || ms(raw.updatedAt);
  const now = Date.now();
  const at = last && now - last < 12 * 3600e3 ? last : now; // 마지막 이동이 너무 오래전이면 지금 시각
  const date = String(raw.workDate || "").slice(0, 10) || kstYmd(at);
  const dist = Number(raw.totalDistance) || 0;
  const acc = accumulateOdometer({ odometer: raw.care?.odometer, odoAccum: raw.odoAccum }, date, dist);
  await updateDoc(doc(db, "drivers", id), {
    status: "퇴근", mainStatus: "퇴근", active: false, isFinalCheckout: true, totalDistance: 0, workDate: date,
    퇴근처리: { date, at, by: by || "staff" }, 퇴근미처리: deleteField(), updatedAt: serverTimestamp(),
    ...(acc ? { [`odoAccum.${acc.day}`]: acc.record, ...(acc.add > 0 ? { "care.odometer": acc.odometer, "care.odometerAt": date } : {}) } : {}),
  });
  await addDoc(collection(db, "driver_logs"), {
    uid: id, driverName: raw.name || raw.이름 || "", carNo: raw.carNo || raw.차량번호 || "", companyName: raw.companyName || "",
    status: "최종퇴근", mainStatus: "퇴근", auto: true, autoReason: `운송사 퇴근처리${by ? `(${by})` : ""}`,
    timestamp: Timestamp.fromMillis(at), finalDistance: dist, location: null,
  });
  return { at, acc };
}
