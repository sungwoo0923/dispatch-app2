// ======================= src/vehicleCare.js =======================
// 🚚 지입차 차량관리(2026-10-30) — 기사앱·PC 지입차관리·모바일이 함께 쓰는 차량 제원/정비 기준.
//  저장 위치: drivers/{기사ID} 문서 (기사 본인 + 운송사 직원 모두 수정 가능 — 기존 규칙 그대로)
//   · vehicle  : 차량 제원 { 제조사, 모델, 연식, 연료, 변속기, 적재함, 톤, 적재함길이/폭/높이(cm), 최대적재(kg), 냉동기, 요소수, 축 }
//   · care     : { odometer, odometerAt, items: { 키: { km, date } }, dates: { 키: "YYYY-MM-DD" }, intervals: { 키: { km, months } }, setupDone }
//   · careLogs : 정비·주행 기록 [{ at, date, km, kind, item, cost, memo, by }] (최근 200건)
//  정비 주기는 "화물 사업용 = 제조사 매뉴얼의 가혹조건(짧은 반복 주행·적재·공회전)" 기준으로 잡은 기본값이다.
//  차량마다 다를 수 있어 회사가 차량별로 주기를 바꿀 수 있다(intervals).

export const VEHICLE_KINDS = ["카고", "윙바디", "탑차", "냉장/냉동탑", "냉장/냉동윙", "라보/다마스", "리프트", "추레라", "기타"];
export const TONS = [
  "1톤", "1톤 장축", "1.4톤", "1.4톤 장축", "2.5톤", "3.5톤", "3.5톤 장축", "3.5톤 와이드",
  "5톤", "5톤 플러스", "5톤 축", "8톤", "8톤 특장", "9.5톤", "11톤", "11톤 장축", "11톤 후축",
  "14톤", "14톤 후축", "18톤", "22톤", "25톤", "추레라",
];
export const FUELS = ["경유", "LPG", "전기", "휘발유", "수소"];
export const GEARS = ["수동", "자동", "AMT(반자동)"];

