// 주소 → 위도/경도 변환(Geocoding). 배차 프로그램(FleetManagement.jsx 등)에서 이미
// 쓰이고 있는 것과 동일한 SK Open API(T맵) 엔드포인트/키를 재사용한다 — 주소를
// 검색하면 좌표까지 한 번에 확보되어, 관리자가 구글맵 등에서 직접 좌표를 찾아
// 입력할 필요가 없다.
//
// 배차 프로그램의 FleetManagement.jsx 구현은 tmap/searchAddress 응답을
// `coordinateInfo.coordinate` 경로로 읽는데, 이 엔드포인트는 실제로는
// `searchAddressInfo.addressInfo[].newAddressList.newAddress[]` 형태로 좌표를
// 반환한다(같은 저장소의 StandardFare.jsx에서 이미 이렇게 정확히 파싱하고
// 있음). 그 결과 배차 프로그램에서도 searchAddress 단계는 사실상 항상
// 실패하고 fullAddrGeo(지번/도로명 정주소 전용, 느슨한 매칭 없음)만 동작하고
// 있었다 — 지번 일부만 다르거나 정주소 DB에 없는 주소는 그대로 실패한다.
// 여기서는 응답 경로를 바로잡고, 건물번호 제거 + 단계적 주소 축소 재시도를
// 추가해 실제 등록 주소들이 더 안정적으로 좌표를 찾도록 한다.
const TMAP_KEY = "rmzwkLwH9N4i9ayxDj9GR6l8hyFDaEk52ZQs4yer";

function cleanAddr(a) {
  return String(a)
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function tryFullAddrGeo(addr) {
  try {
    const url = `https://apis.openapi.sk.com/tmap/geo/fullAddrGeo?version=1&format=json&fullAddr=${encodeURIComponent(addr)}`;
    const data = await fetch(url, { headers: { appKey: TMAP_KEY, Accept: "application/json" } }).then((r) => r.json());
    const coord = data?.coordinateInfo?.coordinate?.[0];
    if (coord?.lat && coord?.lon) return { lat: parseFloat(coord.lat), lng: parseFloat(coord.lon) };
  } catch {
    // 다음 방법으로 폴백
  }
  return null;
}

async function trySearchAddress(addr) {
  try {
    const url = `https://apis.openapi.sk.com/tmap/searchAddress?version=1&format=json&queryVersion=1&fullAddrOnOff=Y&searchKeyword=${encodeURIComponent(addr)}&countPerPage=1&appKey=${TMAP_KEY}`;
    const data = await fetch(url, { headers: { Accept: "application/json" } }).then((r) => r.json());
    const raw = data?.searchAddressInfo?.addressInfo;
    const item = Array.isArray(raw) ? raw[0] : raw;
    if (!item) return null;
    const newAddrArr = item?.newAddressList?.newAddress;
    const newAddr = Array.isArray(newAddrArr) ? newAddrArr[0] : newAddrArr;
    const lat1 = parseFloat(newAddr?.centerLat || "");
    const lon1 = parseFloat(newAddr?.centerLon || "");
    if (lat1 && lon1) return { lat: lat1, lng: lon1 };
    const lat2 = parseFloat(item?.lat || item?.y_wgs84 || "");
    const lon2 = parseFloat(item?.lon || item?.x_wgs84 || "");
    if (lat2 && lon2) return { lat: lat2, lng: lon2 };
  } catch {
    // 다음 방법으로 폴백
  }
  return null;
}

async function tryOne(addr) {
  return (await tryFullAddrGeo(addr)) || (await trySearchAddress(addr));
}

// "인천광역시 서구 정서진8로 55" → "인천광역시 서구 정서진8로" (건물번호 제거)
function stripBuildingNumber(addr) {
  return addr.replace(/\s+\d+(?:-\d+)?\s*$/, "").trim();
}

// 뒤 토큰부터 단계적으로 잘라내며 더 넓은 단위(동/구 등)로 재시도할 후보 목록
function shortenCandidates(addr) {
  const parts = addr.split(" ");
  const results = [];
  for (let i = parts.length - 1; i >= 2; i--) {
    results.push(parts.slice(0, i).join(" "));
  }
  return results;
}

// 행정구역 개편/신설(예: 인천 서구 검단 신도시 → 검단구 분구)이 도로명주소
// 데이터베이스에 아직 반영되지 않았거나, 반대로 사용자가 옛 명칭으로 입력한
// 경우를 모두 대비해 양쪽 이름을 다 시도한다 — 어느 한쪽만 시도하면 실제로는
// 존재하는 주소인데도 "좌표를 찾지 못함"으로 잘못 처리될 수 있다.
const DISTRICT_ALIASES = [["검단구", "서구"]];

function withDistrictAliases(addr) {
  const variants = [addr];
  for (const [a, b] of DISTRICT_ALIASES) {
    if (addr.includes(a)) variants.push(addr.replace(a, b));
    if (addr.includes(b)) variants.push(addr.replace(b, a));
  }
  return [...new Set(variants)];
}

async function tryWithAliases(addr) {
  for (const variant of withDistrictAliases(addr)) {
    const found = await tryOne(variant);
    if (found) return { address: variant, ...found };
  }
  return null;
}

export async function searchAddressCoords(keyword) {
  const kw = keyword.trim();
  if (!kw) return null;
  const cleaned = cleanAddr(kw);

  let found = await tryWithAliases(cleaned);
  if (found) return { precise: true, ...found };

  const noBuilding = stripBuildingNumber(cleaned);
  if (noBuilding && noBuilding !== cleaned) {
    found = await tryWithAliases(noBuilding);
    if (found) return { precise: true, ...found };
  }

  for (const candidate of shortenCandidates(cleaned)) {
    found = await tryWithAliases(candidate);
    if (found) return { precise: false, ...found };
  }

  return null;
}
