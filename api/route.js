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
// 🔥 주소 정리 (강화 버전)
// =========================
function cleanAddress(addr = "") {
  return String(addr)
    .replace(/\(.*?\)/g, "")         // 괄호 제거
    .replace(/지하\s*\d+층?/g, "")   // 지하1층 제거
    .replace(/\d+층/g, "")           // 1층, 2층 제거
    .replace(/B\d+/gi, "")           // B1, B2 제거
    .replace(/[^가-힣0-9\s-]/g, "")  // 특수문자 제거
    .replace(/\s+/g, " ")
    .trim();
}

// =========================
// 🔥 도로명 → 지번 변환
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
        }),
      }
    );

    if (!res.ok) return addr;

    const data = await res.json();

    // 🔥 핵심: 지번만 사용
    const jibun =
      data?.addressInfo?.legalDong ||
      data?.addressInfo?.adminDong ||
      data?.addressInfo?.buildingAddress;

    return jibun || addr;

  } catch {
    return addr;
  }
};
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
    // 🔥 1-1️⃣ 강화된 fallback
    // =========================
    const tryGeocode = async (addr) => {
  const cleaned = cleanAddress(addr);

  // 🔥 1️⃣ 지번 먼저
let jibun = await convertToJibun(cleaned);

if (!jibun || jibun === cleaned) {
  jibun = cleaned;
}
  console.log("원본:", addr);
  console.log("정제:", cleaned);
  console.log("지번:", jibun);
  let result = await geocode(jibun);
  if (result) return result;

  // 🔥 2️⃣ 도로명 fallback
  result = await geocode(cleaned);
  if (result) return result;

  // 🔥 3️⃣ 주소 축소
  const parts = cleaned.split(" ");
  for (let i = parts.length - 1; i >= 2; i--) {
    const short = parts.slice(0, i).join(" ");
    result = await geocode(short);
    if (result) return result;
  }

  return null;
};
    // =========================
    // 🔥 실제 적용
    // =========================
const from = await tryGeocode(fromAddr);
const to = await tryGeocode(toAddr);

    if (!from || !to) {
      return res.status(200).json({
        distanceKm: "0.0",
        durationMin: 0,
        path: [],
        error: "GEOCODE_FAIL",
      });
    }

    // =========================
    // 🔥 경로 시도 함수
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
    // 🔥 경로 재시도 (도로 스냅 효과)
    // =========================
    const getRoute = async (start, end) => {
      const offsets = [
  [0, 0],
  [0.0003, 0],
  [-0.0003, 0],
  [0, 0.0003],
  [0, -0.0003],
  [0.0007, 0],
  [-0.0007, 0],
  [0, 0.0007],
  [0, -0.0007],
  [0.0015, 0],
  [0, 0.0015],
];

      // 출발 이동
      for (const [dx, dy] of offsets) {
        const res = await tryRoute(
          start.lon + dx,
          start.lat + dy,
          end.lon,
          end.lat
        );
        if (res) return res;
      }

      // 도착 이동
      for (const [dx, dy] of offsets) {
        const res = await tryRoute(
          start.lon,
          start.lat,
          end.lon + dx,
          end.lat + dy
        );
        if (res) return res;
      }

      // 둘 다 이동
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
    // 경로 좌표
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