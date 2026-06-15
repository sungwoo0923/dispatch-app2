export default async function handler(req, res) {
  try {
    const key = "F251130200";
    const area = req.query.area; // "" = 전국, "01" = 서울, etc.

    // 지역 코드가 있으면 시도별 평균, 없으면 전국 평균
    const url = area
      ? `https://www.opinet.co.kr/api/avgSidoPrice.do?out=json&code=${key}&area=${area}`
      : `https://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=${key}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error("HTTP " + response.status);

    const data = await response.json();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate");
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
