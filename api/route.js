// =========================
// 주소 정리
// =========================
function cleanAddress(addr = "") {
  return String(addr)
    .replace(/\(.*?\)/g, "")
    .replace(/[^가-힣0-9\s-]/g, "")
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
    // 1️⃣ 주소 → 좌표
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
    // 1-1️⃣ fallback 주소 보정
    // =========================
    const tryGeocode = async (addr) => {
      let result = await geocode(addr);

      if (!result) {
        const parts = addr.split(" ");
        if (parts.length > 2) {
          const short = parts.slice(0, -1).join(" ");
          result = await geocode(short);
        }
      }

      return result;
    };

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
    // 2️⃣ 🔥 경로 재탐색 함수 (핵심)
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

      for (let i = 0; i < offsets.length; i++) {
        const [dx, dy] = offsets[i];

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
                startX: start.lon + dx,
                startY: start.lat + dy,
                endX: end.lon + dx,
                endY: end.lat + dy,
                reqCoordType: "WGS84GEO",
                resCoordType: "WGS84GEO",
              }),
            }
          );

          if (!routeRes.ok) continue;

          const json = await routeRes.json();
          const features = json?.features;

          if (features && features.length) {
            return features; // ✅ 성공
          }
        } catch (e) {
          console.warn("재시도 실패:", i);
        }
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
    // 3️⃣ 경로 좌표 추출
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
    // 4️⃣ 거리 / 시간
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

    // =========================
    // 5️⃣ 응답
    // =========================
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