// ======================= functions/fleetCareCore.mjs =======================
// 🚚 2026-11-09 차량관리 자동화 — 화면(src/vehicleCare.js · src/VehicleLedger.jsx)과 서버(functions/index.js)가 같이 쓰는 순수 계산.
//  ① 정비·소모품 주기(CARE_ITEMS) · 상태(itemStatus) — 주기 우선순위: 차량별(care.intervals) > 회사별(vehicleCareSettings) > 기본값
//  ② 정비 예정 알림 계획(carePushPlan) — 남은 500km 이하 · D-7 · D-1 · 당일 · 지남(7일마다) 단계가 바뀔 때만 알림(같은 단계는 한 번)
//  ③ 정비 이력 → 마지막 교체 자동 반영(repairCareKeys · careItemsFromRepairs)
//  ④ 월 차량별 비용 리포트(monthlyCostReport) · ⑤ 하이패스·유류카드 내역 읽기(parseCardSheet) · 대조(reconcileCards)
//  ⚠ 다른 파일을 가져오지 않는다(서버·화면·node 테스트 모두 그대로 읽음).

// ─── 날짜 ───
const DAY = 86400000;
export const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
export const addMonths = (ymd, m) => { const d = new Date(`${ymd}T00:00:00`); d.setMonth(d.getMonth() + m); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const daysBetween = (from, to) => Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / DAY);
const n = (v) => { const x = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(x) ? x : 0; };
// ⭐ 2026-11-09 실제 데이터 모양 방어 — 날짜가 Firestore Timestamp({seconds}·toDate)·숫자(ms·엑셀 일련번호)·Date·"2026.11.09"·빈 값이어도
//  항상 "YYYY-MM-DD" 또는 ""(못 읽으면)로. 화면에 객체가 그대로 그려지거나 NaN 날짜가 나오지 않게.
const pad2 = (x) => String(x).padStart(2, "0");
export function toYmd(v) {
  if (v == null || v === "" || v === false) return "";
  let d = null;
  if (typeof v === "object") {
    if (v instanceof Date) d = v;
    else if (typeof v.toDate === "function") { try { d = v.toDate(); } catch { d = null; } }
    else if (Number.isFinite(Number(v.seconds ?? v._seconds))) d = new Date(Number(v.seconds ?? v._seconds) * 1000);
    if (!(d instanceof Date)) return "";
  } else if (typeof v === "number") {
    if (v > 20000 && v < 80000) d = new Date(Math.round((v - 25569) * DAY)); // 엑셀 날짜
    else if (v > 1e11) d = new Date(v); // ms
    else if (v > 1e9) d = new Date(v * 1000); // 초
    else return "";
  }
  if (d) { if (Number.isNaN(+d)) return ""; return new Date(+d + 9 * 3600e3).toISOString().slice(0, 10); }
  const s = String(v).trim();
  const m = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/.exec(s) || /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (!m) return "";
  const mo = Number(m[2]), da = Number(m[3]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return "";
  return `${m[1]}-${pad2(mo)}-${pad2(da)}`;
}
// 배열이어야 하는 값(정비 이력 등)이 객체·문자열·undefined로 와도 안전하게
const isObj = (x) => !!x && typeof x === "object";
export const arr = (v) => (Array.isArray(v) ? (v.every(isObj) ? v : v.filter(isObj)) : isObj(v) && !(v instanceof Date) && typeof v.toDate !== "function" ? Object.values(v).filter(isObj) : []);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
// 숫자 칸("120,000"·"12만"이 아닌 일반 숫자 문자열) → 숫자, 비면 ""(값 없음 유지)
const numOrEmpty = (v) => (v == null || String(v).trim() === "" ? "" : n(v));
// 기사 문서 care를 화면이 쓰기 좋은 모양으로 — odometer 숫자, 날짜 칸 "YYYY-MM-DD", items·dates·intervals 객체(저장할 때는 쓰지 않는다)
export function normCare(care) {
  const c = obj(care);
  const items = Object.fromEntries(Object.entries(obj(c.items)).map(([k, x]) => { const o = obj(x); return [k, { ...o, km: numOrEmpty(o.km), date: toYmd(o.date) }]; }));
  const dates = Object.fromEntries(Object.entries(obj(c.dates)).map(([k, x]) => [k, toYmd(x)]));
  return { ...c, odometer: n(c.odometer), odometerAt: toYmd(c.odometerAt) || (typeof c.odometerAt === "string" ? c.odometerAt : ""), items, dates, intervals: obj(c.intervals), setupDone: !!c.setupDone };
}
// 정비·주행 기록(careLogs) — 배열이 아니어도 · 날짜는 글자로 · 최신순
export function normCareLogs(logs) {
  const at = (x) => (typeof x === "number" ? x : Number(x?.seconds ?? x?._seconds) * 1000 || Date.parse(toYmd(x)) || 0);
  return arr(logs).map((l) => ({ ...l, at: at(l.at), date: toYmd(l.date) || toYmd(l.at), km: numOrEmpty(l.km), cost: n(l.cost), liters: numOrEmpty(l.liters) })).sort((a, b) => b.at - a.at);
}
const normPlate = (s) => String(s ?? "").replace(/[^0-9가-힣A-Za-z]/g, "");
const plateCore = (s) => normPlate(s).replace(/^[가-힣]+(?=\d)/, "");

// ─── 톤급 ───
export function tonClass(ton = "", kind = "") {
  const t = String(ton);
  if (/라보|다마스/.test(kind) || /^(1|1\.4)톤/.test(t) || /^0\./.test(t)) return "small";
  if (/^(2\.5|3\.5|5)톤/.test(t)) return "mid";
  if (t) return "large";
  return "small";
}

// ─── 정비·소모품 항목 — [km, 개월] 중 먼저 오는 쪽(0 = 그 기준 없음) ───
//  소형=포터·봉고(디젤 가혹조건) / 중형=마이티·메가트럭 / 대형=파비스·엑시언트(장수명 오일 기준)
//  ⭐ 2026-11-09 소모품 추가: 브레이크오일 · 벨트 · 와이퍼 (그룹 consumable = 소모품)
export const CARE_ITEMS = [
  { key: "engineOil", label: "엔진오일·오일필터", short: "엔진오일", small: [7500, 6], mid: [15000, 6], large: [30000, 6], must: true, consumable: true },
  { key: "airFilter", label: "에어클리너(에어필터)", short: "에어필터", small: [15000, 12], mid: [20000, 12], large: [40000, 12], consumable: true },
  { key: "fuelFilter", label: "연료필터(수분 배출 포함)", short: "연료필터", small: [30000, 24], mid: [20000, 12], large: [30000, 12], consumable: true },
  { key: "transOil", label: "미션오일", short: "미션오일", small: [60000, 48], mid: [80000, 48], large: [100000, 48], consumable: true },
  { key: "diffOil", label: "데후(디퍼런셜)오일", short: "데후오일", small: [60000, 48], mid: [80000, 48], large: [100000, 48], consumable: true },
  { key: "brake", label: "브레이크 패드·라이닝", short: "브레이크패드", small: [20000, 12], mid: [20000, 12], large: [30000, 12], consumable: true },
  { key: "brakeFluid", label: "브레이크오일(액)", short: "브레이크오일", small: [40000, 24], mid: [40000, 24], large: [60000, 24], consumable: true },
  { key: "tireRotate", label: "타이어 위치교환", short: "타이어 위치", small: [10000, 0], mid: [15000, 0], large: [20000, 0] },
  { key: "tire", label: "타이어 교체", short: "타이어", small: [50000, 48], mid: [80000, 48], large: [100000, 48], consumable: true },
  { key: "coolant", label: "냉각수(부동액)", short: "냉각수", small: [40000, 24], mid: [60000, 24], large: [100000, 24], consumable: true },
  { key: "battery", label: "배터리", short: "배터리", small: [0, 36], mid: [0, 36], large: [0, 36], consumable: true },
  { key: "belt", label: "벨트(팬·발전기·에어컨)", short: "벨트", small: [60000, 36], mid: [80000, 36], large: [100000, 36], consumable: true },
  { key: "wiper", label: "와이퍼", short: "와이퍼", small: [0, 12], mid: [0, 12], large: [0, 12], consumable: true },
  { key: "grease", label: "그리스 주입(샤시)", short: "그리스", small: [0, 0], mid: [5000, 1], large: [5000, 1] },
  { key: "dpf", label: "DPF·요소수 필터 점검", short: "DPF", small: [0, 0], mid: [100000, 24], large: [100000, 24] },
  { key: "reefer", label: "냉동기 점검(오일·벨트·가스)", short: "냉동기", small: [0, 6], mid: [0, 6], large: [0, 6], reefer: true },
];
export const CARE_DATES = [
  { key: "inspection", label: "자동차 정기(종합)검사 만료", short: "정기검사", hint: "사업용 화물차는 차령 2년 초과 시 매년 검사" },
  { key: "insurance", label: "자동차보험 만기", short: "자동차보험" },
  { key: "cargoInsurance", label: "적재물배상책임보험 만기", short: "적재물보험" },
  { key: "tacho", label: "운행기록장치(타코) 점검", short: "타코 점검" },
  { key: "contract", label: "지입계약 만료", short: "지입계약" },
];
// 차량관리대장(vehicleLedger) 기본정보의 만기일 칸
export const LEDGER_DUES = [["보험만기", "보험"], ["검사만기", "정기검사"], ["할부만기", "할부·리스"]];

// 이 차량에 해당하는 항목과 주기 — 차량별(care.intervals) > 회사별(coIntervals) > 기본값
export function itemsFor(vehicle = {}, care = {}, coIntervals = {}) {
  vehicle = obj(vehicle);
  const cls = tonClass(vehicle.톤 || vehicle.ton, vehicle.적재함);
  const reefer = !!vehicle.냉동기 || /냉장|냉동/.test(String(vehicle.적재함 || ""));
  return CARE_ITEMS.filter((it) => (!it.reefer || reefer)).map((it) => {
    const [km, months] = it[cls];
    const co = obj(obj(coIntervals)[it.key]);
    const ov = obj(obj(obj(care).intervals)[it.key]);
    const pick = (a, b, c) => (a != null && a !== "" ? n(a) : b != null && b !== "" ? n(b) : c);
    return { ...it, km: pick(ov.km, co.km, km), months: pick(ov.months, co.months, months), defKm: km, defMonths: months };
  }).filter((it) => it.km || it.months);
}

// 항목 하나의 상태 — level: 2 지남 / 1 곧(남은 10%·500km 이하 또는 30일) / 0 정상 / -1 기록 없음
//  + nextKm(다음 교체 km) · leftKm · dueDate · daysLeft (알림·표시용)
export function itemStatus(it, care = {}, today = kstToday()) {
  const raw = obj(obj(obj(care).items)[it.key]);
  const last = { km: numOrEmpty(raw.km), date: toYmd(raw.date) };
  const odo = n(obj(care).odometer);
  if (!last.km && !last.date) return { level: -1, text: "기록 없음" };
  let level = 0; const parts = []; const out = {};
  if (it.km && last.km != null && last.km !== "" && odo) {
    out.nextKm = Number(last.km) + it.km;
    const left = out.nextKm - odo; out.leftKm = left;
    parts.push(left < 0 ? `${Math.abs(left).toLocaleString()}km 초과` : `${left.toLocaleString()}km 남음`);
    if (left < 0) level = 2; else if (left <= Math.max(500, it.km * 0.1)) level = Math.max(level, 1);
  } else if (it.km && last.km != null && last.km !== "") out.nextKm = Number(last.km) + it.km;
  if (it.months && last.date) {
    const due = addMonths(last.date, it.months); const d = daysBetween(today, due);
    out.dueDate = due; out.daysLeft = d;
    parts.push(d < 0 ? `${due} 지남` : `${due}까지`);
    if (d < 0) level = 2; else if (d <= 30) level = Math.max(level, 1);
  }
  return { level, text: parts.join(" · ") || "확인 필요", ...out };
}
export function dateStatus(ymd, today = kstToday()) {
  ymd = toYmd(ymd);
  if (!ymd) return { level: -1, text: "미입력" };
  const d = daysBetween(today, ymd);
  if (d < 0) return { level: 2, text: `${-d}일 지남`, daysLeft: d, dueDate: ymd };
  if (d <= 30) return { level: 1, text: `D-${d}`, daysLeft: d, dueDate: ymd };
  return { level: 0, text: `D-${d}`, daysLeft: d, dueDate: ymd };
}
export const STATUS_LABEL = { 2: "초과", 1: "임박", 0: "정상", [-1]: "기록 없음" };

// 차량 요약 — 목록·홈 경고용 (가장 급한 항목들)
export function careSummary(drv = {}, coIntervals = {}, today = kstToday()) {
  const vehicle = obj(drv?.vehicle); const care = obj(drv?.care);
  const list = [
    ...itemsFor(vehicle, care, coIntervals).map((it) => ({ key: it.key, label: it.short, ...itemStatus(it, care, today) })),
    ...CARE_DATES.map((d) => ({ key: d.key, label: d.short, ...dateStatus(obj(care.dates)[d.key], today) })),
  ];
  const alerts = list.filter((x) => x.level >= 1).sort((a, b) => b.level - a.level);
  return { list, alerts, over: alerts.filter((x) => x.level === 2).length, soon: alerts.filter((x) => x.level === 1).length, missing: list.filter((x) => x.level === -1).length, odometer: n(care.odometer), odometerAt: toYmd(care.odometerAt) || (typeof care.odometerAt === "string" ? care.odometerAt : ""), setupDone: !!care.setupDone };
}

// 소모품 표(차량 상세) — 주기·마지막 교체·다음 예정·상태
export function consumableRows(vehicle = {}, care = {}, coIntervals = {}, today = kstToday()) {
  return itemsFor(vehicle, care, coIntervals).map((it) => {
    const last = obj(obj(obj(care).items)[it.key]);
    const st = itemStatus(it, care, today);
    return {
      key: it.key, label: it.label, short: it.short, consumable: !!it.consumable,
      km: it.km, months: it.months, lastKm: numOrEmpty(last.km), lastDate: toYmd(last.date),
      nextKm: st.nextKm ?? "", nextDate: st.dueDate || "", leftKm: st.leftKm, daysLeft: st.daysLeft,
      level: st.level, status: STATUS_LABEL[st.level], text: st.text,
    };
  });
}

// ─── 정비 이력 → 정비 항목(마지막 교체 자동) ───
//  정비 구분·내용 글자로 항목을 찾는다(여러 개 가능: "엔진오일·에어필터 교환")
const REPAIR_MAP = [
  [/엔진\s*오일|오일\s*필터|(?<!(미션|브레이크|데후|변속기|디퍼런셜)\s*)오일\s*교환/, "engineOil"], [/에어\s*(필터|클리너)/, "airFilter"], [/연료\s*필터/, "fuelFilter"],
  [/미션\s*오일|변속기\s*오일/, "transOil"], [/데후|디퍼런셜|차동/, "diffOil"], [/브레이크\s*(오일|액)/, "brakeFluid"],
  [/브레이크(?!\s*(오일|액))|패드|라이닝/, "brake"], [/타이어\s*(위치|로테이션)/, "tireRotate"], [/타이어(?!\s*(위치|로테이션))/, "tire"],
  [/냉각수|부동액/, "coolant"], [/배터리|밧데리/, "battery"], [/벨트/, "belt"], [/와이퍼/, "wiper"], [/그리스|구리스/, "grease"],
  [/DPF|요소수/i, "dpf"], [/냉동기/, "reefer"],
];
export function repairCareKeys(row = {}) {
  // 직접 고른 항목(정비항목) > 정비 내용 글자 > 구분 글자 순서 — 구분이 "브레이크"여도 내용이 "브레이크오일 교환"이면 브레이크오일
  const keys = new Set(Array.isArray(row.정비항목) ? row.정비항목.filter((k) => CARE_ITEMS.some((c) => c.key === k)) : []);
  const scan = (s) => { REPAIR_MAP.forEach(([re, k]) => { if (re.test(String(s || ""))) keys.add(k); }); };
  if (!keys.size) scan(row.내용);
  if (!keys.size) scan(row.구분);
  return [...keys];
}
// 정비 이력 목록에서 항목별 가장 최근 교체(날짜·km) — 기존 기록보다 새로울 때만 덮어쓸 값
export function careItemsFromRepairs(repairs = [], current = {}) {
  const out = {}; current = obj(current);
  arr(repairs).map((r) => ({ r, d: toYmd(r.일자) })).sort((a, b) => a.d.localeCompare(b.d)).forEach(({ r, d: date }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    repairCareKeys(r).forEach((k) => {
      const cur = out[k] || obj(current[k]);
      if (cur.date && toYmd(cur.date) > date) return;
      out[k] = { date, km: n(r.주행거리) || cur.km || "", from: "ledger" };
    });
  });
  // 실제로 바뀐 것만
  Object.keys(out).forEach((k) => { const c = current[k] || {}; if (toYmd(c.date) === out[k].date && String(c.km ?? "") === String(out[k].km ?? "")) delete out[k]; });
  return out;
}

// ─── 정비 예정 알림 계획 ───
//  단계: km500(남은 500km 이하) · d7 · d1 · d0(오늘) · over(지남 — 7일마다 다시) — 같은 항목·같은 단계는 한 번만 알린다
export function stageOf(x) {
  if (x.daysLeft != null) {
    if (x.daysLeft < 0) return `over${Math.floor(-x.daysLeft / 7)}`;
    if (x.daysLeft === 0) return "d0";
    if (x.daysLeft === 1) return "d1";
    if (x.daysLeft <= 7) return "d7";
  }
  if (x.leftKm != null) {
    if (x.leftKm < 0) return "kmover";
    if (x.leftKm <= 500) return "km500";
  }
  return "";
}
// drv: drivers 문서 · ledger: vehicleLedger 문서(같은 차량, 없으면 null) · state: drivers.careNotified { key: stage }
export function carePushPlan(drv = {}, ledger = null, coIntervals = {}, today = kstToday()) {
  const state = obj(drv?.careNotified);
  const care = obj(drv?.care);
  const items = [];
  itemsFor(obj(drv?.vehicle), care, coIntervals).forEach((it) => {
    const st = itemStatus(it, care, today);
    if (st.level === -1) return;
    items.push({ key: it.key, label: it.short, daysLeft: st.daysLeft, leftKm: st.leftKm, dueDate: st.dueDate, nextKm: st.nextKm });
  });
  CARE_DATES.forEach((d) => { const ymd = toYmd(obj(care.dates)[d.key]); if (ymd) items.push({ key: d.key, label: d.short, daysLeft: daysBetween(today, ymd), dueDate: ymd }); });
  if (ledger) LEDGER_DUES.forEach(([k, label]) => { const ymd = toYmd(ledger[k]); if (ymd) items.push({ key: `vl_${k}`, label: `${label} 만기`, daysLeft: daysBetween(today, ymd), dueDate: ymd }); });
  const notify = []; const next = { ...state };
  items.forEach((x) => {
    const sg = stageOf(x);
    if (!sg) { if (next[x.key]) delete next[x.key]; return; }
    if (state[x.key] === sg) return;
    next[x.key] = sg;
    notify.push({ ...x, stage: sg, text: careAlertText(x, sg) });
  });
  return { notify, nextState: next };
}
export function careAlertText(x, sg = stageOf(x)) {
  if (sg.startsWith("over")) return `${x.label} ${x.dueDate || ""} 지남`;
  if (sg === "kmover") return `${x.label} ${Math.abs(x.leftKm).toLocaleString()}km 초과`;
  if (sg === "km500") return `${x.label} ${Math.max(0, x.leftKm).toLocaleString()}km 남음`;
  if (sg === "d0") return `${x.label} 오늘까지`;
  return `${x.label} D-${x.daysLeft} (${x.dueDate})`;
}

// ─── 월 차량별 비용 리포트 ───
//  vehicles: vehicleLedger 문서 [{ 차량번호, repairs[], structures[], 보험료 }] · drivers: drivers 문서(odoAccum) · txs: 카드 내역
export function monthlyCostReport({ vehicles = [], drivers = [], txs = [], ym }) {
  const inM = (d) => toYmd(d).slice(0, 7) === ym;
  const drvByPlate = new Map();
  arr(drivers).forEach((d) => { const k = plateCore(d.차량번호 || d.carNo || ""); if (k) drvByPlate.set(k, d); });
  const txBy = new Map();
  arr(txs).forEach((t) => { if (!inM(t.date) || !t.plateKey) return; const a = txBy.get(t.plateKey) || []; a.push(t); txBy.set(t.plateKey, a); });
  const rows = arr(vehicles).filter((v) => v && String(v.차량번호 || "").trim()).map((v) => {
    const key = plateCore(v.차량번호);
    const reps = arr(v.repairs).filter((r) => inM(r.일자));
    const amt = (r) => n(r.공가) + (r.부가세 === "" || r.부가세 == null ? Math.round(n(r.공가) * 0.1) : n(r.부가세));
    const cons = reps.filter((r) => repairCareKeys(r).some((k) => CARE_ITEMS.find((c) => c.key === k)?.consumable));
    const consumable = cons.reduce((s, r) => s + amt(r), 0);
    const repair = reps.reduce((s, r) => s + amt(r), 0) - consumable;
    const structure = arr(v.structures).filter((r) => inM(r.일자)).reduce((s, r) => s + n(r.금액), 0);
    const t = txBy.get(key) || [];
    const fuel = t.filter((x) => x.type === "유류").reduce((s, x) => s + n(x.amount), 0);
    const hipass = t.filter((x) => x.type === "하이패스").reduce((s, x) => s + n(x.amount), 0);
    const insurance = v.보험료 ? Math.round(n(v.보험료) / 12) : 0;
    const drv = drvByPlate.get(key);
    const km = Object.entries(obj(drv?.odoAccum)).filter(([d, k]) => inM(d) && n(k) > 0).reduce((s, [, k]) => s + n(k), 0);
    const total = repair + consumable + structure + fuel + hipass + insurance;
    return { id: v.id, plate: String(v.차량번호).trim(), plateKey: key, driver: String(drv?.이름 || drv?.name || ""), repair, consumable, structure, fuel, hipass, insurance, km: Math.round(km), total, perKm: km > 0 ? Math.round(total / km) : null, repairCount: reps.length };
  }).sort((a, b) => b.total - a.total);
  const sum = rows.reduce((s, r) => { ["repair", "consumable", "structure", "fuel", "hipass", "insurance", "km", "total"].forEach((k) => { s[k] = (s[k] || 0) + r[k]; }); return s; }, {});
  // km당 비용 합계는 주행거리가 있는 차량만으로(주행 기록 없는 차량의 비용이 섞이면 부풀려진다)
  const withKm = rows.filter((r) => r.km > 0);
  sum.perKm = sum.km > 0 ? Math.round(withKm.reduce((a, r) => a + r.total, 0) / sum.km) : null;
  return { ym, rows, sum };
}
export const prevYm = (ymd = kstToday()) => { const [y, m] = ymd.split("-").map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

// ─── 하이패스·유류카드 내역 읽기 ───
//  카드사·한국도로공사 내려받기 양식마다 열 이름이 달라 이름으로 찾는다(첫 10줄 안에서 머리줄 자동 인식)
const COLS = {
  date: /^(이용|사용|거래|승인|통행|주유|결제)?\s*(일시|일자|날짜|일)$|^(이용|사용|거래|승인|통행)?일자?시간?$|^date$/i,
  time: /^(이용|사용|거래|승인|통행)?\s*시간$|^time$/i,
  amount: /(이용|사용|결제|승인|청구|통행|주유)?\s*(금액|요금|료)$|^금액|통행료|amount/i,
  plate: /차량\s*번호|차번|차량$/,
  card: /카드\s*번호|카드번호|하이패스\s*번호|obu|단말/i,
  place: /가맹점|주유소|영업소|이용처|사용처|업소|장소|톨게이트|출구|입구/,
  liter: /리터|ℓ|수량|주유량/,
  kind: /유종|품목|구분|상품/,
};
const cellStr = (v) => String(v ?? "").trim();
export function detectCardCols(header = []) {
  const map = {};
  header.forEach((h, i) => {
    const s = cellStr(h).replace(/\s+/g, " ");
    if (!s) return;
    for (const [k, re] of Object.entries(COLS)) if (map[k] == null && re.test(s)) { map[k] = i; break; }
  });
  return map;
}
function excelDate(v) {
  if (typeof v === "number" && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * DAY)); return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) }; }
  if (v instanceof Date && !Number.isNaN(+v)) { const d = new Date(+v + 9 * 3600e3); return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) }; }
  const s = cellStr(v);
  const m = /(\d{4})[.\-/년\s]*(\d{1,2})[.\-/월\s]*(\d{1,2})/.exec(s) || /^(\d{4})(\d{2})(\d{2})/.exec(s.replace(/\D/g, ""));
  if (!m) return null;
  const t = /(\d{1,2}):(\d{2})/.exec(s);
  return { date: `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`, time: t ? `${t[1].padStart(2, "0")}:${t[2]}` : "" };
}
// aoa: 시트 행 배열 · type: "유류" | "하이패스" | "" (비우면 열 이름으로 추정)
export function parseCardSheet(aoa = [], type = "") {
  let hi = -1; let cols = {};
  for (let i = 0; i < Math.min(10, aoa.length); i += 1) {
    const c = detectCardCols(aoa[i] || []);
    if (c.date != null && c.amount != null) { hi = i; cols = c; break; }
  }
  if (hi < 0) return { rows: [], cols: {}, error: "머리줄(이용일시·금액)을 찾지 못했어요. 첫 10줄 안에 '이용일시'·'금액' 같은 머리줄이 있어야 해요." };
  const head = (aoa[hi] || []).map(cellStr).join(" ");
  const guess = type || (/통행|톨|영업소|하이패스|OBU/i.test(head) ? "하이패스" : "유류");
  const rows = [];
  for (let i = hi + 1; i < aoa.length; i += 1) {
    const r = aoa[i] || [];
    const dt = excelDate(r[cols.date]);
    const amount = n(r[cols.amount]);
    if (!dt || !amount) continue;
    rows.push({
      type: guess, date: dt.date, time: cols.time != null ? (excelDate(`2000-01-01 ${cellStr(r[cols.time])}`)?.time || cellStr(r[cols.time])) : dt.time,
      amount, plate: cols.plate != null ? cellStr(r[cols.plate]) : "", cardNo: cols.card != null ? cellStr(r[cols.card]).replace(/\s/g, "") : "",
      place: cols.place != null ? cellStr(r[cols.place]) : "", liter: cols.liter != null ? n(r[cols.liter]) : 0, kind: cols.kind != null ? cellStr(r[cols.kind]) : "",
    });
  }
  return { rows, cols, type: guess, headerRow: hi };
}
export const cardTxId = (co, t) => `${String(co).replace(/\//g, "_")}__${t.type}_${t.date}_${String(t.time || "").replace(/\D/g, "")}_${t.amount}_${String(t.cardNo || normPlate(t.plate)).slice(-8)}`.replace(/[^\w가-힣-]/g, "_");
const last4 = (s) => String(s || "").replace(/\D/g, "").slice(-4);

