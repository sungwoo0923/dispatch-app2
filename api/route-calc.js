// route-calc.js (개선 버전)

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
    // 주소 → 좌표 (개선)
    // =========================
    const geocode = async (addr) => {
      try {
        const url =
          "https://apis.openapi.sk.com/tmap/geo/fullAddrGeo" +
          "?version=1&format=json&fullAddr=" +
          encodeURIComponent(addr);

        const r = await fetch(url, {
          method: "GET",
          headers: { appKey: TMAP_KEY },
        });

        if (!r.ok) {
          console.warn(`⚠️ geocode fail (${r.status}):`, addr);
          return null;
        }

        const j = await r.json();
        
        // ✅ 응답 구조 로깅
        console.log(`📍 geocode response for "${addr}":`, JSON.stringify(j).substring(0, 200));

        // 다양한 응답 구조 대응
        const coord =
          j?.coordinateInfo?.coordinate?.[0] ||
          j?.features?.[0]?.geometry?.coordinates ||
          j?.resultData?.[0]?.point;

        if (!coord) return null;

        const lat = typeof coord.lat === "number" ? coord.lat : coord[1];
        const lon = typeof coord.lon === "number" ? coord.lon : coord[0];

        return { lat, lon };
      } catch (e) {
        console.error("❌ geocode error:", e);
        return null;
      }
    };

    // =========================
    // 강화된 지오코딩 (축소 전략)
    // =========================
    const tryGeocode = async (addr) => {
      // 1️⃣ 원본 주소로 시도
      let result = await geocode(addr);
      if (result) {
        console.log(`✅ geocode success (original):`, result);
        return result;
      }

      // 2️⃣ 주소 축소 시도 (도로명 → 지번으로 자동 변환)
      const parts = addr.split(" ");
      for (let i = parts.length - 1; i >= 2; i--) {
        const short = parts.slice(0, i).join(" ");
        result = await geocode(short);
        if (result) {
          console.log(`✅ geocode success (shortened):`, short, result);
          return result;
        }
      }

      console.error(`❌ geocode failed all attempts:`, addr);
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
        debug: { from, to },
      });
    }

    console.log(`🚩 Route request: from (${from.lat}, ${from.lon}) → to (${to.lat}, ${to.lon})`);

    // =========================
    // 경로 API 호출 (개선)
    // =========================
    const tryRoute = async (startX, startY, endX, endY, attempt = 0) => {
      try {
        const payload = {
          startX,
          startY,
          endX,
          endY,
          reqCoordType: "WGS84GEO",
          resCoordType: "WGS84GEO",
          trafficInfo: "Y", // 교통정보 포함
        };

        console.log(`📡 Route API call (attempt ${attempt}):`, payload);

        const routeRes = await fetch(
          "https://apis.openapi.sk.com/tmap/routes?version=1&format=json",
          {
            method: "POST",
            headers: {
              appKey: TMAP_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );

        if (!routeRes.ok) {
          console.warn(`⚠️ route API error (${routeRes.status})`);
          return null;
        }

        const json = await routeRes.json();
        
        // ✅ 전체 응답 로깅
        console.log(`📍 Route response:`, JSON.stringify(json).substring(0, 300));

        // 다양한 응답 구조 대응
        const features = json?.features || json?.resultData || [];
        
        if (!Array.isArray(features) || features.length === 0) {
          console.warn(`⚠️ No features in response`);
          return null;
        }

        return features;
      } catch (e) {
        console.error("❌ tryRoute error:", e);
        return null;
      }
    };

    // =========================
    // 도로 스냅 재시도
    // =========================
    const getRoute = async (start, end) => {
      const offsets = [
        [0, 0],
        [0.0002, 0],
        [-0.0002, 0],
        [0, 0.0002],
        [0, -0.0002],
        [0.0005, 0],
        [0, 0.0005],
        [0.001, 0],
        [0, 0.001],
      ];

      let attempt = 0;

      // 출발지 오프셋
      for (const [dx, dy] of offsets) {
        const res = await tryRoute(
          start.lon + dx,
          start.lat + dy,
          end.lon,
          end.lat,
          attempt++
        );
        if (res) return res;
      }

      // 도착지 오프셋
      for (const [dx, dy] of offsets) {
        const res = await tryRoute(
          start.lon,
          start.lat,
          end.lon + dx,
          end.lat + dy,
          attempt++
        );
        if (res) return res;
      }

      // 양쪽 오프셋
      for (const [dx, dy] of offsets) {
        const res = await tryRoute(
          start.lon + dx,
          start.lat + dy,
          end.lon + dx,
          end.lat + dy,
          attempt++
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
    // 경로 좌표 추출 (개선)
    // =========================
    const path = [];
    features.forEach((f) => {
      if (f.geometry?.type === "LineString" && Array.isArray(f.geometry.coordinates)) {
        f.geometry.coordinates.forEach(([lng, lat]) => {
          path.push([lng, lat]);
        });
      }
    });

    // =========================
    // 거리 / 시간 계산 (개선)
    // =========================
    let distanceKm = "0.0";
    let durationMin = 0;

    // 1️⃣ 첫 번째 feature의 properties에서 추출
    const summaryFeature = features[0];
    const summary = summaryFeature?.properties || {};

    if (summary.totalDistance) {
      distanceKm = (summary.totalDistance / 1000).toFixed(1);
    } else if (summary.distance) {
      distanceKm = (summary.distance / 1000).toFixed(1);
    }

    if (summary.totalTime) {
      durationMin = Math.round(summary.totalTime / 60);
    } else if (summary.time) {
      durationMin = Math.round(summary.time / 60);
    }

    // 2️⃣ 좌표 기반 거리 계산 (fallback)
    if (distanceKm === "0.0" && path.length > 0) {
      const haversine = (lat1, lon1, lat2, lon2) => {
        const R = 6371;
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLon = ((lon2 - lon1) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(a));
      };

      let totalDist = 0;
      for (let i = 1; i < path.length; i++) {
        totalDist += haversine(path[i-1][1], path[i-1][0], path[i][1], path[i][0]);
      }
      distanceKm = totalDist.toFixed(1);
    }

    return res.status(200).json({
      distanceKm,
      durationMin,
      path,
      debug: {
        fromAddr: cleanAddress(fromAddr),
        toAddr: cleanAddress(toAddr),
        fromCoord: from,
        toCoord: to,
      },
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
