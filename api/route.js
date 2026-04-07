// route.js

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
    // 1️⃣ 주소 → 좌표 변환
    // =========================
    const geocode = async (addr) => {
      const url =
        "https://apis.openapi.sk.com/tmap/geo/fullAddrGeo" +
        "?version=1&format=json&fullAddr=" +
        encodeURIComponent(addr);

      const r = await fetch(url, {
        method: "GET",
        headers: {
          appKey: TMAP_KEY,
        },
      });

      if (!r.ok) throw new Error("좌표 API 실패");

      const j = await r.json();
      const coord = j?.coordinateInfo?.coordinate?.[0];

      if (!coord) throw new Error("주소 인식 실패");

      return {
        lat: parseFloat(coord.lat),
        lon: parseFloat(coord.lon),
      };
    };

    const from = await geocode(fromAddr);
    const to = await geocode(toAddr);

    // =========================
    // 2️⃣ 길찾기 API
    // =========================
    const routeRes = await fetch(
      "https://apis.openapi.sk.com/tmap/routes?version=1&format=json",
      {
        method: "POST",
        headers: {
          appKey: TMAP_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startX: from.lon,
          startY: from.lat,
          endX: to.lon,
          endY: to.lat,
          reqCoordType: "WGS84GEO",
          resCoordType: "WGS84GEO",
        }),
      }
    );

    if (!routeRes.ok) {
      throw new Error("Tmap 길찾기 API 실패");
    }

    const routeJson = await routeRes.json();

    const features = routeJson?.features;
    if (!features || !features.length) {
      throw new Error("경로 없음");
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
    // 4️⃣ 거리 / 시간 (🔥 핵심 수정)
    // =========================
    const summaryFeature = features.find(
      (f) => f.properties?.totalDistance
    );

    if (!summaryFeature) {
      throw new Error("거리 계산 실패");
    }

    const summary = summaryFeature.properties;

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

    return res.status(500).json({
      error: e.message,
      distanceKm: "0.0",
      durationMin: 0,
      path: [],
    });
  }
};

export default handler;