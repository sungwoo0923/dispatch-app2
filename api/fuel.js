export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const key = "F251130200";
    const area = req.query.area; // "" or undefined = 전국, "01" = 서울, etc.

    const url = area
      ? `https://www.opinet.co.kr/api/avgSidoPrice.do?out=json&code=${key}&area=${area}`
      : `https://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=${key}`;

    const response = await fetch(url);
    const text = await response.text();

    if (!response.ok) {
      return res.status(502).json({ error: `http_${response.status}`, raw: text.slice(0, 300) });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: "not_json", raw: text.slice(0, 300) });
    }

    // Return diagnostic info alongside data so frontend can debug if OIL is missing
    if (!data?.RESULT?.OIL?.length) {
      return res.status(200).json({
        RESULT: { OIL: [] },
        _debug: { keys: Object.keys(data || {}), resultKeys: Object.keys(data?.RESULT || {}), raw: JSON.stringify(data).slice(0, 300) }
      });
    }

    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate");
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
