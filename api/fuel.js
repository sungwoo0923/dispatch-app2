export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const key  = "F251130200";
  const area = req.query.area || "01";

  const endpoints = [
    `https://www.opinet.co.kr/api/avgSidoPrice.do?out=json&code=${key}&area=${area}`,
    `https://www.opinet.co.kr/api/avgSidoPrice.do?out=json&code=${key}`,
    `https://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=${key}`,
  ];

  // vercel.json의 maxDuration이 10초라, endpoint 3개를 순서대로 시도하면서 각각 6초씩
  // 기다리면(최악의 경우 최대 18초) 하드코딩 폴백에 도달하기도 전에 Vercel이 함수를
  // 강제 종료해 504가 나고, 프런트엔드는 이를 "유가 정보 없음"으로 표시하게 된다.
  // 3개 endpoint를 다 시도해도 여유가 남도록 endpoint당 제한시간을 줄인다.
  for (const url of endpoints) {
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 2500);
      const response = await fetch(url, { signal: ctrl.signal });
      clearTimeout(tid);
      if (!response.ok) continue;
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch { continue; }
      const oil = data?.RESULT?.OIL;
      if (Array.isArray(oil) && oil.length > 0) {
        res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate");
        return res.status(200).json(data);
      }
    } catch { /* try next endpoint */ }
  }

  // 모든 endpoint 실패 — 최근 전국 평균가 반환 (유가 정보 없음 방지)
  return res.status(200).json({
    RESULT: {
      OIL: [
        { PRODNM: "고급휘발유",  PRICE: 2020, DIFF: 0 },
        { PRODNM: "휘발유",      PRICE: 1748, DIFF: 0 },
        { PRODNM: "경유",        PRICE: 1623, DIFF: 0 },
        { PRODNM: "LPG(부탄)",   PRICE:  986, DIFF: 0 },
      ],
    },
    _fallback: true,
  });
}
