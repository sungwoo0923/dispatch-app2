// 티맵 API 기반 거리 계산 + 차량/화물 조건별 운임 추정 유틸.
// FreightRateInquiry.jsx(전국운임조회)의 요율표/거리계산 로직과 동일한 기준을 사용해
// 배차관리 폼에서도 같은 산정 방식을 쓸 수 있게 분리했다.

const TMAP_KEY = "rmzwkLwH9N4i9ayxDj9GR6l8hyFDaEk52ZQs4yer";

// ⭐ FreightRateInquiry.jsx와 동일하게 perKm 재보정 — 인천~부산(약 433km) 기준
//    참고 운임표에 맞춰 base는 유지하고 perKm만 역산했다. (자세한 사유는
//    FreightRateInquiry.jsx의 VEHICLE_TYPES 주석 참고)
export const VEHICLE_TYPES = [
  { id: "bike", keywords: ["오토바이", "바이크"], base: 5000, perKm: 434, min: 10000, L100km: 4 },
  { id: "damas", keywords: ["다마스", "라보"], base: 12000, perKm: 478, min: 18000, L100km: 8 },
  { id: "1ton", keywords: ["1톤"], base: 60000, perKm: 453, min: 60000, L100km: 12 },
  { id: "1.4ton", keywords: ["1.4톤"], base: 66000, perKm: 497, min: 67000, L100km: 14 },
  { id: "2.5ton", keywords: ["2.5톤"], base: 67000, perKm: 730, min: 85000, L100km: 18 },
  { id: "3.5tonW", keywords: ["3.5톤 광", "3.5톤광", "3.5톤(광"], base: 86000, perKm: 732, min: 105000, L100km: 24 },
  { id: "3.5ton", keywords: ["3.5톤"], base: 79000, perKm: 725, min: 95000, L100km: 22 },
  { id: "5tonAx", keywords: ["5톤+축", "5톤 축"], base: 87000, perKm: 1037, min: 115000, L100km: 30 },
  { id: "5tonP", keywords: ["5톤+"], base: 84000, perKm: 961, min: 110000, L100km: 29 },
  { id: "5ton", keywords: ["5톤"], base: 76000, perKm: 947, min: 100000, L100km: 27 },
  { id: "11ton", keywords: ["11톤"], base: 103000, perKm: 1102, min: 165000, L100km: 35 },
  { id: "18ton", keywords: ["18톤"], base: 142000, perKm: 1282, min: 230000, L100km: 38 },
  { id: "25ton", keywords: ["25톤"], base: 174000, perKm: 1286, min: 290000, L100km: 42 },
  { id: "trailer", keywords: ["추레라", "트레일러"], base: 200000, perKm: 1400, min: 335000, L100km: 45 },
  { id: "lowbed", keywords: ["로베드", "로우베드"], base: 220000, perKm: 2030, min: 370000, L100km: 47 },
];

const DEFAULT_VEHICLE = VEHICLE_TYPES.find(v => v.id === "1ton");

