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

// "5톤 냉동윙", "3.5톤(광폭)" 같은 자유 입력 텍스트에서 가장 근접한 요율 항목을 찾는다.
export function matchVehicleType(vehicleText = "", tonText = "") {
  const text = `${vehicleText} ${tonText}`;
  for (const v of VEHICLE_TYPES) {
    if (v.keywords.some(k => text.includes(k))) return v;
  }
  // 톤수만 숫자로 들어온 경우 (예: "5", "5t") 가장 가까운 톤급으로 폴백
  const num = parseFloat(String(tonText || vehicleText).replace(/[^0-9.]/g, ""));
  if (!isNaN(num) && num > 0) {
    const byTon = [...VEHICLE_TYPES].filter(v => /ton/i.test(v.id)).sort((a, b) => {
      const an = parseFloat(a.id) || 0, bn = parseFloat(b.id) || 0;
      return Math.abs(an - num) - Math.abs(bn - num);
    });
    if (byTon[0]) return byTon[0];
  }
  return DEFAULT_VEHICLE;
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
  const vt = matchVehicleType(vehicleText, tonText) || DEFAULT_VEHICLE;
  const base = vt.base + vt.perKm * roadDist;
  const surcharged = Math.max(vt.min, base) * (1 + cargoSurcharge(cargoText));
  const avg = Math.round(surcharged / 5000) * 5000;
  const min = Math.round(avg * 0.85 / 5000) * 5000;
  const max = Math.round(avg * 1.15 / 5000) * 5000;

  if (![roadDist, min, max, avg].every(Number.isFinite)) return null;

  return { distance: roadDist, min, max, avg, vehicleId: vt.id };
}