// 톤급별 표준 제원 — PC 차량제원표(CARGO_VEHICLE_SPEC_TABLE)와 같은 값(적재함 내측 cm, 최대 적재 kg)
//  + 대표 차종·축 구성·타이어 수·요소수(유로6 디젤) 여부
const SPEC = {
  "1톤": { l: 278, w: 160, h: 0, maxKg: 1100, models: ["현대 포터2", "기아 봉고3"], axle: "2축", tires: 6 },
  "1톤 장축": { l: 305, w: 160, maxKg: 1150, models: ["포터2 초장축", "봉고3 장축"], axle: "2축", tires: 6 },
  "1.4톤": { l: 300, w: 165, maxKg: 1550, models: ["봉고3 1.4톤"], axle: "2축", tires: 6 },
  "1.4톤 장축": { l: 340, w: 170, maxKg: 1600, models: ["봉고3 1.4톤 장축"], axle: "2축", tires: 6 },
  "2.5톤": { l: 425, w: 180, maxKg: 2750, models: ["현대 마이티 2.5톤", "이스즈 엘프"], axle: "2축", tires: 6 },
  "3.5톤": { l: 470, w: 205, maxKg: 3850, models: ["현대 마이티 3.5톤"], axle: "2축", tires: 6 },
  "3.5톤 장축": { l: 525, w: 218, maxKg: 4000, models: ["마이티 3.5톤 장축"], axle: "2축", tires: 6 },
  "3.5톤 와이드": { l: 570, w: 230, maxKg: 4000, models: ["마이티 와이드"], axle: "2축", tires: 6 },
  "5톤": { l: 625, w: 223, maxKg: 5500, models: ["현대 메가트럭 5톤", "타타대우 구쎈"], axle: "2축", tires: 6 },
  "5톤 플러스": { l: 700, w: 230, maxKg: 5800, models: ["메가트럭 와이드캡 플러스"], axle: "2축", tires: 6 },
  "5톤 축": { l: 790, w: 235, maxKg: 7500, models: ["메가트럭 가변축"], axle: "3축(가변)", tires: 8 },
  "8톤": { l: 765, w: 235, maxKg: 8800, models: ["현대 파비스", "메가트럭 8톤"], axle: "2축", tires: 6 },
  "8톤 특장": { l: 850, w: 240, maxKg: 9200, models: ["파비스 특장"], axle: "2~3축", tires: 8 },
  "9.5톤": { l: 875, w: 238, maxKg: 10500, models: ["파비스 9.5톤", "엑시언트"], axle: "3축", tires: 10 },
  "11톤": { l: 900, w: 235, maxKg: 12000, models: ["엑시언트 11.5톤", "볼보 FM", "타타대우 맥쎈"], axle: "3축", tires: 10 },
  "11톤 장축": { l: 960, w: 240, maxKg: 12700, models: ["엑시언트 장축"], axle: "3축", tires: 10 },
  "11톤 후축": { l: 1020, w: 240, maxKg: 14500, models: ["엑시언트 후축"], axle: "3축(후축)", tires: 10 },
  "14톤": { l: 900, w: 235, maxKg: 15400, models: ["엑시언트 14톤"], axle: "3축", tires: 10 },
  "14톤 후축": { l: 990, w: 240, maxKg: 18200, models: ["엑시언트 후축"], axle: "4축", tires: 12 },
  "18톤": { l: 1010, w: 240, maxKg: 19800, models: ["엑시언트 18톤", "볼보 FH"], axle: "4축", tires: 12 },
  "22톤": { l: 1010, w: 240, maxKg: 24200, models: ["엑시언트 22톤"], axle: "4축", tires: 14 },
  "25톤": { l: 1010, w: 240, maxKg: 27500, models: ["엑시언트 25톤", "스카니아 R"], axle: "5축", tires: 14 },
  "추레라": { l: 1200, w: 240, maxKg: 27500, models: ["트랙터 + 트레일러"], axle: "트랙터 3축 + 트레일러 3축", tires: 22 },
};
// 탑차·윙바디 적재함 내측 높이 기본값(cm) — 톤급마다 대략값
const BOX_H = (ton) => (/^1(\.4)?톤/.test(ton) ? 170 : /^(2\.5|3\.5)톤/.test(ton) ? 210 : /^5톤/.test(ton) ? 235 : 245);

export const CLASS_LABEL = { small: "소형 (1~1.4톤)", mid: "중형 (2.5~5톤)", large: "대형 (8톤 이상)" };

export function specFor(ton = "", kind = "") {
  const s = SPEC[ton] || null;
  if (!s) return null;
  const box = /탑|윙|냉장|냉동/.test(kind);
  return { ...s, h: box ? BOX_H(ton) : 0, euro6: true, reefer: /냉장|냉동/.test(kind) };
}

// ─── 정비 항목·주기·상태 — ⭐ 2026-11-09 서버(정비 예정 알림)와 같이 쓰려고 functions/fleetCareCore.mjs로 옮겼다(이름 그대로 다시 내보냄)
//  소모품 추가: 브레이크오일 · 벨트 · 와이퍼 · 회사별 주기(vehicleCareSettings/{회사}.intervals)
import { tonClass, CARE_ITEMS, CARE_DATES, itemsFor, itemStatus, dateStatus, careSummary, kstToday } from "../functions/fleetCareCore.mjs";
export { tonClass, CARE_ITEMS, CARE_DATES, itemsFor, itemStatus, dateStatus, careSummary };
export const today = kstToday;

// 기사 문서의 톤·적재함(가입 때 고른 값) → 제원 기본값
export function vehicleDefaults(drv = {}) {
  const ton = drv.vehicle?.톤 || drv.차량톤수 || drv.톤수 || "";
  const kind = drv.vehicle?.적재함 || drv.차량종류 || "";
  const s = specFor(ton, kind) || {};
  return {
    제조사: "", 모델: s.models?.[0] || "", 연식: "", 연료: "경유", 변속기: "수동", 적재함: kind, 톤: ton,
    길이: s.l || "", 폭: s.w || "", 높이: s.h || "", 최대적재: s.maxKg || "", 축: s.axle || "", 타이어: s.tires || "",
    냉동기: /냉장|냉동/.test(kind), 요소수: true,
    ...(drv.vehicle || {}),
  };
}