// ⭐ "820kg", "1.5톤", "800g", "5t" 등 단위가 섞인 톤수 텍스트를 항상 "톤" 단위
// 숫자로 정규화한다. 예전엔 숫자만 남기고 단위를 통째로 버려서("820kg"도 그냥
// 820으로 취급) 820kg(0.82톤)짜리 소형 화물이 가장 가까운 톤급을 찾다가 25톤
// 트레일러 요금으로 잡혀버리는 심각한 오류가 있었다(11km인데 24만~33만원으로
// 나오던 원인). DispatchApp.jsx의 toTonUnit과 동일한 파싱 규칙을 쓴다.
function parseTonValue(text = "") {
  const str = String(text || "").trim();
  const m = str.match(/([\d.]+)\s*(kg|g|톤|ton|t)?/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (isNaN(num) || num <= 0) return null;
  const unit = (m[2] || "톤").toLowerCase();
  if (unit === "kg") return num / 1000;
  if (unit === "g") return num / 1000000;
  return num; // 톤 / ton / t
}

// ⭐ 키워드가 텍스트 안에 있어도, 바로 앞이 숫자면(=더 큰 숫자의 뒷부분과 우연히
// 겹친 것) 매칭으로 인정하지 않는다. 예전엔 단순 text.includes(keyword)라서
// "11톤"을 입력해도 "1톤"(1ton) 키워드가 그 안에 그대로 들어있어(1[1톤]) 항상
// 1톤 요금으로 먼저 잡혀버렸다("25톤"도 "5톤"에 걸려 5톤 요금으로 잡히는 등,
// 숫자가 겹치는 모든 차종에서 발생하던 문제) — 실제로는 절대 원하는 동작이
// 아니므로, 숫자 키워드 앞에 다른 숫자가 붙어있으면 무시하도록 경계를 둔다.
function keywordMatches(text, keyword) {
  const idx = text.indexOf(keyword);
  if (idx === -1) return false;
  const prevChar = text[idx - 1];
  if (prevChar && /[0-9.]/.test(prevChar)) return false;
  return true;
}

// 화물내용 텍스트에서 파레트 수량을 추출한다 ("5파레트", "10파렛트", "10 pallet" 등 —
// DispatchApp.jsx 화물내용 입력이 "{숫자}{화물타입}" 형태로 저장되는 것과 동일한 형식).
function extractPalletCount(cargoText = "") {
  const m = String(cargoText || "").match(/(\d+)\s*(?:파레트|파렛트|팔레트|pallet|plt)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ⭐ 파레트 수량 → 대략적인 필요 차량 톤급 근사표. 표준 파레트(1100×1100mm) 적재
// 기준의 업계 통상치를 참고한 근사값이라 실제 화물 부피/중량에 따라 달라질 수
// 있다 — 톤수/차종이 명확하지 않을 때 화물량에 맞는 최소 차량 크기를 가늠하는
// 용도로만 쓰고, 아래 matchVehicleType에서 실제 선택된 톤수보다 작게는 절대
// 쓰지 않는다(파레트 수가 많으면 더 큰 차량 쪽으로만 보정).
const PALLET_VEHICLE_STEPS = [
  { maxPallet: 2, id: "1ton" },
  { maxPallet: 4, id: "1.4ton" },
  { maxPallet: 6, id: "2.5ton" },
  { maxPallet: 9, id: "3.5ton" },
  { maxPallet: 12, id: "5ton" },
  { maxPallet: 16, id: "5tonAx" },
  { maxPallet: 20, id: "11ton" },
  { maxPallet: 28, id: "18ton" },
  { maxPallet: Infinity, id: "25ton" },
];
function vehicleFromPalletCount(count) {
  const step = PALLET_VEHICLE_STEPS.find(s => count <= s.maxPallet);
  return VEHICLE_TYPES.find(v => v.id === (step || PALLET_VEHICLE_STEPS.at(-1)).id) || null;
}

// "5톤 냉동윙", "3.5톤(광폭)" 같은 자유 입력 텍스트 + 톤수 + 화물내용(파레트 수량)을
// 종합해 가장 적합한 요율 항목을 찾는다.
//  1) 차종/톤수 텍스트에 명시적인 톤급 키워드가 있으면 최우선으로 신뢰한다.
//  2) 톤수가 숫자로 들어온 경우(kg/g/톤 단위 모두 지원) 가장 가까운 톤급으로 매칭.
//  3) 화물내용에서 읽은 파레트 수량이, 위에서 찾은 차량으로는 다 못 실을 만큼
//     크면(예: 같은 조건인데 5파레트 vs 10파레트) 더 큰 차량 쪽으로 끌어올린다 —
//     화물량이 차량 크기보다 작은 쪽으로는 절대 보정하지 않는다(운임 과소추정 방지).
export function matchVehicleType(vehicleText = "", tonText = "", cargoText = "") {
  const text = `${vehicleText} ${tonText}`;
  const byKeyword = VEHICLE_TYPES.find(v => v.keywords.some(k => keywordMatches(text, k)));

  const tonNum = parseTonValue(tonText) ?? parseTonValue(vehicleText);
  let byTon = null;
  if (tonNum != null) {
    const sorted = [...VEHICLE_TYPES].filter(v => /ton/i.test(v.id)).sort((a, b) => {
      const an = parseFloat(a.id) || 0, bn = parseFloat(b.id) || 0;
      return Math.abs(an - tonNum) - Math.abs(bn - tonNum);
    });
    byTon = sorted[0] || null;
  }

  const base = byKeyword || byTon || null;

  const palletCount = extractPalletCount(cargoText);
  const byPallet = palletCount != null ? vehicleFromPalletCount(palletCount) : null;

  if (base && byPallet) {
    // min(최소운임)을 차량 크기의 대리 지표로 써서, 파레트 기준 차량이 더 크면 그쪽을 쓴다.
    return byPallet.min > base.min ? byPallet : base;
  }
  return base || byPallet || DEFAULT_VEHICLE;
}

export function haversineKm(la1, lo1, la2, lo2) {
  const R = 6371;
  const d1 = (la2 - la1) * Math.PI / 180;
  const d2 = (lo2 - lo1) * Math.PI / 180;
  const a = Math.sin(d1 / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(d2 / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 도로명/지번/축약 주소 순으로 시도하는 간단한 지오코딩. 실패하면 null.
export async function geocodeAddress(rawAddr) {
  const addr = String(rawAddr || "").trim();
  if (!addr) return null;

  const clean = addr.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();

  const tryGeocode = async (address) => {
    try {
      const url = "https://apis.openapi.sk.com/tmap/geo/fullAddrGeo" +
        "?version=1&format=json&fullAddr=" + encodeURIComponent(address);
      const res = await fetch(url, { method: "GET", headers: { Accept: "application/json", appKey: TMAP_KEY } });
      const data = await res.json();
      const coord = data?.coordinateInfo?.coordinate?.[0];
      if (!coord) return null;
      const lat = parseFloat(coord.lat);
      const lon = parseFloat(coord.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
      return { lat, lon };
    } catch {
      return null;
    }
  };

  let result = await tryGeocode(clean);
  if (result) return result;

  const parts = clean.split(" ");
  for (let i = parts.length - 1; i >= 2; i--) {
    result = await tryGeocode(parts.slice(0, i).join(" "));
    if (result) return result;
  }
  return null;
}

// 화물내용 텍스트에 냉장/냉동/위험물 키워드가 있으면 할증률 적용
function cargoSurcharge(cargoText = "") {
  if (/냉장|냉동/.test(cargoText)) return 0.15;
  if (/위험물/.test(cargoText)) return 0.20;
  return 0;
}

// 상/하차지 주소, 차량종류/톤수, 화물내용을 바탕으로 티맵 거리 기준 운임 범위를 추정한다.
export async function estimateDistanceFare({ pickupAddr, dropAddr, vehicleText, tonText, cargoText }) {
  const [from, to] = await Promise.all([geocodeAddress(pickupAddr), geocodeAddress(dropAddr)]);
  if (!from || !to) return null;

  const roadDist = Math.round(haversineKm(from.lat, from.lon, to.lat, to.lon) * 1.25);
  const vt = matchVehicleType(vehicleText, tonText, cargoText) || DEFAULT_VEHICLE;
  const base = vt.base + vt.perKm * roadDist;
  const surcharged = Math.max(vt.min, base) * (1 + cargoSurcharge(cargoText));
  const avg = Math.round(surcharged / 5000) * 5000;
  const min = Math.round(avg * 0.85 / 5000) * 5000;
  const max = Math.round(avg * 1.15 / 5000) * 5000;

  if (![roadDist, min, max, avg].every(Number.isFinite)) return null;

  return { distance: roadDist, min, max, avg, vehicleId: vt.id };
}
