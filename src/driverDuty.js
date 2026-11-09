// ======================= src/driverDuty.js =======================
// 🚚 2026-11-09 관제(PC 지입차관리)에서 쓰는 기사 근무 도우미 — 계산은 functions/driverDutyCore.mjs(기사앱·서버와 같은 기준)
//  · missedInfo(raw): "퇴근 미처리" 표시 여부·문구
//  · forceCheckout(raw, by): 운송사가 대신 퇴근 처리(마지막 이동 시각 기준 · 오늘 이동거리 키로수 누적 · 기록 남김)
import { addDoc, collection, deleteField, doc, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { accumulateOdometer, isOnDuty, liveOdometer, missedCheckoutPlan, kstYmd } from "../functions/driverDutyCore.mjs";

export { liveOdometer, isOnDuty };

const ms = (t) => (t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : typeof t === "number" ? t : 0);
const hm = (m) => new Date(m + 9 * 3600e3).toISOString().slice(11, 16);

// { show, text, title } — 서버가 남긴 퇴근미처리 표시 또는 지금 계산(서버 배포 전에도 보이게)
export function missedInfo(raw = {}) {
  if (!isOnDuty(raw)) return { show: false };
  const last = ms(raw.lastMovedAt) || ms(raw.updatedAt);
  const plan = missedCheckoutPlan(raw, Date.now(), last);
  const flagged = raw.퇴근미처리?.date && raw.퇴근미처리.date === (raw.workDate || kstYmd(Date.now()));
  if (!flagged && plan.stage !== "flag" && plan.stage !== "auto") return { show: false };
  return {
    show: true,
    text: plan.stage === "auto" ? "퇴근 미처리 · 날짜 지남" : "퇴근 미처리",
    title: `퇴근시간(${raw.퇴근시간 || "19:00"})이 지났는데 퇴근 기록이 없어요${last ? ` · 마지막 이동 ${hm(last)}` : ""} — [대신 퇴근]으로 처리할 수 있어요`,
  };
}

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
    자동퇴근: { date, at, by: by || "staff" }, 퇴근미처리: deleteField(), updatedAt: serverTimestamp(),
    ...(acc ? { [`odoAccum.${acc.day}`]: acc.record, ...(acc.add > 0 ? { "care.odometer": acc.odometer, "care.odometerAt": date } : {}) } : {}),
  });
  await addDoc(collection(db, "driver_logs"), {
    uid: id, driverName: raw.name || raw.이름 || "", carNo: raw.carNo || raw.차량번호 || "", companyName: raw.companyName || "",
    status: "최종퇴근", mainStatus: "퇴근", auto: true, autoReason: `운송사 대신 퇴근${by ? `(${by})` : ""}`,
    timestamp: Timestamp.fromMillis(at), finalDistance: dist, location: null,
  });
  return { at, acc };
}
