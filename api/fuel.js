// /api/fuel.js  (CommonJS - api/package.json has "type":"commonjs")
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate");
  try {
    const key = "F251130200";
    const url = `https://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=${key}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible)" }
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch {
      return res.status(502).json({ error: "opinet_html", raw: text.slice(0, 120) });
    }
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