// 🚚 국내 화물차 모델 목록 — 모델명 검색·선택(직접 입력도 가능). [제조사, 모델, 톤급 힌트]
export const TRUCK_MODELS = [
  ["현대", "포터2", "1톤"], ["현대", "포터2 일렉트릭", "1톤"], ["현대", "포터2 슈퍼캡", "1톤"], ["현대", "포터2 더블캡", "1톤"],
  ["기아", "봉고3", "1톤"], ["기아", "봉고3 EV", "1톤"], ["기아", "봉고3 1.2톤", "1.2톤"], ["기아", "봉고3 1.4톤", "1.4톤"],
  ["현대", "스타리아 카고", "1톤"], ["르노", "마스터 밴", "1톤"], ["쉐보레", "다마스", "0.5톤"], ["쉐보레", "라보", "0.5톤"],
  ["현대", "마이티", "2.5톤"], ["현대", "마이티 QT", "3.5톤"], ["현대", "마이티 3.5톤 광폭", "3.5톤"], ["현대", "e-마이티", "2.5톤"],
  ["타타대우", "구쎈", "2.5톤"], ["타타대우", "더쎈", "3.5톤"], ["이스즈", "엘프", "3.5톤"], ["기아", "카운티 화물", "2.5톤"],
  ["현대", "메가트럭", "5톤"], ["현대", "메가트럭 와이드캡", "5톤"], ["현대", "메가트럭 5톤 플러스", "5톤"], ["현대", "파비스", "5톤"],
  ["타타대우", "맥쎈", "5톤"], ["타타대우", "노부스", "8톤"], ["타타대우", "프리마", "11톤"], ["타타대우", "맥쎈 8톤", "8톤"],
  ["현대", "뉴파워트럭", "11톤"], ["현대", "엑시언트", "11톤"], ["현대", "엑시언트 25톤", "25톤"], ["현대", "엑시언트 수소전기", "11톤"],
  ["볼보", "FH", "25톤"], ["볼보", "FH16", "25톤"], ["볼보", "FM", "11톤"], ["볼보", "FMX", "25톤"],
  ["스카니아", "R 시리즈", "25톤"], ["스카니아", "S 시리즈", "25톤"], ["스카니아", "G 시리즈", "11톤"], ["스카니아", "P 시리즈", "11톤"],
  ["벤츠", "악트로스", "25톤"], ["벤츠", "아록스", "25톤"], ["만(MAN)", "TGX", "25톤"], ["만(MAN)", "TGS", "11톤"],
  ["이베코", "S-WAY", "25톤"], ["이베코", "스트랄리스", "25톤"], ["다프(DAF)", "XF", "25톤"],
];
export function searchTruckModels(q, ton = "", maker = "") {
  const k = String(q || "").replace(/\s+/g, "").toLowerCase();
  const tonN = parseFloat(String(ton).replace(/[^\d.]/g, "")) || 0;
  const near = (h) => { const n = parseFloat(h) || 0; return tonN ? Math.abs(n - tonN) : 0; };
  const tonKey = String(ton || "").replace(/\s/g, "");
  let base = TRUCK_MODELS.filter(([mk]) => !maker || maker === "기타" || mk === maker);
  // 톤수가 정해져 있으면 그 톤수 모델만(그 톤수 모델이 하나도 없을 때만 전체)
  if (tonKey && base.some((m) => m[2] === tonKey)) base = base.filter((m) => m[2] === tonKey);
  return base
    .filter(([mk, md]) => !k || `${mk}${md}`.replace(/\s+/g, "").toLowerCase().includes(k))
    .sort((a, b) => near(a[2]) - near(b[2]))
    .slice(0, 12)
    .map(([maker, model, hint]) => ({ maker, model, hint }));
}
