export default async function handler(req, res) {
  try {
    const key = "F251130200";
    const url = `https://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=${key}`;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch {
      return res.status(502).json({ error: "non-json", raw: text.slice(0, 200) });
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
