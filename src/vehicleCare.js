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

export function tonClass(ton = "", kind = "") {
  const t = String(ton);
  if (/라보|다마스/.test(kind) || /^(1|1\.4)톤/.test(t) || /^0\./.test(t)) return "small";
  if (/^(2\.5|3\.5|5)톤/.test(t)) return "mid";
  if (t) return "large";
  return "small";
}
export const CLASS_LABEL = { small: "소형 (1~1.4톤)", mid: "중형 (2.5~5톤)", large: "대형 (8톤 이상)" };

export function specFor(ton = "", kind = "") {
  const s = SPEC[ton] || null;
  if (!s) return null;
  const box = /탑|윙|냉장|냉동/.test(kind);
  return { ...s, h: box ? BOX_H(ton) : 0, euro6: true, reefer: /냉장|냉동/.test(kind) };
}

// ─── 정비 항목 — km 또는 개월 중 먼저 오는 쪽 ───
//  소형=포터·봉고(디젤 가혹조건) / 중형=마이티·메가트럭 / 대형=파비스·엑시언트(장수명 오일 기준)
export const CARE_ITEMS = [
  { key: "engineOil", label: "엔진오일·오일필터", short: "엔진오일", small: [7500, 6], mid: [15000, 6], large: [30000, 6], must: true },
  { key: "airFilter", label: "에어클리너(에어필터)", short: "에어필터", small: [15000, 12], mid: [20000, 12], large: [40000, 12] },
  { key: "fuelFilter", label: "연료필터(수분 배출 포함)", short: "연료필터", small: [30000, 24], mid: [20000, 12], large: [30000, 12] },
  { key: "transOil", label: "미션오일", short: "미션오일", small: [60000, 48], mid: [80000, 48], large: [100000, 48] },
  { key: "diffOil", label: "데후(디퍼런셜)오일", short: "데후오일", small: [60000, 48], mid: [80000, 48], large: [100000, 48] },
  { key: "brake", label: "브레이크 패드·라이닝 점검", short: "브레이크", small: [20000, 12], mid: [20000, 12], large: [30000, 12] },
  { key: "tireRotate", label: "타이어 위치교환", short: "타이어 위치", small: [10000, 0], mid: [15000, 0], large: [20000, 0] },
  { key: "tire", label: "타이어 교체", short: "타이어", small: [50000, 48], mid: [80000, 48], large: [100000, 48] },
  { key: "coolant", label: "냉각수(부동액)", short: "냉각수", small: [40000, 24], mid: [60000, 24], large: [100000, 24] },
  { key: "battery", label: "배터리", short: "배터리", small: [0, 36], mid: [0, 36], large: [0, 36] },
  { key: "grease", label: "그리스 주입(샤시)", short: "그리스", small: [0, 0], mid: [5000, 1], large: [5000, 1] },
  { key: "dpf", label: "DPF·요소수 필터 점검", short: "DPF", small: [0, 0], mid: [100000, 24], large: [100000, 24] },
  { key: "reefer", label: "냉동기 점검(오일·벨트·가스)", short: "냉동기", small: [0, 6], mid: [0, 6], large: [0, 6], reefer: true },
];
// 날짜(만기) 항목 — 며칠 남았는지로 경고
export const CARE_DATES = [
  { key: "inspection", label: "자동차 정기(종합)검사 만료", short: "정기검사", hint: "사업용 화물차는 차령 2년 초과 시 매년 검사" },
  { key: "insurance", label: "자동차보험 만기", short: "자동차보험" },
  { key: "cargoInsurance", label: "적재물배상책임보험 만기", short: "적재물보험" },
  { key: "tacho", label: "운행기록장치(타코) 점검", short: "타코 점검" },
  { key: "contract", label: "지입계약 만료", short: "지입계약" },
];

// 이 차량에 해당하는 정비 항목과 주기 (회사가 바꾼 주기 우선)
export function itemsFor(vehicle = {}, care = {}) {
  const cls = tonClass(vehicle.톤 || vehicle.ton, vehicle.적재함);
  const reefer = !!vehicle.냉동기 || /냉장|냉동/.test(vehicle.적재함 || "");
  return CARE_ITEMS.filter((it) => (!it.reefer || reefer)).map((it) => {
    const [km, months] = it[cls];
    const ov = care.intervals?.[it.key] || {};
    return { ...it, km: ov.km ?? km, months: ov.months ?? months };
  }).filter((it) => it.km || it.months);
}

const DAY = 86400000;
export const today = () => { const d = new Date(Date.now() + 9 * 3600e3); return d.toISOString().slice(0, 10); };
const addMonths = (ymd, m) => { const d = new Date(`${ymd}T00:00:00`); d.setMonth(d.getMonth() + m); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const daysTo = (ymd) => Math.round((new Date(`${ymd}T00:00:00`) - new Date(`${today()}T00:00:00`)) / DAY);

// 항목 하나의 상태 — level: 2 지남 / 1 곧(남은 10% 또는 30일) / 0 정상 / -1 기록 없음
export function itemStatus(it, care = {}) {
  const last = care.items?.[it.key] || {};
  const odo = Number(care.odometer) || 0;
  if (!last.km && !last.date) return { level: -1, text: "기록 없음" };
  let level = 0; const parts = [];
  if (it.km && last.km != null && last.km !== "" && odo) {
    const left = Number(last.km) + it.km - odo;
    parts.push(left < 0 ? `${Math.abs(left).toLocaleString()}km 초과` : `${left.toLocaleString()}km 남음`);
    if (left < 0) level = 2; else if (left <= it.km * 0.1) level = Math.max(level, 1);
  }
  if (it.months && last.date) {
    const due = addMonths(last.date, it.months); const d = daysTo(due);
    parts.push(d < 0 ? `${due} 지남` : `${due}까지`);
    if (d < 0) level = 2; else if (d <= 30) level = Math.max(level, 1);
  }
  return { level, text: parts.join(" · ") || "확인 필요" };
}
export function dateStatus(ymd) {
  if (!ymd) return { level: -1, text: "미입력" };
  const d = daysTo(ymd);
  if (d < 0) return { level: 2, text: `${-d}일 지남` };
  if (d <= 30) return { level: 1, text: `D-${d}` };
  return { level: 0, text: `D-${d}` };
}
// 차량 요약 — 목록·홈 경고용 (가장 급한 항목들)
export function careSummary(drv = {}) {
  const vehicle = drv.vehicle || {}; const care = drv.care || {};
  const list = [
    ...itemsFor(vehicle, care).map((it) => ({ key: it.key, label: it.short, ...itemStatus(it, care) })),
    ...CARE_DATES.map((d) => ({ key: d.key, label: d.short, ...dateStatus(care.dates?.[d.key]) })),
  ];
  const alerts = list.filter((x) => x.level >= 1).sort((a, b) => b.level - a.level);
  return { alerts, over: alerts.filter((x) => x.level === 2).length, soon: alerts.filter((x) => x.level === 1).length, missing: list.filter((x) => x.level === -1).length, odometer: Number(care.odometer) || 0, odometerAt: care.odometerAt || "", setupDone: !!care.setupDone };
}
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
