// =========================
// 주소 정리
// =========================
function cleanAddress(addr = "") {
  return String(addr)
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default async function handler(req, res) {

  // ✅ CORS 헤더
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { fromAddr, toAddr } = req.body;

    if (!fromAddr || !toAddr) {
      return res.status(400).json({ error: "주소 누락" });
    }

    const TMAP_KEY = "rmzwkLwH9N4i9ayxDj9GR6l8hyFDaEk52ZQs4yer";

    // =========================
    // 0️⃣ 도로명 → 지번 변환
    // =========================
    const convertToJibun = async (addr) => {
      try {
        const r = await fetch(
          "https://apis.openapi.sk.com/tmap/geo/convertAddress?version=1&format=json",
          {
            method: "POST",
            headers: {
              appKey: TMAP_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              address: addr,
              coordType: "WGS84GEO",
            }),
          }
        );

        if (!r.ok) return addr;

        const data = await r.json();
        const jibun =
          data?.addressInfo?.fullAddress ||
          data?.addressInfo?.buildingName;

        return jibun || addr;
      } catch {
        return addr;
      }
    };

    // =========================
    // 1️⃣ 주소 → 좌표
    // 🔥 TMAP: newLat/newLon 필드가 실제 좌표값
    //    lat = 위도(Y) 33~38, lon = 경도(X) 126~130
    // =========================
    const geocode = async (addr) => {
      const url =
        "https://apis.openapi.sk.com/tmap/geo/fullAddrGeo" +
        "?version=1&format=json&fullAddr=" +
        encodeURIComponent(addr);

      const r = await fetch(url, {
        method: "GET",
        headers: { appKey: TMAP_KEY },
      });

      if (!r.ok) return null;

      const j = await r.json();
      const coord = j?.coordinateInfo?.coordinate?.[0];

      if (!coord) return null;

      // 🔥 핵심 수정: newLat/newLon 우선 사용
      const rawLat = parseFloat(coord.newLat || coord.lat);
      const rawLon = parseFloat(coord.newLon || coord.lon);

      if (!rawLat || !rawLon) return null;

      // 🔥 한국 좌표 범위 검증 (lat: 33~38, lon: 126~130)
      if (rawLat < 33 || rawLat > 38 || rawLon < 126 || rawLon > 130) {
        console.warn("⚠️ 좌표 범위 이상 — lat:", rawLat, "lon:", rawLon, "addr:", addr);
        return null;
      }

      return {
        lat: rawLat,  // 위도 Y
        lon: rawLon,  // 경도 X
      };
    };

    // =========================
    // 1-1️⃣ 강화된 fallback
    // =========================
    const tryGeocode = async (addr) => {
      let result = await geocode(addr);

      const jibun = await convertToJibun(addr);
      const jibunResult = await geocode(jibun);

      if (jibunResult) return jibunResult;
      if (result) return result;

      const parts = addr.split(" ");
      for (let i = parts.length - 1; i >= 2; i--) {
        const short = parts.slice(0, i).join(" ");
        result = await geocode(short);
        if (result) return result;
      }

      return null;
    };

    const from = await tryGeocode(cleanAddress(fromAddr));
    const to   = await tryGeocode(cleanAddress(toAddr));

    // 🔥 좌표 디버그 로그
    console.log("📍 from:", from, "| 원본주소:", fromAddr);
    console.log("📍 to  :", to,   "| 원본주소:", toAddr);

    if (!from || !to) {
      return res.status(200).json({
        distanceKm: "0.0",
        durationMin: 0,
        path: [],
        error: "GEOCODE_FAIL",
      });
    }

    // =========================
    // 2️⃣ 경로 시도 함수
    // 🔥 TMAP Routes: startX = 경도(lon), startY = 위도(lat)
    // =========================
    const tryRoute = async (startX, startY, endX, endY) => {
      try {
        const routeRes = await fetch(
          "https://apis.openapi.sk.com/tmap/routes?version=1&format=json",
          {
            method: "POST",
            headers: {
              appKey: TMAP_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              startX,          // 🔥 경도(lon)
              startY,          // 🔥 위도(lat)
              endX,            // 🔥 경도(lon)
              endY,            // 🔥 위도(lat)
              reqCoordType: "WGS84GEO",
              resCoordType: "WGS84GEO",
              searchOption: "0",          // ✅ 추가: 최적경로
              tollgateFareOption: "16",   // ✅ 추가: 경로 탐색 성공률 향상
            }),
          }
        );

        if (!routeRes.ok) return null;

        const json = await routeRes.json();
        const features = json?.features;

        return features && features.length ? features : null;
      } catch {
        return null;
      }
    };

    // =========================
    // 3️⃣ 경로 재시도 (도로 스냅 효과)
    // 🔥 lon = X, lat = Y 순서 엄격히 지킴
    // =========================
    const getRoute = async (start, end) => {
      const offsets = [
        [0, 0],
        [0.0005, 0],
        [-0.0005, 0],
        [0, 0.0005],
        [0, -0.0005],
        [0.001, 0],
        [0, 0.001],
      ];

      // 출발지 이동
      for (const [dx, dy] of offsets) {
        const r = await tryRoute(
          start.lon + dx,   // startX = 경도
          start.lat + dy,   // startY = 위도
          end.lon,          // endX   = 경도
          end.lat           // endY   = 위도
        );
        if (r) return r;
      }

      // 도착지 이동
      for (const [dx, dy] of offsets) {
        const r = await tryRoute(
          start.lon,
          start.lat,
          end.lon + dx,
          end.lat + dy
        );
        if (r) return r;
      }

      // 둘 다 이동
      for (const [dx, dy] of offsets) {
        const r = await tryRoute(
          start.lon + dx,
          start.lat + dy,
          end.lon + dx,
          end.lat + dy
        );
        if (r) return r;
      }

      return null;
    };

    const features = await getRoute(from, to);

    if (!features) {
      console.error("❌ 경로 없음: ROUTE_RETRY_FAIL", { from, to });
      return res.status(200).json({
        distanceKm: "0.0",
        durationMin: 0,
        path: [],
        error: "ROUTE_RETRY_FAIL",
      });
    }

    // =========================
    // 경로 좌표 추출
    // =========================
    const path = [];

    features.forEach((f) => {
      if (f.geometry?.type === "LineString") {
        f.geometry.coordinates.forEach(([lng, lat]) => {
          path.push([lng, lat]);
        });
      }
    });

    // =========================
    // 거리 / 시간
    // =========================
    const summaryFeature =
      features.find((f) => f.properties?.totalDistance) ||
      features[0];

    const summary = summaryFeature?.properties || {};

    const distanceKm = summary.totalDistance
      ? (summary.totalDistance / 1000).toFixed(1)
      : "0.0";

    const durationMin = summary.totalTime
  ? Math.round(summary.totalTime / 60)
  : 0;

// 🔥 분 → "X시간 X분" 텍스트 변환
const formatDuration = (min) => {
  if (!min || min <= 0) return "0분";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
};

return res.status(200).json({
  distanceKm,
  durationMin,                        // 기존 숫자값 유지 (혹시 다른 곳에서 쓸 경우 대비)
  durationText: formatDuration(durationMin),  // 🔥 새로 추가
  path,
});

  } catch (e) {
    console.error("❌ route error:", e);

    return res.status(200).json({
      distanceKm: "0.0",
      durationMin: 0,
      path: [],
      error: "SERVER_FAIL",
    });
  }
}