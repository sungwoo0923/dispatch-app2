// 주소 → 위도/경도 변환(Geocoding). 배차 프로그램(FleetManagement.jsx)에서 이미
// 검증되어 쓰이고 있는 것과 동일한 SK Open API(T맵) 엔드포인트/키를 그대로
// 재사용한다 — 주소를 검색하면 좌표까지 한 번에 확보되어, 관리자가 구글맵 등에서
// 직접 좌표를 찾아 입력할 필요가 없다.
const TMAP_KEY = "rmzwkLwH9N4i9ayxDj9GR6l8hyFDaEk52ZQs4yer";

export async function searchAddressCoords(keyword) {
  const kw = keyword.trim();
  if (!kw) return null;

  try {
    const url1 = `https://apis.openapi.sk.com/tmap/searchAddress?version=1&format=json&queryVersion=1&fullAddrOnOff=Y&searchKeyword=${encodeURIComponent(kw)}&countPerPage=1&appKey=${TMAP_KEY}`;
    const d1 = await fetch(url1).then((r) => r.json());
    const coords1 = d1?.coordinateInfo?.coordinate;
    const first = Array.isArray(coords1) ? coords1[0] : coords1;
    if (first?.lat && first?.lon) {
      return { address: kw, lat: parseFloat(first.lat), lng: parseFloat(first.lon) };
    }

    const url2 = `https://apis.openapi.sk.com/tmap/geo/fullAddrGeo?version=1&format=json&fullAddr=${encodeURIComponent(kw)}`;
    const d2 = await fetch(url2, { headers: { appKey: TMAP_KEY, Accept: "application/json" } }).then((r) => r.json());
    const coord = d2?.coordinateInfo?.coordinate?.[0];
    if (coord?.lat && coord?.lon) {
      return { address: kw, lat: parseFloat(coord.lat), lng: parseFloat(coord.lon) };
    }
    return null;
  } catch {
    return null;
  }
}
