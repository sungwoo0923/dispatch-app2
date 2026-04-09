// =========================
// 주소 정리
// =========================
function cleanAddress(addr = "") {
  return String(addr)
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// =========================
// 도로명 주소 감지
// =========================
function isRoadAddress(addr = "") {
  const roadKeywords = ["길", "로", "대로", "거리"];
  return roadKeywords.some(keyword => addr.includes(keyword));
}

// =========================
// 도로명 주소 → 시/구/동 추출
// =========================
function extractCityDistrictDong(addr = "") {
  const parts = addr.split(" ");
  // 최대 3개 부분만 추출 (시/도, 구/군, 동/읍/면)
  const extracted = parts.slice(0, 3).join(" ");
  return extracted;
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
    // 🔥 0️⃣ 도로명 → 지번 변환 (핵심)
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

      // 🔥 도로명 주소는 newLat/newLon, 지번 주소는 lat/lon 사용
      let lat = coord.newLat || coord.lat;
      let lon = coord.newLon || coord.lon;

      // 빈 문자열 체크
      if (!lat || !lon || lat === "" || lon === "") return null;

      return {
        lat: parseFloat(lat),
        lon: parseFloat(lon),
      };
    };

    // =========================
    // 🔥 1-1️⃣ 강화된 fallback
    // =========================
    const tryGeocode = async (addr) => {
  const isRoad = isRoadAddress(addr);

  // 🔥 1️⃣ 도로명 주소인 경우 지번 변환 우선
  if (isRoad) {
    console.log("🚦 도로명 주소 감지:", addr);
    
    // 지번 변환 시도
    const jibun = await convertToJibun(addr);
    console.log("📍 지번 변환 결과:", jibun);
    
    if (jibun && jibun !== addr) {
      const jibunResult = await geocode(jibun);
      if (jibunResult) {
        console.log("✅ 지번으로 좌표 획득 성공");
        return jibunResult;
      }
    }

    // 지번 변환 실패 시 시/구/동까지만 추출
    const cityDistrictDong = extractCityDistrictDong(addr);
    console.log("🏙️ 시/구/동 추출:", cityDistrictDong);
    
    if (cityDistrictDong && cityDistrictDong !== addr) {
      const shortResult = await geocode(cityDistrictDong);
      if (shortResult) {
        console.log("✅ 시/구/동으로 좌표 획득 성공");
        return shortResult;
      }
    }
  }

  // 🔥 2️⃣ 원본 주소로 시도 (지번 주소인 경우)
  let result = await geocode(addr);
  if (result) return result;

  // 🔥 3️⃣ 지번 변환 시도 (도로명이 아니었던 경우에도)
  if (!isRoad) {
    const jibun = await convertToJibun(addr);
    const jibunResult = await geocode(jibun);
    if (jibunResult) return jibunResult;
  }

  // 🔥 4️⃣ 주소 축소 (일반적인 경우)
  const parts = addr.split(" ");
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
        [0.0005, 0],
        [-0.0005, 0],
        [0, 0.0005],
        [0, -0.0005],
        [0.001, 0],
        [0, 0.001],
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