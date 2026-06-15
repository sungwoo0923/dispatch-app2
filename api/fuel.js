export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const key  = "F251130200";
  const area = req.query.area || "01";

  const endpoints = [
    `https://www.opinet.co.kr/api/avgSidoPrice.do?out=json&code=${key}&area=${area}`,
    `https://www.opinet.co.kr/api/avgSidoPrice.do?out=json&code=${key}`,
    `https://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=${key}`,
  ];

  for (const url of endpoints) {
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 6000);
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
