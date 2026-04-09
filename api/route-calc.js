// route-calc.js (통합 버전)

// =========================
// 주소 정리
// =========================
function cleanAddress(addr = "") {
  return String(addr)
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const handler = async (req, res) => {
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
    // 도로명 → 지번 변환
    // =========================
    const convertToJibun = async (addr) => {
      try {
        const res = await fetch(
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

        if (!res.ok) return addr;

        const data = await res.json();
        const jibun =
          data?.addressInfo?.fullAddress ||
          data?.addressInfo?.buildingName;

        return jibun || addr;
      } catch {
        return addr;
      }
    };

    // =========================
    // 주소 → 좌표
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

      return {
        lat: parseFloat(coord.lat),
        lon: parseFloat(coord.lon),
      };
    };

    // =========================
    // 강화된 지오코딩 (원본 + 지번 변환 + 축소)
    // =========================
    const tryGeocode = async (addr) => {
      // 1️⃣ 원본 주소로 시도
      let result = await geocode(addr);
      if (result) return result;

      // 2️⃣ 지번 변환 후 시도 (도로명/지번 모두 대응)
      const jibun = await convertToJibun(addr);
      if (jibun !== addr) {
        const jibunResult = await geocode(jibun);
        if (jibunResult) return jibunResult;
      }

      // 3️⃣ 주소 축소 시도
      const parts = addr.split(" ");
      for (let i = parts.length - 1; i >= 2; i--) {
        const short = parts.slice(0, i).join(" ");
        result = await geocode(short);
        if (result) return result;
      }

      return null;
    };

    // =========================
    // 실제 적용
    // =========================
    const from = await tryGeocode(cleanAddress(fromAddr));
    const to = await tryGeocode(cleanAddress(toAddr));

    if (!from || !to) {
      return res.status(200).json({
        distanceKm: "0.0",
        durationMin: 0,
        path: [],
        error: "GEOCODE_FAIL",
      });
    }

    // =========================
    // 경로 API 호출
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
              startX,
              startY,
              endX,
              endY,
              reqCoordType: "WGS84GEO",
              resCoordType: "WGS84GEO",
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
    // 도로 스냅 재시도
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

      for (const [dx, dy] of offsets) {
        const res = await tryRoute(
          start.lon + dx,
          start.lat + dy,
          end.lon,
          end.lat
        );
        if (res) return res;
      }

      for (const [dx, dy] of offsets) {
        const res = await tryRoute(
          start.lon,
          start.lat,
          end.lon + dx,
          end.lat + dy
        );
        if (res) return res;
      }

      for (const [dx, dy] of offsets) {
        const res = await tryRoute(
          start.lon + dx,
          start.lat + dy,
          end.lon + dx,
          end.lat + dy
        );
        if (res) return res;
      }

      return null;
    };

    const features = await getRoute(from, to);

    if (!features) {
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
    // 거리 / 시간 계산
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

    return res.status(200).json({
      distanceKm,
      durationMin,
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
};

export default handler;
