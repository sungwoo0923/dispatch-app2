// ======================= src/fleetDispatchWayCore.js =======================
// 🚛 2026-11-23 사용자 요청 — 지입 · 직영 · 임대(· 분양) 기사로 배차하면 배차방식을 자동으로(JY: "기사직통")
//  · 회사마다 다르게: companySettings/{회사}.fleetDispatchWay = { 지입: "기사직통", 직영: "기사직통", 임대: "", 분양: "" }
//    빈 칸(또는 설정 없음) = 그 구분은 자동으로 바꾸지 않는다 → 안 쓰는 운송사는 아무것도 달라지지 않는다
//  · 회사 마스터가 기사관리 › [지입차 배차방식]에서 정한다(쓰기 = 마스터 · 최고관리자 — firestore.rules companySettings)
//  이 파일은 화면 · DB를 모른다(테스트 가능). 화면 쪽은 src/fleetDispatchWay.jsx
import { isFleetGrade } from "./fleetGradesCore.js";

export const SETTING_KEY = "fleetDispatchWay";
const plateKey = (v) => String(v || "").replace(/[\s-]/g, "").toUpperCase();
const clean = (v) => String(v ?? "").trim();

// 설정 정리 — 지입차 구분만, 이름이 있는 것만
export function normalizeWayMap(raw) {
  const out = {};
  if (raw && typeof raw === "object") for (const [g, w] of Object.entries(raw)) if (isFleetGrade(g) && clean(w)) out[g] = clean(w);
  return out;
}
export const hasAnyWay = (map) => Object.keys(normalizeWayMap(map)).length > 0;

// 차량번호 → 지입차 구분(같은 차량번호로 기사관리 · 기사앱 문서가 따로 있어도 지입차 구분이 있는 쪽)
export function fleetGradeOfPlate(drivers, plate) {
  const k = plateKey(plate);
  if (!k || !Array.isArray(drivers)) return "";
  for (const d of drivers) if (d && plateKey(d.차량번호 || d.carNo) === k && isFleetGrade(d.등급)) return clean(d.등급);
  return "";
}

/**
 * 저장하려는 오더 값에 자동 배차방식을 넣을지 정한다.
 * @param data   저장할 값(updateDoc 의 고칠 칸 · setDoc 의 전체)
 * @param prev   지금 저장돼 있는 오더(모르면 null — 그때는 "새로 배차"로 본다)
 * @returns      넣을 배차방식 이름 · 안 넣으면 ""
 *  · 차량번호를 고치지 않는 저장 → 안 넣는다
 *  · 지입차 구분이 아니거나, 그 구분에 정한 이름이 없으면 → 안 넣는다
 *  · 이번 저장에 배차방식이 없거나 비어 있으면 → 넣는다(표에서 차량번호만 넣은 경우)
 *  · 배차방식을 같이 보내도, 차량이 "새로" 바뀐 저장이면 → 넣는다(등록 · 수정 창에서 차량을 바꾼 경우)
 *  · 같은 차량 그대로 배차방식만 바꾼 저장 → 사람이 고른 값을 둔다
 */
export function autoWayFor(data, prev, drivers, map) {
  if (!data || typeof data !== "object" || !("차량번호" in data)) return "";
  const plate = clean(data.차량번호);
  if (!plate) return "";
  const grade = fleetGradeOfPlate(drivers, plate);
  const way = grade ? normalizeWayMap(map)[grade] || "" : "";
  if (!way) return "";
  if (clean(data.배차방식) === way) return "";
  if (!("배차방식" in data) || !clean(data.배차방식)) return way;
  const newly = !prev || plateKey(prev.차량번호) !== plateKey(plate);
  return newly ? way : "";
}