// ─── 대조 ───
//  vehicles: [{ id, 차량번호, 유류카드번호, 하이패스카드번호 }] · activeDays: Map(plateKey → Set(날짜)) — 그날 오더·출퇴근·GPS 이동이 있던 날
//  결과 각 줄: { ...t, plateKey, vehicleId, match: "plate"|"card"|"none", flags: [] }
export const FLAG_LABEL = { noTrip: "운행 없는 날 사용", otherCard: "다른 차량 카드", amount: "이상 금액", unmatched: "차량 미확인", dup: "같은 날 여러 번" };
export function reconcileCards(txs = [], vehicles = [], activeDays = new Map()) {
  const byPlate = new Map(); const byCard = new Map();
  arr(vehicles).forEach((v) => {
    const k = plateCore(v.차량번호); if (!k) return; byPlate.set(k, v);
    [v.유류카드번호, v.하이패스카드번호].forEach((c) => { const l = last4(c); if (l.length === 4) byCard.set(l, v); });
  });
  // 차량·종류별 금액 중간값(이상 금액 판단)
  const amounts = new Map();
  const out = arr(txs).map((t) => {
    const pk = plateCore(t.plate);
    const pv = pk ? byPlate.get(pk) : null;
    const cv = last4(t.cardNo).length === 4 ? byCard.get(last4(t.cardNo)) : null;
    const v = pv || cv || null;
    const flags = [];
    if (!v) flags.push("unmatched");
    if (pv && cv && pv.id !== cv.id) flags.push("otherCard");
    const plateKey = v ? plateCore(v.차량번호) : pk;
    const r = { ...t, plateKey, vehicleId: v?.id || "", vehiclePlate: v?.차량번호 || t.plate || "", match: pv ? "plate" : cv ? "card" : "none", flags };
    if (plateKey) { const k = `${plateKey}|${t.type}`; const a = amounts.get(k) || []; a.push(Number(t.amount) || 0); amounts.set(k, a); }
    return r;
  });
  const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
  const sameDay = new Map();
  out.forEach((r) => { if (r.plateKey && r.type === "유류") { const k = `${r.plateKey}|${r.date}`; sameDay.set(k, (sameDay.get(k) || 0) + 1); } });
  out.forEach((r) => {
    if (!r.plateKey) return;
    const days = activeDays.get(r.plateKey);
    if (days && !days.has(r.date)) r.flags.push("noTrip");
    const med = median(amounts.get(`${r.plateKey}|${r.type}`) || []);
    const cap = r.type === "유류" ? 600000 : 150000;
    if ((med > 0 && (amounts.get(`${r.plateKey}|${r.type}`) || []).length >= 3 && r.amount > med * 3) || r.amount > cap) r.flags.push("amount");
    if (r.type === "유류" && (sameDay.get(`${r.plateKey}|${r.date}`) || 0) > 2) r.flags.push("dup");
  });
  const summary = new Map();
  out.forEach((r) => {
    const k = r.plateKey || "(미확인)";
    const s = summary.get(k) || { plate: r.vehiclePlate || k, fuel: 0, hipass: 0, count: 0, flagged: 0 };
    if (r.type === "유류") s.fuel += r.amount; else s.hipass += r.amount;
    s.count += 1; if (r.flags.length) s.flagged += 1;
    summary.set(k, s);
  });
  return { rows: out, summary: [...summary.values()].sort((a, b) => (b.fuel + b.hipass) - (a.fuel + a.hipass)) };
}
// 차량별 "운행한 날" — 오더(상차일·하차일) + 기사 이동 기록(odoAccum)
export function buildActiveDays({ orders = [], drivers = [] } = {}) {
  const m = new Map();
  const add = (plate, d) => { const k = plateCore(plate); const day = toYmd(d); if (!k || !day) return; if (!m.has(k)) m.set(k, new Set()); m.get(k).add(day); };
  arr(orders).forEach((o) => { if (/취소/.test(String(o.배차상태 || ""))) return; add(o.차량번호, o.상차일); add(o.차량번호, o.하차일); });
  arr(drivers).forEach((d) => { Object.entries(obj(d.odoAccum)).forEach(([day, km]) => { if (n(km) > 0) add(d.차량번호 || d.carNo, day); }); if (d.workDate) add(d.차량번호 || d.carNo, d.workDate); });
  return m;
}
