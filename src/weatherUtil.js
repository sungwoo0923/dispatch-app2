// ======================= src/weatherUtil.js =======================
// 오더 등록일에 실제로 비/눈이 왔는지 자동으로 인식해, 배차가 어려워 평소보다
// 운임이 높게(또는 낮게) 형성됐을 수 있다는 걸 자사운임표·AI추천·매출관리 등
// "운임조회"가 일어나는 모든 곳에서 알 수 있게 한다.
//
// 이미 있던 특수운임(연휴·성수기) 시스템에 그대로 얹혀서 동작한다 —
// isSpecialDemandOrder/isSpecialDemandRow가 이 모듈의 getWeatherSpecialInfo를
// 홀리데이 판정과 같은 자리에서 함께 확인하도록 확장했을 뿐이라, 별도의 새
// UI 없이도 "특수일" 배지·평균 계산 제외 로직을 기상에도 그대로 재사용한다.
//
// 위치는 상/하차지별 정밀 좌표가 아니라 서울(전국 대표) 좌표 하나로 간단히
// 판단한다 — 오더마다 주소를 지오코딩하는 건 비용이 크고, "그 날 비/눈으로
// 전국적으로 배차가 어려웠다"는 대략적인 신호만으로도 충분하다는 판단.
// API는 Open-Meteo(무료, 키 불필요, CORS 허용)를 쓴다.

const WEATHER_LOCATION = { lat: 37.5665, lon: 126.978 }; // 서울시청
const RAIN_MM_THRESHOLD = 5; // 하루 강수량 5mm 이상이면 "우천"으로 판단
const CACHE_KEY = "dispatchWeatherCache_v1";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6시간 — 오늘 날씨는 계속 갱신될 수 있어서

let memoryCache = null; // { fetchedAt, byDate: { "2026-08-31": { special:true, reason:"우천(12mm)" } } }
let inFlight = null; // 중복 fetch 방지

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.byDate || !parsed?.fetchedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveToStorage(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 저장 실패(용량 초과 등)해도 메모리 캐시로는 계속 동작하므로 무시.
  }
}

async function fetchWeatherMap() {
  const { lat, lon } = WEATHER_LOCATION;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_sum,snowfall_sum&timezone=Asia%2FSeoul&past_days=92&forecast_days=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather fetch failed: ${res.status}`);
  const data = await res.json();
  const times = data?.daily?.time || [];
  const precip = data?.daily?.precipitation_sum || [];
  const snow = data?.daily?.snowfall_sum || [];
  const byDate = {};
  times.forEach((d, i) => {
    const rain = Number(precip[i] || 0);
    const snowfall = Number(snow[i] || 0);
    if (snowfall > 0) byDate[d] = { special: true, reason: `강설(${snowfall.toFixed(1)}cm)` };
    else if (rain >= RAIN_MM_THRESHOLD) byDate[d] = { special: true, reason: `우천(${rain.toFixed(0)}mm)` };
  });
  return byDate;
}

// 앱 시작 시 한 번 호출 — 캐시가 신선하면 그대로 쓰고, 아니면 새로 받아온다.
// 실패해도(오프라인 등) 조용히 무시한다 — 날씨 표시는 부가 기능이라 이 때문에
// 앱 사용 자체가 막히면 안 된다.
export async function ensureWeatherLoaded() {
  if (memoryCache && Date.now() - memoryCache.fetchedAt < CACHE_TTL_MS) return;
  if (inFlight) return inFlight;

  const stored = loadFromStorage();
  if (stored && Date.now() - stored.fetchedAt < CACHE_TTL_MS) {
    memoryCache = stored;
    return;
  }

  inFlight = (async () => {
    try {
      const byDate = await fetchWeatherMap();
      memoryCache = { fetchedAt: Date.now(), byDate };
      saveToStorage(memoryCache);
    } catch {
      // 실패하면 오래된 캐시라도 있으면 그거라도 쓴다(완전히 없는 것보다 낫다).
      if (stored) memoryCache = stored;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// 동기 조회 — specialDemandInfo(연휴 판정)와 동일한 { special, reason } 모양.
// ensureWeatherLoaded가 아직 끝나지 않았으면 특수일 아님으로 취급(로드가 끝나면
// 다음 렌더/조회부터 반영된다).
export function getWeatherSpecialInfo(dateStr) {
  if (!dateStr || !memoryCache?.byDate) return { special: false, reason: "" };
  const key = String(dateStr).slice(0, 10);
  return memoryCache.byDate[key] || { special: false, reason: "" };
}
