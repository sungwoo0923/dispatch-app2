export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body;

    const { fromAddr, toAddr } = body;

    if (!fromAddr || !toAddr) {
      return res.status(400).json({ error: "주소 누락" });
    }

    const KAKAO_KEY = process.env.KAKAO_REST_KEY;
    if (!KAKAO_KEY) {
      return res.status(500).json({ error: "KAKAO KEY 없음" });
    }

    // 1️⃣ 주소 → 좌표
    const geocode = async (addr) => {
      const r = await fetch(
        `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(addr)}`,
        {
          headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
        }
      );
      const j = await r.json();
      if (!j.documents?.length) throw new Error("주소 인식 실패");
      return {
        x: j.documents[0].x,
        y: j.documents[0].y,
      };
    };

    const from = await geocode(fromAddr);
    const to = await geocode(toAddr);

    // 2️⃣ 길찾기
    const routeRes = await fetch(
      `https://apis-navi.kakao.com/v1/directions?origin=${from.x},${from.y}&destination=${to.x},${to.y}`,
      {
        headers: {
          Authorization: `KakaoAK ${KAKAO_KEY}`,
        },
      }
    );

    const routeJson = await routeRes.json();
    const summary = routeJson.routes[0].summary;

    return res.status(200).json({
      distanceKm: (summary.distance / 1000).toFixed(1),
      durationMin: Math.round(summary.duration / 60),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
